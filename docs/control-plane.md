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
