#!/usr/bin/env bash
# Live contract test — run on edge: bash scripts/live-contract-test.sh
set -euo pipefail
export PATH=/run/current-system/sw/bin:${PATH:-}

cd "$(dirname "$0")/.."
ROOT=$(pwd)
BASE="${LANDA_API_BASE:-http://127.0.0.1:8787}"
PUBLIC="${LANDA_PUBLIC_BASE:-http://landa.tharavad.xyz}"

# same env as flake shellHook (without banner)
export LANDA_ROOT="$ROOT"
export LANDA_DATA="${LANDA_DATA:-$ROOT/.data}"
export PGDATA="${PGDATA:-$LANDA_DATA/pg}"
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5433}"
export PGUSER="${PGUSER:-landa}"
export PGPASSWORD="${PGPASSWORD:-landa}"
export PGDATABASE="${PGDATABASE:-landa}"
export DATABASE_URL="${DATABASE_URL:-postgres://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$PGDATABASE}"
export PATH="$ROOT/scripts:$PATH"
mkdir -p "$LANDA_DATA"

nixd() {
  nix --extra-experimental-features "nix-command flakes" develop -c "$@"
}

echo "==> pg start"
nixd landa-pg start >/dev/null

echo "==> mint API key (write to .data/dev-api-key)"
nixd node --input-type=module <<'NODE'
import { createHash, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://landa:landa@127.0.0.1:5433/landa";
const sql = postgres(url, { max: 1 });
const raw = "landa_dev_livetest_" + randomBytes(12).toString("hex");
const prefix = raw.slice(0, 12);
const keyHash = createHash("sha256").update(raw).digest("hex");
const projectId = "00000000-0000-4000-8000-000000000001";

await sql`
  INSERT INTO api_keys (project_id, label, key_prefix, key_hash)
  VALUES (${projectId}::uuid, 'live-test', ${prefix}, ${keyHash})
`;

await sql`
  INSERT INTO templates (id, project_id, slug, name, backend, config)
  SELECT
    '00000000-0000-4000-8000-000000000012'::uuid,
    NULL,
    'docker-alpine',
    'Docker Alpine seat',
    'docker',
    '{"image":"alpine:3.20"}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM templates WHERE slug = 'docker-alpine')
`;

await sql.end({ timeout: 5 });
mkdirSync(".data", { recursive: true });
writeFileSync(".data/dev-api-key", raw + "\n", { mode: 0o600 });
// only this line on stdout after shellHook noise — we read the file instead
NODE

KEY=$(tr -d '\n' < "$ROOT/.data/dev-api-key")
if [[ ! "$KEY" =~ ^landa_ ]]; then
  echo "ERROR: bad key file: $KEY" >&2
  exit 1
fi
echo "KEY=${KEY:0:28}..."

auth() {
  curl -sS -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" "$@"
}

echo "==> CLI demo"
nixd npm run demo

echo "==> HTTP health"
curl -sS "$BASE/health"; echo

echo "==> me"
auth "$BASE/v1/me"; echo

echo "==> backends"
auth "$BASE/v1/backends"; echo

echo "==> templates"
auth "$BASE/v1/templates"; echo

echo "==> create sandbox"
CREATE=$(auth -d '{"template":"memory-default","label":"live-contract-test"}' "$BASE/v1/sandboxes")
echo "$CREATE"
SBX=$(printf '%s' "$CREATE" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -1)
echo "SBX=$SBX"
test -n "$SBX"

echo "==> exec"
EXEC=$(auth -d '{"cmd":"echo hello-live-landa"}' "$BASE/v1/sandboxes/$SBX/exec")
echo "$EXEC"
echo "$EXEC" | grep -q hello-live-landa

echo "==> write file"
auth -d '{"path":"notes.txt","content":"live test\n"}' "$BASE/v1/sandboxes/$SBX/files"; echo

echo "==> read file"
READ=$(auth "$BASE/v1/sandboxes/$SBX/files?path=notes.txt&mode=read")
echo "$READ"
echo "$READ" | grep -q 'live test'

echo "==> list files"
auth "$BASE/v1/sandboxes/$SBX/files?path=.&mode=list"; echo

echo "==> world snapshot"
SNAP=$(curl -sS -H "Authorization: Bearer $KEY" -X POST "$BASE/v1/sandboxes/$SBX/snapshot")
echo "$SNAP"
echo "$SNAP" | grep -q affordances

echo "==> destroy"
curl -sS -H "Authorization: Bearer $KEY" -X DELETE "$BASE/v1/sandboxes/$SBX"; echo

echo "==> public health"
curl -sS -m 8 "$PUBLIC/health"; echo

echo "==> public create/exec/destroy"
CREATE2=$(auth -d '{"template":"memory-default","label":"public-test"}' "$PUBLIC/v1/sandboxes")
echo "$CREATE2"
SBX2=$(printf '%s' "$CREATE2" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -1)
test -n "$SBX2"
EXEC2=$(auth -d '{"cmd":"uname -a"}' "$PUBLIC/v1/sandboxes/$SBX2/exec")
echo "$EXEC2"
echo "$EXEC2" | grep -q landa-memory
curl -sS -m 8 -H "Authorization: Bearer $KEY" -X DELETE "$PUBLIC/v1/sandboxes/$SBX2"; echo

echo
echo "ALL_LIVE_TESTS_PASSED"
