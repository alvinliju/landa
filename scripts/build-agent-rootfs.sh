#!/usr/bin/env bash
# Build landa-agent Firecracker rootfs: Alpine + dropbear + bash + python3 + jq.
# Offline by design — no pip/apk at runtime. Grok/main-agent default seat.
# Run as root on Linux. Output: firecracker/assets/agent-rootfs.ext4 (~≤250MiB)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="${LANDA_FC_ASSETS:-$ROOT/firecracker/assets}"
ALPINE_VER="${ALPINE_VER:-3.20.3}"
ARCH="${ALPINE_ARCH:-x86_64}"
SIZE_MB="${AGENT_ROOTFS_MB:-256}"
WORK="${TMPDIR:-/tmp}/landa-agent-$$"

mkdir -p "$ASSETS" "$WORK"
cd "$WORK"

need() { command -v "$1" >/dev/null || { echo "need $1" >&2; exit 1; }; }
need curl
need tar
need truncate
need mkfs.ext4

if [[ ! -f "$ASSETS/hello-id_rsa" ]]; then
  ssh-keygen -t rsa -b 2048 -f "$ASSETS/hello-id_rsa" -N "" -q
fi
chmod 600 "$ASSETS/hello-id_rsa"
PUB=$(cat "$ASSETS/hello-id_rsa.pub")

echo "→ alpine minirootfs $ALPINE_VER ($ARCH) [agent]"
TAR="alpine-minirootfs-${ALPINE_VER}-${ARCH}.tar.gz"
URL="https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER%.*}/releases/${ARCH}/${TAR}"
curl -fsSL -o "$TAR" "$URL"

rm -rf rootfs
mkdir rootfs
tar -C rootfs -xzf "$TAR"

echo "→ /init + dropbear"
cat > rootfs/init <<'INIT'
#!/bin/sh
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
mount -t proc proc /proc 2>/dev/null || true
mount -t sysfs sysfs /sys 2>/dev/null || true
mount -t devtmpfs devtmpfs /dev 2>/dev/null || true
mkdir -p /dev/pts /dev/shm /work/in /work/out
mount -t devpts devpts /dev/pts 2>/dev/null || true
ip link set lo up 2>/dev/null || true
ip link set eth0 up 2>/dev/null || true
mkdir -p /etc/dropbear /root/.ssh
[ -f /etc/dropbear/dropbear_rsa_host_key ] || dropbearkey -t rsa -f /etc/dropbear/dropbear_rsa_host_key >/dev/null 2>&1 || true
[ -f /etc/dropbear/dropbear_ed25519_host_key ] || dropbearkey -t ed25519 -f /etc/dropbear/dropbear_ed25519_host_key >/dev/null 2>&1 || true
dropbear -R -p 22 2>/dev/null || dropbear -p 22 2>/dev/null || true
exec sleep infinity
INIT
chmod +x rootfs/init

echo "→ apk: dropbear bash python3 jq (+ busybox-extras)"
cp /etc/resolv.conf rootfs/etc/resolv.conf 2>/dev/null || echo "nameserver 1.1.1.1" > rootfs/etc/resolv.conf
mount --bind /dev rootfs/dev
mount --bind /proc rootfs/proc
mount --bind /sys rootfs/sys
cat > rootfs/etc/apk/repositories <<EOF
https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER%.*}/main
https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER%.*}/community
EOF

chroot rootfs /bin/sh -c "
  set -e
  export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  /sbin/apk update --no-progress
  /sbin/apk add --no-progress --no-cache \
    dropbear dropbear-dbclient \
    busybox-extras \
    bash \
    python3 \
    jq \
    coreutils \
    findutils \
    grep \
    sed
  # no py3-pip — offline seat; bake more packages here if needed
  python3 -c 'import sys; print(sys.version)'
  jq --version
  bash --version | head -1
" || {
  umount rootfs/dev rootfs/proc rootfs/sys 2>/dev/null || true
  echo "apk install failed" >&2
  exit 1
}
umount rootfs/dev rootfs/proc rootfs/sys 2>/dev/null || true

# work dirs + contract
mkdir -p rootfs/work/in rootfs/work/out rootfs/usr/local/share/landa
cat > rootfs/usr/local/share/landa/README <<'README'
landa-agent seat contract (offline)
===================================

Layout:
  /work/in/     inputs written by control plane / main agent
  /work/out/    put results here (prefer result.json)
  /work/task.py or /work/task.sh  — script to run

Run (examples):
  python3 /work/task.py
  bash /work/task.sh

Result:
  Prefer /work/out/result.json :
    { "ok": true, "summary": "...", "data": {} }
  stdout is the log stream for the main agent.

Tools (no internet, no pip/apk):
  shell: busybox, bash, sed, awk, grep, coreutils
  script: python3 (stdlib only)
  data: jq

Do not: apk add, pip install, curl external URLs.
Bake extra tools into this image at build time.
README

# sample task for smoke
cat > rootfs/work/task.py <<'PY'
#!/usr/bin/env python3
"""Smoke task — offline tools check."""
import json
import platform
import sys
from pathlib import Path

out = Path("/work/out")
out.mkdir(parents=True, exist_ok=True)
result = {
    "ok": True,
    "summary": "landa-agent smoke",
    "data": {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "machine": platform.machine(),
    },
}
(out / "result.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
PY
chmod +x rootfs/work/task.py

mkdir -p rootfs/root/.ssh
echo "$PUB" > rootfs/root/.ssh/authorized_keys
chmod 700 rootfs/root/.ssh
chmod 600 rootfs/root/.ssh/authorized_keys
sed -i 's|^root:.*|root:x:0:0:root:/root:/bin/bash|' rootfs/etc/passwd
ln -sf /init rootfs/sbin/init 2>/dev/null || cp -a rootfs/init rootfs/sbin/init

echo "→ mkfs ${SIZE_MB}M agent-rootfs.ext4"
OUT="$ASSETS/agent-rootfs.ext4"
rm -f "$OUT"
truncate -s "${SIZE_MB}M" "$OUT"
mkfs.ext4 -q -d rootfs -F "$OUT"

# ensure CI kernel if missing
if [[ ! -f "$ASSETS/vmlinux.bin" ]]; then
  echo "→ fetch CI vmlinux"
  S3="https://s3.amazonaws.com/spec.ccfc.min"
  CI_PREFIX=$(curl -fsSL "$S3?list-type=2&prefix=firecracker-ci/&delimiter=/" \
    | grep -oE "firecracker-ci/[0-9]{8}-[^/<]+/" | sort | tail -1)
  if [[ -n "$CI_PREFIX" ]]; then
    KKEY=$(curl -fsSL "$S3?list-type=2&prefix=${CI_PREFIX}${ARCH}/vmlinux-" \
      | grep -oE "${CI_PREFIX}${ARCH}/vmlinux-[0-9][0-9.]+" \
      | grep -v debug | sort -u | head -1 || true)
    if [[ -n "$KKEY" ]]; then
      curl -fsSL -o "$ASSETS/vmlinux.bin" "$S3/$KKEY"
      cp -f "$ASSETS/vmlinux.bin" "$ASSETS/hello-vmlinux.bin"
    fi
  fi
fi

BYTES=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
echo "→ done agent-rootfs.ext4 ($((BYTES / 1024 / 1024)) MiB file)"
ls -lh "$OUT" "$ASSETS/hello-id_rsa" "$ASSETS/vmlinux.bin" 2>/dev/null || ls -lh "$OUT"
if [[ "$BYTES" -gt $((250 * 1024 * 1024)) ]]; then
  echo "warn: image > 250MiB — consider trimming packages" >&2
fi
echo "  LANDA_FC_ROOTFS=$OUT"
rm -rf "$WORK"
