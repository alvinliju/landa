#!/usr/bin/env bash
# Build assets/hello-rootfs.ext4 from Firecracker CI squashfs (official getting-started path).
# Needs: curl, unsquashfs (squashfs-tools), mkfs.ext4, truncate, sudo
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$ROOT/assets"
mkdir -p "$ASSETS"
cd "$ASSETS"

ARCH="$(uname -m)"
S3="https://s3.amazonaws.com/spec.ccfc.min"

echo "list firecracker-ci prefixes…"
CI_ARTIFACTS_PREFIX=$(curl -fsSL "$S3?list-type=2&prefix=firecracker-ci/&delimiter=/" \
  | grep -oE "firecracker-ci/[0-9]{8}-[^/<]+/" \
  | sort \
  | tail -1)

if [[ -z "$CI_ARTIFACTS_PREFIX" ]]; then
  echo "could not find CI_ARTIFACTS_PREFIX" >&2
  exit 1
fi
echo "prefix=$CI_ARTIFACTS_PREFIX"

latest_ubuntu_key=$(curl -fsSL "$S3?list-type=2&prefix=${CI_ARTIFACTS_PREFIX}${ARCH}/ubuntu-" \
  | grep -oE "${CI_ARTIFACTS_PREFIX}${ARCH}/ubuntu-[0-9]+\.[0-9]+\.squashfs" \
  | sort -V \
  | tail -1)

if [[ -z "$latest_ubuntu_key" ]]; then
  echo "could not find ubuntu squashfs key" >&2
  exit 1
fi
echo "key=$latest_ubuntu_key"

curl -fsSL -o upstream.squashfs "$S3/$latest_ubuntu_key"
rm -rf squashfs-root
unsquashfs -d squashfs-root upstream.squashfs

if [[ ! -f id_rsa ]]; then
  ssh-keygen -t rsa -b 2048 -f id_rsa -N "" -q
fi
mkdir -p squashfs-root/root/.ssh
cp -v id_rsa.pub squashfs-root/root/.ssh/authorized_keys
chmod 600 squashfs-root/root/.ssh/authorized_keys || true

sudo chown -R root:root squashfs-root
rm -f hello-rootfs.ext4
truncate -s 1G hello-rootfs.ext4
sudo mkfs.ext4 -d squashfs-root -F hello-rootfs.ext4
cp -f id_rsa hello-id_rsa
chmod 600 hello-id_rsa

echo "wrote $ASSETS/hello-rootfs.ext4 and hello-id_rsa"
ls -lh hello-rootfs.ext4 hello-id_rsa
