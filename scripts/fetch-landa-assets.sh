#!/usr/bin/env bash
# Fetch/build Firecracker kernel + rootfs + SSH key into firecracker/assets.
# Run as root on a Linux KVM host (alvin).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="${LANDA_FC_ASSETS:-$ROOT/firecracker/assets}"
mkdir -p "$ASSETS"
cd "$ASSETS"

ARCH="$(uname -m)"
S3="https://s3.amazonaws.com/spec.ccfc.min"

echo "→ assets dir: $ASSETS"

# tiny official kernel
if [[ ! -f hello-vmlinux.bin ]]; then
  echo "→ kernel"
  curl -fsSL -o hello-vmlinux.bin \
    "$S3/img/hello/kernel/hello-vmlinux.bin"
fi

# SSH key for guest root
if [[ ! -f hello-id_rsa ]]; then
  echo "→ ssh key"
  ssh-keygen -t rsa -b 2048 -f hello-id_rsa -N "" -q
fi
chmod 600 hello-id_rsa

# Prefer existing rootfs
if [[ -f hello-rootfs.ext4 ]]; then
  echo "→ rootfs already present"
  ls -lh hello-vmlinux.bin hello-rootfs.ext4 hello-id_rsa
  exit 0
fi

# Build from Firecracker CI ubuntu squashfs (same as fetch-ci-rootfs.sh)
echo "→ build rootfs from firecracker CI squashfs"
need() { command -v "$1" >/dev/null || { echo "need $1" >&2; exit 1; }; }
need curl
need unsquashfs
need mkfs.ext4
need truncate

CI_ARTIFACTS_PREFIX=$(curl -fsSL "$S3?list-type=2&prefix=firecracker-ci/&delimiter=/" \
  | grep -oE "firecracker-ci/[0-9]{8}-[^/<]+/" \
  | sort \
  | tail -1)
[[ -n "$CI_ARTIFACTS_PREFIX" ]] || { echo "no CI prefix" >&2; exit 1; }
echo "  prefix=$CI_ARTIFACTS_PREFIX"

latest_ubuntu_key=$(curl -fsSL "$S3?list-type=2&prefix=${CI_ARTIFACTS_PREFIX}${ARCH}/ubuntu-" \
  | grep -oE "${CI_ARTIFACTS_PREFIX}${ARCH}/ubuntu-[0-9]+\.[0-9]+\.squashfs" \
  | sort -V \
  | tail -1)
[[ -n "$latest_ubuntu_key" ]] || { echo "no ubuntu squashfs" >&2; exit 1; }
echo "  key=$latest_ubuntu_key"

curl -fsSL -o upstream.squashfs "$S3/$latest_ubuntu_key"
rm -rf squashfs-root
unsquashfs -d squashfs-root upstream.squashfs
mkdir -p squashfs-root/root/.ssh
cp -f hello-id_rsa.pub squashfs-root/root/.ssh/authorized_keys
chmod 600 squashfs-root/root/.ssh/authorized_keys
chown -R root:root squashfs-root 2>/dev/null || true

truncate -s 1G hello-rootfs.ext4
mkfs.ext4 -d squashfs-root -F hello-rootfs.ext4
rm -rf squashfs-root upstream.squashfs

echo "→ done"
ls -lh hello-vmlinux.bin hello-rootfs.ext4 hello-id_rsa
