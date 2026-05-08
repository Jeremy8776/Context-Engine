#!/usr/bin/env bash
# backup-daily.sh — Create a Context Engine backup via the API
# Schedule with Windows Task Scheduler or cron equivalent.
# Example (Windows): schtasks /create /sc daily /tn "ContextEngineBackup" /tr "bash \"<path-to-repo>\app\backup-daily.sh\"" /st 02:00
# Example (cron):    0 2 * * * /path/to/repo/app/backup-daily.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CE_PORT="${CE_PORT:-3847}"
CE_URL="http://127.0.0.1:${CE_PORT}"
BACKUP_DIR="${ROOT_DIR}/data/backups"
MAX_BACKUPS=14

# Try API-based backup first (preferred if server is running)
if curl -sf "${CE_URL}/api/health" > /dev/null 2>&1; then
  result=$(curl -sf -X POST "${CE_URL}/api/backups")
  echo "[$(date -Iseconds)] API backup: ${result}"
else
  # Fallback: direct file copy when server is offline
  ts=$(date +%Y-%m-%dT%H-%M-%S)
  dest="${BACKUP_DIR}/${ts}"
  mkdir -p "${dest}"
  for f in memory.json rules.json skill-states.json; do
    src="${ROOT_DIR}/data/${f}"
    [ -f "${src}" ] && cp "${src}" "${dest}/"
  done
  [ -f "${ROOT_DIR}/CONTEXT.md" ] && cp "${ROOT_DIR}/CONTEXT.md" "${dest}/"
  echo "[$(date -Iseconds)] File backup: ${dest}"
fi

# Prune old backups beyond retention limit
cd "${BACKUP_DIR}" 2>/dev/null && ls -d */ 2>/dev/null | sort | head -n -${MAX_BACKUPS} | xargs -r rm -rf
echo "[$(date -Iseconds)] Retained last ${MAX_BACKUPS} backups"
