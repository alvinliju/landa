#!/usr/bin/env bash
# landa API workflow test — all major surfaces
# Usage: BASE=http://landa.tharavad.xyz ./scripts/api-workflow-test.sh
set -euo pipefail

BASE="${BASE:-http://landa.tharavad.xyz}"
COOKIE="${COOKIE:-/tmp/landa-workflow-cookie.txt}"
PASS="${PASS:-password12345}"
EMAIL="workflow-$(date +%s)@landa.test"
NAME="Workflow Test"
FAIL=0
STEP=0

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
cyan() { printf '\033[36m%s\033[0m\n' "$*"; }

need_jq() {
  command -v jq >/dev/null || {
    red "need jq"
    exit 1
  }
}

step() {
  STEP=$((STEP + 1))
  cyan ""
  cyan "═══ $STEP. $* ═══"
}

ok() { green "  OK  $*"; }
bad() {
  red "  FAIL $*"
  FAIL=$((FAIL + 1))
}

# $1=desc $2=expected_http $3...=curl args
# Uses global LAST_BODY LAST_CODE
# Set NOCOOKIE=1 to omit cookie jar (Bearer-only checks).
req() {
  local desc="$1"
  local expect="$2"
  shift 2
  local tmp
  tmp=$(mktemp)
  local -a cookie_args=()
  if [[ "${NOCOOKIE:-0}" != "1" ]]; then
    cookie_args=(-b "$COOKIE" -c "$COOKIE")
  else
    # empty jar — do not send session cookies
    cookie_args=(-b /dev/null)
  fi
  set +e
  LAST_CODE=$(
    curl -sS -o "$tmp" -w "%{http_code}" -m 120 \
      "${cookie_args[@]}" \
      -H "Origin: $BASE" \
      "$@"
  )
  set -e
  LAST_BODY=$(cat "$tmp")
  rm -f "$tmp"
  if [[ "$LAST_CODE" == "$expect" ]]; then
    ok "$desc → HTTP $LAST_CODE"
  else
    bad "$desc → HTTP $LAST_CODE (want $expect)"
    echo "       body: $(echo "$LAST_BODY" | head -c 300)"
  fi
}

json_field() {
  echo "$LAST_BODY" | jq -r "$1" 2>/dev/null
}

need_jq
rm -f "$COOKIE"
cyan "BASE=$BASE"
cyan "EMAIL=$EMAIL"

# ── 1. health (no auth) ──────────────────────────────────────────
step "GET /health (public)"
req "health" "200" "$BASE/health"
echo "$LAST_BODY" | jq -c '{ok,service,backends,auth}' 2>/dev/null || true

# ── 2. sign-up ───────────────────────────────────────────────────
step "POST /api/auth/sign-up/email"
req "sign-up" "200" -X POST "$BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$NAME\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"
USER_ID=$(json_field '.user.id // empty')
[[ -n "$USER_ID" && "$USER_ID" != "null" ]] && ok "user id=$USER_ID" || bad "no user id in sign-up"

# ── 3. get-session ───────────────────────────────────────────────
step "GET /api/auth/get-session"
req "get-session" "200" "$BASE/api/auth/get-session"
[[ "$(json_field '.user.email // empty')" == "$EMAIL" ]] && ok "session email ok" || bad "session missing email"

# ── 4. me (cookie) ───────────────────────────────────────────────
step "GET /v1/me (session cookie)"
req "me" "200" "$BASE/v1/me"
PROJECT=$(json_field '.project.slug // empty')
ok "project=$PROJECT via=$(json_field '.via // empty')"

# ── 5. backends / templates ──────────────────────────────────────
step "GET /v1/backends"
req "backends" "200" "$BASE/v1/backends"

step "GET /v1/templates"
req "templates" "200" "$BASE/v1/templates"
echo "$LAST_BODY" | jq -c '[.templates[].slug]' 2>/dev/null || true

# ── 6. API keys ──────────────────────────────────────────────────
step "POST /v1/api-keys (create)"
KEY_LABEL="wf-key-$(date +%s)"
req "create-key" "201" -X POST "$BASE/v1/api-keys" \
  -H "Content-Type: application/json" \
  -d "{\"label\":\"$KEY_LABEL\"}"
API_KEY=$(json_field '.key // empty')
KEY_ID=$(json_field '.apiKey.id // empty')
if [[ -n "$API_KEY" && "$API_KEY" == landa_* ]]; then
  ok "key prefix ${API_KEY:0:12}… id=$KEY_ID"
else
  bad "no key in create response"
fi

step "POST /v1/api-keys duplicate label → 409"
req "dup-key" "409" -X POST "$BASE/v1/api-keys" \
  -H "Content-Type: application/json" \
  -d "{\"label\":\"$KEY_LABEL\"}"

step "GET /v1/api-keys"
req "list-keys" "200" "$BASE/v1/api-keys"
echo "$LAST_BODY" | jq -c '[.keys[] | select(.active) | {label,prefix}]' 2>/dev/null || true

step "GET /v1/me (Bearer key only, no cookie)"
NOCOOKIE=1 req "me-bearer" "200" -H "Authorization: Bearer $API_KEY" "$BASE/v1/me"
[[ "$(json_field '.via // empty')" == "api_key" ]] && ok "via=api_key" || bad "via=$(json_field '.via // empty') want api_key"

# ── 7. sandboxes (workers) — prefer Bearer ───────────────────────
step "POST /v1/sandboxes (create landa-agent)"
req "sandbox-create" "201" -X POST "$BASE/v1/sandboxes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template":"landa-agent","label":"wf-worker"}'
SID=$(json_field '.sandbox.id // empty')
SSTATUS=$(json_field '.sandbox.status // empty')
ok "sandbox=$SID status=$SSTATUS"
[[ -n "$SID" && "$SID" != "null" ]] || bad "no sandbox id"

step "POST /v1/sandboxes bad template → 400"
req "bad-template" "400" -X POST "$BASE/v1/sandboxes" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template":"landa-lite"}'

if [[ -n "$SID" && "$SID" != "null" ]]; then
  step "GET /v1/sandboxes"
  req "sandbox-list" "200" -H "Authorization: Bearer $API_KEY" "$BASE/v1/sandboxes"

  step "GET /v1/sandboxes/:id"
  req "sandbox-get" "200" -H "Authorization: Bearer $API_KEY" "$BASE/v1/sandboxes/$SID"

  step "POST /v1/sandboxes/:id/exec"
  req "sandbox-exec" "200" -X POST "$BASE/v1/sandboxes/$SID/exec" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"cmd":"echo hello-workflow && uname -a | head -c 80"}'
  echo "$LAST_BODY" | jq -c '{exitCode:.result.exitCode,stdout:(.result.stdout|.[0:120])}' 2>/dev/null || true

  step "POST /v1/sandboxes/:id/exec empty cmd → 400"
  req "exec-empty" "400" -X POST "$BASE/v1/sandboxes/$SID/exec" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"cmd":""}'

  step "POST /v1/sandboxes/:id/files (write)"
  req "file-write" "200" -X POST "$BASE/v1/sandboxes/$SID/files" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"path":"/work/in/wf.txt","content":"workflow-ok\n"}'

  step "GET /v1/sandboxes/:id/files?mode=read"
  req "file-read" "200" -H "Authorization: Bearer $API_KEY" \
    "$BASE/v1/sandboxes/$SID/files?path=/work/in/wf.txt&mode=read"
  echo "$LAST_BODY" | jq -c '.file.path,.file.content' 2>/dev/null || true

  step "POST /v1/sandboxes/:id/snapshot (200 or 409)"
  # snapshot may 409 if no affordances — accept either
  tmp_snap=$(mktemp)
  set +e
  LAST_CODE=$(
    curl -sS -o "$tmp_snap" -w "%{http_code}" -m 120 \
      -b "$COOKIE" -c "$COOKIE" -H "Origin: $BASE" \
      -X POST "$BASE/v1/sandboxes/$SID/snapshot" \
      -H "Authorization: Bearer $API_KEY"
  )
  set -e
  LAST_BODY=$(cat "$tmp_snap")
  rm -f "$tmp_snap"
  if [[ "$LAST_CODE" == "200" || "$LAST_CODE" == "409" ]]; then
    ok "snapshot → HTTP $LAST_CODE"
  else
    bad "snapshot → HTTP $LAST_CODE (want 200|409)"
    echo "       body: $(echo "$LAST_BODY" | head -c 300)"
  fi

  step "GET /v1/sandboxes/not-a-uuid → 400"
  req "bad-uuid" "400" -H "Authorization: Bearer $API_KEY" \
    "$BASE/v1/sandboxes/not-a-uuid"

  step "DELETE /v1/sandboxes/:id"
  req "sandbox-destroy" "200" -X DELETE \
    -H "Authorization: Bearer $API_KEY" \
    "$BASE/v1/sandboxes/$SID"
fi

# ── 8. sessions (landa-run) ──────────────────────────────────────
step "POST /v1/sessions (create + boot)"
SNAME="wf-$(date +%s)"
# clone optional — public repo may fail offline host; empty workspace still ok
req "session-create" "201" -X POST "$BASE/v1/sessions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$SNAME\"}"
# if firecracker boot fails we get 500 — record and continue
SESS=$(json_field '.session.id // empty')
if [[ -z "$SESS" || "$SESS" == "null" ]]; then
  # try soft: maybe 500 with sessionId
  SESS=$(json_field '.sessionId // empty')
  bad "session create did not return running session (body=$(echo "$LAST_BODY" | head -c 200))"
else
  ok "session=$SESS status=$(json_field '.session.status // empty')"

  step "GET /v1/sessions"
  req "session-list" "200" -H "Authorization: Bearer $API_KEY" "$BASE/v1/sessions"

  step "GET /v1/sessions/:id"
  req "session-get" "200" -H "Authorization: Bearer $API_KEY" "$BASE/v1/sessions/$SESS"

  step "POST /v1/sessions/:id/exec"
  req "session-exec" "200" -X POST "$BASE/v1/sessions/$SESS/exec" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"cmd":"ls -la /workspace 2>/dev/null || ls -la /work; echo sess-ok"}'
  echo "$LAST_BODY" | jq -c '{exitCode:.result.exitCode,stdout:(.result.stdout|.[0:160])}' 2>/dev/null || true

  step "POST /v1/sessions/:id/files (write under /workspace)"
  req "session-file-write" "200" -X POST "$BASE/v1/sessions/$SESS/files" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"path":"/workspace/wf-upload.txt","content":"session-files-ok\n"}'

  step "GET /v1/sessions/:id/files?mode=read"
  req "session-file-read" "200" -H "Authorization: Bearer $API_KEY" \
    "$BASE/v1/sessions/$SESS/files?path=/workspace/wf-upload.txt&mode=read"
  echo "$LAST_BODY" | jq -c '.file.path,.file.content' 2>/dev/null || true

  step "POST /v1/sessions/:id/files under /work → 400"
  req "session-file-bad-root" "400" -X POST "$BASE/v1/sessions/$SESS/files" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"path":"/work/nope.txt","content":"x"}'

  step "POST /v1/sessions/:id/stop"
  req "session-stop" "200" -X POST \
    -H "Authorization: Bearer $API_KEY" \
    "$BASE/v1/sessions/$SESS/stop"

  step "POST /v1/sessions/:id/start"
  req "session-start" "200" -X POST \
    -H "Authorization: Bearer $API_KEY" \
    "$BASE/v1/sessions/$SESS/start"

  step "POST /v1/sessions/:id/exec after restart"
  req "session-exec-2" "200" -X POST "$BASE/v1/sessions/$SESS/exec" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"cmd":"test -f /workspace/README-LANDA.md && cat /workspace/README-LANDA.md | head -3 || echo no-readme"}'

  step "DELETE /v1/sessions/:id"
  req "session-destroy" "200" -X DELETE \
    -H "Authorization: Bearer $API_KEY" \
    "$BASE/v1/sessions/$SESS"
fi

# ── 9. revoke key ────────────────────────────────────────────────
step "DELETE /v1/api-keys/:id (session cookie)"
if [[ -n "$KEY_ID" && "$KEY_ID" != "null" ]]; then
  # use cookie — Bearer may still work until revoke completes
  req "revoke-key" "200" -X DELETE "$BASE/v1/api-keys/$KEY_ID"
else
  bad "no KEY_ID to revoke"
fi

step "GET /v1/me with revoked key only (no cookie) → 401"
NOCOOKIE=1 req "revoked-key" "401" -H "Authorization: Bearer $API_KEY" "$BASE/v1/me"

# ── summary ──────────────────────────────────────────────────────
echo ""
cyan "════════ SUMMARY ════════"
if [[ "$FAIL" -eq 0 ]]; then
  green "ALL PASSED ($STEP steps)"
  exit 0
else
  red "$FAIL failure(s) in $STEP steps"
  exit 1
fi
