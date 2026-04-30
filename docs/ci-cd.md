# CI/CD & Versioning

## Overview

```
dev branch  ──push──►  build images  ──►  staging deploy (automatic)
                           │
version tag (v1.2.3) ──►  build images  ──►  production deploy (automatic)
                                                         │
                                           rollback ◄── workflow_dispatch
```

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

> Production deploys are triggered by **Git tags**, not branch merges.

---

## GitHub Actions workflows

### `build-and-push.yml` — Build & automatic deploy

**Triggers:**
- Push to `dev` → images tagged `dev` and `dev-<sha>`
- Push of a `v*` tag → images tagged `v1.2.3`, `1.2`, `latest`

**Jobs:**
1. **build** — Matrix over all 4 services in parallel, with per-service GHA layer cache
2. **deploy-staging** — After build on `dev`: SCP compose file + `docker compose pull && up`
3. **deploy-production** — After build on `v*` tag: same flow with the versioned tag

**Registry auto-resolution:**
```bash
IMAGE_REGISTRY=$(echo "ghcr.io/${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
```
No manual configuration needed — the registry is derived from the GitHub repository name.

---

### `deploy.yml` — Manual deploy (rollback)

**Trigger:** `workflow_dispatch` (GitHub Actions UI or CLI)

**Inputs:**
- `environment`: `staging` or `production`
- `tag`: image tag to deploy (e.g. `v1.1.0`, `dev`)

**Usage:**
```bash
# Via Makefile
make rollback v=1.1.0              # rollback prod to v1.1.0
make rollback v=1.1.0 env=staging

# Via gh CLI directly
gh workflow run deploy.yml --field environment=production --field tag=v1.1.0
```

---

### `ci.yml` — PR checks

**Triggers:** PR targeting `main` or `dev`, push to `dev`

**Jobs:**
- Lint + type-check across all packages
- Unit tests (matrix: `chat-service`, `search-indexer`)

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
3. Pushes the tag → triggers build + automatic production deploy

### Full flow

```
git commit -m "feat: ..."
git push origin dev          # → staging updated

# Once staging is validated:
make release v=1.2.3         # → production updated
```

---

## Makefile — Command reference

### Release & deploy

| Command | Description |
|---------|-------------|
| `make release v=1.2.3` | Tag + push → triggers build + prod deploy |
| `make staging` | Force-push current branch to `dev` → staging |
| `make rollback v=1.1.0` | Redeploy a previous version to prod |
| `make rollback v=1.1.0 env=staging` | Rollback on staging |

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
| `make deploy` | Pull new images + restart |
| `make logs` | Tail logs from all services |
| `make logs-api` | Tail logs from a specific service |
| `make restart-api` | Restart a specific service |

### Kubernetes (Kustomize)

| Command | Description |
|---------|-------------|
| `make k8s-apply` | Apply Kustomize manifests |
| `make k8s-diff` | Preview changes before applying |
| `make k8s-deploy v=1.2.3` | Update image tag in the cluster |
| `make k8s-status` | Pod status in the `bns` namespace |

### Infrastructure — Pulumi (EKS / AKS)

| Command | Description |
|---------|-------------|
| `make infra-install` | Install npm dependencies in `infra/` |
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

```bash
# On the server
cp deployments/docker-compose/.env.example .env
nano .env   # fill in values

IMAGE_REGISTRY=ghcr.io/yvan2xero/bns-v2 IMAGE_TAG=latest docker compose up -d
```

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

### Required GitHub Actions secrets

Configure in **Settings → Secrets and variables → Actions**:

| Secret | Environment |
|--------|-------------|
| `STAGING_HOST` | staging |
| `STAGING_USER` | staging |
| `STAGING_PATH` | staging |
| `STAGING_SSH_KEY` | staging |
| `DEPLOY_HOST` | production |
| `DEPLOY_USER` | production |
| `DEPLOY_PATH` | production |
| `DEPLOY_SSH_KEY` | production |
| `GHCR_TOKEN` | both |

> `GHCR_TOKEN`: GitHub Personal Access Token with the `read:packages` scope.

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
