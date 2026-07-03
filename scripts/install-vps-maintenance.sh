#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"
SERVICE_GROUP="${SERVICE_GROUP:-$(id -gn)}"

source "$SCRIPT_DIR/lib/load-env.sh"
load_env_values "$ENV_FILE" APP_URL NEXT_PUBLIC_APP_URL

BASE_URL="${BASE_URL:-${NEXT_PUBLIC_APP_URL:-${APP_URL:-http://127.0.0.1:3000}}}"
NODE_BIN_DIR="${NODE_BIN_DIR:-$HOME/.hermes/node/bin}"
SERVICE_PATH="$NODE_BIN_DIR:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs/maintenance}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5min}"

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required to install systemd units." >&2
  exit 1
fi

sudo tee /etc/systemd/system/nexus-health-check.service >/dev/null <<UNIT
[Unit]
Description=Nexus lightweight health check
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$ROOT_DIR
Environment=PATH=$SERVICE_PATH
Environment=BASE_URL=$BASE_URL
Environment=LOG_DIR=$LOG_DIR
Environment=HEALTH_REQUIRE_OVERALL_HEALTHY=false
ExecStart=/usr/bin/env bash $ROOT_DIR/scripts/maintenance-health-check.sh
UNIT

sudo tee /etc/systemd/system/nexus-health-check.timer >/dev/null <<UNIT
[Unit]
Description=Run Nexus lightweight health check every $HEALTH_INTERVAL

[Timer]
OnBootSec=2min
OnUnitActiveSec=$HEALTH_INTERVAL
AccuracySec=30s
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo tee /etc/systemd/system/nexus-postgres-backup.service >/dev/null <<UNIT
[Unit]
Description=Nexus daily Postgres backup
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$ROOT_DIR
Environment=PATH=$SERVICE_PATH
Environment=ENV_FILE=$ENV_FILE
Environment=BACKUP_DIR=$ROOT_DIR/backups
Environment=BACKUP_RETENTION_DAYS=$BACKUP_RETENTION_DAYS
ExecStart=/usr/bin/env bash $ROOT_DIR/scripts/backup-postgres.sh
UNIT

sudo tee /etc/systemd/system/nexus-postgres-backup.timer >/dev/null <<'UNIT'
[Unit]
Description=Run Nexus daily Postgres backup

[Timer]
OnCalendar=*-*-* 03:10:00
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo tee /etc/systemd/system/nexus-docker-cleanup.service >/dev/null <<UNIT
[Unit]
Description=Nexus safe Docker cleanup
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$ROOT_DIR
Environment=PATH=$SERVICE_PATH
Environment=LOG_DIR=$LOG_DIR
ExecStart=/usr/bin/env bash $ROOT_DIR/scripts/maintenance-docker-cleanup.sh
UNIT

sudo tee /etc/systemd/system/nexus-docker-cleanup.timer >/dev/null <<'UNIT'
[Unit]
Description=Run Nexus safe Docker cleanup weekly

[Timer]
OnCalendar=Sun *-*-* 04:30:00
RandomizedDelaySec=30min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now nexus-health-check.timer nexus-postgres-backup.timer nexus-docker-cleanup.timer
sudo systemctl start nexus-health-check.service

echo "Installed Nexus maintenance timers:"
systemctl list-timers 'nexus-*' --all
