#!/usr/bin/env bash
set -euo pipefail

db_container="$(docker ps --filter "name=supabase_db_" --format "{{.Names}}" | head -n 1)"

if [[ -z "${db_container}" ]]; then
  echo "Local Supabase database container is not running. Start it with: supabase start" >&2
  exit 1
fi

for file in supabase/tests/*.sql; do
  echo "Running ${file}"
  docker exec -i "${db_container}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "${file}"
done
