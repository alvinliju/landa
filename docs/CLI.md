# landa CLI

```bash
# install / run from repo
npm run cli -- help
# or after build: npx landa / node dist/cli.js
```

## Zero-friction path

```bash
# 1) one-time login (saves ~/.config/landa/config.json)
landa login landa_YOUR_KEY
# prompts for base if needed (default http://landa.tharavad.xyz)

# or:
landa --login landa_YOUR_KEY

# 2) open the whole product surface
landa t3
# or:
landa --t3
```

### What `landa t3` does

1. Ensures you’re logged in (prompts for key + base if missing)
2. Lists your sessions (host-first)
3. Picks/creates a session if needed
4. Opens the web console for that session
5. Writes `~/.config/landa/t3.env`
6. **Launches bundled T3** from monorepo folder `t3/` (first run: `pnpm install` inside `t3/`)

```bash
landa t3              # full GUI: pnpm dev → server :13773 + web :5733
landa t3 --serve      # headless API only (remote pair)
landa t3 --no-launch  # setup only, no T3 process
```

**Ports:** open **http://localhost:5733** (web UI), not only :13773.  
If Firefox can’t connect to :5733, the Vite UI never started (server-only mode).  
Pairing URL looks like `http://localhost:5733/pair#token=…` — use the whole thing.

Bundle path: `landa/t3`. Override with `LANDA_T3_ROOT`.

## Commands

| Command | Meaning |
|---------|---------|
| `login [key]` | Save API key + base |
| `t3` | Login + sessions + console + t3.env |
| `open -r <id\|name>` | Open one session |
| `sessions` | List |
| `create --name x --repo url` | Host-first volume (stopped) |
| `files ls\|cat\|put` | Host volume when stopped |
| `start` / `stop` / `exec` | Seat lifecycle |

## Monorepo layout (direction)

```
landa/
  src/api          # control plane
  src/cli          # this CLI (product entry)
  web/             # console
  docs/
  vendor/t3/       # optional later: t3code submodule (huge)
```

We **don’t** vendor all of T3 into landa by default (15k+ files).  
CLI owns auth + session; T3 is launched with env (`LANDA_*`).  
Native T3 project-sync lives in the `t3code` fork until we submodule it.

## Config file

`~/.config/landa/config.json`:

```json
{
  "apiKey": "landa_…",
  "apiBase": "http://landa.tharavad.xyz",
  "lastSession": "uuid…"
}
```
