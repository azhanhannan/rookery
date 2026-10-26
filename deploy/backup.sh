#!/usr/bin/env bash
# pg_dump of the Rookery database to backups/, gzipped; keeps 14 days locally.
#   ./backup.sh [label]    cron runs it as `nightly`, deploy.sh as `pre-deploy`.
# Off-site: if restic.env exists (RESTIC_REPOSITORY, RESTIC_PASSWORD, AWS_* for R2/S3), backups/ is
# also pushed with restic. Without it the dumps die with the droplet. See docs/DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")"

label="${1:-manual}"
mkdir -p backups
file="backups/rookery-$(date -u +%Y%m%dT%H%M%SZ)-${label}.sql.gz"

docker compose exec -T db pg_dump -U rookery -d rookery --no-owner --clean --if-exists | gzip > "${file}.part"
mv "${file}.part" "${file}"
echo "backup: ${file} ($(du -h "${file}" | cut -f1))"

find backups -name 'rookery-*.sql.gz' -mtime +14 -delete

if [[ -f restic.env ]]; then
  set -a; source restic.env; set +a
  restic backup --quiet --tag rookery backups/
  restic forget --quiet --tag rookery --keep-daily 14 --keep-weekly 8 --keep-monthly 6 --prune
  echo "backup: pushed off-site with restic"
fi
