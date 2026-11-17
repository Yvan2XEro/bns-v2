# Runbook — production on AKS with MongoDB Atlas

Production runs on Azure Kubernetes Service, built by the Pulumi stack
`azure-prod` (`infra/`). The database is MongoDB Atlas, also provisioned by
the stack (`infra/src/atlas.ts`): a three-node replica set on Azure in the
same region, continuous backup with point-in-time restore, and network
access from the cluster's egress IP only.

The first deploy starts from staging: its release image and its data.

## What protects the data

| Layer | Setting |
|---|---|
| Point-in-time restore | Any second of the last `atlas.restoreWindowDays` (default 7) |
| Snapshots | Every 6 h kept 2 days · daily kept 14 days · weekly kept 8 weeks · monthly kept 12 months |
| Deletion | Atlas termination protection on the cluster, and Pulumi `protect`: neither `pulumi destroy` nor a code change can drop it |
| Access | One database user, `readWrite` on the app database only; the IP access list holds the AKS egress IP (stack output `egressIps`) and, temporarily, `atlas.accessCidrs` |

Restoring is done in the Atlas UI (cluster → Backup → Restore): to a point in
time or a snapshot, into this cluster or into a scratch one. Rehearse it once
a quarter into a scratch cluster.

## Before you start

- An Atlas organization **with a payment method** (M10 is a paid tier) and an
  organization API key with *Organization Project Creator*. Keep the key in
  your shell, never in a file of the repo:
  `export MONGODB_ATLAS_PUBLIC_KEY=… MONGODB_ATLAS_PRIVATE_KEY=…`
- `az login`, `pulumi login` (the stack's backend), `docker`, `gh`.
- The production `.env` (`.env.azure-prod`, git-ignored) with the production
  values. **Copy these three from staging, unchanged**, or the restored hashes
  stop matching: `ORDER_PHONE_PEPPER` (buyer-phone refusal scores),
  `RISK_HASH_SECRET` (risk signals), `VERIFICATION_HASH_PEPPER` (verification
  duplicate detection). A new `PAYLOAD_SECRET` only signs everyone out once.
  `MONGO_PASSWORD` is new: it becomes the Atlas user's password.

## 1. The release

Production runs the exact code staging was validated on. Tag the commit
staging runs (the `dev-<sha>` image tag shows it) and let CI build it:

```bash
git tag -a v1.1.0 <sha> -m "v1.1.0" && git push origin v1.1.0
```

CI builds `v1.1.0` images. It does not deploy them: the SSH production job
only runs when the repository variable `PRODUCTION_PLATFORM` is `compose`.

## 2. The stack

```bash
bun run infra:stack:init --stack azure-prod --from azure-prod
bun run infra:env:check --env .env.azure-prod --stack azure-prod
bun run infra:env:apply --env .env.azure-prod --stack azure-prod
```

In `infra/.stacks/Pulumi.azure-prod.yaml`: `imageTag: v1.1.0`,
`atlas.orgId`, your IP in `atlas.accessCidrs` for the restore, and
`apiPaused: true`.

## 3. First `pulumi up`, API paused

```bash
make infra-up STACK=azure-prod
```

This creates AKS, Atlas (about ten minutes), Redis, Meilisearch, the web,
chat and indexer, and the ingress, but no API, so nothing writes to the
empty database. Point the DNS records at the ingress IP.

## 4. The staging data

On the staging host, dump the app database (the container reads its own
credentials; nothing is typed):

```bash
docker exec <staging-mongodb-container> sh -c \
  'mongodump --uri "mongodb://$MONGO_INITDB_ROOT_USERNAME:$MONGO_INITDB_ROOT_PASSWORD@localhost:27017/?authSource=admin" \
   --db "$MONGO_INITDB_DATABASE" --archive --gzip' > bns.archive.gz
```

Copy `bns.archive.gz` to your machine, then:

```bash
infra/scripts/restore-to-atlas.sh --stack azure-prod --archive ./bns.archive.gz
```

The script refuses unless the API is paused, drops and reloads each
collection, and prints the document counts. Compare them with staging.

## 5. The files

The dump holds only documents. Images, verification documents and the other
uploads stay in staging's buckets. Media records store relative paths
(`/api/media/file/<name>`), and both storage adapters name objects
`<prefix>/<filename>`, so copying the objects is enough:

```bash
rclone sync staging-s3:<public-bucket>  prod:<public-container>
rclone sync staging-s3:<private-bucket> prod:<private-container>
```

On Azure, create the private container with no public access first
(`az storage container create --public-access off`): the app never creates it.

## 6. What staging leaves behind

Decide before opening, in the admin or with a one-off script:

- test accounts, orders, payments and payouts made during staging tests;
- App Settings: feature switches (resale, verification, protected payment),
  sandbox payment settings, test markets;
- notification and webhook settings pointing at staging.

## 7. Open

```bash
pulumi config set apiPaused false --stack azure-prod   # (in infra/)
pulumi config rm --path atlas.accessCidrs --stack azure-prod
make infra-up STACK=azure-prod
```

The API boots and runs its boot tasks (indexes, markets, workflow sync); the
ones staging already ran are recorded in `deploy_tasks` and skipped. The
search indexer rebuilds Meilisearch from the database. Then check:

- `https://api.<domain>/api/public/config` answers;
- sign-in, a search, a listing page with its photos, a COD order end to end;
- Atlas → Backup shows the first snapshot within six hours.

## Later releases and rollback

```bash
git tag -a v1.2.0 -m "v1.2.0" && git push origin v1.2.0   # CI builds the images
make infra-tag v=1.2.0 STACK=azure-prod                   # deploys them
make infra-tag v=1.1.0 STACK=azure-prod                   # rollback of the code
```

A rollback of the data is an Atlas point-in-time restore, chosen to the
second; restore into a scratch cluster first when in doubt.
