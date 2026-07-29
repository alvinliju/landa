---
name: landa-vms
description: >
  Spin up landa agent VMs (isolated Firecracker computers with offline python/bash/jq),
  run shell commands, read/write files, and destroy seats. Use whenever the user or agent
  needs a real machine for code execution, tool use, builds, or experiments — similar to
  E2B/Daytona sandboxes. Requires LANDA_API_KEY.
---

# landa VMs — coding-agent skill

## What this is

**landa** is a control plane for **ephemeral agent computers** (VMs).  
Pattern matches industry sandboxes (E2B, Daytona, etc.):

| Competitor pattern | landa equivalent |
|--------------------|------------------|
| `E2B_API_KEY` | `LANDA_API_KEY` |
| `Sandbox.create()` | `POST /v1/sandboxes` |
| `runCode` / `commands.run` | `POST /v1/sandboxes/:id/exec` |
| filesystem upload/download | `POST/GET …/files` |
| `sandbox.kill()` / context exit | `DELETE /v1/sandboxes/:id` |
| template / image | `template: "landa-agent"` only (for now) |

Each VM is a short-lived Linux seat. Default image has **offline** `python3`, `bash`, `jq` and workspace dirs under `/work`.

**Do not** invent other template slugs. Only **`landa-agent`** is live; more templates are coming later.

---

## When to use

- Run untrusted or generated code safely off the host
- Install-free offline tools already on the agent image
- Multi-step jobs that need a real shell + filesystem
- Parallel “one seat per task” workflows (respect concurrent limits)

## When not to use

- Pure Q&A with no execution
- Long-lived servers (TTL is hours, not days)
- Secrets you cannot put on an ephemeral disk

---

## Setup (user once)

1. Open **http://landa.tharavad.xyz** → sign up / sign in  
2. Sidebar **API keys** → **Create key** → copy secret (`landa_…`)  
3. Export (never commit):

```bash
export LANDA_API_KEY='landa_xxxxxxxx'           # from console, once
export LANDA_API_BASE='http://landa.tharavad.xyz'
```

Optional direct API host: `http://landa-back.tharavad.xyz`.

Auth on every `/v1/*` call:

```http
Authorization: Bearer $LANDA_API_KEY
```

Also accepted: `X-Api-Key: $LANDA_API_KEY`.

---

## Canonical lifecycle (always)

```
create → (wait running) → exec / files / snapshot → destroy
```

**Always destroy** when the job finishes or fails. Same rule as E2B “kill sandbox” / Python `with` cleanup.

Default **TTL: 8 hours** if you forget; reaper will destroy expired seats. Do not rely on that.

---

## Only template: `landa-agent`

```json
{ "template": "landa-agent", "label": "optional-job-name" }
```

| Field | Value |
|-------|--------|
| slug | `landa-agent` |
| backend | firecracker |
| tools | python3, bash, jq (offline) |
| workspace | `/work`, `/work/in`, `/work/out` |
| mem | ~256 MiB (image default) |

Other templates: **coming soon** — do not request them.

---

## HTTP API (complete)

Base: `$LANDA_API_BASE`  
Unless noted, all need Bearer key.

| Method | Path | Body / query | Returns |
|--------|------|--------------|---------|
| GET | `/health` | — | `{ ok, backends, … }` (no auth) |
| GET | `/v1/me` | — | project, user, concurrent limits |
| GET | `/v1/templates` | — | list (only agent is usable) |
| GET | `/v1/sandboxes` | — | non-destroyed VMs for this user |
| POST | `/v1/sandboxes` | `{ template, label?, ttlSec? }` | `{ sandbox, vm? }` |
| GET | `/v1/sandboxes/:id` | — | one sandbox |
| POST | `/v1/sandboxes/:id/exec` | `{ cmd, cwd? }` | `{ result: { exitCode, stdout, stderr, durationMs } }` |
| POST | `/v1/sandboxes/:id/snapshot` | — | world affordances JSON |
| POST | `/v1/sandboxes/:id/files` | `{ path, content }` | write file |
| GET | `/v1/sandboxes/:id/files` | `path`, `mode=read\|list` | file or listing |
| DELETE | `/v1/sandboxes/:id` | — | destroy seat |

Statuses: `creating` → `running` → `destroyed` | `error`.  
Only call exec/files/snapshot when **`status === "running"`**.

---

## Tool-shaped recipes (copy this pattern)

### 1. Create

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template":"landa-agent","label":"agent-job-1"}' \
  "$LANDA_API_BASE/v1/sandboxes"
```

Save `sandbox.id` (UUID).

### 2. Exec

```bash
SID="<sandbox-uuid>"
curl -sS -X POST \
  -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cmd":"set -euo pipefail; uname -a; python3 --version; which jq"}' \
  "$LANDA_API_BASE/v1/sandboxes/$SID/exec"
```

Prefer `set -euo pipefail` in multi-step shell. Check `result.exitCode`.

### 3. Files

```bash
# write
curl -sS -X POST \
  -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path":"/work/in/task.py","content":"print(40+2)\n"}' \
  "$LANDA_API_BASE/v1/sandboxes/$SID/files"

# run
curl -sS -X POST \
  -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cmd":"python3 /work/in/task.py > /work/out/result.txt && cat /work/out/result.txt"}' \
  "$LANDA_API_BASE/v1/sandboxes/$SID/exec"

# read
curl -sS \
  -H "Authorization: Bearer $LANDA_API_KEY" \
  "$LANDA_API_BASE/v1/sandboxes/$SID/files?path=/work/out/result.txt&mode=read"
```

### 4. Snapshot (optional)

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $LANDA_API_KEY" \
  "$LANDA_API_BASE/v1/sandboxes/$SID/snapshot"
```

### 5. Destroy (required)

```bash
curl -sS -X DELETE \
  -H "Authorization: Bearer $LANDA_API_KEY" \
  "$LANDA_API_BASE/v1/sandboxes/$SID"
```

---

## TypeScript client (E2B-style loop)

```ts
const base = process.env.LANDA_API_BASE ?? "http://landa.tharavad.xyz";
const key = process.env.LANDA_API_KEY;
if (!key) throw new Error("LANDA_API_KEY is required");

async function landa<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      data?.message || data?.error || res.statusText || String(res.status);
    throw new Error(`landa ${res.status}: ${msg}`);
  }
  return data as T;
}

/** Create → work → always destroy (like E2B with-block). */
async function withVm<T>(
  label: string,
  fn: (id: string) => Promise<T>,
): Promise<T> {
  const { sandbox } = await landa<{ sandbox: { id: string; status: string } }>(
    "/v1/sandboxes",
    {
      method: "POST",
      body: JSON.stringify({ template: "landa-agent", label }),
    },
  );
  const id = sandbox.id;
  try {
    if (sandbox.status !== "running") {
      throw new Error(`sandbox not running: ${sandbox.status}`);
    }
    return await fn(id);
  } finally {
    await landa(`/v1/sandboxes/${id}`, { method: "DELETE" }).catch(() => null);
  }
}

// example
const out = await withVm("demo", async (id) => {
  const { result } = await landa<{
    result: { exitCode: number; stdout: string; stderr: string };
  }>(`/v1/sandboxes/${id}/exec`, {
    method: "POST",
    body: JSON.stringify({ cmd: "python3 -c 'print(2+2)'" }),
  });
  return result.stdout.trim();
});
```

---

## Python (same pattern)

```python
import os, json, urllib.request

BASE = os.environ.get("LANDA_API_BASE", "http://landa.tharavad.xyz")
KEY = os.environ["LANDA_API_KEY"]

def landa(method, path, body=None):
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=None if body is None else json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method=method,
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

sid = None
try:
    created = landa("POST", "/v1/sandboxes", {
        "template": "landa-agent",
        "label": "py-job",
    })
    sid = created["sandbox"]["id"]
    ex = landa("POST", f"/v1/sandboxes/{sid}/exec", {
        "cmd": "python3 -c 'print(\"ok\")'",
    })
    print(ex["result"])
finally:
    if sid:
        try:
            landa("DELETE", f"/v1/sandboxes/{sid}")
        except Exception:
            pass
```

---

## Limits & errors

| Limit | Default / notes |
|-------|-----------------|
| Concurrent VMs | per project (often 10) |
| Session TTL | 8h unless `ttlSec` lower |
| Template | only `landa-agent` |

| HTTP | Meaning | Agent action |
|------|---------|--------------|
| 401 | bad/missing key | stop; ask user for key |
| 429 | concurrent limit | list VMs, destroy idle, retry |
| 400 | bad template/body | use only `landa-agent` |
| 409 | not running / no seat | recreate or wait |
| 501 | backend down | report host/backend unavailable |
| 404 | unknown id | refresh list |

---

## Security rules (non-negotiable)

1. **Never** print, commit, or paste full API keys into chat logs if avoidable  
2. Prefer env `LANDA_API_KEY` over hardcoding  
3. **Destroy** every seat you create  
4. Treat `/work` as ephemeral — nothing persists after destroy  
5. Do not open network-dependent installs unless the seat has egress and the user asked  

---

## Agent checklist

- [ ] `LANDA_API_KEY` set  
- [ ] Create with `template: "landa-agent"` only  
- [ ] Use `/work/in` + `/work/out` for artifacts  
- [ ] Check `exitCode` on every exec  
- [ ] `DELETE` sandbox in a `finally` / cleanup path  
- [ ] On 429, destroy unused VMs before retrying  

---

## Console map (for humans)

| UI | Purpose |
|----|---------|
| Overview / VMs | list & create seats |
| API keys | mint Bearer secrets for agents |
| Guide | human-readable recipes |
| Templates | `landa-agent` live; others **Coming soon** |

Skill file path in repo: **`docs/SKILL.md`** (this file).  
Point coding assistants at this skill + a fresh key from the console.
