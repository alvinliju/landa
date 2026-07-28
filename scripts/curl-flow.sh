#!/usr/bin/env bash
# Full landa API flow via curl.
#
#   export LANDA_API_KEY=landa_...
#   ./scripts/curl-flow.sh
#   ./scripts/curl-flow.sh https://landa.tharavad.xyz   # or http://127.0.0.1:8787
#
# Optional:
#   LANDA_TEMPLATE=memory-default
#   LANDA_LABEL=curl-flow
set -euo pipefail

BASE="${1:-${LANDA_API_BASE:-http://landa.tharavad.xyz}}"
BASE="${BASE%/}"
KEY="${LANDA_API_KEY:-}"
TEMPLATE="${LANDA_TEMPLATE:-memory-default}"
LABEL="${LANDA_LABEL:-curl-flow}"

if [[ -z "$KEY" ]]; then
  echo "error: set LANDA_API_KEY" >&2
  echo "  export LANDA_API_KEY=landa_..." >&2
  exit 1
fi

if ! command -v curl >/dev/null; then
  echo "error: curl required" >&2
  exit 1
fi

# jq optional — fall back to sed/python
has_jq=0
command -v jq >/dev/null && has_jq=1

json_field() {
  local json="$1" field="$2"
  if [[ $has_jq -eq 1 ]]; then
    printf '%s' "$json" | jq -r "$field // empty"
  elif command -v python3 >/dev/null; then
    printf '%s' "$json" | python3 -c "import sys,json; d=json.load(sys.stdin)
def g(o,p):
  for k in p.split('.'):
    if k.startswith('[') and k.endswith(']'):
      o=o[int(k[1:-1])]
    else:
      o=o.get(k) if isinstance(o,dict) else None
    if o is None: return ''
  return o if o is not None else ''
print(g(d,'${field#.}'.replace('[','.[').lstrip('.') if False else '''$field'''.lstrip('.')))" 2>/dev/null || \
    printf '%s' "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
path = '''$field'''.lstrip('.')
cur = d
for part in path.replace('[','.').replace(']','').split('.'):
    if not part: continue
    if part.isdigit():
        cur = cur[int(part)]
    else:
        cur = cur[part]
print(cur if cur is not None else '')
"
  else
    # last-resort sed for uuid id
    if [[ "$field" == ".sandbox.id" ]]; then
      printf '%s' "$json" | sed -n 's/.*"id":"\([0-9a-f-]\{36\}\)".*/\1/p' | head -1
    elif [[ "$field" == ".result.stdout" ]]; then
      printf '%s' "$json" | sed -n 's/.*"stdout":"\([^"]*\)".*/\1/p' | head -1
    else
      echo ""
    fi
  fi
}

auth() {
  curl -sS --fail-with-body \
    -H "Authorization: Bearer ${KEY}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    "$@"
}

step() { echo; echo "=== $* ==="; }

fail() { echo "FAIL: $*" >&2; exit 1; }

step "1 health  $BASE/health"
HEALTH=$(curl -sS --fail-with-body "$BASE/health")
echo "$HEALTH"
echo "$HEALTH" | grep -q '"ok":true' || fail "health not ok"

step "2 me"
ME=$(auth "$BASE/v1/me")
echo "$ME"
echo "$ME" | grep -q '"project"' || fail "me missing project"

step "3 backends"
auth "$BASE/v1/backends"; echo

step "4 templates"
TEMPLATES=$(auth "$BASE/v1/templates")
echo "$TEMPLATES" | head -c 1200; echo
echo "$TEMPLATES" | grep -q "$TEMPLATE" || fail "template $TEMPLATE not listed"

step "5 create sandbox  template=$TEMPLATE"
CREATE=$(auth -d "{\"template\":\"$TEMPLATE\",\"label\":\"$LABEL\"}" "$BASE/v1/sandboxes")
echo "$CREATE"
SBX=$(json_field "$CREATE" ".sandbox.id")
[[ -n "$SBX" ]] || fail "no sandbox id"
STATUS=$(json_field "$CREATE" ".sandbox.status")
echo "SBX=$SBX status=$STATUS"
[[ "$STATUS" == "running" || "$STATUS" == "creating" ]] || fail "unexpected status $STATUS"

step "6 list sandboxes"
auth "$BASE/v1/sandboxes"; echo

step "7 get sandbox"
auth "$BASE/v1/sandboxes/$SBX"; echo

step "8 exec echo"
EXEC=$(auth -d '{"cmd":"echo hello-curl-landa"}' "$BASE/v1/sandboxes/$SBX/exec")
echo "$EXEC"
echo "$EXEC" | grep -q 'hello-curl-landa' || fail "exec stdout missing"

step "9 exec uname"
auth -d '{"cmd":"uname -a"}' "$BASE/v1/sandboxes/$SBX/exec"; echo

step "10 write file"
auth -d '{"path":"notes.txt","content":"curl flow ok\n"}' "$BASE/v1/sandboxes/$SBX/files"; echo

step "11 read file"
READ=$(auth "$BASE/v1/sandboxes/$SBX/files?path=notes.txt&mode=read")
echo "$READ"
echo "$READ" | grep -q 'curl flow ok' || fail "read mismatch"

step "12 list files"
auth "$BASE/v1/sandboxes/$SBX/files?path=.&mode=list"; echo

step "13 world snapshot"
SNAP=$(curl -sS --fail-with-body \
  -H "Authorization: Bearer ${KEY}" \
  -X POST "$BASE/v1/sandboxes/$SBX/snapshot")
echo "$SNAP"
echo "$SNAP" | grep -q 'affordances' || fail "snapshot missing affordances"

step "14 destroy"
DESTROY=$(curl -sS --fail-with-body \
  -H "Authorization: Bearer ${KEY}" \
  -X DELETE "$BASE/v1/sandboxes/$SBX")
echo "$DESTROY"
echo "$DESTROY" | grep -q 'destroyed' || fail "destroy failed"

echo
echo "CURL_FLOW_OK  base=$BASE  sandbox=$SBX"
