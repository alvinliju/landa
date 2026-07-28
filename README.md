# landa

**computers for agents** — TypeScript control plane with swappable seat backends.

```
agent / MCP / CLI
       │
       ▼
   ControlPlane          ← landa (this repo)
       │
   ComputerBackend
    ├── memory   (local fake seat — works offline)
    ├── e2b      (stub → wire SDK)
    ├── daytona  (planned)
    └── microvm  (later: your iron / Firecracker)
```

Not a chat product. Not a foundation model.  
The unit is a **Computer**: create → exec / fs → snapshot world JSON → destroy.

## quick start

```bash
cd ~/Documents/landa
npm install
npm run demo
```

## the game

Seed-stage money funds **the computer under the agent** (E2B, Daytona, Runloop, Runta…).  
Most of that is cloud rental + SDK gravity.

**Landa’s bet:**

1. **Control plane first** — one seat contract, many backends (rent cloud now, own metal later).
2. **Plug into any env** — CLI today; MCP skill next (Cursor / Claude / anything).
3. **World JSON** — compact affordances, not screenshot-only computer use.
4. **Features later** — BrowserUse-extreme, LumOS-class always-on tuning, workflows — as plugins on a real seat.

If you only wrap E2B, you die. If you own the **contract + world model + workflow**, backends are commodities.

## open source to study (steal shapes, not brands)

| project | what it is | steal |
|---|---|---|
| [e2b-dev/E2B](https://github.com/e2b-dev/E2B) | Firecracker sandboxes + SDK | seat lifecycle API, templates |
| [daytonaio/daytona](https://github.com/daytonaio/daytona) | agent computers (OSS history; prod shifted) | snapshot / fork mental model |
| [agent-sandbox/agent-sandbox](https://github.com/agent-sandbox/agent-sandbox) | REST + **MCP** sandbox manager | E2B-compatible + MCP surface |
| [steel-dev/steel-browser](https://github.com/steel-dev/steel-browser) | OSS browser fleet for agents | browser as a seat type |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | web agent harness | extreme browser actuator later |
| [lastmile-ai/mcp-agent](https://github.com/lastmile-ai/mcp-agent) | agents as MCP | expose landa as MCP tools |
| [restyler/awesome-sandbox](https://github.com/restyler/awesome-sandbox) | landscape list | map of primitives |
| Firecracker / cloud-hypervisor / microvm.nix | isolation primitives | data plane only |

Also track: Modal sandboxes, Fly Sprites, AWS AgentCore MCP, AgentScope Runtime.

## repo map

```
src/
  types.ts           seat contract + WorldSnapshot
  control-plane.ts   public API
  backends/memory.ts in-process demo seat
  backends/e2b.stub.ts
  world/snapshot.ts  shell → compact JSON
  cli.ts
docs/backends.md
```

## roadmap (thin)

- [x] seat types + memory backend + demo
- [ ] real E2B backend behind the same interface
- [ ] MCP server: `computer_create`, `computer_exec`, `computer_snapshot`
- [ ] docker backend for local real shells
- [ ] world sensors: browser affordances, proc, git graph
- [ ] workflow runner (checkpoint / verify)
- [ ] optional: always-on OS tune feature (LumOS-class) *after* seats work

## license

MIT
