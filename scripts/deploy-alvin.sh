#!/usr/bin/env bash
# Deploy landa-api onto alvin member VM (KVM host for seats).
# Run FROM edge (or any host that can bastion-hop):
#   ./scripts/deploy-alvin.sh
#
# Path: edge → bastion key → mothership WG → alvin@alvin
set -euo pipefail

EDGE="${EDGE_HOST:-root@178.105.120.5}"
REPO="${DEPLOY_REPO:-https://github.com/alvinliju/landa.git}"
BRANCH="${DEPLOY_BRANCH:-main}"
REMOTE_DIR="${DEPLOY_DIR:-/home/alvin/src/landa}"
PORT="${LANDA_API_PORT:-8787}"

echo "deploy landa-api → alvin via $EDGE ($REPO @$BRANCH → $REMOTE_DIR)"

ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$EDGE" \
  "REPO=$REPO BRANCH=$BRANCH REMOTE_DIR=$REMOTE_DIR PORT=$PORT bash -s" <<'EDGE'
set -euo pipefail
export PATH="/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin:$PATH"
cp -f /var/lib/mothership/bastion/id_ed25519 /tmp/bk
chmod 600 /tmp/bk

ssh -o BatchMode=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  -o IdentitiesOnly=yes -i /tmp/bk \
  -o ProxyCommand="ssh -i /tmp/bk -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -W %h:%p root@10.99.0.2" \
  alvin@alvin "export PATH=/run/current-system/sw/bin:\$PATH
set -euo pipefail
REPO='$REPO'
BRANCH='$BRANCH'
REMOTE_DIR='$REMOTE_DIR'
PORT='$PORT'

mkdir -p \"\$(dirname \"\$REMOTE_DIR\")\"
if [[ -d \"\$REMOTE_DIR/.git\" ]]; then
  cd \"\$REMOTE_DIR\"
  git fetch origin
  git checkout \"\$BRANCH\"
  git reset --hard \"origin/\$BRANCH\"
else
  git clone --branch \"\$BRANCH\" \"\$REPO\" \"\$REMOTE_DIR\"
  cd \"\$REMOTE_DIR\"
fi
echo \"HEAD \$(git rev-parse --short HEAD) on \$(hostname)\"
df -h / | tail -1
free -h | head -2

nix --extra-experimental-features 'nix-command flakes' develop -c bash -c '
  set -euo pipefail
  export LANDA_ROOT=\"\$PWD\"
  export LANDA_DATA=\"\$PWD/.data\"
  export PGDATA=\"\$LANDA_DATA/pg\"
  export PGHOST=127.0.0.1
  export PGPORT=5433
  export PGUSER=landa
  export PGPASSWORD=landa
  export PGDATABASE=landa
  export DATABASE_URL=postgres://landa:landa@127.0.0.1:5433/landa
  chmod +x scripts/* || true
  landa-pg start
  if [[ ! -d node_modules ]]; then npm install; else npm install --prefer-offline; fi
  landa-migrate
  landa-migrate seed || true
'

# user systemd unit (no root needed)
mkdir -p \"\$HOME/.config/systemd/user\"
cat > \"\$HOME/.config/systemd/user/landa-api.service\" <<UNIT
[Unit]
Description=landa control plane API (alvin)
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$REMOTE_DIR
Environment=NODE_ENV=production
Environment=LANDA_ROOT=$REMOTE_DIR
Environment=LANDA_DATA=$REMOTE_DIR/.data
Environment=PGDATA=$REMOTE_DIR/.data/pg
Environment=PGHOST=127.0.0.1
Environment=PGPORT=5433
Environment=PGUSER=landa
Environment=PGPASSWORD=landa
Environment=PGDATABASE=landa
Environment=DATABASE_URL=postgres://landa:landa@127.0.0.1:5433/landa
Environment=LANDA_API_HOST=0.0.0.0
Environment=LANDA_API_PORT=$PORT
Environment=LANDA_CORS_ORIGIN=*
Environment=PATH=/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin
ExecStartPre=/run/current-system/sw/bin/nix --extra-experimental-features nix-command flakes develop -c landa-pg start
ExecStart=/run/current-system/sw/bin/nix --extra-experimental-features nix-command flakes develop -c npm run api
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
UNIT

# enable lingering so user services survive logout
loginctl enable-linger alvin 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable --now landa-api.service
sleep 5
systemctl --user --no-pager status landa-api.service || true
curl -sS -m 5 http://127.0.0.1:\$PORT/health || true
echo
"
EDGE

echo "done — check http://landa-back.tharavad.xyz/health after publish path is live"
