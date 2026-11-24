#!/usr/bin/env bash
# Offline tests for scripts/deploy.sh against stateful docker/git/curl stubs
# (scripts/tests/deploy-stubs). No Docker daemon or network is used.
#
#   bash scripts/tests/deploy.test.sh
#
# check() evaluates its assertion string later, so single quotes are intended
# and variables used only inside assertions look unused to shellcheck.
# shellcheck disable=SC2016,SC2034
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="$HERE/../deploy.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILURES=0

fail() { echo "  FAIL: $*"; FAILURES=$((FAILURES + 1)); }
pass() { echo "  ok: $*"; }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

LEGACY_ID="sha256:legacy0000000000000000000000000000000000000000000000000000000001"
GHCR_PREFIX="ghcr.io/zexy2/nexus"

# Fresh server: the old shared image runs web, worker and collaboration
# (compose-built, so Config.Image is the untagged "nexus-<svc>"), a manual
# rollback tag exists, and there is no .deploy directory yet.
setup() {
  rm -rf "$WORK/state" "$WORK/deploy-state" "$WORK/backups"
  mkdir -p "$WORK/state"
  : > "$WORK/state/images"; : > "$WORK/state/containers"
  local svc
  for svc in web worker collaboration; do
    echo "nexus-$svc:latest $LEGACY_ID" >> "$WORK/state/images"
    echo "nexus-$svc:rollback-661bbfb $LEGACY_ID" >> "$WORK/state/images"
    echo "$svc nexus-$svc $LEGACY_ID" >> "$WORK/state/containers"
  done
  # An unrelated old local build that nothing uses: prunable.
  echo "nexus-web:old sha256:unused0000000000000000000000000000000000000000000000000000000001" >> "$WORK/state/images"
  printf 'POSTGRES_USER=nexus\nNEXT_PUBLIC_APP_URL=https://nexus.example\nNEXT_PUBLIC_COLLABORATION_URL=wss://nexus.example/collab\nHEALTH_CHECK_TOKEN=t\n' > "$WORK/env"
}

run_deploy() {
  PATH="$HERE/deploy-stubs:$PATH" STUB_STATE="$WORK/state" ENV_FILE="$WORK/env" \
    DEPLOY_STATE_DIR="$WORK/deploy-state" DEPLOY_BACKUP_DIR="$WORK/backups" \
    DEPLOY_MIN_FREE_GB=0 DEPLOY_HEALTH_TIMEOUT=5 \
    bash "$DEPLOY" "$@" > "$WORK/out.log" 2>&1
}

has_image() { awk -v r="$1" '$1 == r { f = 1 } END { exit !f }' "$WORK/state/images"; }
image_id() { awk -v r="$1" '$1 == r { print $2; exit }' "$WORK/state/images"; }
running() { awk -v s="$1" '$1 == s { print $2; exit }' "$WORK/state/containers"; }
running_id() { awk -v s="$1" '$1 == s { print $3; exit }' "$WORK/state/containers"; }

echo "first deploy from the legacy shared image (no .deploy yet)"
setup
if run_deploy sha-9f6609c; then pass "deploy exits 0"; else fail "deploy exits non-zero"; cat "$WORK/out.log"; fi
check "previous is written" '[[ -s "$WORK/deploy-state/previous" ]]'
read -r prev_prefix prev_tag < "$WORK/deploy-state/previous" || true
check "previous is a pinned local rollback-pre tag" '[[ "$prev_prefix" == nexus && "$prev_tag" == rollback-pre-* ]]'
for svc in web worker collaboration; do
  check "nexus-$svc:$prev_tag pins the legacy image" '[[ "$(image_id "nexus-$svc:$prev_tag")" == "$LEGACY_ID" ]]'
  check "nexus-$svc:rollback-661bbfb (manual) kept" 'has_image "nexus-$svc:rollback-661bbfb"'
  check "$svc runs $GHCR_PREFIX-$svc:sha-9f6609c" '[[ "$(running "$svc")" == "$GHCR_PREFIX-$svc:sha-9f6609c" ]]'
done
check "current is the new release" '[[ "$(cat "$WORK/deploy-state/current")" == "$GHCR_PREFIX sha-9f6609c" ]]'
check "unused nexus-web:old pruned" '! has_image nexus-web:old'
check "no running/previous image removed" '! grep -Eq ":(sha-9f6609c|rollback-)" "$WORK/state/removed"'

echo "rollback round-trip"
if run_deploy --rollback; then pass "rollback exits 0"; else fail "rollback exits non-zero"; cat "$WORK/out.log"; fi
for svc in web worker collaboration; do
  check "$svc back on the legacy image" '[[ "$(running_id "$svc")" == "$LEGACY_ID" ]]'
done
check "legacy commands override used" 'grep -q "legacy image: using" "$WORK/out.log"'
check "previous now points at the GHCR release" '[[ "$(cat "$WORK/deploy-state/previous")" == "$GHCR_PREFIX sha-9f6609c" ]]'
check "GHCR images kept for roll-forward" 'has_image "$GHCR_PREFIX-web:sha-9f6609c"'
if run_deploy --rollback; then pass "second rollback exits 0"; else fail "second rollback exits non-zero"; cat "$WORK/out.log"; fi
check "second rollback returns to the GHCR release" '[[ "$(running web)" == "$GHCR_PREFIX-web:sha-9f6609c" ]]'

echo "prune is skipped without a previous release"
setup
rm -f "$WORK/state/containers"; : > "$WORK/state/containers"   # nothing running: nothing to record
if run_deploy sha-9f6609c; then pass "deploy exits 0"; else fail "deploy exits non-zero"; cat "$WORK/out.log"; fi
check "no previous recorded" '[[ ! -s "$WORK/deploy-state/previous" ]]'
check "prune skipped" 'grep -q "skipping prune" "$WORK/out.log"'
check "legacy images untouched" 'has_image nexus-web:latest && has_image nexus-web:old'

echo "second deploy keeps exactly current + previous"
setup
run_deploy sha-9f6609c || { fail "first deploy"; cat "$WORK/out.log"; }
if run_deploy sha-abcdef0; then pass "deploy exits 0"; else fail "deploy exits non-zero"; cat "$WORK/out.log"; fi
check "previous is the registry ref (pullable, not re-pinned)" '[[ "$(cat "$WORK/deploy-state/previous")" == "$GHCR_PREFIX sha-9f6609c" ]]'
check "previous release images kept" 'has_image "$GHCR_PREFIX-worker:sha-9f6609c"'
check "current release running" '[[ "$(running worker)" == "$GHCR_PREFIX-worker:sha-abcdef0" ]]'

echo
if (( FAILURES > 0 )); then
  echo "$FAILURES check(s) failed"
  exit 1
fi
echo "all deploy.sh checks passed"
