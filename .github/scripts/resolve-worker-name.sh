#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_DIR="${WEB_DIR:-${REPOSITORY_ROOT}/web}"

# Optional: WRANGLER_ENV=staging reads env.<name>.name; default is top-level production name.
# Optional: WRANGLER_CONFIG points at a specific wrangler.json(c) file (used in tests).
WRANGLER_ENV="${WRANGLER_ENV:-${1:-}}"

read_worker_name_from_file() {
  local config_file="$1"
  local env_name="${2:-}"

  if [ ! -f "$config_file" ]; then
    return 1
  fi

  if [[ "$config_file" == *.jsonc ]] || [[ "$config_file" == *.json ]]; then
    if [ -n "$env_name" ]; then
      sed -n "/\"${env_name}\"[[:space:]]*:[[:space:]]*{/,/^[[:space:]]*}[[:space:]]*,\\?[[:space:]]*$/s/.*\"name\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" \
        "$config_file" | head -1
    else
      sed -n '1,/\"env\"[[:space:]]*:/s/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
        "$config_file" | head -1
    fi
    return 0
  fi

  if [ -n "$env_name" ]; then
    echo "WRANGLER_ENV is only supported for wrangler.jsonc or wrangler.json" >&2
    return 1
  fi

  sed -n 's/^name[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$config_file" | head -1
}

if [ -n "${WRANGLER_CONFIG:-}" ]; then
  if worker_name="$(read_worker_name_from_file "$WRANGLER_CONFIG" "$WRANGLER_ENV")" && [ -n "$worker_name" ]; then
    echo "$worker_name"
    exit 0
  fi
  if [ -n "$WRANGLER_ENV" ]; then
    echo "Unable to read env.${WRANGLER_ENV}.name from ${WRANGLER_CONFIG}" >&2
  else
    echo "Unable to read worker name from ${WRANGLER_CONFIG}" >&2
  fi
  exit 1
fi

worker_name=""
for candidate in \
  "${WEB_DIR}/wrangler.jsonc" \
  "${WEB_DIR}/wrangler.json" \
  "${WEB_DIR}/wrangler.toml"; do
  if worker_name="$(read_worker_name_from_file "$candidate" "$WRANGLER_ENV")" && [ -n "$worker_name" ]; then
    echo "$worker_name"
    exit 0
  fi
done

if [ -n "$WRANGLER_ENV" ]; then
  echo "Unable to read env.${WRANGLER_ENV}.name from web/wrangler.jsonc" >&2
else
  echo "Unable to read worker name from web/wrangler.jsonc, wrangler.json, or wrangler.toml" >&2
fi
exit 1
