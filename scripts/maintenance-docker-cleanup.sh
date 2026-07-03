#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${LOG_DIR:-logs/maintenance}"
DOCKER_PRUNE_UNTIL="${DOCKER_PRUNE_UNTIL:-168h}"
CLEANUP_LOG_RETENTION_DAYS="${CLEANUP_LOG_RETENTION_DAYS:-30}"

mkdir -p "$LOG_DIR"

log_file="$LOG_DIR/docker-cleanup-$(date +%F).log"

{
  echo "== $(date -u +"%Y-%m-%dT%H:%M:%SZ") =="
  echo "-- disk before --"
  df -h /
  echo "-- docker before --"
  docker system df || true
  echo "-- prune build cache older than $DOCKER_PRUNE_UNTIL --"
  docker builder prune -af --filter "until=$DOCKER_PRUNE_UNTIL"
  echo "-- prune dangling images --"
  docker image prune -f
  echo "-- prune stopped containers older than 24h --"
  docker container prune -f --filter "until=24h"
  echo "-- docker after --"
  docker system df || true
  echo "-- disk after --"
  df -h /
} >> "$log_file" 2>&1

if [[ "$CLEANUP_LOG_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( CLEANUP_LOG_RETENTION_DAYS > 0 )); then
  find "$LOG_DIR" -type f -name 'docker-cleanup-*.log' -mtime "+$CLEANUP_LOG_RETENTION_DAYS" -delete
fi
