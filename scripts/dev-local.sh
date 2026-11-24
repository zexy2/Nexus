#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${ENV_FILE:-apps/web/.env.local}"
CLI_WEB_PORT="${WEB_PORT:-}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required but was not found."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but was not found."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Creating $ENV_FILE from .env.example"
  cp .env.example "$ENV_FILE"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ "${DATABASE_URL:-}" =~ ^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):([0-9]+)/([^?]+) ]]; then
  export POSTGRES_USER="${POSTGRES_USER:-${BASH_REMATCH[2]}}"
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-${BASH_REMATCH[3]}}"
  export POSTGRES_PORT="${POSTGRES_PORT:-${BASH_REMATCH[5]}}"
  export POSTGRES_DB="${POSTGRES_DB:-${BASH_REMATCH[6]}}"
fi

export POSTGRES_USER="${POSTGRES_USER:-nexus}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
export POSTGRES_DB="${POSTGRES_DB:-nexus}"
export POSTGRES_PORT="${POSTGRES_PORT:-5434}"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}"

export TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-localhost:7233}"
export TEMPORAL_NAMESPACE="${TEMPORAL_NAMESPACE:-default}"

export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:3000}"
export AUTH_TRUSTED_ORIGINS="${AUTH_TRUSTED_ORIGINS:-http://localhost:3000}"

# A second local app may already own the default port. Keep the caller's
# explicit port, then make all browser-facing URLs agree with the selected
# Nexus port so auth cookies and callbacks do not target a different origin.
if [ -n "$CLI_WEB_PORT" ]; then
  export WEB_PORT="$CLI_WEB_PORT"
else
  WEB_PORT="$(printf '%s' "$NEXT_PUBLIC_APP_URL" | sed -nE 's#^https?://[^:]+:([0-9]+).*$#\1#p')"
  export WEB_PORT="${WEB_PORT:-3000}"
fi
export NEXT_PUBLIC_APP_URL="http://localhost:${WEB_PORT}"
export BETTER_AUTH_URL="http://localhost:${WEB_PORT}"
export AUTH_TRUSTED_ORIGINS="http://localhost:${WEB_PORT}"
export PORT="$WEB_PORT"
export DEV_LOCAL_KILL_PORTS="${DEV_LOCAL_KILL_PORTS:-true}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-local-dev-secret-change-me}"
# Shared secret for the realtime collaboration server (web issues tokens, the
# collab server verifies them). Both must match; the collab server refuses to
# start without it.
export COLLAB_AUTH_SECRET="${COLLAB_AUTH_SECRET:-local-collab-secret-change-me}"

export DEMO_MODE="${DEMO_MODE:-true}"
export NEXT_PUBLIC_DEMO_MODE="${NEXT_PUBLIC_DEMO_MODE:-true}"
export PUBLIC_SIGNUP_ENABLED="${PUBLIC_SIGNUP_ENABLED:-false}"
export NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED="${NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED:-false}"
export DEMO_SESSION_TTL_MINUTES="${DEMO_SESSION_TTL_MINUTES:-60}"
export DEMO_MAX_ACTIVE_SESSIONS="${DEMO_MAX_ACTIVE_SESSIONS:-25}"

export AI_ENABLED="${AI_ENABLED:-true}"
export AI_GLOBAL_DAILY_LIMIT="${AI_GLOBAL_DAILY_LIMIT:-100}"
export AI_USER_DAILY_LIMIT="${AI_USER_DAILY_LIMIT:-20}"
export AI_WORKFLOW_DAILY_LIMIT="${AI_WORKFLOW_DAILY_LIMIT:-20}"
export AI_CHAT_DAILY_LIMIT="${AI_CHAT_DAILY_LIMIT:-20}"

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

port_pids() {
  lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | sort -u
}

wait_for_port_free() {
  local port="$1"
  local label="$2"
  local deadline=$((SECONDS + 15))

  while port_in_use "$port"; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "Port ${port} is still in use (${label})."
      echo "Tip: lsof -nP -iTCP:${port} -sTCP:LISTEN"
      return 1
    fi
    sleep 1
  done

  return 0
}

stop_port_listeners() {
  local port="$1"
  local label="$2"

  if ! port_in_use "$port"; then
    return 0
  fi

  local pids
  pids="$(port_pids "$port" | tr '\n' ' ')"
  if [ -z "${pids// }" ]; then
    echo "Port ${port} is in use (${label}), but no listener PID could be resolved."
    echo "Tip: lsof -nP -iTCP:${port} -sTCP:LISTEN"
    exit 1
  fi

  echo "Stopping old ${label} process on port ${port}: ${pids}"
  # shellcheck disable=SC2086
  kill ${pids} >/dev/null 2>&1 || true
  if ! wait_for_port_free "$port" "$label"; then
    echo "Old ${label} process did not stop cleanly; forcing shutdown: ${pids}"
    # shellcheck disable=SC2086
    kill -9 ${pids} >/dev/null 2>&1 || true
    wait_for_port_free "$port" "$label" || exit 1
  fi
}

repo_process_pids() {
  if ! command -v pgrep >/dev/null 2>&1; then
    return 0
  fi

  # Port cleanup only catches web/collab. Temporal workers have no listener and
  # can keep polling the task queue with an old workflow bundle after code moves.
  pgrep -f "${ROOT_DIR}.*(src/worker\\.ts|src/server/collaboration\\.ts|next/dist/bin/next dev)" \
    2>/dev/null \
    | awk -v current="$$" '$1 != current' \
    || true
}

stop_stale_repo_processes() {
  local pids
  pids="$(repo_process_pids | tr '\n' ' ' || true)"
  if [ -z "${pids// }" ]; then
    return 0
  fi

  echo "Stopping stale Nexus local processes: ${pids}"
  # shellcheck disable=SC2086
  kill ${pids} >/dev/null 2>&1 || true
  sleep 1

  local remaining
  remaining="$(repo_process_pids | tr '\n' ' ' || true)"
  if [ -n "${remaining// }" ]; then
    echo "Forcing stale Nexus local processes: ${remaining}"
    # shellcheck disable=SC2086
    kill -9 ${remaining} >/dev/null 2>&1 || true
  fi
}

container_env() {
  local name="$1"
  local key="$2"
  docker inspect "$name" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2); exit }'
}

container_host_port() {
  docker port "$1" 5432/tcp 2>/dev/null | awk -F: 'NR == 1 { print $NF }'
}

port_belongs_to_repo() {
  local port="$1"
  local pid
  local command

  while read -r pid; do
    [ -n "$pid" ] || continue
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" != *"$ROOT_DIR"* ]]; then
      return 1
    fi
  done < <(port_pids "$port")

  return 0
}

select_web_port() {
  if ! port_in_use "$WEB_PORT"; then
    return 0
  fi

  if [ "$DEV_LOCAL_KILL_PORTS" = "true" ] && port_belongs_to_repo "$WEB_PORT"; then
    stop_port_listeners "$WEB_PORT" "web"
    return 0
  fi

  local candidate
  for candidate in $(seq "$((WEB_PORT + 1))" "$((WEB_PORT + 10))"); do
    if ! port_in_use "$candidate"; then
      echo "Port ${WEB_PORT} is already in use by another process; using ${candidate} for Nexus."
      WEB_PORT="$candidate"
      export WEB_PORT PORT
      export NEXT_PUBLIC_APP_URL="http://localhost:${WEB_PORT}"
      export BETTER_AUTH_URL="http://localhost:${WEB_PORT}"
      export AUTH_TRUSTED_ORIGINS="http://localhost:${WEB_PORT}"
      return 0
    fi
  done

  echo "No free web port found near ${WEB_PORT}."
  exit 1
}

database_password_works() {
  local password="$1"
  if command -v psql >/dev/null 2>&1; then
    PGPASSWORD="$password" psql \
      -h localhost \
      -p "$POSTGRES_PORT" \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -c "select 1" >/dev/null 2>&1
    return $?
  fi

  DATABASE_URL="postgresql://${POSTGRES_USER}:${password}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}" \
    pnpm --filter @nexus/workflows exec tsx <<'NODE' >/dev/null 2>&1
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql`select 1`;
} finally {
  await sql.end();
}
NODE
}

resolve_database_password() {
  local candidates=()
  candidates+=("$POSTGRES_PASSWORD")

  local container_password
  container_password="$(container_env nexus-postgres POSTGRES_PASSWORD || true)"
  if [ -n "$container_password" ]; then
    candidates+=("$container_password")
  fi

  # Older local Nexus volumes were commonly initialized with this password.
  candidates+=("nexusdev" "changeme")

  local seen=" "
  local candidate
  for candidate in "${candidates[@]}"; do
    if [ -z "$candidate" ] || [[ "$seen" == *" $candidate "* ]]; then
      continue
    fi
    seen+="$candidate "

    if database_password_works "$candidate"; then
      export POSTGRES_PASSWORD="$candidate"
      export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}"
      return 0
    fi
  done

  echo "Could not connect to Postgres on localhost:${POSTGRES_PORT} as ${POSTGRES_USER}/${POSTGRES_DB}."
  echo "Your Docker volume was likely initialized with a different password."
  echo "Either update ${ENV_FILE} DATABASE_URL to the real password or reset the local postgres volume."
  exit 1
}

verify_database_connection() {
  pnpm --filter @nexus/workflows exec tsx <<'NODE'
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  await sql`select 1`;
} finally {
  await sql.end();
}
NODE
}

local_schema_exists_without_migration_history() {
  pnpm --filter @nexus/workflows exec tsx <<'NODE' >/dev/null 2>&1
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const [drizzleTable] = await sql`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = 'drizzle'
      and table_name = '__drizzle_migrations'
  `;
  const [migrationRows] = drizzleTable.count > 0
    ? await sql`select count(*)::int as count from drizzle.__drizzle_migrations`
    : [{ count: 0 }];
  const [existingSchema] = await sql`
    select (
      exists(select 1 from pg_type where typname = 'agent_type')
      or exists(
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'tasks'
      )
    ) as exists
  `;

  process.exit(existingSchema.exists && migrationRows.count === 0 ? 0 : 1);
} finally {
  await sql.end();
}
NODE
}

wait_for_temporal() {
  local deadline=$((SECONDS + 90))
  until pnpm --filter @nexus/workflows exec tsx <<'NODE' >/dev/null 2>&1
import { Connection } from "@temporalio/client";

const connection = await Connection.connect({
  address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
});
await connection.workflowService.getSystemInfo({});
NODE
  do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "Temporal did not become ready at ${TEMPORAL_ADDRESS}"
      exit 1
    fi
    sleep 2
  done
}

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  pnpm install
fi

if ! timeout 10s docker info >/dev/null 2>&1; then
  echo "Docker Desktop is installed but the Docker daemon is unavailable."
  echo "Open Docker Desktop, wait until it reports running, then retry pnpm dev:local."
  exit 1
fi

if [ "${DEV_LOCAL_KILL_PORTS:-true}" = "true" ]; then
  stop_stale_repo_processes
  select_web_port
  stop_port_listeners 1234 "collaboration"
else
  if port_in_use "$WEB_PORT"; then
    echo "Port ${WEB_PORT} is already in use. Set WEB_PORT to another free port."
    exit 1
  fi
  wait_for_port_free 1234 "collaboration" || exit 1
fi

echo "Starting Docker services on Postgres port ${POSTGRES_PORT}..."
timeout 120s docker compose up -d postgres temporal temporal-ui jaeger

actual_postgres_user="$(container_env nexus-postgres POSTGRES_USER || true)"
actual_postgres_db="$(container_env nexus-postgres POSTGRES_DB || true)"
actual_postgres_port="$(container_host_port nexus-postgres || true)"

export POSTGRES_USER="${actual_postgres_user:-$POSTGRES_USER}"
export POSTGRES_DB="${actual_postgres_db:-$POSTGRES_DB}"
export POSTGRES_PORT="${actual_postgres_port:-$POSTGRES_PORT}"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:${POSTGRES_PORT}/${POSTGRES_DB}"

echo "Using Postgres on localhost:${POSTGRES_PORT} as ${POSTGRES_USER}/${POSTGRES_DB}"

echo "Checking database connection..."
resolve_database_password
verify_database_connection

echo "Ensuring Temporal uses the verified database password..."
timeout 120s docker compose up -d --force-recreate temporal temporal-ui

echo "Preparing database..."
if local_schema_exists_without_migration_history; then
  echo "Existing local schema detected without Drizzle migration history."
  echo "Syncing schema with db:push for local development only."
  pnpm --filter @nexus/database exec drizzle-kit push --force
elif ! pnpm db:migrate; then
  echo "Migration failed. Falling back to db:push for local development only."
  pnpm --filter @nexus/database exec drizzle-kit push --force
fi

echo "Waiting for Temporal..."
wait_for_temporal

pids=()
cleanup() {
  echo
  echo "Stopping Nexus local processes..."
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup INT TERM EXIT

echo "Starting worker..."
pnpm --filter @nexus/workflows worker &
pids+=("$!")

echo "Starting collaboration server..."
pnpm --filter @nexus/web collab &
pids+=("$!")

echo "Starting web app..."
pnpm --filter @nexus/web dev &
pids+=("$!")

echo "Waiting for web app..."
for _ in $(seq 1 80); do
  if curl -fsS "${NEXT_PUBLIC_APP_URL}/login" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${NEXT_PUBLIC_APP_URL}/login" >/dev/null 2>&1; then
  echo "Web app did not become ready at ${NEXT_PUBLIC_APP_URL}"
  exit 1
fi

cat <<EOF

Nexus is running.

App:          ${NEXT_PUBLIC_APP_URL}
Demo login:   ${NEXT_PUBLIC_APP_URL}/login
Health:       ${NEXT_PUBLIC_APP_URL}/api/health
Temporal UI:  http://localhost:8080

Use "Try the public demo" on the login page.
Press Ctrl+C here to stop web, worker, and collaboration.
Docker services will keep running.

EOF

wait
