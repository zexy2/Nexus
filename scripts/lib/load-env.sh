#!/usr/bin/env bash

load_env_values() {
  local env_file="$1"
  shift

  if [[ ! -f "$env_file" ]]; then
    return 0
  fi

  local name
  local value
  while IFS= read -r -d '' name && IFS= read -r -d '' value; do
    if [[ -z "${!name+x}" ]]; then
      printf -v "$name" '%s' "$value"
      export "$name"
    fi
  done < <(node "$(dirname "${BASH_SOURCE[0]}")/../read-env-values.mjs" "$env_file" "$@")
}
