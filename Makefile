# BNS — Release & Deployment Management
#
# Usage:
#   make release v=1.2.3   → tag + push → CI builds images → auto-deploy to prod
#   make staging            → push dev → CI builds + deploy to staging
#   make rollback v=1.1.0  → redeploy a previous version to prod (via GitHub Actions)
#   make build              → build all images locally
#   make deploy v=1.2.3    → pull + run images locally (needs .env)

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

# ─── Release flow ─────────────────────────────────────────────────────────────

release: ## Create + push a release tag (triggers prod CI/CD). Usage: make release v=1.2.3
	@test -n "$(v)" || (echo "Usage: make release v=1.2.3" && exit 1)
	@git diff --quiet HEAD || (echo "✗ Uncommitted changes — commit first" && exit 1)
	@git tag -a v$(v) -m "v$(v)"
	@git push origin v$(v)
	@echo "✓ Tag v$(v) pushed → CI will build images and deploy to production"
	@echo "  Monitor: https://github.com/$(shell git remote get-url origin | sed 's|.*github.com[:/]||;s|.git$$||')/actions"

staging: ## Push current branch to dev (triggers staging CI/CD)
	@git push origin HEAD:dev
	@echo "✓ Pushed to dev → CI will build images and deploy to staging"

rollback: ## Redeploy a previous version via GitHub Actions. Usage: make rollback v=1.1.0 env=production
	@test -n "$(v)"   || (echo "Usage: make rollback v=1.1.0 [env=production|staging]" && exit 1)
	@gh workflow run deploy.yml \
	  --field environment=$(or $(env),production) \
	  --field tag=v$(v)
	@echo "✓ Rollback to v$(v) triggered on $(or $(env),production)"

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
	@IMAGE_TAG=$(IMAGE_TAG) REGISTRY=$(REGISTRY) $(COMPOSE) up -d
	@echo "✓ Services started ($(IMAGE_TAG))"

down: ## Stop all services
	$(COMPOSE) down

pull: ## Pull latest images for IMAGE_TAG
	@IMAGE_TAG=$(IMAGE_TAG) REGISTRY=$(REGISTRY) $(COMPOSE) pull

deploy: pull ## Pull images and redeploy (zero-downtime update)
	@IMAGE_TAG=$(IMAGE_TAG) REGISTRY=$(REGISTRY) $(COMPOSE) up -d --remove-orphans
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

# ─── Kubernetes ───────────────────────────────────────────────────────────────

k8s-apply: ## Apply all Kubernetes manifests
	kubectl apply -k deployments/kubernetes/

k8s-diff: ## Preview changes before applying
	kubectl diff -k deployments/kubernetes/

k8s-delete: ## Delete all K8s resources
	kubectl delete -k deployments/kubernetes/

k8s-status: ## Show pod status in bns namespace
	kubectl get pods -n bns -o wide

k8s-deploy: ## Deploy a specific image tag to K8s. Usage: make k8s-deploy v=1.2.3
	@test -n "$(v)" || (echo "Usage: make k8s-deploy v=1.2.3" && exit 1)
	@cd deployments/kubernetes && \
	  kustomize edit set image \
	    "REGISTRY/api=$(REGISTRY)/api:v$(v)" \
	    "REGISTRY/web=$(REGISTRY)/web:v$(v)" \
	    "REGISTRY/chat-service=$(REGISTRY)/chat-service:v$(v)" \
	    "REGISTRY/search-indexer=$(REGISTRY)/search-indexer:v$(v)"
	kubectl apply -k deployments/kubernetes/
	@echo "✓ K8s deployment updated to v$(v)"

.PHONY: help version release staging rollback build push up down pull deploy \
        logs ps restart k8s-apply k8s-diff k8s-delete k8s-status k8s-deploy
