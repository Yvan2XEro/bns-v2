#!/usr/bin/env bash
# Restores a mongodump archive into the stack's Atlas database, for the first
# production deploy (docs/runbook-aks-production.md).
#
#   infra/scripts/restore-to-atlas.sh --stack azure-prod --archive ./bns.archive.gz [--from-db bns]
#
# - Refuses unless the stack has `apiPaused: true`: nothing may write while
#   collections are dropped and reloaded.
# - Reads the connection string from the stack's secret output and hands it
#   to the container through the environment: it is never printed or put on
#   a command line.
# - Needs docker (runs mongo:7's mongorestore) and pulumi logged in to the
#   stack's backend; your IP must be in `atlas.accessCidrs`.
set -euo pipefail

stack=""
archive=""
from_db="bns"
while [ $# -gt 0 ]; do
	case "$1" in
		--stack) stack="$2"; shift 2 ;;
		--archive) archive="$2"; shift 2 ;;
		--from-db) from_db="$2"; shift 2 ;;
		*) echo "✗ unknown argument: $1" >&2; exit 2 ;;
	esac
done
[ -n "$stack" ] && [ -n "$archive" ] || {
	echo "Usage: $0 --stack <stack> --archive <file.archive.gz> [--from-db bns]" >&2
	exit 2
}
[ -f "$archive" ] || { echo "✗ no such archive: $archive" >&2; exit 1; }

infra_dir="$(cd "$(dirname "$0")/.." && pwd)"
paused=$(cd "$infra_dir" && pulumi config get apiPaused --stack "$stack" 2>/dev/null || true)
if [ "$paused" != "true" ]; then
	echo "✗ $stack does not have apiPaused: true — pause the API first:" >&2
	echo "    pulumi config set apiPaused true --stack $stack && pulumi up --stack $stack" >&2
	exit 1
fi

DATABASE_URI=$(cd "$infra_dir" && pulumi stack output databaseUri --show-secrets --stack "$stack")
[ -n "$DATABASE_URI" ] || { echo "✗ the stack has no databaseUri output (database: atlas?)" >&2; exit 1; }
to_db=$(printf '%s' "$DATABASE_URI" | sed -E 's|^[^/]*//[^/]*/([^?]*).*|\1|')
export DATABASE_URI

archive_dir="$(cd "$(dirname "$archive")" && pwd)"
archive_name="$(basename "$archive")"

echo "→ restoring $archive_name ($from_db.*) into $to_db on $stack, dropping each collection first"
docker run --rm -e DATABASE_URI -v "$archive_dir:/backup:ro" mongo:7 \
	sh -c 'mongorestore --uri "$DATABASE_URI" --archive="/backup/$1" --gzip --drop \
		--nsInclude "$2.*" --nsFrom "$2.*" --nsTo "$3.*" --numInsertionWorkersPerCollection 4' \
	restore "$archive_name" "$from_db" "$to_db"

echo "→ document counts after the restore"
docker run --rm -e DATABASE_URI mongo:7 \
	sh -c 'mongosh "$DATABASE_URI" --quiet --eval "
		for (const name of db.getCollectionNames().sort()) {
			print(name.padEnd(40) + db.getCollection(name).estimatedDocumentCount());
		}"'

echo "✓ restored. Next: unpause the API (pulumi config set apiPaused false && pulumi up)."
