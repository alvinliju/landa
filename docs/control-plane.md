# control plane (Hono + Postgres)

What E2B’s dashboard is, for landa — **you** run it.

```
SDK / curl / later MCP
        │
        ▼
   landa-api (Hono)     ← this package
   auth · projects · sandboxes · templates · audit
        │
        ▼
   Postgres (raw SQL migrations)
        │
        ▼
   seat backends: memory (now) · firecracker (next)
```

## routes

| method | path | auth | notes |
|--------|------|------|--------|
| GET | `/health` | no | db ping |
| GET | `/v1/me` | key | project + limits |
| GET | `/v1/templates` | key | list templates |
| GET | `/v1/sandboxes` | key | list non-destroyed |
| POST | `/v1/sandboxes` | key | create (`template`, `label`, optional `ttlSec` ≤ project max) |
| GET | `/v1/sandboxes/:id` | key | get |
| DELETE | `/v1/sandboxes/:id` | key | destroy |
| POST | `/v1/sandboxes/:id/exec` | key | `{ "cmd": "…" }` memory + docker |
| POST | `/v1/sandboxes/:id/snapshot` | key | world JSON (affordances) |
| POST | `/v1/sandboxes/:id/files` | key | write `{ path, content }` |
| GET | `/v1/sandboxes/:id/files?path=&mode=list\|read` | key | list or read |
| GET | `/v1/backends` | key | registered seat drivers |
| GET | `/v1/api-keys` | session/key | list key prefixes for project |
| POST | `/v1/api-keys` | session/key | create key (plaintext once) |
| DELETE | `/v1/api-keys/:id` | session/key | revoke |

Auth: `Authorization: Bearer <key>` or `X-Api-Key: <key>`, or Better Auth session cookie.

Agent skill: **`docs/SKILL.md`** (`landa-vms`) — create/exec/destroy VMs with a user API key.

Templates: **`landa-agent` only** (more coming soon). See **`docs/SKILL.md`**.

## maps to E2B UI

| E2B | landa |
|-----|--------|
| Project | `projects` row |
| API Keys | `api_keys` (hashed) |
| Sandboxes | `sandboxes` + backend seat |
| Templates | `templates` |
| Usage / Limits | `max_concurrent`, `expires_at` (TTL; reaper destroys after expiry, default 8h) |
| Webhooks / Billing | later |

## dev = deploy shape

```bash
nix develop
landa-pg start
landa-migrate && landa-migrate seed
npm run api:dev
# or: landa-dev
```

Same `DATABASE_URL`, same migrations, same binary path on a server.

## public deploy (internet)

```bash
nix run .#deploy
# or: ./scripts/landa-deploy
# or: DEPLOY_HOST=root@178.105.120.5 ./scripts/landa-deploy
```

Default: **edge** → `/var/lib/landa` → `http://178.105.120.5:8787`

```bash
curl -s http://178.105.120.5:8787/health
ssh root@178.105.120.5 'cd /var/lib/landa && nix develop -c landa-migrate seed'
curl -s -H "Authorization: Bearer $LANDA_API_KEY" http://178.105.120.5:8787/v1/me
```

Service on host: `systemctl status landa-api`
