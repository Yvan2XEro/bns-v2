# BNS — BuyNSellem

Classifieds platform — API (Payload CMS), Web (Next.js), Chat (WebSocket), Mobile (Expo).

## Packages

| Package | Description | Port |
|---------|-------------|------|
| `packages/api` | REST API + CMS (Payload v3 / MongoDB) | 3000 |
| `packages/web` | Next.js frontend | 3001 |
| `packages/chat-service` | Real-time WebSocket service | 4000 |
| `packages/search-indexer` | Meilisearch indexing worker | — |
| `packages/mobile` | Expo app (iOS / Android) | — |

## Quick start (local development)

```bash
bun install
docker compose up -d   # MongoDB, Redis, Meilisearch
bun run dev
```

## Documentation

| Doc | Content |
|-----|---------|
| [CI/CD & Versioning](docs/ci-cd.md) | Workflows, release flow, Makefile reference, Pulumi (EKS/AKS) |
| [Local setup](docs/local-setup.md) | Prerequisites, environment variables, running the stack |
| [OAuth](docs/oauth-setup.md) | Google, Apple, Facebook OAuth configuration |
| [Notifications (Novu)](docs/novu-workflows.md) | Notification workflows |
| [Mobile](docs/mobile-implementation-guide.md) | Mobile implementation guide |

## Deployment

Staging runs on Docker Compose (Dokploy); production on Kubernetes through
the Pulumi stack in `infra/` — see [docs/ci-cd.md](docs/ci-cd.md) and
[docs/runbook-aks-production.md](docs/runbook-aks-production.md).

**Staging — Docker Compose (Dokploy)**
```bash
make staging          # push to dev → CI builds the images → Dokploy redeploys
```

**Production — Kubernetes via Pulumi (AKS / EKS / K3s)**
```bash
make release v=1.2.3                      # tag + push → GitHub Actions builds the images
make check                                # preflight, read-only
make infra-tag v=1.2.3 STACK=azure-prod   # deploy (an older v=… rolls back)
```

## Tech stack

- **Runtime**: Bun
- **Monorepo**: Turborepo
- **Database**: MongoDB (Payload), Redis (cache / queues)
- **Search**: Meilisearch
- **Notifications**: Novu
- **Payments**: Stripe, NotchPay
- **Auth**: Google, Apple, Facebook OAuth
- **Infrastructure as Code**: Pulumi (TypeScript)
- **CI/CD**: GitHub Actions + GHCR
