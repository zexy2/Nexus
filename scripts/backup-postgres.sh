#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%F-%H%M%S)"

mkdir -p "$BACKUP_DIR"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-nexus}" "${POSTGRES_DB:-nexus}" \
  > "$BACKUP_DIR/nexus-$STAMP.sql"

echo "Backup written to $BACKUP_DIR/nexus-$STAMP.sql"
