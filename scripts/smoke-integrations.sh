#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.local}"

# shellcheck source=lib/load-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/load-env.sh"
load_env_values "$ENV_FILE" \
  APP_URL \
  NEXT_PUBLIC_APP_URL \
  INTEGRATION_TOKEN_ENCRYPTION_KEY \
  GITHUB_APP_ID \
  GITHUB_APP_SLUG \
  GITHUB_APP_PRIVATE_KEY \
  GITHUB_APP_CLIENT_ID \
  GITHUB_APP_CLIENT_SECRET \
  GITHUB_WEBHOOK_SECRET \
  LINEAR_CLIENT_ID \
  LINEAR_CLIENT_SECRET \
  LINEAR_WEBHOOK_SECRET \
  LINEAR_REDIRECT_URI

BASE_URL="${SMOKE_BASE_URL:-${APP_URL:-${NEXT_PUBLIC_APP_URL:-http://localhost:3000}}}"
BASE_URL="${BASE_URL%/}"

missing=()
optional_missing=()

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
}

optional_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    optional_missing+=("$name")
  fi
}

require_env "APP_URL"
require_env "INTEGRATION_TOKEN_ENCRYPTION_KEY"

require_env "GITHUB_APP_ID"
require_env "GITHUB_APP_SLUG"
require_env "GITHUB_APP_PRIVATE_KEY"
require_env "GITHUB_APP_CLIENT_ID"
require_env "GITHUB_APP_CLIENT_SECRET"
require_env "GITHUB_WEBHOOK_SECRET"

require_env "LINEAR_CLIENT_ID"
require_env "LINEAR_CLIENT_SECRET"
require_env "LINEAR_WEBHOOK_SECRET"
optional_env "LINEAR_REDIRECT_URI"

echo "==> Nexus integration endpoint map"
echo "Base URL:              $BASE_URL"
echo "GitHub setup URL:      $BASE_URL/api/integrations/github/setup"
echo "GitHub callback URL:   $BASE_URL/api/integrations/github/callback"
echo "GitHub webhook URL:    $BASE_URL/api/webhooks/github"
echo "Linear callback URL:   ${LINEAR_REDIRECT_URI:-$BASE_URL/api/integrations/linear/callback}"
echo "Linear webhook URL:    $BASE_URL/api/webhooks/linear"
echo

if (( ${#missing[@]} > 0 )); then
  echo "Missing required integration env values:" >&2
  printf ' - %s\n' "${missing[@]}" >&2
  exit 1
fi

if (( ${#optional_missing[@]} > 0 )); then
  echo "Optional values not set:"
  printf ' - %s\n' "${optional_missing[@]}"
  echo
fi

key_bytes="$(node -e 'const raw=process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY || ""; try { console.log(Buffer.from(raw, "base64").length) } catch { console.log(0) }')"
if [[ "$key_bytes" != "32" ]]; then
  echo "INTEGRATION_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes. Current byte length: $key_bytes" >&2
  exit 1
fi

echo "==> Health"
curl -fsS "$BASE_URL/api/health" >/dev/null
echo "Health endpoint is reachable."

echo "==> Auth boundary"
integration_status="$(
  curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/integrations"
)"
if [[ "$integration_status" != "401" ]]; then
  echo "/api/integrations should require auth. Got HTTP $integration_status." >&2
  exit 1
fi
echo "Unauthenticated integration status returned 401."

echo "==> GitHub webhook signature check"
github_body='{"action":"ping","installation":{"id":1},"repository":{"full_name":"zexy2/Nexus"}}'
bad_github_status="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "content-type: application/json" \
    -H "x-github-event: ping" \
    -H "x-github-delivery: smoke-invalid-github" \
    -H "x-hub-signature-256: sha256=invalid" \
    --data "$github_body" \
    "$BASE_URL/api/webhooks/github"
)"
if [[ "$bad_github_status" != "401" ]]; then
  echo "Invalid GitHub webhook signature should return 401. Got HTTP $bad_github_status." >&2
  exit 1
fi

github_signature="$(
  BODY="$github_body" node -e 'const crypto=require("node:crypto"); console.log("sha256="+crypto.createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET).update(process.env.BODY).digest("hex"))'
)"
good_github_status="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "content-type: application/json" \
    -H "x-github-event: ping" \
    -H "x-github-delivery: smoke-valid-github-$(date +%s)" \
    -H "x-hub-signature-256: $github_signature" \
    --data "$github_body" \
    "$BASE_URL/api/webhooks/github"
)"
if [[ "$good_github_status" != "200" ]]; then
  echo "Valid GitHub webhook signature should return 200. Got HTTP $good_github_status." >&2
  exit 1
fi
echo "GitHub webhook rejects invalid signatures and accepts valid signatures."

echo "==> Linear webhook signature check"
linear_body='{"type":"Issue","action":"update","organizationId":"smoke","data":{"id":"issue-smoke","identifier":"NEX-1","team":{"id":"team-smoke"}}}'
linear_timestamp="$(date +%s)"
bad_linear_status="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "content-type: application/json" \
    -H "linear-delivery: smoke-invalid-linear" \
    -H "webhook-timestamp: $linear_timestamp" \
    -H "linear-signature: invalid" \
    --data "$linear_body" \
    "$BASE_URL/api/webhooks/linear"
)"
if [[ "$bad_linear_status" != "401" ]]; then
  echo "Invalid Linear webhook signature should return 401. Got HTTP $bad_linear_status." >&2
  exit 1
fi

linear_signature="$(
  BODY="$linear_body" TS="$linear_timestamp" node -e 'const crypto=require("node:crypto"); console.log(crypto.createHmac("sha256", process.env.LINEAR_WEBHOOK_SECRET).update(`${process.env.TS}.${process.env.BODY}`).digest("hex"))'
)"
good_linear_status="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    -X POST \
    -H "content-type: application/json" \
    -H "linear-delivery: smoke-valid-linear-$(date +%s)" \
    -H "webhook-timestamp: $linear_timestamp" \
    -H "linear-signature: $linear_signature" \
    --data "$linear_body" \
    "$BASE_URL/api/webhooks/linear"
)"
if [[ "$good_linear_status" != "200" ]]; then
  echo "Valid Linear webhook signature should return 200. Got HTTP $good_linear_status." >&2
  exit 1
fi
echo "Linear webhook rejects invalid signatures and accepts valid signatures."

echo
echo "Integration smoke passed. Next manual step: sign in as the owner, open Settings -> Integrations, connect GitHub/Linear, select repo/team/project, then run Sync."
