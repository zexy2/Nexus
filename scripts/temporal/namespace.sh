#!/bin/sh
# Ensure the Temporal namespace exists (one-shot `temporal-namespace` service).
#
# Namespaces are created through the frontend API, so this runs after the
# `temporal` server is healthy (the schema job runs before it and cannot do
# this). An existing namespace is left untouched, including its retention.
# A new one gets DEFAULT_NAMESPACE_RETENTION, default 24h, which is what
# temporalio/auto-setup used (DEFAULT_NAMESPACE_RETENTION=24h).
#
# Env: TEMPORAL_ADDRESS (read by the temporal CLI), DEFAULT_NAMESPACE,
#      DEFAULT_NAMESPACE_RETENTION.
set -eu

NS="${DEFAULT_NAMESPACE:-default}"
RETENTION="${DEFAULT_NAMESPACE_RETENTION:-24h}"
export TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-temporal:7233}"

echo "temporal-namespace: waiting for ${TEMPORAL_ADDRESS}"
i=0
until temporal operator cluster health > /dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "temporal-namespace: server not healthy" >&2
    temporal operator cluster health || true
    exit 1
  fi
  sleep 2
done

i=0
while :; do
  if temporal operator namespace describe -n "$NS" > /dev/null 2>&1; then
    echo "temporal-namespace: '$NS' present"
    temporal operator namespace describe -n "$NS" | grep -i -E "^ *(Name|State|Config.WorkflowExecutionRetentionTtl)" || true
    exit 0
  fi
  # describe can fail while the namespace cache warms up, so a failed create
  # (e.g. "already exists") just loops back to describe.
  if temporal operator namespace create -n "$NS" --retention "$RETENTION" \
      --description "Default namespace for Temporal Server."; then
    echo "temporal-namespace: created '$NS' (retention $RETENTION)"
  fi
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "temporal-namespace: could not ensure '$NS'" >&2
    exit 1
  fi
  sleep 2
done
