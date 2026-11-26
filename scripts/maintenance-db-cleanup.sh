#!/usr/bin/env bash
# Prunes append-only bookkeeping tables that otherwise grow forever.
#
# workflow_activity_receipts holds idempotency receipts for activity retries.
# A receipt is only needed while its workflow can still retry the activity
# (plan-impact reviews wait at most 72h), so rows older than
# RECEIPT_RETENTION_DAYS (default 30) are safe to delete.
#
# ai_traces holds per-call AI metadata for the admin usage view, which only
# looks back 7 days; rows older than AI_TRACE_RETENTION_DAYS (default 30) are
# deleted. Skipped when the table does not exist yet (migration not applied).
#
# notifications older than NOTIFICATION_RETENTION_DAYS (default 90) are deleted.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
LOG_DIR="${LOG_DIR:-logs/maintenance}"
RECEIPT_RETENTION_DAYS="${RECEIPT_RETENTION_DAYS:-30}"
AI_TRACE_RETENTION_DAYS="${AI_TRACE_RETENTION_DAYS:-30}"
NOTIFICATION_RETENTION_DAYS="${NOTIFICATION_RETENTION_DAYS:-90}"
CLEANUP_LOG_RETENTION_DAYS="${CLEANUP_LOG_RETENTION_DAYS:-30}"

source "$SCRIPT_DIR/lib/load-env.sh"
load_env_values "$ENV_FILE" POSTGRES_USER POSTGRES_DB

if ! [[ "$RECEIPT_RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RECEIPT_RETENTION_DAYS < 7 )); then
  echo "RECEIPT_RETENTION_DAYS must be an integer >= 7 (got '$RECEIPT_RETENTION_DAYS')." >&2
  exit 1
fi

if ! [[ "$NOTIFICATION_RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( NOTIFICATION_RETENTION_DAYS < 7 )); then
  echo "NOTIFICATION_RETENTION_DAYS must be an integer >= 7 (got '$NOTIFICATION_RETENTION_DAYS')." >&2
  exit 1
fi

if ! [[ "$AI_TRACE_RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( AI_TRACE_RETENTION_DAYS < 7 )); then
  echo "AI_TRACE_RETENTION_DAYS must be an integer >= 7 (got '$AI_TRACE_RETENTION_DAYS')." >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
log_file="$LOG_DIR/db-cleanup-$(date +%F).log"
timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# -At prints only the DELETE command tag ("DELETE <n>").
result="$(
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${POSTGRES_USER:-nexus}" -d "${POSTGRES_DB:-nexus}" -v ON_ERROR_STOP=1 -At <<SQL
DELETE FROM workflow_activity_receipts
WHERE created_at < now() - interval '$RECEIPT_RETENTION_DAYS days';
SQL
)"

printf '%s workflow_activity_receipts retention=%sd result=%s\n' \
  "$timestamp" "$RECEIPT_RETENTION_DAYS" "${result:-unknown}" >> "$log_file"
echo "workflow_activity_receipts: ${result:-unknown} (older than $RECEIPT_RETENTION_DAYS days)"

has_ai_traces="$(
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${POSTGRES_USER:-nexus}" -d "${POSTGRES_DB:-nexus}" -v ON_ERROR_STOP=1 -At \
    -c "SELECT to_regclass('public.ai_traces') IS NOT NULL"
)"

if [[ "$has_ai_traces" == "t" ]]; then
  ai_result="$(
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
      psql -U "${POSTGRES_USER:-nexus}" -d "${POSTGRES_DB:-nexus}" -v ON_ERROR_STOP=1 -At <<SQL
DELETE FROM ai_traces
WHERE created_at < now() - interval '$AI_TRACE_RETENTION_DAYS days';
SQL
  )"
else
  ai_result="skipped (table missing)"
fi

printf '%s ai_traces retention=%sd result=%s\n' \
  "$timestamp" "$AI_TRACE_RETENTION_DAYS" "${ai_result:-unknown}" >> "$log_file"
echo "ai_traces: ${ai_result:-unknown} (older than $AI_TRACE_RETENTION_DAYS days)"

# In-app notifications: the bell lists the latest 30, so old rows are dead
# weight. Skipped until migration 0019 created the table.
has_notifications="$(
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "${POSTGRES_USER:-nexus}" -d "${POSTGRES_DB:-nexus}" -v ON_ERROR_STOP=1 -At \
    -c "SELECT to_regclass('public.notifications') IS NOT NULL"
)"

if [[ "$has_notifications" == "t" ]]; then
  notification_result="$(
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
      psql -U "${POSTGRES_USER:-nexus}" -d "${POSTGRES_DB:-nexus}" -v ON_ERROR_STOP=1 -At <<SQL
DELETE FROM notifications
WHERE created_at < now() - interval '$NOTIFICATION_RETENTION_DAYS days';
SQL
  )"
else
  notification_result="skipped (table missing)"
fi

printf '%s notifications retention=%sd result=%s\n' \
  "$timestamp" "$NOTIFICATION_RETENTION_DAYS" "${notification_result:-unknown}" >> "$log_file"
echo "notifications: ${notification_result:-unknown} (older than $NOTIFICATION_RETENTION_DAYS days)"

if [[ "$CLEANUP_LOG_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( CLEANUP_LOG_RETENTION_DAYS > 0 )); then
  find "$LOG_DIR" -type f -name 'db-cleanup-*.log' -mtime "+$CLEANUP_LOG_RETENTION_DAYS" -delete
fi
