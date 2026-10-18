#!/usr/bin/env bash
# Builds the cloud-init template `createProxmoxCluster` clones (proxmox:templateVmId).
# Run as root on the Proxmox node. Override any default through the environment:
#   VMID=9000 STORAGE=local-lvm BRIDGE=vmbr0 ./create-proxmox-template.sh
set -euo pipefail

VMID="${VMID:-9000}"
NAME="${NAME:-ubuntu-2404-k3s-tpl}"
STORAGE="${STORAGE:-local-lvm}"   # = proxmox:datastoreId
BRIDGE="${BRIDGE:-vmbr0}"         # = proxmox:bridge
IMAGE_URL="${IMAGE_URL:-https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img}"
WORKDIR="${WORKDIR:-/var/lib/vz/template/cloud}"

[ "$(id -u)" -eq 0 ] || { echo "Run as root on the Proxmox node." >&2; exit 1; }
command -v qm >/dev/null || { echo "qm not found: this is not a Proxmox node." >&2; exit 1; }
if qm status "$VMID" >/dev/null 2>&1; then
	echo "VM $VMID already exists: pick another VMID or remove it (qm destroy $VMID)." >&2
	exit 1
fi
command -v virt-customize >/dev/null || { apt-get update && apt-get install -y libguestfs-tools; }

mkdir -p "$WORKDIR"
BASE="$WORKDIR/$(basename "$IMAGE_URL")"
[ -f "$BASE" ] || wget -O "$BASE" "$IMAGE_URL"
IMAGE="$WORKDIR/$NAME.img"
cp "$BASE" "$IMAGE"

# The guest agent is how Proxmox (and the Pulumi provider) learn the VM is up.
# An empty machine-id gives every clone its own identity on first boot.
virt-customize -a "$IMAGE" \
	--install qemu-guest-agent \
	--run-command 'systemctl enable qemu-guest-agent' \
	--truncate /etc/machine-id \
	--run-command 'rm -f /var/lib/dbus/machine-id'

qm create "$VMID" \
	--name "$NAME" \
	--ostype l26 \
	--cores 2 --cpu host --memory 2048 \
	--net0 "virtio,bridge=$BRIDGE" \
	--scsihw virtio-scsi-single \
	--agent enabled=1 \
	--serial0 socket --vga serial0

# Boot disk on scsi0, as the Pulumi module expects; it is grown at clone time.
qm set "$VMID" --scsi0 "$STORAGE:0,import-from=$IMAGE,iothread=1,discard=on"
qm set "$VMID" --ide2 "$STORAGE:cloudinit"
qm set "$VMID" --boot order=scsi0

qm template "$VMID"
rm -f "$IMAGE"
echo "Template $VMID ($NAME) ready on $STORAGE."
