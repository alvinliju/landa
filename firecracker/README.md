# firecracker spike (DIY)

Based on [Julia Evans — Firecracker: start a VM in less than a second](https://jvns.ca/blog/2021/01/23/firecracker-start-a-vm-in-less-than-a-second/).

**Needs:** Linux + KVM + root (or proper caps). Not macOS.

## layout

```
firecracker/
  README.md
  hello-world.sh      # download assets, tap, write config, run
  vmconfig.example.json
  assets/             # gitignored — kernel, rootfs, ssh key
```

## run (on a KVM host)

```bash
# install firecracker binary into PATH first:
# https://github.com/firecracker-microvm/firecracker/releases

cd firecracker
sudo ./hello-world.sh
```

In another terminal (default offline demo net):

```bash
ssh -o StrictHostKeyChecking=false -i assets/hello-id_rsa root@169.254.0.21
```

## two modes (later benches)

| mode | what we time |
|------|----------------|
| **true cold** | this script path: process → boot → shell |
| **snapshot** (headline) | restore pre-booted snapshot → shell (&lt;5ms fight) |

This folder is **true cold hello**. Snapshot API comes after one VM boots reliably.

## notes from the post

- Ubuntu+systemd ≈ 2–3s boot (fine for learning)
- Spec: ≤125ms to guest `/sbin/init` with a tiny image
- Config file (`--no-api --config-file`) for DIY; socket API/SDK for the control plane
- Nested virt: DO/GCP often OK; AWS usually wants metal
- Next: jailer, own rootfs, vsock exec, snapshot
