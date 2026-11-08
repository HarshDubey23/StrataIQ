#!/usr/bin/env bash
# Prepare and start StrataIQ on a fresh Ubuntu server. Safe to run again: it keeps existing secrets and data.
#   DOMAIN=example.com bash deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi

# Building the frontend needs more memory than a small server has free.
if [ ! -f /swapfile ]; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -f .env ]; then
  : "${DOMAIN:?Run with DOMAIN=your.domain the first time}"
  umask 077
  cat > .env <<EOF
DOMAIN=$DOMAIN
MARKET=US
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
PROXY_SECRET=$(openssl rand -hex 32)
CONTACT_EMAIL=${CONTACT_EMAIL:-}
PAYMENT_URL=${PAYMENT_URL:-}
EOF
fi

mkdir -p backups
sudo docker compose up -d --build
# StrataIQ India keeps its own database on the same server; its API retries until this exists
until sudo docker compose exec -T db pg_isready -U strataiq >/dev/null 2>&1; do sleep 2; done
sudo docker compose exec -T db psql -U strataiq -tc "SELECT 1 FROM pg_database WHERE datname='strataiq_in'" | grep -q 1   || sudo docker compose exec -T db psql -U strataiq -c "CREATE DATABASE strataiq_in"

# Nightly database backup, kept for 7 days.
# shortcut: backups stay on this server, so losing the disk loses them; copy them off-site before holding paying customers' data long term.
CRON="$PWD/backup.sh"
chmod +x "$CRON"
( sudo crontab -l 2>/dev/null | grep -v "$CRON" || true; echo "15 3 * * * $CRON" ) | sudo crontab -

sudo docker compose ps
