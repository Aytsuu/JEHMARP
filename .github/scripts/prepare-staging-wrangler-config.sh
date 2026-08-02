#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_CONFIG="${REPOSITORY_ROOT}/web/wrangler.jsonc"
GENERATED_CONFIG="${REPOSITORY_ROOT}/web/dist/server/wrangler.json"

usage() {
  cat <<'EOF'
Usage: prepare-staging-wrangler-config.sh [options]

Patch Astro's generated Wrangler deploy configuration with the explicit staging
Worker identity and bindings. Astro's generated dist/server/wrangler.json is a
flattened top-level configuration, so Wrangler's --env staging does not retain
the source config's env.staging non-inheritable bindings.

Options:
  --source-config PATH       Source wrangler.jsonc (default: web/wrangler.jsonc)
  --generated-config PATH    Astro-generated config (default: web/dist/server/wrangler.json)
  -h, --help                 Show this help text
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source-config)
      SOURCE_CONFIG="${2:?--source-config requires a path}"
      shift 2
      ;;
    --generated-config)
      GENERATED_CONFIG="${2:?--generated-config requires a path}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$SOURCE_CONFIG" ]; then
  echo "Source Wrangler config not found: $SOURCE_CONFIG" >&2
  exit 1
fi

if [ ! -f "$GENERATED_CONFIG" ]; then
  echo "Astro-generated Wrangler config not found: $GENERATED_CONFIG" >&2
  echo "Run the Astro build before preparing the staging deployment." >&2
  exit 1
fi

node - "$SOURCE_CONFIG" "$GENERATED_CONFIG" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [sourcePath, generatedPath] = process.argv.slice(2);
const readJsonc = (filePath) => {
  const source = fs.readFileSync(filePath, "utf8")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(source);
};

const source = readJsonc(sourcePath);
const staging = source.env?.staging;
if (!staging || typeof staging !== "object") {
  throw new Error(`Missing env.staging in ${sourcePath}`);
}

const productionName = source.name;
const stagingName = staging.name;
if (typeof productionName !== "string" || !productionName) {
  throw new Error(`Missing top-level Worker name in ${sourcePath}`);
}
if (typeof stagingName !== "string" || !stagingName || stagingName === productionName) {
  throw new Error("Staging Worker name must be present and differ from production.");
}

const stagingNamespaces = staging.kv_namespaces;
if (!Array.isArray(stagingNamespaces) || stagingNamespaces.length === 0) {
  throw new Error("env.staging.kv_namespaces must declare the isolated staging bindings.");
}

const stagingSession = stagingNamespaces.find((binding) => binding?.binding === "SESSION");
const productionSession = source.kv_namespaces?.find((binding) => binding?.binding === "SESSION");
if (!stagingSession?.id || !/^[a-f0-9]{32}$/.test(stagingSession.id)) {
  throw new Error("env.staging SESSION KV id must be an injected 32-character lowercase hex id.");
}
if (!productionSession?.id || stagingSession.id === productionSession.id) {
  throw new Error("Staging SESSION KV id must differ from the production SESSION KV id.");
}

const generated = JSON.parse(fs.readFileSync(generatedPath, "utf8"));
generated.name = stagingName;
generated.topLevelName = stagingName;
generated.workers_dev = staging.workers_dev === true;
generated.kv_namespaces = stagingNamespaces;

const temporaryPath = `${generatedPath}.tmp-${process.pid}`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(generated)}\n`);
fs.renameSync(temporaryPath, generatedPath);

console.log(`Prepared generated staging Worker config: ${path.basename(generatedPath)} (${stagingName})`);
NODE
