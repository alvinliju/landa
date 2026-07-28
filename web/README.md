# landa web console

Control plane UI — computers for agents.

## Run

```bash
cd web
npm install
npm run dev
# http://localhost:5173
```

Dev proxies `/v1` and `/health` to the API (default `http://landa-back.tharavad.xyz`).
Override with `LANDA_API_PROXY_TARGET`.

Paste a `landa_…` API key to connect.

## Production

| Host | Role |
|------|------|
| `https://landa.tharavad.xyz` (HTTP for now) | static UI |
| `http://landa-back.tharavad.xyz` | control plane API |

```bash
VITE_LANDA_API_URL=http://landa-back.tharavad.xyz npm run build
# dist/ → edge /var/lib/landa/web/dist
```

## Pages

| Route | Job |
|-------|-----|
| `/` | Overview |
| `/sandboxes` | List / create / destroy |
| `/sandboxes/:id` | Detail, exec, snapshot |
| `/templates` | Templates |
| `/settings` | API base, sign out |
