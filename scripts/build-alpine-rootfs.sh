#!/usr/bin/env bash
# Build a tiny Alpine ext4 rootfs for Firecracker seats (dropbear + our SSH key).
# Run as root on Linux. Target: ~64–128MiB image, boot to SSH in ~1–2s nested.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="${LANDA_FC_ASSETS:-$ROOT/firecracker/assets}"
ALPINE_VER="${ALPINE_VER:-3.20.3}"
ARCH="${ALPINE_ARCH:-x86_64}"
SIZE_MB="${ALPINE_ROOTFS_MB:-96}"
WORK="${TMPDIR:-/tmp}/landa-alpine-$$"

mkdir -p "$ASSETS" "$WORK"
cd "$WORK"

need() { command -v "$1" >/dev/null || { echo "need $1" >&2; exit 1; }; }
need curl
need tar
need truncate
need mkfs.ext4

# SSH key pair (reuse if present)
if [[ ! -f "$ASSETS/hello-id_rsa" ]]; then
  ssh-keygen -t rsa -b 2048 -f "$ASSETS/hello-id_rsa" -N "" -q
fi
chmod 600 "$ASSETS/hello-id_rsa"
PUB=$(cat "$ASSETS/hello-id_rsa.pub")

echo "→ alpine minirootfs $ALPINE_VER ($ARCH)"
TAR="alpine-minirootfs-${ALPINE_VER}-${ARCH}.tar.gz"
URL="https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER%.*}/releases/${ARCH}/${TAR}"
curl -fsSL -o "$TAR" "$URL"

rm -rf rootfs
mkdir rootfs
tar -C rootfs -xzf "$TAR"

echo "→ custom /init (no openrc — fast)"
# busybox-based init: mount, start dropbear, sleep
cat > rootfs/init <<'INIT'
#!/bin/sh
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
mount -t proc proc /proc 2>/dev/null || true
mount -t sysfs sysfs /sys 2>/dev/null || true
mount -t devtmpfs devtmpfs /dev 2>/dev/null || true
mkdir -p /dev/pts /dev/shm
mount -t devpts devpts /dev/pts 2>/dev/null || true
# eth0 already configured by kernel ip= boot arg when present
ip link set lo up 2>/dev/null || true
ip link set eth0 up 2>/dev/null || true
# dropbear host keys + daemon
mkdir -p /etc/dropbear /root/.ssh
if [ ! -f /etc/dropbear/dropbear_rsa_host_key ]; then
  dropbearkey -t rsa -f /etc/dropbear/dropbear_rsa_host_key >/dev/null 2>&1 || true
fi
if [ ! -f /etc/dropbear/dropbear_ed25519_host_key ]; then
  dropbearkey -t ed25519 -f /etc/dropbear/dropbear_ed25519_host_key >/dev/null 2>&1 || true
fi
# -B allow blank passwords only if no auth — we use keys; -R create hostkeys
dropbear -R -p 22 2>/dev/null || dropbear -p 22 2>/dev/null || true
# keep VM alive
exec sleep infinity
INIT
chmod +x rootfs/init

echo "→ install dropbear via apk (static-ish from alpine repos)"
# need network for apk — use host network
cp /etc/resolv.conf rootfs/etc/resolv.conf 2>/dev/null || echo "nameserver 1.1.1.1" > rootfs/etc/resolv.conf
# apk needs to run in chroot with mount
mount --bind /dev rootfs/dev
mount --bind /proc rootfs/proc
mount --bind /sys rootfs/sys
# use alpine edge/main
cat > rootfs/etc/apk/repositories <<EOF
https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER%.*}/main
https://dl-cdn.alpinelinux.org/alpine/v${ALPINE_VER%.*}/community
EOF

chroot rootfs /bin/sh -c "
  set -e
  export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
  /sbin/apk update --no-progress
  /sbin/apk add --no-progress --no-cache dropbear dropbear-dbclient busybox-extras
" || {
  umount rootfs/dev rootfs/proc rootfs/sys 2>/dev/null || true
  echo "apk install failed — is network available from chroot?" >&2
  exit 1
}

umount rootfs/dev rootfs/proc rootfs/sys 2>/dev/null || true

# root SSH authorized_keys
mkdir -p rootfs/root/.ssh
echo "$PUB" > rootfs/root/.ssh/authorized_keys
chmod 700 rootfs/root/.ssh
chmod 600 rootfs/root/.ssh/authorized_keys

# passwd: root has no password but key auth works with dropbear
# ensure /etc/passwd has root shell
sed -i 's|^root:.*|root:x:0:0:root:/root:/bin/sh|' rootfs/etc/passwd

# kernel will use init=/init if we pass it — also symlink as /sbin/init
ln -sf /init rootfs/sbin/init 2>/dev/null || cp -a rootfs/init rootfs/sbin/init

echo "→ mkfs ${SIZE_MB}M alpine-rootfs.ext4"
OUT="$ASSETS/alpine-rootfs.ext4"
rm -f "$OUT"
truncate -s "${SIZE_MB}M" "$OUT"
mkfs.ext4 -q -d rootfs -F "$OUT"
# also install as default landa rootfs name for easy swap
cp -f "$OUT" "$ASSETS/landa-rootfs.ext4"

# Real Firecracker CI kernel (hello-vmlinux is NOT enough for Alpine userspace)
echo "→ firecracker CI vmlinux"
S3="https://s3.amazonaws.com/spec.ccfc.min"
CI_PREFIX=$(curl -fsSL "$S3?list-type=2&prefix=firecracker-ci/&delimiter=/" \
  | grep -oE "firecracker-ci/[0-9]{8}-[^/<]+/" | sort | tail -1)
if [[ -n "$CI_PREFIX" ]]; then
  # prefer vmlinux from same arch
  KKEY=$(curl -fsSL "$S3?list-type=2&prefix=${CI_PREFIX}${ARCH}/" \
    | grep -oE "${CI_PREFIX}${ARCH}/vmlinux-[^<\"]+" | head -1 || true)
  if [[ -z "$KKEY" ]]; then
    KKEY=$(curl -fsSL "$S3?list-type=2&prefix=${CI_PREFIX}${ARCH}/" \
      | grep -oE "${CI_PREFIX}${ARCH}/[^<\"]*vmlinux[^<\"]*" | head -1 || true)
  fi
  if [[ -n "$KKEY" ]]; then
    echo "  kernel key=$KKEY"
    curl -fsSL -o "$ASSETS/vmlinux.bin" "$S3/$KKEY"
    cp -f "$ASSETS/vmlinux.bin" "$ASSETS/hello-vmlinux.bin"
  else
    echo "  warn: no CI vmlinux listed; keeping existing kernel if any"
  fi
fi
if [[ ! -f "$ASSETS/hello-vmlinux.bin" ]]; then
  echo "→ fallback hello kernel (may not run Alpine)"
  curl -fsSL -o "$ASSETS/hello-vmlinux.bin" \
    "$S3/img/hello/kernel/hello-vmlinux.bin"
fi

# also install as default names used by backend
cp -f "$OUT" "$ASSETS/hello-rootfs.ext4"

echo "→ done"
ls -lh "$ASSETS/alpine-rootfs.ext4" "$ASSETS/landa-rootfs.ext4" "$ASSETS/hello-id_rsa" "$ASSETS/hello-vmlinux.bin"
echo "  LANDA_FC_ROOTFS=$OUT"
rm -rf "$WORK"
