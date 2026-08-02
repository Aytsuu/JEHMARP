#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SCRIPT_PATH="${REPOSITORY_ROOT}/.github/scripts/prepare-staging-wrangler-config.sh"

temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

source_config="${temp_dir}/wrangler.jsonc"
generated_config="${temp_dir}/wrangler.json"

cat > "$source_config" <<'EOF'
{
  // Default production Worker.
  "name": "jehmarp",
  "kv_namespaces": [{ "binding": "SESSION", "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
  "env": {
    "staging": {
      "name": "jehmarp-staging",
      "workers_dev": true,
      "kv_namespaces": [{ "binding": "SESSION", "id": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }]
    }
  }
}
EOF

cat > "$generated_config" <<'EOF'
{
  "configPath": "/repo/web/wrangler.jsonc",
  "topLevelName": "jehmarp",
  "name": "jehmarp",
  "workers_dev": false,
  "kv_namespaces": [{ "binding": "SESSION", "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }]
}
EOF

bash "$SCRIPT_PATH" --source-config "$source_config" --generated-config "$generated_config"

node - "$generated_config" <<'NODE'
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (config.name !== "jehmarp-staging") throw new Error(`Expected staging name, got ${config.name}`);
if (config.topLevelName !== "jehmarp-staging") throw new Error(`Expected staging topLevelName, got ${config.topLevelName}`);
if (config.workers_dev !== true) throw new Error("Expected workers.dev to be enabled for staging.");
const session = config.kv_namespaces?.find((binding) => binding.binding === "SESSION");
if (session?.id !== "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") {
  throw new Error(`Expected staging SESSION KV id, got ${session?.id}`);
}
NODE

if bash "$SCRIPT_PATH" --source-config "$source_config" --generated-config "${temp_dir}/missing.json" 2>/dev/null; then
  echo "Expected missing generated config to fail." >&2
  exit 1
fi

echo "prepare-staging-wrangler-config helper tests passed."
