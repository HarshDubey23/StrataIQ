#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose exec -T db pg_dump -U strataiq -Fc strataiq > "backups/strataiq-$(date +%F).dump"
find backups -name 'strataiq-*.dump' -mtime +7 -delete
