---
name: landa-vms
description: >
  landa cloud VMs + landa-run persistent sessions. Use when the user says
  "go to the cloud", "run this remotely", "landa-run", "session", "close my
  laptop", OR needs disposable sandboxes (create/exec/destroy). Firecracker
  landa-agent only. Requires LANDA_API_KEY. Prefer sessions for long work;
  prefer /v1/sandboxes for one-shot mess.
---

# landa — agent skill (VMs + landa-run sessions)

## When the user says “go to the cloud”

**Do this by default** (persistent workspace that survives stop):

1. Ensure `LANDA_API_KEY` + `LANDA_API_BASE`  
2. **List sessions** → reuse a running one, or **start** a stopped one, or **create**  
3. **Exec** all long work via `POST /v1/sessions/:id/exec` with `cwd` under `/workspace`  
4. On “pause / I’m done for now” → **`stop`** (keeps host volume)  
5. On “wipe it” only → **`DELETE` session**  

Do **not** use disposable sandboxes for “go to cloud / work overnight / laptop closed” unless the user asks for a one-shot throwaway.

---

## Two products (do not mix them up)

| | **Sessions (landa-run)** | **VMs (workers)** |
|--|--------------------------|-------------------|
| API | `/v1/sessions` | `/v1/sandboxes` |
| Purpose | Persistent home / orchestrator | Disposable mess |
| Workspace | `/workspace` (synced to host volume) | `/work/in` · `/work/out` |
| Stop | Keeps files on host | N/A — destroy |
| Destroy | Wipes volume | Wipes seat |
| TTL | Long-lived session row | ~8h reaper |
| User phrase | “go to cloud”, “continue later” | “run this in a sandbox”, “throwaway” |

**Template for both seats today:** `landa-agent` only (Firecracker, offline python3/bash/jq).

---

## Setup

```bash
export LANDA_API_KEY='landa_…'   # console → API keys
export LANDA_API_BASE='http://landa.tharavad.xyz'
```

```http
Authorization: Bearer $LANDA_API_KEY
Content-Type: application/json
```

---

# Part A — Sessions (landa-run v0)  ← “go to cloud”

## Mental model

```
Host volume (truth)  ←pull/push→  Guest /workspace on Firecracker
stop  = pull + kill VM
start = new VM + push
```

Guest is still **offline**. Repo clone happens on the **API host** at create if you pass `repo`.

## Session API

| Method | Path | Body | Notes |
|--------|------|------|--------|
| GET | `/v1/sessions` | — | list mine |
| GET | `/v1/sessions/:id` | — | one |
| POST | `/v1/sessions` | `{ "name"?, "repo"? }` | create volume + boot + push |
| POST | `/v1/sessions/:id/start` | — | boot + restore `/workspace` |
| POST | `/v1/sessions/:id/stop` | — | save `/workspace` + kill seat |
| POST | `/v1/sessions/:id/exec` | `{ "cmd" }` | run in session seat |
| DELETE | `/v1/sessions/:id` | — | kill + **delete volume** |

`repo` = public `https://…git` preferred (host needs git + network).

## “Go to cloud” recipe (copy this)

```bash
BASE="${LANDA_API_BASE:-http://landa.tharavad.xyz}"
AUTH="Authorization: Bearer $LANDA_API_KEY"

# 1) Find existing or create
curl -sS -H "$AUTH" "$BASE/v1/sessions" | jq .

# Create (optional name + repo)
SID=$(curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"main","repo":"https://github.com/ORG/REPO.git"}' \
  "$BASE/v1/sessions" | jq -r .session.id)

# Or start stopped:
# curl -sS -X POST -H "$AUTH" "$BASE/v1/sessions/$SID/start"

# 2) Work in /workspace
curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"cmd":"set -euo pipefail; ls -la /workspace; pwd"}' \
  "$BASE/v1/sessions/$SID/exec" | jq .

# 3) When user leaves / laptop closes intent — STOP (do not destroy)
curl -sS -X POST -H "$AUTH" "$BASE/v1/sessions/$SID/stop"

# Later resume:
curl -sS -X POST -H "$AUTH" "$BASE/v1/sessions/$SID/start"
```

### Agent decision tree

```
User: "go to the cloud" / "run remotely" / "persistent" / "close laptop"
  → sessions: create|start → exec on /workspace → stop when pausing

User: "sandbox this" / "one-shot" / "throwaway" / "untrusted code"
  → sandboxes: create landa-agent → /work → destroy

User: "wipe my session" / "delete cloud workspace"
  → DELETE /v1/sessions/:id
```

### Session exec tips

- Prefer absolute paths under **`/workspace`**
- Multi-line: `set -euo pipefail`
- Guest offline: no `pip`/`apk`/`curl` outbound
- Long agent loops: many `exec` calls on **same session id**; only `stop` when pausing
- Spawning disposable workers: use `/v1/sandboxes` with same API key (from orchestrator)

### TypeScript: go-to-cloud helper

```ts
const base = process.env.LANDA_API_BASE ?? "http://landa.tharavad.xyz";
const key = process.env.LANDA_API_KEY!;

async function landa<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as HeadersInit),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || res.statusText);
  return data as T;
}

/** Ensure a named session is running (create or start). */
async function ensureCloud(name = "main", repo?: string) {
  const { sessions } = await landa<{
    sessions: { id: string; name: string; status: string }[];
  }>("/v1/sessions");
  let s = sessions.find((x) => x.name === name);
  if (!s) {
    const created = await landa<{ session: { id: string } }>("/v1/sessions", {
      method: "POST",
      body: JSON.stringify({ name, repo }),
    });
    return created.session.id;
  }
  if (s.status !== "running") {
    await landa(`/v1/sessions/${s.id}/start`, { method: "POST" });
  }
  return s.id;
}

async function cloudExec(sessionId: string, cmd: string) {
  const { result } = await landa<{
    result: { exitCode: number; stdout: string; stderr: string };
  }>(`/v1/sessions/${sessionId}/exec`, {
    method: "POST",
    body: JSON.stringify({ cmd }),
  });
  return result;
}

// User: "go to the cloud and list the workspace"
const sid = await ensureCloud("main");
console.log(await cloudExec(sid, "ls -la /workspace"));
// User leaves → await landa(`/v1/sessions/${sid}/stop`, { method: "POST" });
```

---

# Part B — Disposable VMs (workers)

Use for short untrusted jobs, not as the user’s home.

## Lifecycle

```
POST /v1/sandboxes → exec/files → DELETE /v1/sandboxes/:id
```

Always destroy workers. Template **`landa-agent` only**.

| Method | Path | Body |
|--------|------|------|
| POST | `/v1/sandboxes` | `{ "template":"landa-agent", "label"? }` |
| POST | `/v1/sandboxes/:id/exec` | `{ "cmd" }` |
| POST | `/v1/sandboxes/:id/files` | `{ "path", "content" }` |
| GET | `/v1/sandboxes/:id/files` | `path`, `mode=read\|list` |
| DELETE | `/v1/sandboxes/:id` | — |
| GET | `/v1/sandboxes` | list |

### Guest layout (workers)

```
/work/in/    inputs
/work/out/   outputs (prefer result.json)
/work/task.py
```

Offline: python3 stdlib, jq, bash. No pip/apk/net.

### Worker one-liner loop

```bash
SID=$(curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template":"landa-agent","label":"job"}' \
  "$LANDA_API_BASE/v1/sandboxes" | jq -r .sandbox.id)

curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cmd":"python3 -c \"print(2+2)\""}' \
  "$LANDA_API_BASE/v1/sandboxes/$SID/exec"

curl -sS -X DELETE -H "Authorization: Bearer $LANDA_API_KEY" \
  "$LANDA_API_BASE/v1/sandboxes/$SID"
```

### TypeScript withVm (always destroy)

```ts
async function withVm<T>(label: string, fn: (id: string) => Promise<T>) {
  const { sandbox } = await landa<{ sandbox: { id: string; status: string } }>(
    "/v1/sandboxes",
    {
      method: "POST",
      body: JSON.stringify({ template: "landa-agent", label }),
    },
  );
  try {
    return await fn(sandbox.id);
  } finally {
    await landa(`/v1/sandboxes/${sandbox.id}`, { method: "DELETE" }).catch(
      () => null,
    );
  }
}
```

---

## Guest capabilities (both)

| Have | Don’t have |
|------|------------|
| python3 stdlib, jq, bash, coreutils | pip, apk, curl net, node, browser |
| `/workspace` (sessions) | GPU |
| `/work/*` (workers) | inventing template names |

Prefer `result.json`:

```json
{ "ok": true, "summary": "…", "data": {} }
```

---

## Errors

| HTTP | Meaning | Action |
|------|---------|--------|
| 401 | bad key | stop; user creates key in console |
| 409 `session_not_running` | stopped | `POST …/start` |
| 409 sandbox | not running | recreate worker |
| 429 | concurrent workers | destroy idle sandboxes |
| 400 `duplicate_name` | session name taken | reuse or other name |
| 400 `duplicate_label` | API key name taken | revoke or rename |
| 501 | no Firecracker | host issue |

---

## Security

1. Never put `LANDA_API_KEY` inside guest files  
2. Workers: destroy always  
3. Sessions: **stop** to pause (not destroy) unless user wants wipe  
4. Redact keys in logs  

---

## Agent checklist

**Cloud / persistent**

- [ ] `ensureCloud` / create|start session  
- [ ] Work under `/workspace`  
- [ ] `stop` when user pauses — not DELETE  
- [ ] DELETE only on explicit wipe  

**Disposable**

- [ ] `template: landa-agent`  
- [ ] `/work` contract  
- [ ] DELETE in `finally`  

---

## Console map

| Tab | For |
|-----|-----|
| **Sessions** | landa-run: create/start/stop/exec |
| **VMs** | disposable workers |
| **API keys** | Bearer secrets for this skill |
| Guide / Templates | human docs; agent template only |

---

## Philosophy

> **“Go to the cloud” → session at `/workspace`, stop to keep, start to resume.**  
> **Throwaway compute → sandbox at `/work`, always destroy.**  
> **Harness holds the key. Guest runs offline tools.**
