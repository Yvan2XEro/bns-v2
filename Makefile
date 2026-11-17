# BNS — Release & Deployment Management
#
# Usage:
#   make staging            → push dev → CI builds images → Dokploy redeploys staging
#   make release v=1.2.3   → tag + push → CI builds the v1.2.3 images (no deploy)
#   make check              → production preflight (stack, values, images, live)
#   make infra-tag v=1.2.3 STACK=azure-prod → deploy that release (Pulumi)
#   make rollback v=1.1.0  → production back to v1.1.0 (Pulumi), env=staging for staging
#   make build              → build all images locally
#   make deploy IMAGE_TAG=v1.2.3 → pull + run images with docker compose (needs .env,
#                                  see deployments/docker-compose/.env.example)

REGISTRY  ?= ghcr.io/$(shell git remote get-url origin 2>/dev/null | sed 's|.*github\.com[:/]||;s|\.git$$||' | tr '[:upper:]' '[:lower:]')
VERSION   ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
IMAGE_TAG ?= $(VERSION)
SERVICES  := api web chat-service search-indexer
COMPOSE   := docker compose -f deployments/docker-compose/docker-compose.yml

.DEFAULT_GOAL := help

# ─── Info ────────────────────────────────────────────────────────────────────

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) | sort \
	  | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-20s\033[0m %s\n",$$1,$$2}'

version: ## Show current version and registry
	@echo "VERSION  = $(VERSION)"
	@echo "REGISTRY = $(REGISTRY)"
	@echo "IMAGE_TAG= $(IMAGE_TAG)"

# ─── GitHub deploy secrets ───────────────────────────────────────────────────
# The workflows read only the secrets that reach a server; the application's
# own keys live in the server's .env or the Dokploy app's Environment tab
# (deployments/docker-compose/.env.example), never in GitHub.
#
# GHFILE (default: .env.deploy, git-ignored by the .env* rule) holds, per ENV:
#   staging:     DOKPLOY_DEPLOY_URL, GHCR_TOKEN, and for `make rollback env=staging`
#                STAGING_HOST STAGING_USER STAGING_PATH STAGING_SSH_KEY_FILE
#   production:  DEPLOY_HOST DEPLOY_USER DEPLOY_PATH DEPLOY_SSH_KEY_FILE GHCR_TOKEN
# *_SSH_KEY_FILE is a path to the private key file; its content is uploaded.
# Values are piped to gh, never printed.
# Requires: gh CLI authenticated (gh auth login)
#
# Usage:
#   make setup-secrets                                → staging from .env.deploy
#   make setup-secrets ENV=production GHFILE=.env.deploy.prod
#   make secrets-list ENV=staging                     → names of what is set

GHFILE ?= .env.deploy
ENV    ?= staging

STAGING_SECRETS    := DOKPLOY_DEPLOY_URL GHCR_TOKEN STAGING_HOST STAGING_USER STAGING_PATH
PRODUCTION_SECRETS := DEPLOY_HOST DEPLOY_USER DEPLOY_PATH GHCR_TOKEN

setup-secrets: ## Sync the deploy secrets from GHFILE to a GitHub environment. Usage: make setup-secrets [ENV=staging|production] [GHFILE=.env.deploy]
	@test -f "$(GHFILE)" || { echo "✗ $(GHFILE) not found"; exit 1; }
	@command -v gh >/dev/null || { echo "✗ gh CLI not installed"; exit 1; }
	@case "$(ENV)" in \
	   staging)    keys="$(STAGING_SECRETS)";    ssh=STAGING_SSH_KEY ;; \
	   production) keys="$(PRODUCTION_SECRETS)"; ssh=DEPLOY_SSH_KEY ;; \
	   *) echo "✗ ENV must be staging or production"; exit 1 ;; \
	 esac; \
	 REPO=$$(gh repo view --json nameWithOwner -q .nameWithOwner); \
	 gh api "repos/$$REPO/environments/$(ENV)" --method PUT --silent; \
	 echo "✓ environment: $(ENV)  repo: $$REPO"; \
	 for key in $$keys; do \
	   val=$$(grep "^$$key=" "$(GHFILE)" | tail -1 | cut -d= -f2-); \
	   if [ -n "$$val" ]; then \
	     printf '%s' "$$val" | gh secret set "$$key" --env "$(ENV)" --repo "$$REPO" >/dev/null && echo "  ✓ $$key"; \
	   else \
	     echo "  - $$key (not in $(GHFILE), skipped)"; \
	   fi; \
	 done; \
	 keyfile=$$(grep "^$${ssh}_FILE=" "$(GHFILE)" | tail -1 | cut -d= -f2-); \
	 if [ -n "$$keyfile" ] && [ -f "$$keyfile" ]; then \
	   gh secret set "$$ssh" --env "$(ENV)" --repo "$$REPO" < "$$keyfile" >/dev/null && echo "  ✓ $$ssh (from file)"; \
	 else \
	   echo "  - $$ssh ($${ssh}_FILE not set or not a file, skipped)"; \
	 fi

secrets-list: ## Show the names of the secrets set for ENV. Usage: make secrets-list [ENV=staging]
	@REPO=$$(gh repo view --json nameWithOwner -q .nameWithOwner); \
	 echo "── Secrets ($(ENV)) ──"; \
	 gh secret list --env "$(ENV)" --repo "$$REPO"

# ─── Release flow ─────────────────────────────────────────────────────────────

release: ## Create + push a release tag; CI builds its images. Usage: make release v=1.2.3
	@test -n "$(v)" || (echo "Usage: make release v=1.2.3" && exit 1)
	@git diff --quiet HEAD || (echo "✗ Uncommitted changes — commit first" && exit 1)
	@git tag -a v$(v) -m "v$(v)"
	@git push origin v$(v)
	@echo "✓ Tag v$(v) pushed → GitHub Actions builds the v$(v) images"
	@echo "  Then: make check && make infra-tag v=$(v) STACK=$(PROD_STACK)"
	@echo "  Monitor: https://github.com/$(shell git remote get-url origin | sed 's|.*github.com[:/]||;s|.git$$||')/actions"

staging: ## Push current branch to dev (triggers staging CI/CD)
	@git push origin HEAD:dev
	@echo "✓ Pushed to dev → CI builds the images, then Dokploy redeploys staging"

rollback: ## Back to a previous release. Usage: make rollback v=1.1.0 [env=production|staging]
	@test -n "$(v)"   || (echo "Usage: make rollback v=1.1.0 [env=production|staging]" && exit 1)
	@if [ "$(or $(env),production)" = "production" ]; then \
	  $(MAKE) --no-print-directory infra-tag v=$(v) STACK=$(PROD_STACK); \
	else \
	  gh workflow run deploy.yml --field environment=$(env) --field tag=v$(v) && \
	  echo "✓ Rollback to v$(v) triggered on $(env)"; \
	fi

# ─── Local build ──────────────────────────────────────────────────────────────

build: ## Build all Docker images locally (IMAGE_TAG=x.y.z to override)
	@echo "Building $(SERVICES) — tag: $(IMAGE_TAG)"
	@for svc in $(SERVICES); do \
	  echo "\n→ $$svc"; \
	  docker build -t $(REGISTRY)/$$svc:$(IMAGE_TAG) -f packages/$$svc/Dockerfile . || exit 1; \
	done
	@echo "\n✓ All images built as $(IMAGE_TAG)"

build-%: ## Build a single service. Usage: make build-api
	docker build -t $(REGISTRY)/$*:$(IMAGE_TAG) -f packages/$*/Dockerfile .
	@echo "✓ $(REGISTRY)/$*:$(IMAGE_TAG)"

push: build ## Build and push all images to registry
	@for svc in $(SERVICES); do \
	  docker push $(REGISTRY)/$$svc:$(IMAGE_TAG); \
	done
	@echo "✓ All images pushed as $(IMAGE_TAG)"

# ─── Local docker-compose ─────────────────────────────────────────────────────

up: ## Start all services with docker-compose (uses IMAGE_TAG env var)
	@IMAGE_TAG=$(IMAGE_TAG) IMAGE_REGISTRY=$(REGISTRY) $(COMPOSE) up -d
	@echo "✓ Services started ($(IMAGE_TAG))"

down: ## Stop all services
	$(COMPOSE) down

pull: ## Pull latest images for IMAGE_TAG
	@IMAGE_TAG=$(IMAGE_TAG) IMAGE_REGISTRY=$(REGISTRY) $(COMPOSE) pull

deploy: pull ## Pull images and redeploy (zero-downtime update)
	@IMAGE_TAG=$(IMAGE_TAG) IMAGE_REGISTRY=$(REGISTRY) $(COMPOSE) up -d --remove-orphans
	@docker image prune -f
	@echo "✓ Deployed $(IMAGE_TAG)"

logs: ## Tail logs from all services
	$(COMPOSE) logs -f --tail=100

logs-%: ## Tail logs from a specific service. Usage: make logs-api
	$(COMPOSE) logs -f --tail=100 $*

ps: ## Show running containers
	$(COMPOSE) ps

restart-%: ## Restart a specific service. Usage: make restart-api
	$(COMPOSE) restart $*

# ─── Pulumi (EKS / AKS) ───────────────────────────────────────────────────────
# Prerequisites: pulumi CLI, Node.js, AWS CLI or Azure CLI authenticated
#
# First time setup:
#   cd infra && bun install
#   pulumi stack init aws-staging   (or azure-staging / aws-prod / azure-prod)
#   pulumi config set --secret ghcrToken <your-github-pat>
#   pulumi config set --secret mongoPassword <password>
#   ... (see Pulumi.<stack>.yaml for the full list)
#
# Stacks: aws-staging | aws-prod | azure-staging | azure-prod

STACK ?= aws-staging
PULUMI := cd infra && pulumi

infra-install: ## Install Pulumi dependencies
	cd infra && bun install

infra-preview: ## Preview infra changes. Usage: make infra-preview [STACK=azure-prod]
	$(PULUMI) preview --stack $(STACK)

infra-up: ## Create / update cloud infra. Usage: make infra-up [STACK=azure-prod]
	$(PULUMI) up --stack $(STACK)

infra-down: ## Destroy infra stack. Usage: make infra-down STACK=aws-staging
	@test -n "$(STACK)" || (echo "Usage: make infra-down STACK=<name>" && exit 1)
	$(PULUMI) destroy --stack $(STACK)

infra-refresh: ## Refresh stack state from cloud reality
	$(PULUMI) refresh --stack $(STACK)

infra-tag: ## Update image tag in running cluster. Usage: make infra-tag v=1.2.3 [STACK=aws-prod]
	@test -n "$(v)" || (echo "Usage: make infra-tag v=1.2.3 [STACK=aws-prod]" && exit 1)
	$(PULUMI) config set imageTag v$(v) --stack $(STACK)
	$(PULUMI) up --stack $(STACK)
	@echo "✓ Cluster updated to v$(v) on stack $(STACK)"

# Production's Pulumi stack: `make check` and `make rollback` use it unless
# STACK is given on the command line (STACK's own default is aws-staging).
PROD_STACK := $(if $(filter command line,$(origin STACK)),$(STACK),azure-prod)

check: ## Production preflight, read-only. Usage: make check [STACK=azure-prod] [ENV_FILE=.env.azure-prod] [STAGING_ENV=.env.staging]
	@cd infra && bun scripts/preflight.ts --stack $(PROD_STACK) \
	  $(if $(ENV_FILE),--env $(ENV_FILE)) $(if $(STAGING_ENV),--staging-env $(STAGING_ENV))

k8s-status: ## Pod status in the bns namespace of the current kubectl context (the Pulumi cluster)
	kubectl get pods -n bns -o wide

infra-output: ## Show stack outputs (kubeconfig, cluster name)
	$(PULUMI) stack output --stack $(STACK)

.PHONY: help version release staging rollback build push up down pull deploy \
        logs ps restart k8s-status \
        infra-install infra-preview infra-up infra-down infra-refresh infra-tag infra-output \
        setup-secrets secrets-list check
