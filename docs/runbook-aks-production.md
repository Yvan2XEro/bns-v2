# Runbook — production on AKS

Production runs on Azure Kubernetes Service, built by the Pulumi stack
`azure-prod` (`infra/`). The first deploy starts from staging: its release
image and its data.

## Choose the database

| | **B — in-cluster + nightly backup** (template default) | **A — MongoDB Atlas** |
|---|---|---|
| Config | `database: in-cluster` + `mongoBackup` | `database: atlas` + `atlas` |
| Accounts | Azure only | Azure + an Atlas organization with a payment method |
| Runs on | One MongoDB pod in the cluster (`src/kubernetes/apps.ts`) | Three-node replica set managed by Atlas (`src/atlas.ts`) |
| Backups | `mongodump` every night (`mongoBackup.schedule`, UTC) to a private, geo-redundant Blob container; cool tier after 7 days, deleted after `retentionDays` (30); deleted blobs recoverable 14 days | Continuous: point-in-time restore over the last 7 days, snapshots 6-hourly/daily/weekly/monthly kept 2 d/14 d/8 w/12 mo |
| Worst-case loss | Everything since the last nightly dump | Seconds |
| Deletion guard | The disk's storage class is `Retain`: deleting the StatefulSet, its claim or the namespace leaves the Azure disk; the backup account is Pulumi-`protect`ed | Atlas termination protection + Pulumi `protect` |
| Restore | `infra/scripts/restore-mongo.sh --backup latest` | Atlas UI → Backup → Restore |

Whatever you choose, rehearse a restore once a quarter. A backup never
restored is a hope, not a backup.

### Option B in practice

- Each run is a Kubernetes Job: `kubectl -n bns get jobs -l app=mongodb-backup`
  shows its outcome; a failure is retried twice, never overlaps the next run.
  Watch for failed jobs in your monitoring.
- Dumps land at `mongo-backups/<db>/<yyyy>/<mm>/<dd>/<HHMMSS>Z.archive.gz` in the
  storage account of stack output `backupStorageAccount`.
- A dump is taken without the oplog: it is consistent per collection, not
  across collections, so take it at a quiet hour (the default 01:00 UTC).
- A manual run before a risky change:
  `kubectl -n bns create job --from=cronjob/mongodb-backup backup-$(date +%s)`.
- Restore:
  `infra/scripts/restore-mongo.sh --stack azure-prod --backup latest` (or a
  blob name), API paused first: it drops and reloads each collection.
- Moving an existing in-cluster stack to `mongoBackup` changes the
  StatefulSet's storage class: Pulumi replaces the StatefulSet, and the new
  one picks up the existing claim (same name), still on its old class. Only a
  new cluster gets the `Retain` disk from the start.

## Before you start

- `az login`, `pulumi login` (the stack's backend), `kubectl`, `docker`.
- Option A only: an Atlas organization **with a payment method** (M10 is a
  paid tier) and an organization API key with *Organization Project
  Creator*, kept in your shell, never in a file of the repo:
  `export MONGODB_ATLAS_PUBLIC_KEY=… MONGODB_ATLAS_PRIVATE_KEY=…`
- The production `.env` (`.env.azure-prod`, git-ignored) with the production
  values. **Copy these three from staging, unchanged**, or the restored hashes
  stop matching: `ORDER_PHONE_PEPPER` (buyer-phone refusal scores),
  `RISK_HASH_SECRET` (risk signals), `VERIFICATION_HASH_PEPPER` (verification
  duplicate detection). A new `PAYLOAD_SECRET` only signs everyone out once.
  `MONGO_PASSWORD` is new: the in-cluster root password (B) or the Atlas
  user's (A).

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
`apiPaused: true`, and the database block — `mongoBackup` as in the template
(B), or `database: atlas` with `atlas.orgId` and your IP in
`atlas.accessCidrs` for the restore (A).

## 3. First `pulumi up`, API paused

```bash
make infra-up STACK=azure-prod
```

This creates AKS, the database (B: the MongoDB pod on its `Retain` disk, the
backup storage account and the nightly CronJob; A: Atlas, about ten
minutes), Redis, Meilisearch, the web, chat and indexer, and the ingress, but
no API, so nothing writes to the empty database. Point the DNS records at
the ingress IP.

## 4. The staging data

On the staging host, dump the app database (the container reads its own
credentials; nothing is typed):

```bash
docker exec <staging-mongodb-container> bash -c \
  'mongodump --host localhost --username "$MONGO_INITDB_ROOT_USERNAME" \
   --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
   --db "$MONGO_INITDB_DATABASE" --archive --gzip' > bns.archive.gz
```

Copy `bns.archive.gz` to your machine, then restore it:

```bash
# B — in-cluster (kubectl on the prod cluster: az aks get-credentials …)
infra/scripts/restore-mongo.sh --stack azure-prod --archive ./bns.archive.gz
# A — Atlas
infra/scripts/restore-to-atlas.sh --stack azure-prod --archive ./bns.archive.gz
```

Both scripts refuse unless the API is paused, drop and reload each restored
collection (a collection absent from the dump is left as is, hence the empty
database), and print the document counts. Compare them with staging.

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
pulumi config rm --path atlas.accessCidrs --stack azure-prod   # A only
make infra-up STACK=azure-prod
```

The API boots and runs its boot tasks (indexes, markets, workflow sync); the
ones staging already ran are recorded in `deploy_tasks` and skipped. The
search indexer rebuilds Meilisearch from the database. Then check:

- `https://api.<domain>/api/public/config` answers;
- sign-in, a search, a listing page with its photos, a COD order end to end;
- B: trigger a first backup (`kubectl -n bns create job --from=cronjob/mongodb-backup first-backup`),
  check the job succeeds and the archive appears in the backup account;
  A: Atlas → Backup shows the first snapshot within six hours.

## Later releases and rollback

```bash
git tag -a v1.2.0 -m "v1.2.0" && git push origin v1.2.0   # CI builds the images
make infra-tag v=1.2.0 STACK=azure-prod                   # deploys them
make infra-tag v=1.1.0 STACK=azure-prod                   # rollback of the code
```

A rollback of the data is, with B, `restore-mongo.sh --backup <blob>` with
the API paused (back to that night); with A, an Atlas point-in-time restore
chosen to the second. Restore into a scratch environment first when in doubt.
