#!/usr/bin/env bash
set -euo pipefail

worker_name="$(
  sed -n 's/.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' web/wrangler.jsonc | head -1
)"

if [ -z "${worker_name}" ]; then
  echo "Unable to read worker name from web/wrangler.jsonc" >&2
  exit 1
fi

check_url() {
  local url="${1%/}"
  local status

  status="$(
    curl -sS -o /dev/null -w "%{http_code}" -L --max-redirs 5 "${url}/" 2>/dev/null || echo "000"
  )"
  echo "${status}"
}

workers_dev_url=""
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  subdomain="$(
    curl -fsS \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/subdomain" \
      | python3 -c 'import json, sys; print(json.load(sys.stdin)["result"]["subdomain"])'
  )"
  workers_dev_url="https://${worker_name}.${subdomain}.workers.dev"
fi

candidate_urls=()
if [ -n "${PRODUCTION_BASE_URL:-}" ]; then
  candidate_urls+=("${PRODUCTION_BASE_URL%/}")
fi
if [ -n "${workers_dev_url}" ]; then
  candidate_urls+=("${workers_dev_url}")
fi

if [ "${#candidate_urls[@]}" -eq 0 ]; then
  echo "No production URL candidates available. Set PRODUCTION_BASE_URL or Cloudflare API credentials." >&2
  exit 1
fi

for url in "${candidate_urls[@]}"; do
  status="$(check_url "${url}")"
  echo "Candidate ${url}: ${status}" >&2
  if [ "${status}" = "200" ]; then
    echo "${url}"
    exit 0
  fi
done

echo "No reachable production base URL returned HTTP 200 for /." >&2
exit 1
