# landa

**computers for agents — we build the seats.**

TypeScript control plane + our own data plane (not an E2B wrapper).

```
agent / MCP / CLI
       │
       ▼
   ControlPlane          ← landa
       │
   ComputerBackend
    ├── memory    offline fake (works now)
    ├── docker    real shell/fs (works when daemon up)
    ├── microvm   strong isolation (Firecracker / cloud-hypervisor)
    └── cloudvm   our VMs on rented metal (later)
```

Unit of work: **Computer**  
`create → exec / fs → world snapshot (JSON) → destroy`

Contract details: **[docs/contract.md](./docs/contract.md)**

## quick start

```bash
cd ~/Documents/landa
npm install
npm run demo              # memory seat — full contract walk
# npm run demo:docker     # real container (Docker Desktop running)

# control plane (Hono + Postgres) — same shape as deploy
nix develop               # or: export DATABASE_URL=… if pg already local
landa-pg start
npm install
landa-migrate && landa-migrate seed   # prints API key once
npm run api:dev
# curl -s localhost:8787/health | jq .
```

See `docs/control-plane.md`.

## the game

Read **[GAME.md](./GAME.md)**.

Short version: seed money is funding “computers for agents.”  
If we only rent E2B, we are a client. **Landa owns the runtime** — control plane, images, isolation, world model. Cloud is where *our* VMs run, not a third-party sandbox API we depend on.

## study (shapes only — we reimplement)

| project | steal |
|---|---|
| E2B / Daytona APIs | lifecycle verbs (not their cloud) |
| agent-sandbox | REST + MCP manager pattern |
| Steel / Browser Use | browser as a seat *type* later |
| Firecracker, cloud-hypervisor, microvm.nix | isolation primitives |
| mcp-agent | expose landa as MCP tools |

## repo

```
src/types.ts              seat contract
src/control-plane.ts      public API
src/backends/memory.ts    demo seat
src/world/snapshot.ts     shell → compact JSON
src/cli.ts
GAME.md
docs/backends.md
```

## roadmap

- [x] seat contract + memory + demo
- [x] docker backend (first real computer — needs daemon)
- [x] multi-backend ControlPlane + registry
- [ ] agent base image
- [ ] MCP: `computer_create` / `computer_exec` / `computer_snapshot`
- [ ] microVM backend
- [ ] cloud VM driver (our provisioning)
- [ ] world sensors + workflows + features

## license

MIT
