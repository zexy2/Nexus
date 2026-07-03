#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date +%F-%H%M%S)"

source "$SCRIPT_DIR/lib/load-env.sh"
load_env_values "$ENV_FILE" POSTGRES_USER POSTGRES_DB

mkdir -p "$BACKUP_DIR"

backup_file="$BACKUP_DIR/nexus-$STAMP.sql"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-nexus}" "${POSTGRES_DB:-nexus}" \
  > "$backup_file"

chmod 600 "$backup_file"

if [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( BACKUP_RETENTION_DAYS > 0 )); then
  find "$BACKUP_DIR" -type f \
    \( -name 'nexus-[0-9][0-9][0-9][0-9]-*.sql' -o -name 'nexus-[0-9][0-9][0-9][0-9]-*.sql.gz' \) \
    -mtime "+$BACKUP_RETENTION_DAYS" \
    -delete
fi

echo "Backup written to $backup_file"
