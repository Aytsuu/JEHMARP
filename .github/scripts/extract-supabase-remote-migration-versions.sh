#!/usr/bin/env bash
set -euo pipefail

input_file="${1:--}"

awk '{
  remote = $0
  sub(/^[^|]*\|/, "", remote)
  sub(/\|.*$/, "", remote)
  gsub(/[`[:space:]]/, "", remote)
  if (remote ~ /^[0-9]{14}$/) print remote
}' "$input_file"
