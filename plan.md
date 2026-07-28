# landa plan (draft — talk before we lock)

## direction

- **own seats** (no E2B/Docker-as-identity)
- **Firecracker** as primary isolation (microVMs)
- culture: sourcehut-simple, tinygrad-hacky, **benchmarks first**
- first leaderboard: **cold create**
- **headline metric:** snapshot restore → usable shell (target &lt;5ms p50)
- **honesty column:** true cold boot (see `firecracker/hello-world.sh`)

## spike status

- [x] DIY config + script (`firecracker/` — Julia Evans-style hello)
- [ ] boot once on KVM host
- [ ] snapshot create/restore API path
- [ ] `bench/cold_create` table

## stack sketch (not locked)

```
landa control plane (TS)
        │
        ▼
 firecracker (+ jailer)
        │
 prebuilt kernel + rootfs (or snapshot)
        │
 agent gets shell / API
```

AWS angle: they open-sourced **Firecracker** and run it under Lambda / Fargate-style multi-tenant isolation. We use the same *class* of tech; we do not need their cloud.

## benches (what we measure)

| bench class    | what you measure                  | who you fight             |
|----------------|-----------------------------------|---------------------------|
| cold create    | time to usable shell              | E2B, Daytona marketing ms |
| exec latency   | round-trip `true` / `echo`        | SDK overhead              |
| density        | seats per host @ fixed RAM        | cloud $                   |
| snapshot/fork  | time + disk                       | Daytona lifecycle story   |
| isolation      | escape / noisy neighbor (crude)   | docker cosplay            |
| agent task     | clone repo + test / fix fail      | real harnesses            |
| world snapshot | tokens + ms for JSON explode      | screenshot computer-use   |

**Phase 0 focus:** cold create only. Define the metric, build the smallest spinner, publish a table.

## cold create — definitions (must nail before claiming <5ms)

| name | meaning |
|------|---------|
| **true cold** | process up + kernel boot + userspace to shell, nothing pre-warmed |
| **warm pool** | VM already running; “create” = assign from pool |
| **snapshot restore** | restore Firecracker snapshot / memory+disk CoW |
| **API overhead only** | control plane RTT, seat already live |

Marketing “&lt;100ms” / “&lt;5ms” is almost always **warm pool or snapshot**, not true cold.

**Proposed claim to fight for first:**  
`create_usable_shell_ms` under a **named** mode (e.g. `snapshot_restore` or `warm_pool`) on a **named** host, p50/p99, open `bench/` script.

&lt;5ms true cold is likely fantasy on stock Firecracker+Linux.  
&lt;5ms snapshot/warm is the Hotz-legible fight.

## phase map (loose)

0. **bench harness** + definitions + firecracker spike on one Linux/KVM box  
1. **minimal seat**: kernel + tiny rootfs + vsock/serial exec  
2. **snapshot path** aimed at sub-5ms *restore*  
3. control plane wires create/destroy to real seats  
4. other benches (exec, density, …)  
5. world JSON / MCP / agent features  

## open / talk later

- [ ] true cold vs snapshot vs warm — which do we put on the homepage number?
- [ ] Firecracker only vs Firecracker + Cloud Hypervisor later?
- [ ] rootfs: Alpine vs custom vs nix-built?
- [ ] host: mothership / spare Linux box / cloud bare metal (needs KVM)?
- [ ] jailer + networking minimal (no full CNI yet)?

## not yet

- docker/podman as the product path  
- E2B wrapper  
- full multi-tenant SaaS  
- LumOS / browser extreme (features after seats + benches)
