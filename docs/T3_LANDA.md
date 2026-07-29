# T3 Code × Landa (native provider)

See the fork: `Documents/t3code` (clone of pingdotgg/t3code) + `docs/landa/THE_GAME.md`.

## The game

| T3 | Landa |
|----|--------|
| Project | Session (host volume) |
| Switch project | Switch session |
| Thread | Chat inside session |
| workspaceRoot | `volumePath` on alvin |

T3 server should run **co-located** with landa volumes (alvin).

## Env

**landa-api (alvin):**
```bash
export LANDA_EXPOSE_VOLUME_PATHS=1   # only on private host — enables T3 sync
```

**t3 server:**
```bash
export LANDA_API_KEY=landa_…
export LANDA_API_BASE=http://127.0.0.1:8787
export LANDA_T3_SYNC=1
```

## Status

- [x] THE_GAME.md in t3code
- [x] `@t3tools/landa` client + planProjectSync
- [x] Startup hook `LandaProjectSync` (when env set)
- [x] landa `volumePath` gated by `LANDA_EXPOSE_VOLUME_PATHS`
- [ ] UI: “New landa project” / create from T3
- [ ] Seat start/stop in project settings
- [ ] landa CLI `open` → pair T3

## Run (dev)

```bash
# terminal 1 — landa-api with expose
LANDA_EXPOSE_VOLUME_PATHS=1 npm run api

# terminal 2 — t3 from monorepo
cd ../t3code
export LANDA_API_KEY=… LANDA_API_BASE=http://127.0.0.1:8787 LANDA_T3_SYNC=1
pnpm install   # once
pnpm dev:server
```

On boot, T3 creates projects titled `landa:<sessionName>` for each session with a volume path.
