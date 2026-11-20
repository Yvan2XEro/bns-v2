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

## The preflight: `make check`

Read-only, never prints a secret value, exit code 1 on any ✗. Run it before
every `up` and after every deploy:

```bash
make check                                   # azure-prod
make check ENV_FILE=.env.azure-prod STAGING_ENV=.env.staging
```

| Section | What it checks |
|---|---|
| Tools and sessions | pulumi, az, kubectl, docker installed; pulumi and az logged in |
| Stack | domain, Let's Encrypt email, `imageTag` is a release tag, GHCR token, API paused or not, a database with backups (`mongoBackup`, or Atlas with its keys exported) |
| Application values | the seven required secrets set and not placeholders; storage is azure/s3 with two distinct containers (never `local`: the API pods have no volume); NotchPay keys, not sandbox ones; email, OAuth, Novu, Sentry, Pixabay; `ENV_FILE` passes `env:check`; with `STAGING_ENV`, the three peppers equal staging's |
| Images | the four images exist at `imageTag` in GHCR |
| Live cluster (once deployed) | every pod ready, restarts; last successful backup under 26 h, archives in the storage account, MongoDB disk on the Retain class; ingress IP; DNS of the four hosts points at it; the web and the API answer over HTTPS |

## 0. The Pulumi state, shared (before creating the stack)

CI deploys production, so the stack's state cannot live on one laptop
(`pulumi login --local`). Keep it in Azure Blob, in its own storage account:

```bash
az group create -n bns-pulumi -l westeurope
az storage account create -n <bnspulumistate> -g bns-pulumi -l westeurope \
  --sku Standard_GRS --min-tls-version TLS1_2 --allow-blob-public-access false
az storage container create -n pulumi-state --account-name <bnspulumistate> --auth-mode login
az storage account blob-service-properties update -n <bnspulumistate> -g bns-pulumi \
  --enable-versioning true --enable-delete-retention true --delete-retention-days 30
pulumi login 'azblob://pulumi-state?storage_account=<bnspulumistate>'
export PULUMI_CONFIG_PASSPHRASE='…'   # keep it in a password manager: secrets cannot be read without it
```

Then create the stack (step 2). A stack already created under another
backend moves with `pulumi stack export` / `pulumi stack import`.

## 1. The release

Production runs the exact code staging was validated on. Tag the commit
staging runs (the `dev-<sha>` image tag shows it) and let CI build it:

```bash
git tag -a v1.1.0 <sha> -m "v1.1.0" && git push origin v1.1.0
```

CI builds the `v1.1.0` images. It does not deploy them yet: the deploy job
waits for `make prod-ci-setup` (after step 7), so this first deploy, with its
restore, is yours.

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

Then `make check` must end with no ✗. The API boots and runs its boot tasks (indexes, markets, workflow sync); the
ones staging already ran are recorded in `deploy_tasks` and skipped. The
search indexer rebuilds Meilisearch from the database. Then check:

- `https://api.<domain>/api/health` answers 200 with `"status":"ok"`
  (`"degraded"` means Redis is unreachable; a 503 means MongoDB is);
- sign-in, a search, a listing page with its photos, a COD order end to end;
- B: trigger a first backup (`kubectl -n bns create job --from=cronjob/mongodb-backup first-backup`),
  check the job succeeds and the archive appears in the backup account;
  A: Atlas → Backup shows the first snapshot within six hours.

Production is open. Hand the next releases to CI: the one-time setup below,
ending with `make prod-ci-setup`.

### Monitoring

Metrics, logs, uptime and alerts live in the shared Overbrand stack
([overbrand/observability](https://github.com/overbrand/observability)).
To send this cluster's pod logs, container, node and cluster metrics there,
create its credential (`scripts/ingest-user.sh bns-aks` in that repo, the
entry appended to the stack's `INGEST_USERS`), then:

```bash
pulumi config set --path observability.username bns-aks --stack azure-prod
pulumi config set --secret observabilityIngestPassword <password> --stack azure-prod
make infra-up STACK=azure-prod
```

Everything arrives labelled `project=bns`, and the generic alerts (crash
loops, pods not ready, HPA at maximum, volumes filling, a failed
`mongodb-backup` job…) reach the BNS Telegram group and address. The public
URLs are probed from there too (`uptime/bns.yml`).

## Later releases: GitHub Actions, with your approval

From the second release on, CI deploys. The first deploy (steps 1–7, with
the restore) stays manual.

```
make release v=1.2.0
  → Build & Push builds the v1.2.0 images
  → Deploy → Production (AKS) / preview: make check without the live part,
    pulumi preview — its diff in the run summary
  → Deploy → Production (AKS) / deploy: waits for a reviewer, then
    pulumi up, rollout, live make check
```

Rollback: `make rollback v=1.1.0` runs the same workflow from the `v1.1.0`
tag — same preview, same approval. `make infra-tag v=… STACK=azure-prod`
from your machine remains the fallback when GitHub is down.

### One-time setup

1. **The state** in Azure Blob (step 0) — CI reads it as `PULUMI_BACKEND_URL`.
2. **An identity for CI**, signed in by OIDC: no password stored anywhere.

   ```bash
   app=$(az ad app create --display-name bns-prod-deploy --query appId -o tsv)
   az ad sp create --id "$app"
   for env in production-preview production; do
     az ad app federated-credential create --id "$app" --parameters "{
       \"name\": \"gh-$env\", \"issuer\": \"https://token.actions.githubusercontent.com\",
       \"subject\": \"repo:Yvan2XEro/bns-v2:environment:$env\",
       \"audiences\": [\"api://AzureADTokenExchange\"] }"
   done
   sub=$(az account show --query id -o tsv)
   # The stack creates its own resource groups, hence the subscription scope.
   az role assignment create --assignee "$app" --role Contributor --scope "/subscriptions/$sub"
   az role assignment create --assignee "$app" --role "Storage Blob Data Contributor" \
     --scope "$(az storage account show -n <bnspulumistate> --query id -o tsv)"
   ```
3. **`.env.deploy.prod`** (git-ignored) at the repo root:

   ```
   AZURE_CLIENT_ID=<app id above>
   AZURE_TENANT_ID=<az account show --query tenantId -o tsv>
   AZURE_SUBSCRIPTION_ID=<subscription id>
   PULUMI_BACKEND_URL=azblob://pulumi-state?storage_account=<bnspulumistate>
   ```

   With `PULUMI_CONFIG_PASSPHRASE` exported in your shell (and the Atlas keys
   for option A), run:

   ```bash
   make prod-ci-setup REVIEWERS=<your-github-login>[,<another>]
   ```

   It creates the environments `production-preview` and `production` (the
   latter with your approval), limits both to `v*` tags, uploads the secrets
   and the encrypted stack config, and sets `PULUMI_BACKEND_URL`,
   `PRODUCTION_STACK` and `PRODUCTION_URL`.
4. **Who may release:** Settings → Rules → Rulesets → New tag ruleset on
   `v*`, restricting creation, update and deletion to the maintainers. A `v*`
   tag is what opens the production environments.

### Keeping CI and your machine in step

- CI deploys from its own copy of the stack config (`PULUMI_STACK_CONFIG`).
  After any local change (`pulumi config set`, `infra:env:apply`), run
  `make prod-ci-setup` again, or CI deploys the old values.
- CI sets `imageTag` only for its run. Your local file then lags behind;
  `make infra-up` refuses to run when it would put production back on an
  older release (`FORCE=1` overrides), and `make check` shows both tags.

A rollback of the data is, with B, `restore-mongo.sh --backup <blob>` with
the API paused (back to that night); with A, an Atlas point-in-time restore
chosen to the second. Restore into a scratch environment first when in doubt.
