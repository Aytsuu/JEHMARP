#!/usr/bin/env bash
# Shared helpers for production and authenticated smoke scripts.

smoke_repository_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${script_dir}/../.." && pwd
}

smoke_script_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

smoke_resolve_base_url() {
  local base_url="${BASE_URL:-${PRODUCTION_BASE_URL:-${STAGING_BASE_URL:-}}}"
  base_url="${base_url%/}"
  printf '%s' "$base_url"
}

smoke_build_version_override_header() {
  local worker_name="$1"
  local version_id="$2"

  if [ -z "$worker_name" ] || [ -z "$version_id" ]; then
    echo "worker name and version id are required to build override header." >&2
    return 1
  fi

  printf 'Cloudflare-Workers-Version-Overrides: %s="%s"' "$worker_name" "$version_id"
}

smoke_setup_version_override() {
  local script_dir="$1"
  local worker_version_id="${WORKER_VERSION_ID:-}"

  VERSION_OVERRIDE_HEADER=""

  if [ -z "$worker_version_id" ]; then
    return 0
  fi

  local worker_name
  worker_name="$(bash "${script_dir}/resolve-worker-name.sh")"
  VERSION_OVERRIDE_HEADER="$(smoke_build_version_override_header "$worker_name" "$worker_version_id")"
  echo "Version-targeted smoke: ${worker_name} -> ${worker_version_id}"
  echo "Override header: ${VERSION_OVERRIDE_HEADER}"
}

smoke_curl_status() {
  local url="$1"
  shift

  if [ -n "${VERSION_OVERRIDE_HEADER:-}" ]; then
    curl -sS -o /dev/null -w "%{http_code}" -H "$VERSION_OVERRIDE_HEADER" "$@" "$url"
  else
    curl -sS -o /dev/null -w "%{http_code}" "$@" "$url"
  fi
}

smoke_curl_status_with_retry() {
  local expected_status="$1"
  local url="$2"
  shift 2

  local max_attempts="${SMOKE_MAX_ATTEMPTS:-6}"
  local retry_delay_seconds="${SMOKE_RETRY_DELAY_SECONDS:-5}"
  local attempt status

  if ! [[ "$max_attempts" =~ ^[1-9][0-9]*$ ]]; then
    echo "SMOKE_MAX_ATTEMPTS must be a positive integer." >&2
    return 1
  fi
  if ! [[ "$retry_delay_seconds" =~ ^[0-9]+$ ]]; then
    echo "SMOKE_RETRY_DELAY_SECONDS must be a non-negative integer." >&2
    return 1
  fi

  for attempt in $(seq 1 "$max_attempts"); do
    status="$(smoke_curl_status "$url" "$@" || true)"
    if [ "$status" = "$expected_status" ]; then
      printf '%s' "$status"
      return 0
    fi

    if [ "$attempt" -lt "$max_attempts" ]; then
      echo "${url}: received ${status:-curl-error}; retrying (${attempt}/${max_attempts}) after ${retry_delay_seconds}s." >&2
      sleep "$retry_delay_seconds"
    fi
  done

  printf '%s' "${status:-000}"
  return 1
}

smoke_curl_with_cookie_jar() {
  local cookie_jar="$1"
  local url="$2"
  shift 2

  local curl_args=(
    -sS
    -b "$cookie_jar"
    -c "$cookie_jar"
    -o /dev/null
    -w "%{http_code}"
  )

  if [ -n "${VERSION_OVERRIDE_HEADER:-}" ]; then
    curl_args+=(-H "$VERSION_OVERRIDE_HEADER")
  fi

  curl "${curl_args[@]}" "$@" "$url"
}

smoke_require_base_url() {
  local base_url
  base_url="$(smoke_resolve_base_url)"

  if [ -z "$base_url" ]; then
    echo "BASE_URL, PRODUCTION_BASE_URL, or STAGING_BASE_URL is required." >&2
    return 1
  fi

  BASE_URL="$base_url"
  export BASE_URL
}
