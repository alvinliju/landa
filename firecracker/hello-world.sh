#!/usr/bin/env bash
# landa firecracker hello — adapted from Julia Evans / firecracker-demo
# run as root on Linux+KVM: sudo ./hello-world.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ASSETS="$ROOT/assets"
mkdir -p "$ASSETS"
cd "$ROOT"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "firecracker needs Linux+KVM (not $(uname -s)). run this on mothership / a KVM box." >&2
  exit 1
fi

if [[ ! -r /dev/kvm ]]; then
  echo "no /dev/kvm — nested virt off or not a KVM host" >&2
  exit 1
fi

if ! command -v firecracker >/dev/null 2>&1; then
  echo "firecracker not in PATH. grab a release:" >&2
  echo "  https://github.com/firecracker-microvm/firecracker/releases" >&2
  exit 1
fi

# --- assets (same demo bits Julia used) ------------------------------------
KERNEL="$ASSETS/hello-vmlinux.bin"
ROOTFS="$ASSETS/hello-rootfs.ext4"
SSH_KEY="$ASSETS/hello-id_rsa"

if [[ ! -e "$KERNEL" ]]; then
  echo "download kernel…"
  wget -q -O "$KERNEL" \
    https://s3.amazonaws.com/spec.ccfc.min/img/hello/kernel/hello-vmlinux.bin
fi
if [[ ! -e "$ROOTFS" ]]; then
  echo "download rootfs…"
  wget -q -O "$ROOTFS" \
    https://github.com/firecracker-microvm/firecracker-demo/raw/fea3897ccfab0387ce5cd4fa2dd49d869729d612/xenial.rootfs.ext4
fi
if [[ ! -e "$SSH_KEY" ]]; then
  echo "download ssh key…"
  wget -q -O "$SSH_KEY" \
    https://raw.githubusercontent.com/firecracker-microvm/firecracker-demo/ec271b1e5ffc55bd0bf0632d5260e96ed54b5c0c/xenial.rootfs.id_rsa
  chmod 600 "$SSH_KEY"
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

# --- config file (firecracker --no-api) ------------------------------------
# leaner than Julia's 1G/2vcpu — denser agent seats later
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
echo "ssh:   ssh -o StrictHostKeyChecking=false -i $SSH_KEY root@${FC_IP}"
echo "start firecracker (true cold path)…"
echo

# wall time for curiosity — not the official bench yet
START_NS=$(date +%s%N)
exec firecracker --no-api --config-file "$CONFIG"
