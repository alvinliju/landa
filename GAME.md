# the game (own the computer)

## what we are not doing

- wrapping E2B / Daytona as the product
- competing on “API key → Firecracker in 90ms at global scale” day one
- shipping a chat model

## what we are doing

**Own the seat.** Landa is the system that:

1. **creates a real computer** for an agent (process → container → microVM → cloud VM)
2. **exposes a stable contract** (create / exec / fs / snapshot / destroy)
3. **feeds the agent a world model** (compact JSON affordances, not only pixels)
4. **plugs into any harness** later (MCP, CLI, SDK)

Cloud is a **place to run our data plane**, not a vendor we become a thin client of.

```
                    landa
        ┌────────────┴────────────┐
        │     control plane       │  API · policy · audit · world JSON
        └────────────┬────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
     docker       microVM      cloud VM
     (dev)     (strong seat)  (scale later)
        │            │            │
        └────────────┴────────────┘
              OUR runtime / images / tooling
```

## why not rent seats forever

| rent (E2B-class) | own |
|---|---|
| fast demo | product is yours |
| their limits & pricing | sovereignty, BYOC, weird workloads |
| hard to differentiate | stack features on *our* OS surface |
| fine as a competitor to study | we study their API shapes, not their bill |

Seed cos raised millions to **be** the computer. If we only call them, we are a skill on top of their moat.

## layers of the product

| layer | job | now |
|---|---|---|
| **contract** | ComputerBackend | yes (`types.ts`) |
| **control plane** | orchestration | yes (thin) |
| **data plane** | real isolation | memory fake → docker → microVM |
| **world** | explode system to JSON | shell snapshot v0 |
| **plug-in** | MCP / skills | next |
| **features** | browser harness, LumOS-class tune, workflows | after seats are real |

## competitive frame

```
E2B / Daytona / Runloop / Runta
  → sell multi-tenant agent computers as a cloud

landa
  → self-hostable / BYOC agent computers
  → control plane + our runtime
  → world JSON + workflows as the up-stack
```

We do not need to beat them on Fortune-100 sandbox volume.  
We need **a computer we control**, that any agent can attach to, that we can explode and govern.

## build order (no rented seats)

1. **docker backend** — real shell/fs, local or single server  
2. **image** — agent-ready rootfs (nix/docker): git, node, python, tools  
3. **MCP** — so Cursor/Claude plug in without a custom IDE  
4. **microVM** — Firecracker / cloud-hypervisor when isolation must be hard  
5. **cloud driver** — same API, VMs on Hetzner/Fly/AWS *we* provision  
6. **features** — world sensors, browser, always-on OS agents  

## success looks like

```bash
landa create
landa exec <id> -- npm test
landa snapshot <id>   # JSON affordances
# MCP: computer_create / computer_exec from any agent
```

All of that hits **our** machines.
