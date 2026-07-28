# backends — we own these

No third-party sandbox SaaS as the product path.

| backend | isolation | role |
|---|---|---|
| `memory` | none | design control plane, CI without docker |
| `docker` | container | first **real** computer (local / single host) |
| `microvm` | hardware VM | untrusted agents, multi-tenant-ish |
| `cloudvm` | full VM | scale-out on Hetzner/AWS/Fly we provision |

## docker (next)

```
docker run -d --name landa-<id> landa-agent:dev
docker exec landa-<id> sh -c '…'
docker cp … 
docker rm -f landa-<id>
```

Maps cleanly onto `ComputerBackend`.

## microvm (after docker works)

Firecracker or cloud-hypervisor:

- prebuilt rootfs + kernel
- vsock or tap for exec channel
- harder ops, real isolation

## rule

Agent code and MCP tools call **ControlPlane only**.  
Never import a vendor sandbox SDK into agent paths.
