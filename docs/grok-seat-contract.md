# Grok seat contract (landa-agent)

Offline Firecracker seat for **main agents** (Grok first): write a script, run it, return results. No internet in the guest.

## Image

| | |
|--|--|
| Template | `landa-agent` |
| Rootfs | `assets/agent-rootfs.ext4` |
| Kernel | `assets/vmlinux.bin` |
| Mem | 256 MiB |
| Tools | bash, busybox, **python3** (stdlib), **jq**, dropbear |

Lite smoke image: `landa-lite` / `firecracker-hello` (shell only, smaller/faster).

## Layout

```
/work/in/      ← inputs (JSON, text, blobs)
/work/out/     ← outputs (prefer result.json)
/work/task.py  ← or task.sh
/usr/local/share/landa/README
```

## Loop (main agent)

1. `POST /v1/sandboxes` `{ "template": "landa-agent", "label": "…" }`
2. Write inputs + script (`POST .../files` or exec `cat > …`)
3. `POST .../exec` `{ "cmd": "python3 /work/task.py" }`
4. Read `/work/out/result.json` and/or stdout
5. `DELETE` sandbox

## Result JSON

```json
{
  "ok": true,
  "summary": "one-line human summary",
  "data": {}
}
```

## Rules

- **No** `apk`, `pip`, `curl` to the public internet.
- Use only baked tools; request new packages in the **image build**, not at task time.
- Prefer pure functions: same inputs + same image → same `data`.

## Smoke

```bash
python3 /work/task.py
cat /work/out/result.json
```

Built into the image as a default smoke task.
