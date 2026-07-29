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

**Host-first default** (volume on API host is truth; seat is optional):

1. Ensure `LANDA_API_KEY` + `LANDA_API_BASE`  
2. **List sessions** → reuse by name, or **create** (`boot` defaults **false** → stopped)  
3. **Edit** via `POST/GET /v1/sessions/:id/files` while **stopped** (host volume)  
4. **Start** seat only for isolated offline exec (`python3`/`bash` in guest)  
5. **Stop** after exec (pull guest → host). Do not leave seat running while IDE/agents edit host.  
6. **DELETE** only on explicit wipe  

Do **not** use disposable sandboxes for “go to cloud / work overnight” unless the user wants throwaway compute.

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

# Part A — Sessions (landa-run)  ← “go to cloud” / dev home

## Host-first (default)

```
Host volume = TRUTH     (agents / T3 / files API edit here while seat STOPPED)
        │
   start│ push
        ▼
Guest /workspace        (optional Firecracker seat — offline python/bash/jq)
        │
    stop│ pull
        ▼
Host volume
```

| Mode | Seat | Files API `via` | Use for |
|------|------|-----------------|---------|
| **Default** | **stopped** | `host` | Edit project, agents, T3 on volume |
| Run tools | **running** | `seat` | Isolated exec only |
| Pause | stop | host again | Pull guest → host |

**Single writer:** while seat is running, edit only via seat files/exec. Stop before host-side bulk edits.

## Hard constraints

| Fact | Implication |
|------|-------------|
| **No git in guest** | Clone via create `repo` (API host) or host tools later |
| **Guest disk small** | ~160 MiB free in seat — keep trees lean if you start |
| **Host volume larger** | Prefer host-first edits; don’t dump huge trees into guest |
| **Paths** | Always `/workspace/...` in files API |

## Session API

| Method | Path | Body | Notes |
|--------|------|------|--------|
| GET | `/v1/sessions` | — | list; includes `editMode`, `filesVia` |
| GET | `/v1/sessions/:id` | — | + `hint` |
| POST | `/v1/sessions` | `{ "name"?, "repo"?, "boot"? }` | **default boot=false** → stopped volume |
| POST | `/v1/sessions/:id/start` | — | boot seat + push host → guest |
| POST | `/v1/sessions/:id/stop` | — | pull guest → host, kill seat |
| POST | `/v1/sessions/:id/exec` | `{ "cmd" }` | **needs running seat** |
| POST | `/v1/sessions/:id/files` | `{ "path", "content" }` | host if stopped, seat if running |
| GET | `/v1/sessions/:id/files` | `path`, `mode=read\|list` | same routing; response `via` |
| DELETE | `/v1/sessions/:id` | — | kill + **delete volume** |

## “Go to cloud” recipe (host-first)

```bash
BASE="${LANDA_API_BASE:-http://landa.tharavad.xyz}"
AUTH="Authorization: Bearer $LANDA_API_KEY"

# 1) Create workspace (NO seat — host volume only)
SID=$(curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name":"main","repo":"https://github.com/ORG/REPO.git"}' \
  "$BASE/v1/sessions" | jq -r .session.id)

# 2) Edit on host volume (works while stopped)
curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"path":"/workspace/hello.txt","content":"from host\n"}' \
  "$BASE/v1/sessions/$SID/files"

curl -sS -H "$AUTH" \
  "$BASE/v1/sessions/$SID/files?path=/workspace&mode=list" | jq .

# 3) Only when you need isolated offline tools:
curl -sS -X POST -H "$AUTH" "$BASE/v1/sessions/$SID/start"
curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"cmd":"python3 -c \"print(open(\\\"/workspace/hello.txt\\\").read())\""}' \
  "$BASE/v1/sessions/$SID/exec" | jq .

# 4) Back to host-first editing
curl -sS -X POST -H "$AUTH" "$BASE/v1/sessions/$SID/stop"
```

### Agent decision tree

```
User: "go to the cloud" / "dev environment" / "persist work"
  → session create (stopped) → files on host → stop stays default
  → start only for guest exec; then stop again

User: "run offline / sandbox tools in session"
  → start → exec → stop

User: "sandbox this" / one-shot throwaway
  → /v1/sandboxes landa-agent → destroy

User: "wipe session"
  → DELETE /v1/sessions/:id
```

### Session tips

- Prefer **files API while stopped** for source (host volume)
- `exec` only after `start`
- Guest offline: no pip/apk/curl/git
- Clone at create with `repo`
- Spawning workers: `/v1/sandboxes` from orchestrator key

### TypeScript: host-first home

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

/** Ensure a named session exists (stopped host volume by default). */
async function ensureHome(name = "main", repo?: string) {
  const { sessions } = await landa<{
    sessions: { id: string; name: string; status: string }[];
  }>("/v1/sessions");
  const s = sessions.find((x) => x.name === name);
  if (s) return s.id;
  const created = await landa<{ session: { id: string } }>("/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ name, repo }), // boot defaults false
  });
  return created.session.id;
}

async function writeHome(sessionId: string, path: string, content: string) {
  return landa(`/v1/sessions/${sessionId}/files`, {
    method: "POST",
    body: JSON.stringify({ path, content }),
  });
}

/** Boot seat only for offline tools; always stop after. */
async function withSeat<T>(sessionId: string, fn: () => Promise<T>) {
  await landa(`/v1/sessions/${sessionId}/start`, { method: "POST" });
  try {
    return await fn();
  } finally {
    await landa(`/v1/sessions/${sessionId}/stop`, { method: "POST" }).catch(
      () => null,
    );
  }
}
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
| python3 stdlib, jq, bash, coreutils | pip, apk, curl net, **git**, node, browser |
| `/workspace` (sessions, ~160 MiB free) | GPU |
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

> **“Go to the cloud” → host volume home; seat only when you need the VM.**  
> **Throwaway compute → sandbox at `/work`, always destroy.**  
> **Harness holds the key. Guest is optional offline tools.**
