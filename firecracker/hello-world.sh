#!/usr/bin/env bash
# landa firecracker hello — adapted from Julia Evans / firecracker-demo
# run as root on Linux+KVM: sudo ./hello-world.sh
#   or: sudo env PATH="/usr/local/bin:$PATH" ./hello-world.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$ROOT/assets"
mkdir -p "$ASSETS"
cd "$ROOT"

# sudo often drops /usr/local/bin — find firecracker explicitly
export PATH="/usr/local/bin:/run/current-system/sw/bin:${PATH:-/usr/bin:/bin}"
FIRECRACKER_BIN="${FIRECRACKER_BIN:-}"
if [[ -z "$FIRECRACKER_BIN" ]]; then
  if command -v firecracker >/dev/null 2>&1; then
    FIRECRACKER_BIN="$(command -v firecracker)"
  elif [[ -x /usr/local/bin/firecracker ]]; then
    FIRECRACKER_BIN=/usr/local/bin/firecracker
  elif [[ -x "$HOME/.local/bin/firecracker" ]]; then
    FIRECRACKER_BIN="$HOME/.local/bin/firecracker"
  fi
fi

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "firecracker needs Linux+KVM (not $(uname -s))." >&2
  exit 1
fi

if [[ ! -r /dev/kvm ]]; then
  echo "no /dev/kvm — nested virt off or not a KVM host" >&2
  exit 1
fi

if [[ -z "${FIRECRACKER_BIN:-}" || ! -x "$FIRECRACKER_BIN" ]]; then
  echo "firecracker binary not found." >&2
  echo "  put it at /usr/local/bin/firecracker or set FIRECRACKER_BIN=..." >&2
  echo "  https://github.com/firecracker-microvm/firecracker/releases" >&2
  exit 1
fi

echo "using firecracker: $FIRECRACKER_BIN ($("$FIRECRACKER_BIN" --version 2>&1 | head -1))"

dl() {
  local url="$1" out="$2"
  if [[ -e "$out" ]]; then
    return 0
  fi
  echo "download $(basename "$out")…"
  curl -fsSL -o "$out" "$url"
}

# --- assets ----------------------------------------------------------------
KERNEL="$ASSETS/hello-vmlinux.bin"
ROOTFS="$ASSETS/hello-rootfs.ext4"
SSH_KEY="$ASSETS/hello-id_rsa"

# official tiny kernel (works)
dl "https://s3.amazonaws.com/spec.ccfc.min/img/hello/kernel/hello-vmlinux.bin" "$KERNEL"

# old demo rootfs URL 404s often — prefer file already present, else CI squashfs path docs
if [[ ! -e "$ROOTFS" ]]; then
  echo "missing $ROOTFS" >&2
  echo "old xenial demo rootfs is gone (404). either:" >&2
  echo "  1) copy a rootfs.ext4 here as assets/hello-rootfs.ext4" >&2
  echo "  2) or run: ./fetch-ci-rootfs.sh  (builds ext4 from Firecracker CI squashfs)" >&2
  exit 1
fi

if [[ ! -e "$SSH_KEY" ]]; then
  dl "https://raw.githubusercontent.com/firecracker-microvm/firecracker-demo/ec271b1e5ffc55bd0bf0632d5260e96ed54b5c0c/xenial.rootfs.id_rsa" "$SSH_KEY" || true
  if [[ -e "$SSH_KEY" ]]; then
    chmod 600 "$SSH_KEY"
  fi
fi

# --- link-local net (offline demo; no egress) ------------------------------
TAP_DEV="fc-landa-tap0"
MASK_LONG="255.255.255.252"
MASK_SHORT="/30"
FC_IP="169.254.0.21"
TAP_IP="169.254.0.22"
FC_MAC="02:FC:00:00:00:05"

KERNEL_BOOT_ARGS="ro console=ttyS0 noapic reboot=k panic=1 pci=off nomodules random.trust_cpu=on"
KERNEL_BOOT_ARGS="${KERNEL_BOOT_ARGS} ip=${FC_IP}::${TAP_IP}:${MASK_LONG}::eth0:off"

ip link del "$TAP_DEV" 2>/dev/null || true
ip tuntap add dev "$TAP_DEV" mode tap
sysctl -w "net.ipv4.conf.${TAP_DEV}.proxy_arp=1" >/dev/null
sysctl -w "net.ipv6.conf.${TAP_DEV}.disable_ipv6=1" >/dev/null
ip addr add "${TAP_IP}${MASK_SHORT}" dev "$TAP_DEV"
ip link set dev "$TAP_DEV" up

CONFIG="$ROOT/vmconfig.generated.json"
cat >"$CONFIG" <<EOF
{
  "boot-source": {
    "kernel_image_path": "$KERNEL",
    "boot_args": "$KERNEL_BOOT_ARGS"
  },
  "drives": [
    {
      "drive_id": "rootfs",
      "path_on_host": "$ROOTFS",
      "is_root_device": true,
      "is_read_only": false
    }
  ],
  "network-interfaces": [
    {
      "iface_id": "eth0",
      "guest_mac": "$FC_MAC",
      "host_dev_name": "$TAP_DEV"
    }
  ],
  "machine-config": {
    "vcpu_count": 1,
    "mem_size_mib": 256,
    "smt": false
  }
}
EOF

echo "config → $CONFIG"
if [[ -e "$SSH_KEY" ]]; then
  echo "ssh:   ssh -o StrictHostKeyChecking=false -i $SSH_KEY root@${FC_IP}"
fi
echo "start firecracker (true cold path)…"
echo

exec "$FIRECRACKER_BIN" --no-api --config-file "$CONFIG"
