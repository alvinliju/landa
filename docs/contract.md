# ComputerBackend contract

The unit of work is a **Computer** (seat). Everything else (HTTP, CLI, MCP, UI) is a client of this contract.

```
Agent / MCP / CLI / Dashboard
            │
            ▼
      ControlPlane          create · exec · fs · worldSnapshot · destroy
            │
            ▼
      BackendRegistry
       ├── memory      (no isolation — tests + offline)
       ├── docker      (real shell/fs)
       └── firecracker (next)
```

## Statuses

`creating → running → paused|stopped|destroyed|error`

## Required methods

| method | job |
|--------|-----|
| `create(spec)` | allocate seat, return `ComputerInfo` |
| `get` / `list` / `destroy` | lifecycle |
| `exec` | run shell command |
| `writeFile` / `readFile` | filesystem |

Optional: `listFiles`, `pause`/`resume`, `checkpoint` (VM/disk — **not** world JSON).

## World snapshot vs checkpoint

- **`ControlPlane.worldSnapshot(id)`** — agent-facing compact JSON (cwd, affordances).
- **`checkpoint(id)`** — backend seat snapshot (Firecracker memory+disk). Different thing.

## IDs

- memory: `mem_<12 hex>`
- docker: `dck_<12 hex>`

## CLI

```bash
npm run demo              # memory
npm run demo:docker       # real container
npx tsx src/cli.ts create --backend docker myseat
npx tsx src/cli.ts exec <id> -- uname -a
npx tsx src/cli.ts snapshot <id>
npx tsx src/cli.ts destroy <id>
```

## Rule

Agent code imports **ControlPlane only**. Never a vendor sandbox SDK.
