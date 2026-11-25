#!/bin/sh
# Idempotent Temporal SQL schema setup/upgrade for Postgres.
#
# Runs inside temporalio/admin-tools (Alpine, POSIX sh, no bash/psql) as the
# one-shot `temporal-schema` compose service, before the `temporal` server
# starts. It replaces what temporalio/auto-setup did on every container start:
#
#   1. create the database                (no-op if it already exists)
#   2. setup-schema -v 0.0                (creates the version tables only if
#                                          missing; skipped when the recorded
#                                          version is already > 0.0)
#   3. update-schema -d <versioned dir>   (applies only the versions newer than
#                                          the recorded one; no-op when current)
#
# The versioned directories ship inside the admin-tools image, so the schema
# is brought up to exactly what that image's server version needs. Keep the
# admin-tools and server tags identical (TEMPORAL_SERVER_VERSION in compose).
# Schema upgrades are one-way: roll back by restoring a dump, never by
# running an older image against an upgraded schema.
#
# Env: DB (postgres12), DB_PORT, POSTGRES_SEEDS, POSTGRES_USER,
#      SQL_PASSWORD (read by temporal-sql-tool), DBNAME, VISIBILITY_DBNAME.
set -eu

: "${POSTGRES_SEEDS:?POSTGRES_SEEDS is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${SQL_PASSWORD:?SQL_PASSWORD is required}"

PLUGIN="${DB:-postgres12}"
PORT="${DB_PORT:-5432}"
SCHEMA_ROOT="${TEMPORAL_SCHEMA_ROOT:-/etc/temporal/schema/postgresql/v12}"

echo "temporal-schema: waiting for ${POSTGRES_SEEDS}:${PORT}"
i=0
until nc -z -w 5 "$POSTGRES_SEEDS" "$PORT"; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "temporal-schema: postgres not reachable" >&2
    exit 1
  fi
  sleep 2
done

sql_tool() {
  db="$1"
  shift
  temporal-sql-tool --plugin "$PLUGIN" --ep "$POSTGRES_SEEDS" -p "$PORT" \
    -u "$POSTGRES_USER" --db "$db" "$@"
}

migrate() {
  db="$1"
  dir="$SCHEMA_ROOT/$2/versioned"
  [ -d "$dir" ] || { echo "temporal-schema: missing $dir" >&2; exit 1; }
  latest="$(find "$dir" -mindepth 1 -maxdepth 1 -name "v*" | sed "s|.*/v||" | sort -t. -k1,1n -k2,2n | tail -n 1)"
  echo "temporal-schema: ${db} -> target v${latest} (${dir})"
  sql_tool "$db" create
  sql_tool "$db" setup-schema -v 0.0
  sql_tool "$db" update-schema -d "$dir"
}

migrate "${DBNAME:-temporal}" temporal
migrate "${VISIBILITY_DBNAME:-temporal_visibility}" visibility

echo "temporal-schema: done"
