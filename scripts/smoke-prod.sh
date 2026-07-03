#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"

# shellcheck source=lib/load-env.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/load-env.sh"
load_env_values "$ENV_FILE" \
  NEXT_PUBLIC_APP_URL \
  GEMINI_API_KEY \
  DEMO_ACCESS_CODE

BASE_URL="${SMOKE_BASE_URL:-${NEXT_PUBLIC_APP_URL:-http://localhost:3000}}"
COOKIE_JAR="$(mktemp)"
ISOLATION_COOKIE_JAR="$(mktemp)"
WORKFLOW_STATUS_FILE="$(mktemp)"
CHANGE_SET_STATUS_FILE="$(mktemp)"
cleanup() {
  rm -f "$COOKIE_JAR" "$ISOLATION_COOKIE_JAR" "$WORKFLOW_STATUS_FILE" "$CHANGE_SET_STATUS_FILE"
}
trap cleanup EXIT

json_get() {
  jq -er --arg path "$1" 'getpath($path | split(".")) | select(. != null) | tostring'
}

json_task_count() {
  jq -r '(.result.tasks // .result.result.tasks // []) | if type == "array" then length else 0 end'
}

json_first_array_id() {
  jq -er 'if type == "array" and .[0].id then .[0].id else empty end'
}

json_pending_proposal_ids() {
  jq -cer --argjson limit "${SMOKE_PLAN_PROPOSAL_LIMIT:-3}" \
    '[.proposals[]? | select(.status == "pending") | .id | select(. != null)][: $limit] | select(length > 0)'
}

poll_workflow() {
  local workflow_id="$1"
  local label="$2"
  local output_file="$3"
  local deadline=$((SECONDS + ${SMOKE_WORKFLOW_TIMEOUT_SECONDS:-180}))

  while (( SECONDS < deadline )); do
    curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/workflows/$workflow_id" > "$output_file"
    local status
    status="$(json_get status < "$output_file")"
    echo "$label workflow status: $status"

    if [[ "$status" == "completed" ]]; then
      return 0
    fi

    if [[ "$status" == "failed" ]]; then
      echo "$label workflow failed:" >&2
      cat "$output_file" >&2
      exit 1
    fi

    sleep 5
  done

  echo "$label workflow did not complete before timeout." >&2
  cat "$output_file" >&2 || true
  exit 1
}

poll_pending_change_set() {
  local doc_id="$1"
  local workflow_id="$2"
  local output_file="$3"
  local deadline=$((SECONDS + ${SMOKE_WORKFLOW_TIMEOUT_SECONDS:-180}))

  while (( SECONDS < deadline )); do
    curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/workflows/$workflow_id" > "$WORKFLOW_STATUS_FILE"
    local workflow_status
    workflow_status="$(json_get status < "$WORKFLOW_STATUS_FILE")"
    if [[ "$workflow_status" == "failed" ]]; then
      echo "Plan impact workflow failed:" >&2
      cat "$WORKFLOW_STATUS_FILE" >&2
      exit 1
    fi

    curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/change-sets?docId=$doc_id&status=pending&limit=1" > "$output_file"

    local change_set_id
    if change_set_id="$(json_first_array_id < "$output_file" 2>/dev/null)"; then
      printf '%s' "$change_set_id"
      return 0
    fi

    echo "Plan impact workflow status: $workflow_status; change set is not ready yet." >&2
    sleep 5
  done

  echo "Plan impact workflow did not create a pending change set before timeout." >&2
  cat "$output_file" >&2 || true
  exit 1
}

echo "==> Compose services"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "==> Health"
health_body="$(curl -fsS "$BASE_URL/api/health")"
echo "$health_body"

if ! printf '%s' "$health_body" | grep -q '"database"'; then
  echo "Health response does not include database status." >&2
  exit 1
fi

if ! printf '%s' "$health_body" | grep -q '"worker"'; then
  echo "Health response does not include worker heartbeat status." >&2
  exit 1
fi

if [[ "${GEMINI_API_KEY:-}" != "" ]] && ! printf '%s' "$health_body" | grep -q '"geminiAvailable":true'; then
  echo "GEMINI_API_KEY is set but health does not report Gemini as available." >&2
  exit 1
fi

echo "==> Worker logs"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs worker --tail=80

echo "==> Demo login"
demo_login_body="$(
  curl -fsS \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-demo-access-code: ${DEMO_ACCESS_CODE:-}" \
    -c "$COOKIE_JAR" \
    "$BASE_URL/api/demo/session"
)"
echo "$demo_login_body"

if ! printf '%s' "$demo_login_body" | grep -q '"ok":true'; then
  echo "Demo session endpoint did not return ok:true." >&2
  exit 1
fi

echo "==> Authenticated settings"
settings_body="$(curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/settings")"
printf '%s' "$settings_body" | grep -q '"byokEnabled":false'

if [[ "${SMOKE_VERIFY_DEMO_ISOLATION:-true}" == "true" ]]; then
  echo "==> Isolated demo session"
  curl -fsS \
    -X POST \
    -H "Content-Type: application/json" \
    -H "x-demo-access-code: ${DEMO_ACCESS_CODE:-}" \
    -c "$ISOLATION_COOKIE_JAR" \
    "$BASE_URL/api/demo/session" >/dev/null

  isolated_settings_body="$(curl -fsS -b "$ISOLATION_COOKIE_JAR" "$BASE_URL/api/settings")"
  first_user_id="$(printf '%s' "$settings_body" | json_get profile.id)"
  second_user_id="$(printf '%s' "$isolated_settings_body" | json_get profile.id)"
  if [[ "$first_user_id" == "$second_user_id" ]]; then
    echo "Public demo sessions unexpectedly share the same user identity." >&2
    exit 1
  fi

  first_docs_body="$(curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/docs")"
  first_doc_id="$(printf '%s' "$first_docs_body" | json_first_array_id)"
  cross_access_status="$(
    curl -sS -o /dev/null -w '%{http_code}' \
      -b "$ISOLATION_COOKIE_JAR" \
      "$BASE_URL/api/docs/$first_doc_id"
  )"
  if [[ "$cross_access_status" != "404" ]]; then
    echo "Cross-demo document access returned HTTP $cross_access_status instead of 404." >&2
    exit 1
  fi
fi

if [[ "${SMOKE_RUN_AI_WORKFLOWS:-true}" == "true" ]]; then
  echo "==> Onboarding bootstrap"
  bootstrap_body="$(
    curl -fsS \
      -X POST \
      -H "Content-Type: application/json" \
      -b "$COOKIE_JAR" \
      "$BASE_URL/api/onboarding/bootstrap" \
      --data '{"includeStarterData":true}'
  )"
  workspace_id="$(printf '%s' "$bootstrap_body" | json_get workspace.id)"

  echo "==> AI document workflow"
  document_body="$(
    curl -fsS \
      -X POST \
      -H "Content-Type: application/json" \
      -b "$COOKIE_JAR" \
      "$BASE_URL/api/workflows" \
      --data "{\"workflowType\":\"document\",\"workspaceId\":\"$workspace_id\",\"input\":{\"title\":\"Nexus Production Smoke Brief\",\"prompt\":\"Write a short portfolio demo brief for Nexus covering AI document generation, task extraction, Kanban, and workflow history.\"}}"
  )"
  document_workflow_id="$(printf '%s' "$document_body" | json_get workflowId)"
  poll_workflow "$document_workflow_id" "Document" "$WORKFLOW_STATUS_FILE"
  document_id="$(json_get result.documentId < "$WORKFLOW_STATUS_FILE")"
  if [[ "$document_id" == "" ]]; then
    echo "Document workflow completed but did not return result.documentId." >&2
    cat "$WORKFLOW_STATUS_FILE" >&2
    exit 1
  fi

  echo "==> AI task breakdown workflow"
  tasks_body="$(
    curl -fsS \
      -X POST \
      -H "Content-Type: application/json" \
      -b "$COOKIE_JAR" \
      "$BASE_URL/api/workflows" \
      --data "{\"workflowType\":\"tasks\",\"workspaceId\":\"$workspace_id\",\"input\":{\"docId\":\"$document_id\",\"projectDescription\":\"Create 3 Kanban-ready implementation tasks from the Nexus production smoke brief. Return actionable task titles, descriptions, and priorities.\"}}"
  )"
  tasks_workflow_id="$(printf '%s' "$tasks_body" | json_get workflowId)"
  poll_workflow "$tasks_workflow_id" "Task breakdown" "$WORKFLOW_STATUS_FILE"
  task_count="$(json_task_count < "$WORKFLOW_STATUS_FILE")"
  if (( task_count < 1 )); then
    echo "Task breakdown completed but returned no tasks." >&2
    cat "$WORKFLOW_STATUS_FILE" >&2
    exit 1
  fi
  echo "Task breakdown created $task_count tasks."

  echo "==> Living plan impact workflow"
  impact_body="$(
    curl -fsS \
      -X POST \
      -H "Content-Type: application/json" \
      -b "$COOKIE_JAR" \
      "$BASE_URL/api/plans/$document_id/analyze-change" \
      --data '{}'
  )"
  plan_workflow_id="$(printf '%s' "$impact_body" | json_get workflowId)"
  change_set_id="$(poll_pending_change_set "$document_id" "$plan_workflow_id" "$CHANGE_SET_STATUS_FILE")"
  echo "Plan impact created change set $change_set_id."

  curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/change-sets/$change_set_id" > "$CHANGE_SET_STATUS_FILE"
  proposal_ids_json="$(json_pending_proposal_ids < "$CHANGE_SET_STATUS_FILE")"

  curl -fsS \
    -X POST \
    -H "Content-Type: application/json" \
    -b "$COOKIE_JAR" \
    "$BASE_URL/api/change-sets/$change_set_id/apply" \
    --data "{\"selectedProposalIds\":$proposal_ids_json}" > /dev/null

  poll_workflow "$plan_workflow_id" "Plan impact" "$WORKFLOW_STATUS_FILE"
  curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/change-sets/$change_set_id" > "$CHANGE_SET_STATUS_FILE"
  change_set_status="$(json_get status < "$CHANGE_SET_STATUS_FILE")"
  if [[ "$change_set_status" != "applied" && "$change_set_status" != "partially_applied" ]]; then
    echo "Plan impact completed but change set was not applied." >&2
    cat "$CHANGE_SET_STATUS_FILE" >&2
    exit 1
  fi
  echo "Plan impact resolved with status $change_set_status."
fi

if [[ "${SMOKE_CHECK_RATE_LIMIT:-false}" == "true" ]]; then
  echo "==> Optional rate-limit check"
  echo "Set AI_USER_DAILY_LIMIT=1 and run an AI workflow twice manually to confirm the second request returns 429."
fi

echo "Production smoke checks passed."
