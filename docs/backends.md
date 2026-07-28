# backends

Landa is a **control plane**. Isolation lives in backends.

| backend | status | notes |
|---|---|---|
| `memory` | shipped | fake FS/shell, local demos only |
| `e2b` | stub | wire `@e2b/code-interpreter` / `e2b` SDK |
| `daytona` | planned | snapshot/fork-friendly |
| `docker` | planned | local real shell, weak multi-tenant isolation |
| `microvm` | later | mothership / Firecracker / cloud-hypervisor |

## E2B sketch

```ts
// pseudo — after npm i e2b
import { Sandbox } from "e2b";

async create(spec) {
  const sbx = await Sandbox.create({ apiKey: this.apiKey, /* template */ });
  return { id: sbx.sandboxId, status: "running", backend: "e2b", ... };
}
```

Keep **all agent code** talking to `ControlPlane`, never to E2B directly.
