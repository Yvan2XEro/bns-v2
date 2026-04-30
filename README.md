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

Three deployment modes are available — see [docs/ci-cd.md](docs/ci-cd.md) for full details.

**Docker Compose (Dokploy / VPS)**
```bash
# CI/CD runs automatically: push to dev → staging, tag v* → prod
make staging          # push to dev → staging
make release v=1.2.3  # tag + push → production
make rollback v=1.1.0 # rollback production
```

**Kubernetes (Kustomize)**
```bash
make k8s-apply
make k8s-deploy v=1.2.3
```

**Managed cloud EKS / AKS (Pulumi)**
```bash
make infra-up STACK=aws-prod
make infra-tag v=1.2.3 STACK=aws-prod
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
