---
name: landa-vms
description: >
  Full-power skill for landa agent VMs: Firecracker microVMs with offline
  python3/bash/jq. Create, exec, filesystem I/O, snapshot, destroy. Use for
  untrusted code, data transforms, multi-step jobs, parallel seats, and any
  workload that needs a disposable Linux box without touching the host.
  Requires LANDA_API_KEY. Template is always landa-agent only.
---

# landa VMs — maximum-utilization skill for coding agents

You are controlling **landa**: a control plane that gives agents **real
Firecracker microVMs** (same isolation class as E2B). Treat each VM as a
**disposable computer**, not a chat tool.

**Live product surface today**

| Item | Value |
|------|--------|
| Template | **`landa-agent` only** (others: coming soon — never invent slugs) |
| Isolation | Firecracker microVM (own kernel) |
| Guest tools | bash, busybox, python3 **stdlib**, jq, coreutils, find, grep, sed |
| Network in guest | **Offline by design** — no `apk` / `pip` / `curl` to the internet |
| Workspace | `/work/in` (inputs) · `/work/out` (outputs) · `/work/task.py` |
| TTL | default **8 hours**; always destroy yourself |
| Auth | `Authorization: Bearer $LANDA_API_KEY` |
| API base | `http://landa.tharavad.xyz` (or `LANDA_API_BASE`) |

---

## 0. Mental model (how people actually use sandboxes)

Synthesized from **Hacker News**, **r/AI_Agents**, E2B/Daytona patterns, and
production agent threads:

### Patterns that win

1. **Sandbox as a tool, harness outside** (HN consensus)  
   Your reasoning/LLM loop stays on the host (or orchestrator). The VM is a
   **tool** for exec + files — not the place you keep secrets or the agent brain.
   landa matches this: you hold `LANDA_API_KEY`; the guest never needs it.

2. **One seat per unit of untrusted work** (E2B / Reddit “disposable box”)  
   One messy experiment = one VM. When done → destroy. Do not reuse a dirty
   seat across unrelated tasks unless you intentionally want state.

3. **Write → run → harvest → kill** (code interpreter loop)  
   Upload inputs + script → exec → read `/work/out` or stdout → destroy.
   Same shape as E2B Code Interpreter / Jupyter-in-sandbox.

4. **Parallel isolation** (Freestyle/HN “fork 10 ideas”)  
   When you must try N approaches fairly, spawn **N sandboxes** (respect
   concurrent limit), run each recipe, compare outputs, destroy all.
   landa does not yet offer snapshot-fork; parallel create is the pattern.

5. **Persistent only when needed** (X/HN agentbox discussion)  
   Prefer on-demand seats from current inputs. “Long-lived box with credentials”
   is harder to secure; landa’s 8h TTL + offline encourages short jobs.

6. **Structured results, not chat logs**  
   Prefer `/work/out/result.json` with `{ "ok", "summary", "data" }` so the
   orchestrator can parse deterministically.

### What people struggle with (avoid)

- Leaving sandboxes running (cost / quota) → always `DELETE`
- Installing packages at runtime → **not available offline** on landa-agent
- Putting host secrets *inside* the guest → keep keys on harness side
- Treating sandbox = full internet laptop → landa-agent is offline toolkit
- Ignoring exit codes → always check `result.exitCode`

---

## 1. Setup (human once; agent reads env)

```bash
export LANDA_API_KEY='landa_…'              # Console → API keys → Create
export LANDA_API_BASE='http://landa.tharavad.xyz'
```

```http
Authorization: Bearer $LANDA_API_KEY
Content-Type: application/json
```

Also: `X-Api-Key: $LANDA_API_KEY`.

Keys are scoped to the user’s project; VMs are owned by that user.

---

## 2. Lifecycle (non-negotiable)

```
POST /v1/sandboxes  →  status running
        ↓
   files / exec / snapshot   (repeat)
        ↓
DELETE /v1/sandboxes/:id     ← always, success or failure
```

Like E2B `with Sandbox() as s:` / `.kill()` — **cleanup is part of the skill**.

Statuses: `creating` → `running` → `destroyed` | `error`.  
Only exec/files/snapshot when **`running`**.

---

## 3. Guest machine facts (max use of landa-agent)

### Baked tools (use these)

| Tool | Use for |
|------|---------|
| `python3` | Data transforms, parsing, algorithms, JSON, pure stdlib |
| `jq` | JSON filter/map/reduce pipelines |
| `bash` + coreutils | Globs, pipelines, control flow |
| `find` / `grep` / `sed` | Search and edit text |
| busybox | Lightweight Unix utilities |

Python is **stdlib only** — no numpy/pandas unless we bake a new image later.

### Layout (contract)

```
/work/in/       ← put inputs here (JSON, CSV, text, scripts)
/work/out/      ← put artifacts here (prefer result.json)
/work/task.py   ← optional main entry
/work/task.sh   ← optional shell entry
```

Dirs are created on seat boot. Prefer absolute paths.

### Offline rules

**Do**

- Pure Python stdlib (`json`, `re`, `pathlib`, `hashlib`, `csv`, `statistics`, …)
- `jq` transforms on files in `/work`
- Multi-file pipelines under `/work`
- Deterministic functions: same inputs → same `data`

**Do not**

- `pip install`, `apk add`, `curl http://…`, `wget`, git clone public net
- Assume package managers or compilers beyond what’s listed
- Expect GPU, browser, or Node (coming later as templates)

If a job needs network packages, **refuse or redesign** for stdlib — don’t thrash.

---

## 4. API reference (complete)

| Method | Path | Body / query | Purpose |
|--------|------|--------------|---------|
| GET | `/health` | — | liveness (no auth) |
| GET | `/v1/me` | — | project, limits, backends |
| GET | `/v1/templates` | — | only `landa-agent` usable |
| GET | `/v1/sandboxes` | — | list non-destroyed VMs |
| POST | `/v1/sandboxes` | `{ "template":"landa-agent", "label"?, "ttlSec"? }` | create |
| GET | `/v1/sandboxes/:id` | — | get one |
| POST | `/v1/sandboxes/:id/exec` | `{ "cmd", "cwd"? }` | shell |
| POST | `/v1/sandboxes/:id/snapshot` | — | world / affordances JSON |
| POST | `/v1/sandboxes/:id/files` | `{ "path", "content" }` | write file |
| GET | `/v1/sandboxes/:id/files` | `path`, `mode=read\|list` | read / list |
| DELETE | `/v1/sandboxes/:id` | — | destroy |

### Create response (important fields)

```json
{
  "sandbox": {
    "id": "uuid",
    "status": "running",
    "backend": "firecracker",
    "label": "…",
    "metadata": { "computerId": "fc_…", "createMs": "…" }
  },
  "vm": { "id": "…", "user_id": "…", "sandbox_id": "…" }
}
```

### Exec response

```json
{
  "result": {
    "exitCode": 0,
    "stdout": "…",
    "stderr": "…",
    "durationMs": 42
  }
}
```

---

## 5. High-value playbooks

### A. Code interpreter (most common E2B use)

1. Create `landa-agent`
2. Write `/work/in/input.json` + `/work/task.py`
3. `python3 /work/task.py`
4. Read `/work/out/result.json`
5. Destroy

```bash
SID=$(curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template":"landa-agent","label":"interp"}' \
  "$LANDA_API_BASE/v1/sandboxes" | jq -r .sandbox.id)

curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path":"/work/task.py","content":"import json,sys\nfrom pathlib import Path\nPath(\"/work/out\").mkdir(exist_ok=True)\nPath(\"/work/out/result.json\").write_text(json.dumps({\"ok\":True,\"summary\":\"2+2\",\"data\":{\"n\":2+2}})+\"\\n\")\n"}' \
  "$LANDA_API_BASE/v1/sandboxes/$SID/files"

curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cmd":"python3 /work/task.py && cat /work/out/result.json"}' \
  "$LANDA_API_BASE/v1/sandboxes/$SID/exec"

curl -sS -X DELETE -H "Authorization: Bearer $LANDA_API_KEY" \
  "$LANDA_API_BASE/v1/sandboxes/$SID"
```

### B. jq data pipeline

Write JSON to `/work/in/data.json`, then:

```bash
cmd='jq "[.[] | select(.score > 10)] | length" /work/in/data.json > /work/out/count.txt && cat /work/out/count.txt'
```

### C. Multi-step shell job (set -euo pipefail)

```bash
cmd='set -euo pipefail
cd /work
python3 -c "open(\"in/a.txt\",\"w\").write(\"hello\")"
grep -n hello in/a.txt | tee out/hits.txt
'
```

Always use `set -euo pipefail` for multi-line scripts so failures surface as non-zero `exitCode`.

### D. Parallel hypotheses (HN “try 10 things”)

```
for each hypothesis i:
  create seat label=hyp-i
  write different task.py
  exec
  collect result.json
  destroy
compare summaries; pick best
```

Watch concurrent limit from `/v1/me` → `project.maxConcurrent` / `vms`.

### E. Recover quota (429)

```
GET /v1/sandboxes
DELETE any idle/error/unneeded ids
retry create
```

### F. Smoke the image

```bash
cmd='python3 --version && jq --version && ls -la /work && python3 /work/task.py && cat /work/out/result.json'
```

Default image ships a smoke `task.py`.

---

## 6. Result JSON contract (preferred)

Orchestrators should teach the guest to emit:

```json
{
  "ok": true,
  "summary": "one-line human summary",
  "data": {}
}
```

On failure:

```json
{
  "ok": false,
  "summary": "what failed",
  "data": { "error": "…" }
}
```

Still check shell `exitCode` — JSON may be missing if the process crashed.

---

## 7. TypeScript harness (E2B-style `with`)

```ts
const base = process.env.LANDA_API_BASE ?? "http://landa.tharavad.xyz";
const key = process.env.LANDA_API_KEY;
if (!key) throw new Error("LANDA_API_KEY required");

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
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      `landa ${res.status}: ${data?.message || data?.error || text || res.statusText}`,
    );
  }
  return data as T;
}

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
      throw new Error(`not running: ${sandbox.status}`);
    }
    return await fn(id);
  } finally {
    await landa(`/v1/sandboxes/${id}`, { method: "DELETE" }).catch(() => null);
  }
}

async function exec(id: string, cmd: string) {
  const { result } = await landa<{
    result: {
      exitCode: number;
      stdout: string;
      stderr: string;
      durationMs: number;
    };
  }>(`/v1/sandboxes/${id}/exec`, {
    method: "POST",
    body: JSON.stringify({ cmd }),
  });
  return result;
}

async function writeFile(id: string, path: string, content: string) {
  await landa(`/v1/sandboxes/${id}/files`, {
    method: "POST",
    body: JSON.stringify({ path, content }),
  });
}

async function readFile(id: string, path: string) {
  const r = await landa<{ file: { path: string; content: string } }>(
    `/v1/sandboxes/${id}/files?path=${encodeURIComponent(path)}&mode=read`,
  );
  return r.file.content;
}
```

---

## 8. Python harness

```python
import json, os, urllib.request

BASE = os.environ.get("LANDA_API_BASE", "http://landa.tharavad.xyz")
KEY = os.environ["LANDA_API_KEY"]

def landa(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{BASE}{path}", data=data, method=method,
        headers={
            "Authorization": f"Bearer {KEY}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if data else {}),
        },
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

class Vm:
    def __enter__(self):
        r = landa("POST", "/v1/sandboxes", {
            "template": "landa-agent", "label": "py",
        })
        self.id = r["sandbox"]["id"]
        if r["sandbox"]["status"] != "running":
            raise RuntimeError(r["sandbox"]["status"])
        return self
    def __exit__(self, *exc):
        try:
            landa("DELETE", f"/v1/sandboxes/{self.id}")
        except Exception:
            pass
    def exec(self, cmd: str):
        return landa("POST", f"/v1/sandboxes/{self.id}/exec", {"cmd": cmd})["result"]
    def write(self, path: str, content: str):
        landa("POST", f"/v1/sandboxes/{self.id}/files", {"path": path, "content": content})

with Vm() as vm:
    print(vm.exec("python3 -c 'print(40+2)'"))
```

---

## 9. Errors & limits

| HTTP | Meaning | What you do |
|------|---------|-------------|
| 401 | bad/missing key | stop; user must create key in console |
| 429 | concurrent limit | list + destroy idle VMs; retry |
| 400 `template_unavailable` | wrong template | only `landa-agent` |
| 409 | not running / no seat | recreate or fix status |
| 501 | Firecracker/backend down | report host issue |
| 404 | unknown id | refresh list |

| Limit | Notes |
|-------|--------|
| Concurrent | `/v1/me` → `project.maxConcurrent` / `vms.active` |
| TTL | 8h default; optional `ttlSec` on create (capped) |
| Memory | ~256 MiB guest — keep workloads small |

---

## 10. Security (industry + landa)

From HN “harness outside sandbox” + multi-tenant practice:

1. **Orchestrator holds secrets** — never write `LANDA_API_KEY` or user API keys into guest files  
2. **Untrusted code only inside the VM** — don’t `eval` host-side  
3. **Destroy always** — in `finally` / `__exit__`  
4. **No key in logs** — redact Bearer tokens  
5. **Ephemeral disk** — nothing survives DELETE  
6. **Offline guest** reduces blast radius of bad code  

---

## 11. Capability map (what to attempt)

| Goal | How on landa-agent |
|------|---------------------|
| Run generated Python | write `/work/task.py` → exec |
| Transform JSON | `jq` or python `json` |
| Parse / regex logs | python `re` or `grep`/`sed` |
| Hash / checksum | python `hashlib` |
| CSV stats | python `csv` + `statistics` |
| Unit-test a pure function | write tests + script, assert exit 0 |
| Compare N algorithms | N parallel VMs or sequential recreate |
| Long REPL session | multiple execs on **same** id until done, then destroy |
| Install packages | **not supported** — redesign or wait for richer image |
| Browse the web | **not supported** — coming soon template |
| Node/npm | **not supported** — coming soon |

---

## 12. Agent checklist (run every job)

- [ ] `LANDA_API_KEY` present  
- [ ] Create with **`template: "landa-agent"`** only  
- [ ] Label seats with task id for debugging  
- [ ] Put inputs in `/work/in`, outputs in `/work/out`  
- [ ] Prefer `result.json` contract  
- [ ] Check `exitCode` **and** parse stdout/files  
- [ ] On multi-line shell: `set -euo pipefail`  
- [ ] `DELETE` in all exit paths  
- [ ] On 429: reap own idle VMs first  
- [ ] Never invent template slugs  

---

## 13. Console map (humans)

| Tab | For |
|-----|-----|
| VMs | create / open / destroy seats |
| API keys | mint Bearer secrets for agents |
| Guide | human recipes |
| Templates | `landa-agent` live · others **Coming soon** |
| Settings | account / project |

---

## 14. One-liner philosophy

> **Harness thinks. VM does. Files go in `/work`. Results come out as JSON. Then the machine dies.**

That is how E2B-class sandboxes are used in production agent stacks — and how landa is meant to be used to the fullest **today**.
