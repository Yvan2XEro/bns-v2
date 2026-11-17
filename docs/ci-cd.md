# CI/CD & Versioning

## Overview

```
dev branch  ──push──►  build images  ──►  staging deploy (automatic, Dokploy)

version tag (v1.2.3) ──►  build images ──►  preview (make check + pulumi preview)
                                       ──►  ⏸ approval (environment `production`)
                                       ──►  pulumi up ──►  rollout + live make check
make rollback v=1.1.0 ──►  the same workflow, from the v1.1.0 tag
```

Staging runs on Docker Compose under Dokploy; production on Kubernetes,
built and deployed only by the Pulumi stack in `infra/`
([runbook-aks-production.md](runbook-aks-production.md)).

Images are built by GitHub Actions and stored in **GHCR** (GitHub Container Registry):
```
ghcr.io/yvan2xero/bns-v2/<service>:<tag>
```
Services: `api` · `web` · `chat-service` · `search-indexer`

---

## Branch strategy

| Branch | Role |
|--------|------|
| `main` | Stable code, base for PRs |
| `dev` | Continuous integration → automatic staging deploy |
| `v*` (tag) | Source of truth for production releases |

> A **Git tag** releases: its images are built, production is previewed, and
> the deploy waits for a reviewer. Merging a branch deploys nothing.

---

## GitHub Actions workflows

### `build-and-push.yml` — Build & automatic deploy

**Triggers:**
- Push to `dev` → images tagged `dev` and `dev-<sha>`
- Push of a `v*` tag → images tagged `v1.2.3` (what every deploy pulls), `1.2.3`, `1.2`, `latest`

**Jobs:**
1. **build** — Matrix over all 4 services in parallel, with per-service GHA layer cache
2. **deploy-staging** — After build on `dev`: calls the Dokploy app's deploy webhook
   (`DOKPLOY_DEPLOY_URL`) with a push-shaped payload; Dokploy pulls the `dev`
   images and restarts the compose app with the environment set in its own UI
3. **deploy-production** — After build on a `v*` tag: calls
   `deploy-production.yml` — a preview job (`make check` without the live
   part, `pulumi preview` in the run summary; environment
   `production-preview`), then a deploy job that waits for a reviewer of the
   environment `production` before `pulumi up`, the rollout and the live
   `make check`. Both environments accept only `v*` tags. See
   [runbook-aks-production.md](runbook-aks-production.md)

**Registry auto-resolution:**
```bash
IMAGE_REGISTRY=$(echo "ghcr.io/${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
```
No manual configuration needed — the registry is derived from the GitHub repository name.

---

### `deploy.yml` — Manual compose deploy (staging rollback)

**Trigger:** `workflow_dispatch` (GitHub Actions UI or CLI)

Goes over SSH to a compose server (`STAGING_*` or `DEPLOY_*` secrets), not
through Dokploy, and runs `docker compose pull && up -d` with the given tag.
Production on Pulumi is rolled back with `make rollback v=…` instead, which
runs `make infra-tag`.

**Inputs:**
- `environment`: `staging` or `production`
- `tag`: image tag to deploy (e.g. `v1.1.0`, `dev`)

**Usage:**
```bash
# Via Makefile
make rollback v=1.1.0              # production (Pulumi) back to v1.1.0
make rollback v=1.1.0 env=staging  # staging, through this workflow

# Via gh CLI directly
gh workflow run deploy.yml --field environment=production --field tag=v1.1.0
```

---

### `ci.yml` — PR checks

**Triggers:** PR targeting `main` or `dev`, push to `dev`

**Jobs:**
- Lint + type-check across all packages
- Unit tests (matrix: `chat-service`, `search-indexer`)

> The API, web and mobile suites are **not** run by CI yet. Run them before
> merging: `cd packages/api && bunx vitest run tests/int`, then `bun test` in
> `packages/web` and `packages/mobile`.

---

## Versioning

The project follows **Semantic Versioning** (`MAJOR.MINOR.PATCH`).

### Creating a release

```bash
make release v=1.2.3
```

What it does:
1. Checks there are no uncommitted changes
2. Creates annotated tag `v1.2.3`
3. Pushes the tag → GitHub Actions builds the images, previews production,
   and deploys once a reviewer approves (`deploy-production.yml`)

### Full flow

```
git commit -m "feat: ..."
git push origin dev          # → staging updated

# Once staging is validated:
make release v=1.2.3     # → images, preview, approval → production updated
```

---

## Makefile — Command reference

### Release & deploy

| Command | Description |
|---------|-------------|
| `make release v=1.2.3` | Tag + push → build, preview, approval, production deploy |
| `make check` | Production preflight, read-only |
| `make prod-ci-setup [REVIEWERS=…]` | GitHub environments, approval and secrets for the production workflow (rerun after a local stack-config change) |
| `make infra-tag v=1.2.3 STACK=azure-prod` | Manual deploy from this machine (fallback) |
| `make staging` | Push the current branch to `dev` (fast-forward only) → build → Dokploy redeploys staging |
| `make rollback v=1.1.0` | Production back to v1.1.0 (the deploy workflow from that tag, with approval) |
| `make rollback v=1.1.0 env=staging` | Staging back to v1.1.0 (`deploy.yml`) |
| `make setup-secrets [ENV=staging\|production] [GHFILE=.env.deploy]` | Upload the deploy secrets the workflows read (see below) |
| `make secrets-list ENV=staging` | List the secret names set on an environment |

### Local build

| Command | Description |
|---------|-------------|
| `make build` | Build all images locally |
| `make build-api` | Build a single image |
| `make push` | Build + push to GHCR |

### Docker Compose (local / server)

| Command | Description |
|---------|-------------|
| `make up` | Start all services |
| `make down` | Stop everything |
| `make deploy IMAGE_TAG=v1.2.3` | Pull new images + restart (`.env` from `deployments/docker-compose/.env.example`) |
| `make logs` | Tail logs from all services |
| `make logs-api` | Tail logs from a specific service |
| `make restart-api` | Restart a specific service |

### Infrastructure — Pulumi (EKS / AKS)

| Command | Description |
|---------|-------------|
| `make infra-install` | Install dependencies in `infra/` (bun) |
| `make k8s-status` | Pod status in the `bns` namespace (current kubectl context) |
| `make check [STACK=azure-prod] [ENV_FILE=…] [STAGING_ENV=…]` | Production preflight, read-only (see [runbook-aks-production.md](runbook-aks-production.md)) |
| `make infra-preview STACK=aws-staging` | Preview infra changes |
| `make infra-up STACK=aws-staging` | Create or update the cluster |
| `make infra-down STACK=aws-staging` | Destroy the cluster |
| `make infra-tag v=1.2.3 STACK=aws-prod` | Update image tag via Pulumi |
| `make infra-refresh STACK=aws-prod` | Resync Pulumi state with cloud reality |

---

## Docker Compose deployment (Dokploy / VPS)

### Server prerequisites

- Docker + Docker Compose v2
- Traefik configured with the `dokploy-network` network
- GHCR access: `docker login ghcr.io`

### First deploy

**Staging (Dokploy):** create a Compose app on
`deployments/docker-compose/docker-compose.yml`, paste the filled
[`.env.example`](../deployments/docker-compose/.env.example) into its
Environment tab with `IMAGE_TAG=dev`, and copy its deploy webhook URL into the
`DOKPLOY_DEPLOY_URL` secret of the GitHub `staging` environment.

**Production (VPS over SSH):**

```bash
# On the server, in DEPLOY_PATH
cp deployments/docker-compose/.env.example .env
nano .env   # fill in values

IMAGE_REGISTRY=ghcr.io/yvan2xero/bns-v2 IMAGE_TAG=latest docker compose up -d
```

A variable the compose file does not list never reaches a container, whatever
the server's `.env` or Dokploy holds: a new one goes into `docker-compose.yml`
and `.env.example` together.

### Required environment variables

See [`deployments/docker-compose/.env.example`](../deployments/docker-compose/.env.example) for the full list.

Critical variables:

| Variable | Description |
|----------|-------------|
| `IMAGE_REGISTRY` | `ghcr.io/yvan2xero/bns-v2` |
| `IMAGE_TAG` | Tag to deploy (`latest`, `dev`, `v1.2.3`) |
| `MONGO_PASSWORD` | MongoDB password |
| `REDIS_PASSWORD` | Redis password |
| `PAYLOAD_SECRET` | Payload secret key (min 32 chars) |
| `MEILI_MASTER_KEY` | Meilisearch master key |
| `ORDER_PHONE_PEPPER` | HMAC key for buyer-phone refusal scores — compose refuses to start without it; never rotate casually |
| `RISK_HASH_SECRET` | ≥ 32 chars; risk-signal hashing |
| `VERIFICATION_HASH_PEPPER` | HMAC key for verification document/IP hashes |
| `S3_PRIVATE_BUCKET` / `AZURE_STORAGE_PRIVATE_CONTAINER_NAME` | With S3 or Azure storage, a private bucket/container distinct from the public one — the API refuses to start without it |

### What a deploy does by itself

Pushing is the whole release: nothing is run by hand on the host afterwards.

| Step | Where | When |
|------|-------|------|
| MongoDB becomes a single-node replica set (key file generated into the `mongo_keyfile` volume, `rs.initiate` by the healthcheck) | `mongodb` service | First start after the upgrade; an existing standalone database is converted in place, data untouched — about ten seconds of database restart |
| Job crons (expiry, payments, commission, nightly sweeps) | API boot | Every start |
| Database indexes (`src/db/indexes.ts`: the partial unique indexes and the TTL the collection configs cannot declare), the Cameroon market and its cities (`src/seed/seedMarkets.ts`), Novu workflow sync, category catch-up | API boot, in the background (`src/services/bootTasks.ts`), in that order | Once per change of what they would write, recorded in the `deploy_tasks` collection — so a new database gets them all; a failure is logged and retried at the next start |
| Meilisearch documents rebuilt in place | `search-indexer` start | When `DOCUMENT_VERSION` in `packages/search-indexer/src/reindex.ts` differs from the one stored in the `indexer-meta` index |

New one-off work goes into `bootTasks()`, and a new partial or TTL index into
`src/db/indexes.ts` — never into a "run this after deploying" note. There are
no migrations: a schema change that existing data would need converted is
written so the old shape still reads, or converted by an idempotent boot task. Bump
`DOCUMENT_VERSION` whenever a listing or shop search document changes shape.

Features shipped behind `AppSettings` switches (shops, verification, protected
payment, delivery, resale…) still start off: turning one on is a product
decision made in the admin panel, not a deploy step.

### Required GitHub Actions secrets

These are the only secrets the workflows read. The application's own keys
(`PAYLOAD_SECRET`, NotchPay, OAuth…) never go to GitHub in clear: staging's
live in Dokploy's Environment tab, production's in the Pulumi stack config,
encrypted with its passphrase.

| Secret | Environment | Used by |
|--------|-------------|---------|
| `DOKPLOY_DEPLOY_URL` | staging | `build-and-push.yml` → staging redeploy |
| `STAGING_HOST` `STAGING_USER` `STAGING_PATH` `STAGING_SSH_KEY` | staging | `deploy.yml` (manual deploy / rollback) only |
| `GHCR_TOKEN` | staging | `docker login ghcr.io` on the staging server |
| `AZURE_CLIENT_ID` `AZURE_TENANT_ID` `AZURE_SUBSCRIPTION_ID` | production-preview, production | OIDC sign-in to Azure (no password) |
| `PULUMI_CONFIG_PASSPHRASE` `PULUMI_STACK_CONFIG` | production-preview, production | the stack config and the key to its encrypted values |
| `MONGODB_ATLAS_PUBLIC_KEY` `MONGODB_ATLAS_PRIVATE_KEY` | production-preview, production | option A (Atlas) only |

Repository variables: `PULUMI_BACKEND_URL`, `PRODUCTION_STACK`, `PRODUCTION_URL`.

> `GHCR_TOKEN`: GitHub Personal Access Token with the `read:packages` scope.

`make setup-secrets` uploads staging's from a git-ignored file (default
`.env.deploy`), piping each value to `gh` without printing it; the SSH key is
given as a path, `STAGING_SSH_KEY_FILE=`. `make prod-ci-setup` does
production's (environments, approval, `v*`-only rule, secrets, variables):

```bash
make setup-secrets                                   # staging, from .env.deploy
make prod-ci-setup REVIEWERS=<login>                 # production, from .env.deploy.prod
```

---

## Kubernetes deployment via Pulumi (EKS / AKS)

See [`infra/`](../infra/) for the full TypeScript code.

### Available stacks

| Stack | Cloud | Environment |
|-------|-------|-------------|
| `aws-staging` | AWS EKS | Staging |
| `aws-prod` | AWS EKS | Production |
| `azure-staging` | Azure AKS | Staging |
| `azure-prod` | Azure AKS | Production |

### First deploy

```bash
# 1. Authenticate with the cloud provider
aws configure                     # for AWS
az login                          # for Azure

# 2. Initialize the stack
make infra-install
cd infra
pulumi stack init aws-staging     # or azure-staging, aws-prod, azure-prod

# 3. Set secrets
pulumi config set --secret ghcrToken <github-pat-read-packages>
pulumi config set --secret mongoPassword <password>
pulumi config set --secret redisPassword <password>
pulumi config set --secret meiliMasterKey <key>
pulumi config set --secret payloadSecret <secret-32-chars>
pulumi config set --secret chatServicePassword <password>

# 4. Deploy
make infra-preview STACK=aws-staging
make infra-up STACK=aws-staging
```

### Updating an image in production

```bash
make infra-tag v=1.2.3 STACK=aws-prod
```

Pulumi only recalculates resources affected by the tag change (Deployments). The cluster and stateful infrastructure are not touched.

Check [Releases with a one-time deploy constraint](#releases-with-a-one-time-deploy-constraint)
first: a release listed there may need the `api` Deployment scaled to one
replica (or switched to `Recreate`) for its rollout.

### What Pulumi provisions

**Cloud infrastructure:**
- EKS: cluster + node group with autoscaling (min 1, max `nodeCount × 2`)
- AKS: cluster + system node pool with autoscaling

**Kubernetes (namespace `bns`):**
- StatefulSets: MongoDB, Redis, Meilisearch (with PVCs)
- Deployments: api (×2), web (×2), chat-service, search-indexer
- ClusterIP Services for each component
- GHCR image pull secret
- `bns-secrets` Secret with all credentials

**Ingress:**
- `ingress-nginx` via Helm (LoadBalancer)
- `cert-manager` via Helm + Let's Encrypt ClusterIssuer
- TLS Ingress for `api.<domain>`, `<domain>`, `www.<domain>`, `chat.<domain>`

---

## GHCR image tag conventions

| Tag | Created by | Usage |
|-----|-----------|-------|
| `dev` | Push to `dev` | Staging (always the latest) |
| `dev-<sha>` | Push to `dev` | Debugging / staging rollback |
| `v1.2.3` | Git tag `v1.2.3` | Versioned release |
| `1.2` | Git tag `v1.2.3` | Minor alias |
| `latest` | Git tag `v*` | Always the latest production release |
