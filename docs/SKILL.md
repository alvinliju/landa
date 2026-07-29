---
name: landa-vms
description: Create, exec, and destroy landa agent VMs (Firecracker seats) via the HTTP control plane. Use when the user wants sandboxes, agent computers, or offline toolchains (python/bash/jq).
---

# landa VMs — agent skill

landa gives agents **real machines**: ephemeral VMs (or memory seats for smoke tests) with create → exec → snapshot → destroy.

## Prerequisites

1. User signs in at **http://landa.tharavad.xyz**
2. **API keys → Create key** in the console — copy the secret once (`landa_…`)
3. Put the key in the environment (never commit it):

```bash
export LANDA_API_KEY='landa_…'
export LANDA_API_BASE='http://landa.tharavad.xyz'   # or http://landa-back.tharavad.xyz
```

## Auth

Every `/v1/*` call (except public `/health`) requires:

```http
Authorization: Bearer $LANDA_API_KEY
```

or `X-Api-Key: $LANDA_API_KEY`.

Keys are scoped to the user's project. VMs created with a key are owned by that user.

## Base URL

| Environment | Base |
|-------------|------|
| Public console (proxied) | `http://landa.tharavad.xyz` |
| Direct API host | `http://landa-back.tharavad.xyz` |

Paths are relative to that base: `/v1/sandboxes`, `/health`, etc.

## Templates

| slug | backend | use |
|------|---------|-----|
| `landa-agent` | firecracker | **Default** — Alpine + python/bash/jq offline toolkit |
| `landa-lite` | memory/lite | Quick smoke tests |

Prefer `landa-agent` unless the user asks for lite.

## Limits

- **Concurrent VMs** per user/project (default 10)
- **TTL** default **8 hours** (`maxSessionSec`); reaper destroys expired seats
- Optional create body field `ttlSec` (capped by project max)

## API cookbook

### Health

```bash
curl -sS "$LANDA_API_BASE/health"
```

### Who am I

```bash
curl -sS -H "Authorization: Bearer $LANDA_API_KEY" "$LANDA_API_BASE/v1/me"
```

### List templates

```bash
curl -sS -H "Authorization: Bearer $LANDA_API_KEY" "$LANDA_API_BASE/v1/templates"
```

### Create a VM

```bash
curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template":"landa-agent","label":"agent-job-1"}' \
  "$LANDA_API_BASE/v1/sandboxes"
```

Response includes `sandbox.id` (UUID) and optional `vm` ownership row.

### List VMs

```bash
curl -sS -H "Authorization: Bearer $LANDA_API_KEY" "$LANDA_API_BASE/v1/sandboxes"
```

### Exec

```bash
SID=<sandbox-uuid>
curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cmd":"uname -a && python3 --version"}' \
  "$LANDA_API_BASE/v1/sandboxes/$SID/exec"
```

### World snapshot (affordances)

```bash
curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  "$LANDA_API_BASE/v1/sandboxes/$SID/snapshot"
```

### Write / read file

```bash
curl -sS -X POST -H "Authorization: Bearer $LANDA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"path":"/work/in/task.txt","content":"hello"}' \
  "$LANDA_API_BASE/v1/sandboxes/$SID/files"

curl -sS -H "Authorization: Bearer $LANDA_API_KEY" \
  "$LANDA_API_BASE/v1/sandboxes/$SID/files?path=/work/in/task.txt&mode=read"
```

### Destroy (always clean up)

```bash
curl -sS -X DELETE -H "Authorization: Bearer $LANDA_API_KEY" \
  "$LANDA_API_BASE/v1/sandboxes/$SID"
```

## Recommended agent loop

1. `POST /v1/sandboxes` with `template: "landa-agent"` and a clear `label`
2. Wait until `status` is `running` (create is usually synchronous when Firecracker is available)
3. `POST …/exec` for work; use `/work/in` and `/work/out` on agent images
4. Optional `POST …/snapshot` for structured world state
5. **`DELETE …/sandboxes/:id` when done** — do not leave seats idle

## Statuses

`creating` → `running` → `destroyed` (or `error`)

Only exec/snapshot/files when `status === "running"`.

## Errors to handle

| HTTP | meaning |
|------|---------|
| 401 | missing/invalid key |
| 429 | concurrent limit — destroy idle VMs or wait |
| 409 | seat not running / no live seat |
| 501 | backend unavailable on this host |

## Security rules for agents

- Never print the full API key in logs or commits
- Prefer env `LANDA_API_KEY` over hardcoding
- Destroy VMs after the job finishes
- Treat guest filesystem as ephemeral

## Minimal TypeScript client sketch

```ts
const base = process.env.LANDA_API_BASE ?? "http://landa.tharavad.xyz";
const key = process.env.LANDA_API_KEY!;

async function landa(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// create → exec → destroy
const { sandbox } = await landa("/v1/sandboxes", {
  method: "POST",
  body: JSON.stringify({ template: "landa-agent", label: "job" }),
});
const { result } = await landa(`/v1/sandboxes/${sandbox.id}/exec`, {
  method: "POST",
  body: JSON.stringify({ cmd: "echo hi" }),
});
await landa(`/v1/sandboxes/${sandbox.id}`, { method: "DELETE" });
```
