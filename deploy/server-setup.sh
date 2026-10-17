#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 droplet for Rookery. Run as root:
#   scp deploy/server-setup.sh root@<ip>:/root/ && ssh root@<ip> bash /root/server-setup.sh
# Safe to re-run. Creates user `deploy` (same SSH key as root), firewall, swap, Docker, nightly backup cron.
set -euo pipefail

DEPLOY_USER=deploy
APP_DIR=/opt/rookery

[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
[[ -s /root/.ssh/authorized_keys ]] || { echo "no SSH key in /root/.ssh/authorized_keys: add one before locking passwords out" >&2; exit 1; }

echo "== packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades restic
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== user ${DEPLOY_USER}"
if ! id "${DEPLOY_USER}" &>/dev/null; then
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
install -d -m 700 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "/home/${DEPLOY_USER}/.ssh"
install -m 600 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"

echo "== ssh: keys only"
cat > /etc/ssh/sshd_config.d/99-rookery.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl reload ssh

echo "== firewall"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== swap (2 GB)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "== docker"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
# Rotate container logs, or they grow until the disk is full.
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
EOF
systemctl restart docker
usermod -aG docker "${DEPLOY_USER}"

echo "== ${APP_DIR}"
install -d -m 750 -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" "${APP_DIR}" "${APP_DIR}/certs" "${APP_DIR}/backups"

echo "== nightly backup (19:30 UTC = 03:30 MYT)"
cat > /etc/cron.d/rookery-backup <<EOF
30 19 * * * ${DEPLOY_USER} ${APP_DIR}/backup.sh nightly >> ${APP_DIR}/backups/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/rookery-backup

echo
echo "Done. Next (docs/DEPLOY.md step 4): log in as ${DEPLOY_USER}, put .env and certs/ in ${APP_DIR}."
echo "Docker's published ports (80/443) bypass ufw; nothing else is published, Postgres stays internal."
