#!/usr/bin/env bash
# One-time (and after every local stack-config change) GitHub setup for the
# production deploy workflow (.github/workflows/deploy-production.yml).
#
#   make prod-ci-setup [STACK=azure-prod] [GHFILE=.env.deploy.prod] [REVIEWERS=login1,login2]
#
# - Creates the environments `production-preview` (no approval) and
#   `production` (approval by REVIEWERS, default: you), both limited to `v*`
#   tags so no branch can reach their secrets.
# - Uploads to both: AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
#   PULUMI_CONFIG_PASSPHRASE, MONGODB_ATLAS_PUBLIC_KEY/_PRIVATE_KEY (Atlas
#   only), and PULUMI_STACK_CONFIG — the base64 of infra/.stacks/Pulumi.<stack>.yaml
#   (its secret values stay encrypted with the passphrase).
# - Sets the repository variables PULUMI_BACKEND_URL, PRODUCTION_STACK and
#   PRODUCTION_URL.
#
# Values come from the shell first, then from GHFILE (git-ignored). They are
# piped to gh and never printed. Requires: gh auth login (repo admin).
set -euo pipefail

stack="${STACK:-azure-prod}"
ghfile="${GHFILE:-.env.deploy.prod}"
repo_dir="$(cd "$(dirname "$0")/../.." && pwd)"
stack_file="$repo_dir/infra/.stacks/Pulumi.$stack.yaml"

command -v gh >/dev/null || { echo "✗ gh CLI not installed" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ gh not logged in: gh auth login" >&2; exit 1; }
[ -f "$stack_file" ] || { echo "✗ no $stack_file — bun run infra:stack:init --stack $stack first" >&2; exit 1; }

value() { # shell first, then GHFILE
	local name="$1"
	if [ -n "${!name:-}" ]; then printf '%s' "${!name}"; return; fi
	[ -f "$repo_dir/$ghfile" ] && grep "^$name=" "$repo_dir/$ghfile" | tail -1 | cut -d= -f2- || true
}

REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
echo "repo $REPO, stack $stack"

# Reviewers: logins → ids.
reviewers_json="["
IFS=',' read -r -a logins <<< "${REVIEWERS:-$(gh api user -q .login)}"
for login in "${logins[@]}"; do
	id=$(gh api "users/$login" -q .id)
	reviewers_json+="{\"type\":\"User\",\"id\":$id},"
done
reviewers_json="${reviewers_json%,}]"

for env in production-preview production; do
	if [ "$env" = production ]; then
		body="{\"reviewers\":$reviewers_json,\"deployment_branch_policy\":{\"protected_branches\":false,\"custom_branch_policies\":true}}"
	else
		body='{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'
	fi
	printf '%s' "$body" | gh api "repos/$REPO/environments/$env" --method PUT --input - --silent
	# Only `v*` tags may deploy (idempotent: an existing policy answers 422/409).
	gh api "repos/$REPO/environments/$env/deployment-branch-policies" --method POST \
		-f name='v*' -f type=tag --silent 2>/dev/null || true
	echo "✓ environment $env (tags v* only$([ "$env" = production ] && echo ", approval: ${REVIEWERS:-you}"))"

	for name in AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID PULUMI_CONFIG_PASSPHRASE MONGODB_ATLAS_PUBLIC_KEY MONGODB_ATLAS_PRIVATE_KEY; do
		v=$(value "$name")
		if [ -n "$v" ]; then
			printf '%s' "$v" | gh secret set "$name" --env "$env" --repo "$REPO" >/dev/null
			echo "  ✓ $name"
		else
			case "$name" in MONGODB_ATLAS_*) ;; *) echo "  ✗ $name not in the shell nor $ghfile" ;; esac
		fi
	done
	base64 -w0 "$stack_file" | gh secret set PULUMI_STACK_CONFIG --env "$env" --repo "$REPO" >/dev/null
	echo "  ✓ PULUMI_STACK_CONFIG (from infra/.stacks/Pulumi.$stack.yaml)"
done

backend=$(value PULUMI_BACKEND_URL)
if [ -n "$backend" ]; then
	gh variable set PULUMI_BACKEND_URL --body "$backend" --repo "$REPO" >/dev/null
	echo "✓ variable PULUMI_BACKEND_URL"
else
	echo "✗ PULUMI_BACKEND_URL not in the shell nor $ghfile (azblob://<container>?storage_account=<account>)"
fi
gh variable set PRODUCTION_STACK --body "$stack" --repo "$REPO" >/dev/null
echo "✓ variable PRODUCTION_STACK=$stack"
domain=$(cd "$repo_dir/infra" && pulumi config get domain --stack "$stack" 2>/dev/null || true)
if [ -n "$domain" ]; then
	gh variable set PRODUCTION_URL --body "https://$domain" --repo "$REPO" >/dev/null
	echo "✓ variable PRODUCTION_URL=https://$domain"
fi
