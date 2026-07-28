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
| POST | `/v1/sandboxes` | key | create (`template`, `label`) |
| GET | `/v1/sandboxes/:id` | key | get |
| DELETE | `/v1/sandboxes/:id` | key | destroy |
| POST | `/v1/sandboxes/:id/exec` | key | `{ "cmd": "…" }` memory only |

Auth: `Authorization: Bearer <key>` or `X-Api-Key: <key>`.

## maps to E2B UI

| E2B | landa |
|-----|--------|
| Project | `projects` row |
| API Keys | `api_keys` (hashed) |
| Sandboxes | `sandboxes` + backend seat |
| Templates | `templates` |
| Usage / Limits | `max_concurrent`, `expires_at` |
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
