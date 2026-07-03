#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
CURL_TIMEOUT_SECONDS="${CURL_TIMEOUT_SECONDS:-15}"
HEALTH_REQUIRE_OVERALL_HEALTHY="${HEALTH_REQUIRE_OVERALL_HEALTHY:-false}"
HEALTH_LOG_RETENTION_DAYS="${HEALTH_LOG_RETENTION_DAYS:-14}"
LOG_DIR="${LOG_DIR:-logs/maintenance}"

mkdir -p "$LOG_DIR"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log_file="$LOG_DIR/health-$(date +%F).log"
health_url="${BASE_URL%/}/api/health"

body="$(curl -fsS --max-time "$CURL_TIMEOUT_SECONDS" "$health_url")"

overall_status="unknown"
commit_sha="unknown"
worker_status="unknown"

if command -v node >/dev/null 2>&1; then
  parsed="$(
    BODY="$body" node <<'NODE'
const health = JSON.parse(process.env.BODY || "{}");
const parts = [
  health.status || "unknown",
  health.commitSha || "unknown",
  health.services?.worker?.status || "unknown",
];
process.stdout.write(parts.join("\t"));
NODE
  )"
  IFS=$'\t' read -r overall_status commit_sha worker_status <<<"$parsed"
fi

printf '%s status=%s worker=%s commit=%s url=%s\n' \
  "$timestamp" "$overall_status" "$worker_status" "$commit_sha" "$health_url" >> "$log_file"

if ! printf '%s' "$body" | grep -q '"database"'; then
  echo "Health response did not include database service." >&2
  exit 1
fi

if ! printf '%s' "$body" | grep -q '"worker"'; then
  echo "Health response did not include worker service." >&2
  exit 1
fi

if [[ "$HEALTH_REQUIRE_OVERALL_HEALTHY" == "true" && "$overall_status" != "healthy" ]]; then
  echo "Health status is $overall_status, expected healthy." >&2
  exit 1
fi

if [[ "$HEALTH_LOG_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( HEALTH_LOG_RETENTION_DAYS > 0 )); then
  find "$LOG_DIR" -type f -name 'health-*.log' -mtime "+$HEALTH_LOG_RETENTION_DAYS" -delete
fi
