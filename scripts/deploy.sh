#!/usr/bin/env bash
# Deploy prebuilt Nexus images from GHCR on the production server.
#
# Run from the repository checkout on the server (e.g. ~/Nexus):
#
#   scripts/deploy.sh                 # deploy the `main` images
#   scripts/deploy.sh sha-1a2b3c4     # deploy one immutable build
#   scripts/deploy.sh --rollback      # redeploy the previously running images (no migrate)
#
# Steps: preflight -> git pull --ff-only -> pg_dump backup -> record running
# images -> pull -> NEXT_PUBLIC_* check -> migrate -> worker -> web +
# collaboration -> health -> prune old images.
#
# On failure it prints logs and exits non-zero. It never rolls the database
# back; `--rollback` only swaps the app containers back to the recorded
# previous images, so migrations must stay backward compatible (see
# docs/DEPLOYMENT.md, "deploy order").
#
# Environment overrides (all optional):
#   NEXUS_IMAGE_PREFIX   registry prefix (default ghcr.io/zexy2/nexus)
#   ENV_FILE             default .env.production
#   COMPOSE_FILE         default docker-compose.prod.yml
#   DEPLOY_STATE_DIR     default .deploy (rollback state, git-ignored)
#   DEPLOY_BACKUP_DIR    default ~/Avenox-Backups/nexus-predeploy
#   DEPLOY_BACKUP_KEEP   default 10
#   DEPLOY_MIN_FREE_GB   default 3
#   DEPLOY_HEALTH_TIMEOUT seconds to wait for healthy containers (default 240)
#   DEPLOY_BASE_URL      default http://127.0.0.1:${WEB_PORT:-3000}
#   DEPLOY_SKIP_PULL=1   skip `git pull --ff-only`
#   DEPLOY_SKIP_PUBLIC_ENV_CHECK=1  deploy even if the image's NEXT_PUBLIC_*
#                        build values differ from the env file
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

IMAGE_PREFIX="${NEXUS_IMAGE_PREFIX:-ghcr.io/zexy2/nexus}"
ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
STATE_DIR="${DEPLOY_STATE_DIR:-.deploy}"
BACKUP_DIR="${DEPLOY_BACKUP_DIR:-$HOME/Avenox-Backups/nexus-predeploy}"
BACKUP_KEEP="${DEPLOY_BACKUP_KEEP:-10}"
MIN_FREE_GB="${DEPLOY_MIN_FREE_GB:-3}"
HEALTH_TIMEOUT="${DEPLOY_HEALTH_TIMEOUT:-240}"
APP_SERVICES=(web worker collaboration migrate)

log() { printf '\n==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
}

# Every docker invocation runs with stdin closed so nothing can block on a
# prompt or swallow the caller's terminal input.
dc() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile tools "$@" < /dev/null
}

# Reads KEY=VALUE from the env file without sourcing it (values may contain
# shell metacharacters). Prints nothing when the key is absent.
env_value() {
  local key="$1" line value
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$ENV_FILE" | tail -n 1 || true)"
  [[ -z "$line" ]] && return 0
  value="${line#*=}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

free_gb() {
  df -Pk "$1" | awk 'NR == 2 { printf "%d", $4 / 1024 / 1024 }'
}

# "ghcr.io/zexy2/nexus-web:sha-abc" -> "ghcr.io/zexy2/nexus sha-abc"
running_ref() {
  local id image
  id="$(dc ps -q web 2>/dev/null | awk 'NR == 1' || true)"
  [[ -z "$id" ]] && return 0
  image="$(docker inspect --format '{{.Config.Image}}' "$id" < /dev/null 2>/dev/null || true)"
  if [[ "$image" =~ ^(.+)-web:([A-Za-z0-9_.-]+)$ ]]; then
    printf '%s %s' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
  fi
}

image_label() {
  docker image inspect --format "{{ index .Config.Labels \"$2\" }}" "$1" < /dev/null 2>/dev/null || true
}

image_exists() {
  docker image inspect "$1" > /dev/null 2>&1 < /dev/null
}

preflight() {
  log "Preflight"
  cd "$ROOT_DIR"
  docker info > /dev/null 2>&1 < /dev/null || die "docker is not reachable"
  docker compose version > /dev/null 2>&1 < /dev/null || die "docker compose v2 is required"
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found in $ROOT_DIR"
  [[ -f "$COMPOSE_FILE" ]] || die "$COMPOSE_FILE not found in $ROOT_DIR"
  command -v curl > /dev/null || die "curl is required"

  local docker_root free
  docker_root="$(docker info --format '{{.DockerRootDir}}' < /dev/null 2>/dev/null || echo /)"
  [[ -d "$docker_root" ]] || docker_root=/
  free="$(free_gb "$docker_root")"
  echo "free disk at $docker_root: ${free}GB (need >= ${MIN_FREE_GB}GB)"
  (( free >= MIN_FREE_GB )) || die "not enough free disk; run scripts/maintenance-docker-cleanup.sh or prune old images first"
  mkdir -p "$STATE_DIR"
}

git_pull() {
  if [[ "${DEPLOY_SKIP_PULL:-0}" == "1" ]]; then
    echo "skipping git pull (DEPLOY_SKIP_PULL=1)"
    return 0
  fi
  log "git pull --ff-only"
  local before after
  before="$(git rev-parse HEAD)"
  git pull --ff-only < /dev/null
  after="$(git rev-parse HEAD)"
  if [[ "$before" != "$after" ]] && ! git diff --quiet "$before" "$after" -- scripts/deploy.sh; then
    echo "scripts/deploy.sh changed; re-running the new version"
    DEPLOY_SKIP_PULL=1 exec "$ROOT_DIR/scripts/deploy.sh" "$@"
  fi
}

backup_db() {
  log "Database backup"
  local user db stamp file
  user="$(env_value POSTGRES_USER)"; user="${user:-nexus}"
  db="$(env_value POSTGRES_DB)"; db="${db:-nexus}"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  file="$BACKUP_DIR/nexus-predeploy-$stamp.sql.gz"
  if ! dc exec -T postgres pg_dump -U "$user" "$db" | gzip > "$file"; then
    rm -f "$file"
    die "pg_dump failed; nothing was changed"
  fi
  chmod 600 "$file"
  [[ -s "$file" ]] || die "backup $file is empty"
  echo "backup: $file ($(du -h "$file" | cut -f1))"
  # Keep the newest $BACKUP_KEEP pre-deploy dumps.
  local old
  while IFS= read -r old; do
    rm -f "$old"
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'nexus-predeploy-*.sql.gz' | sort -r | tail -n +"$((BACKUP_KEEP + 1))")
}

# Pull every app image for prefix/tag. A moving tag (main) is resolved to the
# immutable sha-<short> tag from the image's revision label, so all services
# run the same build even if main moves during the deploy.
pull_images() {
  local prefix="$1" tag="$2" rev
  if [[ "$prefix" != */* ]]; then
    for svc in "${APP_SERVICES[@]}"; do
      image_exists "$prefix-$svc:$tag" || die "local image $prefix-$svc:$tag not found (build it first)"
    done
    RESOLVED_TAG="$tag"
    return 0
  fi
  log "Pull $prefix-*:$tag"
  docker pull --quiet "$prefix-web:$tag" < /dev/null > /dev/null || die "cannot pull $prefix-web:$tag (is the package public, or run: docker login ghcr.io)"
  RESOLVED_TAG="$tag"
  if [[ "$tag" != sha-* ]]; then
    rev="$(image_label "$prefix-web:$tag" org.opencontainers.image.revision)"
    if [[ "$rev" =~ ^[0-9a-f]{7,40}$ ]]; then
      RESOLVED_TAG="sha-${rev:0:7}"
      echo "$tag -> $RESOLVED_TAG"
    else
      warn "no revision label on $prefix-web:$tag; deploying the moving tag"
    fi
  fi
  NEXUS_IMAGE_PREFIX="$prefix" NEXUS_IMAGE_TAG="$RESOLVED_TAG" dc pull --quiet "${APP_SERVICES[@]}"
}

# The browser bundle has NEXT_PUBLIC_* baked in at build time; refuse to roll
# out an image built for different public values than this server uses.
check_public_env() {
  local image="$1" mismatch=0 key name label expected actual default
  [[ "${DEPLOY_SKIP_PUBLIC_ENV_CHECK:-0}" == "1" ]] && return 0
  if [[ -z "$(image_label "$image" org.nexus.next-public-app-url)" ]]; then
    warn "$image has no NEXT_PUBLIC labels (legacy image); skipping check"
    return 0
  fi
  log "Check NEXT_PUBLIC_* build values"
  for key in NEXT_PUBLIC_APP_URL:app-url: NEXT_PUBLIC_COLLABORATION_URL:collaboration-url: \
      NEXT_PUBLIC_DEMO_MODE:demo-mode:true NEXT_PUBLIC_PUBLIC_SIGNUP_ENABLED:public-signup-enabled:false \
      NEXT_PUBLIC_DEMO_ACCESS_CODE_REQUIRED:demo-access-code-required:false; do
    IFS=: read -r name label default <<< "$key"
    expected="$(env_value "$name")"; expected="${expected:-$default}"
    actual="$(image_label "$image" "org.nexus.next-public-$label")"
    if [[ "$expected" != "$actual" ]]; then
      echo "  $name: env file '$expected' != image '$actual'"
      mismatch=1
    fi
  done
  (( mismatch == 0 )) || die "image was built for other NEXT_PUBLIC_* values (set repo variables and rebuild, or DEPLOY_SKIP_PUBLIC_ENV_CHECK=1)"
  echo "ok"
}

# Images built before the per-service targets run web by default; give the
# worker and collaboration their old commands when rolling back to them.
legacy_override() {
  local prefix="$1" tag="$2" cmd file="$STATE_DIR/legacy-compose.override.yml"
  cmd="$(docker image inspect --format '{{json .Config.Cmd}}' "$prefix-worker:$tag" < /dev/null 2>/dev/null || true)"
  if [[ "$cmd" == *'"@nexus/web","start"'* ]]; then
    cat > "$file" <<'YAML'
services:
  worker:
    command: ["pnpm", "--filter", "@nexus/workflows", "worker"]
  collaboration:
    command: ["pnpm", "--filter", "@nexus/web", "collab"]
YAML
    printf '%s' "$file"
  fi
}

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) svc id state pending
  log "Wait for web + collaboration to become healthy (timeout ${HEALTH_TIMEOUT}s)"
  while :; do
    pending=""
    for svc in web collaboration; do
      id="$(dc ps -q "$svc" | awk 'NR == 1')"
      state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" < /dev/null 2>/dev/null || echo missing)"
      [[ "$state" == healthy ]] || pending+=" $svc=$state"
    done
    [[ -z "$pending" ]] && { echo "healthy"; return 0; }
    (( SECONDS < deadline )) || { echo "still not healthy:$pending"; return 1; }
    sleep 5
  done
}

wait_worker() {
  local deadline=$((SECONDS + 120)) id
  log "Wait for the worker to connect to Temporal"
  while :; do
    id="$(dc ps -q worker | awk 'NR == 1')"
    if [[ -n "$id" ]] \
      && [[ "$(docker inspect --format '{{.State.Running}}/{{.State.Restarting}}' "$id" < /dev/null 2>/dev/null)" == "true/false" ]] \
      && docker logs "$id" 2>&1 < /dev/null | grep -c "Waiting for workflows" > /dev/null; then
      echo "worker ready"
      return 0
    fi
    (( SECONDS < deadline )) || { echo "worker did not report ready"; return 1; }
    sleep 3
  done
}

check_health_endpoint() {
  local base token body code
  base="${DEPLOY_BASE_URL:-http://127.0.0.1:$(env_value WEB_PORT | grep . || echo 3000)}"
  token="$(env_value HEALTH_CHECK_TOKEN)"
  log "GET $base/api/health"
  local args=(-sS --max-time 15 -o "$STATE_DIR/health.json" -w '%{http_code}')
  [[ -n "$token" ]] && args+=(-H "x-health-token: $token")
  code="$(curl "${args[@]}" "$base/api/health" || echo 000)"
  body="$(cat "$STATE_DIR/health.json" 2>/dev/null || true)"
  echo "HTTP $code"
  echo "$body"
  [[ "$code" == 200 ]]
}

on_failure() {
  local what="$1"
  echo
  echo "!!! Deploy failed: $what"
  dc ps || true
  for svc in worker web collaboration; do
    echo "----- logs: $svc"
    dc logs --tail 80 "$svc" || true
  done
  echo
  echo "The database was NOT rolled back (pre-deploy dump: ${BACKUP_FILE_HINT:-see $BACKUP_DIR})."
  if [[ -s "$STATE_DIR/previous" ]]; then
    echo "To restore the previous app images: scripts/deploy.sh --rollback   ($(cat "$STATE_DIR/previous"))"
  fi
  exit 1
}

# Roll out prefix/tag: optional migrate, then worker, then web+collaboration.
roll_out() {
  local prefix="$1" tag="$2" run_migrate="$3" override rev
  local -a files=(-f "$COMPOSE_FILE")
  override="$(legacy_override "$prefix" "$tag")"
  if [[ -n "$override" ]]; then
    files+=(-f "$override")
    echo "legacy image: using $override"
  fi

  export NEXUS_IMAGE_PREFIX="$prefix" NEXUS_IMAGE_TAG="$tag"
  rev="$(image_label "$prefix-web:$tag" org.opencontainers.image.revision)"
  export APP_COMMIT_SHA="${rev:-$tag}"

  if [[ "$run_migrate" == yes ]]; then
    log "Migrate ($prefix-migrate:$tag)"
    dc run --rm migrate || on_failure "migration"
  fi

  log "Worker"
  docker compose --env-file "$ENV_FILE" "${files[@]}" up -d --no-deps --no-build --pull never worker < /dev/null \
    || on_failure "worker start"
  wait_worker || on_failure "worker readiness"

  log "Web + collaboration"
  docker compose --env-file "$ENV_FILE" "${files[@]}" up -d --no-deps --no-build --pull never web collaboration < /dev/null \
    || on_failure "web/collaboration start"
  wait_healthy || on_failure "container health"
  check_health_endpoint || on_failure "/api/health"
}

record_success() {
  local ref="$1"
  printf '%s\n' "$ref" > "$STATE_DIR/current"
  printf '%s %s\n' "$(date -u +%FT%TZ)" "$ref" >> "$STATE_DIR/history"
}

# Remove app images other than the current and previous refs.
prune_images() {
  log "Prune old app images (keep current + previous)"
  local keep=() ref prefix tag svc image f k
  for f in current previous; do
    [[ -s "$STATE_DIR/$f" ]] || continue
    read -r prefix tag < "$STATE_DIR/$f"
    for svc in "${APP_SERVICES[@]}"; do keep+=("$prefix-$svc:$tag"); done
  done
  for prefix in "$IMAGE_PREFIX" nexus; do
    for svc in "${APP_SERVICES[@]}"; do
      while IFS= read -r image; do
        [[ -z "$image" || "$image" == *"<none>"* ]] && continue
        ref=no
        for k in "${keep[@]}"; do
          if [[ "$k" == "$image" ]]; then ref=yes; fi
        done
        if [[ "$ref" == no ]] && docker image rm "$image" > /dev/null 2>&1 < /dev/null; then
          echo "removed $image"
        fi
      done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' "$prefix-$svc" < /dev/null)
    done
  done
  docker image prune -f > /dev/null < /dev/null || true
  df -h "$(docker info --format '{{.DockerRootDir}}' < /dev/null 2>/dev/null || echo /)" | tail -n 1
}

deploy() {
  local tag="$1" current
  preflight
  git_pull "$tag"
  backup_db
  BACKUP_FILE_HINT="$(find "$BACKUP_DIR" -maxdepth 1 -name 'nexus-predeploy-*.sql.gz' | sort | tail -n 1)"

  current="$(running_ref)"
  pull_images "$IMAGE_PREFIX" "$tag"
  check_public_env "$IMAGE_PREFIX-web:$RESOLVED_TAG"

  if [[ -n "$current" && "$current" != "$IMAGE_PREFIX $RESOLVED_TAG" ]]; then
    printf '%s\n' "$current" > "$STATE_DIR/previous"
    echo "recorded previous: $current"
  elif [[ -z "$current" ]]; then
    warn "no running web container found; rollback state unchanged"
  fi

  roll_out "$IMAGE_PREFIX" "$RESOLVED_TAG" yes
  record_success "$IMAGE_PREFIX $RESOLVED_TAG"
  prune_images
  log "Deployed $IMAGE_PREFIX-*:$RESOLVED_TAG"
}

rollback() {
  local prefix tag current
  preflight
  [[ -s "$STATE_DIR/previous" ]] || die "no previous deployment recorded in $STATE_DIR/previous"
  read -r prefix tag < "$STATE_DIR/previous"
  log "Rollback to $prefix-*:$tag (no migration)"
  current="$(running_ref)"
  if [[ "$prefix" == */* ]]; then
    NEXUS_IMAGE_PREFIX="$prefix" NEXUS_IMAGE_TAG="$tag" dc pull --quiet web worker collaboration \
      || die "cannot pull $prefix-*:$tag"
  else
    for svc in web worker collaboration; do
      image_exists "$prefix-$svc:$tag" || die "local image $prefix-$svc:$tag no longer exists"
    done
  fi
  roll_out "$prefix" "$tag" no
  if [[ -n "$current" ]]; then
    printf '%s\n' "$current" > "$STATE_DIR/previous"
  fi
  record_success "$prefix $tag"
  log "Rolled back to $prefix-*:$tag"
}

main() {
  local arg="${1:-main}"
  case "$arg" in
    -h|--help) usage ;;
    --rollback) rollback ;;
    -*) usage; exit 2 ;;
    *)
      [[ "$arg" =~ ^[A-Za-z0-9_.-]+$ ]] || die "invalid tag: $arg"
      deploy "$arg"
      ;;
  esac
}

# Everything runs from main(), so bash has parsed the whole file before
# `git pull` can replace it on disk.
main "$@"
exit $?
