#!/usr/bin/env bash
# Restores a mongodump archive into the stack's in-cluster MongoDB
# (database: in-cluster) — the first production deploy from a staging dump,
# or a nightly backup (docs/runbook-aks-production.md).
#
#   infra/scripts/restore-mongo.sh --stack azure-prod --archive ./bns.archive.gz [--from-db bns]
#   infra/scripts/restore-mongo.sh --stack azure-prod --backup latest
#   infra/scripts/restore-mongo.sh --stack azure-prod --backup bns/2026/11/18/010003Z.archive.gz
#
# - Refuses unless the stack has `apiPaused: true`: nothing may write while
#   collections are dropped and reloaded.
# - Uses the current kubectl context (`az aks get-credentials` first) and
#   says which one; the database credentials never leave the pod.
# - `--backup` downloads from the stack's backup storage account with your
#   `az login` (needs read access to its keys or blobs).
set -euo pipefail

stack=""
archive=""
backup=""
from_db=""
while [ $# -gt 0 ]; do
	case "$1" in
		--stack) stack="$2"; shift 2 ;;
		--archive) archive="$2"; shift 2 ;;
		--backup) backup="$2"; shift 2 ;;
		--from-db) from_db="$2"; shift 2 ;;
		*) echo "✗ unknown argument: $1" >&2; exit 2 ;;
	esac
done
if [ -z "$stack" ] || { [ -z "$archive" ] && [ -z "$backup" ]; }; then
	echo "Usage: $0 --stack <stack> (--archive <file.archive.gz> | --backup latest|<blob>) [--from-db bns]" >&2
	exit 2
fi

infra_dir="$(cd "$(dirname "$0")/.." && pwd)"
pulumi_cfg() { (cd "$infra_dir" && pulumi config get "$1" --stack "$stack" 2>/dev/null) || true; }

if [ "$(pulumi_cfg apiPaused)" != "true" ]; then
	echo "✗ $stack does not have apiPaused: true — pause the API first:" >&2
	echo "    (cd infra && pulumi config set apiPaused true --stack $stack && pulumi up --stack $stack)" >&2
	exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

if [ -n "$backup" ]; then
	account=$(cd "$infra_dir" && pulumi stack output backupStorageAccount --stack "$stack")
	[ -n "$account" ] || { echo "✗ the stack has no backupStorageAccount (mongoBackup off?)" >&2; exit 1; }
	if [ "$backup" = "latest" ]; then
		backup=$(az storage blob list --only-show-errors --auth-mode key \
			--account-name "$account" --container-name mongo-backups \
			--query "sort_by(@, &properties.lastModified)[-1].name" -o tsv)
		[ -n "$backup" ] || { echo "✗ no backup found in $account" >&2; exit 1; }
	fi
	echo "→ downloading $backup from $account"
	az storage blob download --only-show-errors --no-progress --auth-mode key \
		--account-name "$account" --container-name mongo-backups \
		--name "$backup" --file "$workdir/restore.archive.gz" >/dev/null
	archive="$workdir/restore.archive.gz"
	# A backup's blob name starts with the database it was taken from.
	from_db="${from_db:-${backup%%/*}}"
fi
[ -f "$archive" ] || { echo "✗ no such archive: $archive" >&2; exit 1; }
from_db="${from_db:-bns}"

context=$(kubectl config current-context)
pod=mongodb-0
echo "→ kubectl context: $context — restoring into bns/$pod"
read -r -p "  Drop and reload every $from_db collection there? [y/N] " answer
[ "$answer" = "y" ] || { echo "aborted"; exit 1; }

kubectl -n bns cp "$archive" "$pod:/tmp/restore.archive.gz"
kubectl -n bns exec "$pod" -- bash -c '
	set -euo pipefail
	to_db="$MONGO_INITDB_DATABASE"
	mongorestore --host localhost --username "$MONGO_INITDB_ROOT_USERNAME" \
		--password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
		--archive=/tmp/restore.archive.gz --gzip --drop \
		--nsInclude "$1.*" --nsFrom "$1.*" --nsTo "$to_db.*"
	rm -f /tmp/restore.archive.gz
	echo "→ document counts in $to_db"
	mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" \
		--password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$to_db" --eval "
		for (const name of db.getCollectionNames().sort()) {
			print(name.padEnd(40) + db.getCollection(name).estimatedDocumentCount());
		}"
' restore "$from_db"

echo "✓ restored. Next: unpause the API (pulumi config set apiPaused false && pulumi up)."
