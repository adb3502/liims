#!/usr/bin/env bash
# =============================================================================
# LIIMS Database Backup Script
# Usage: ./scripts/backup.sh [--retain-days 30]
#
# Creates a timestamped pg_dump of the liims database.
# Automatically prunes backups older than --retain-days (default: 30).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

RETAIN_DAYS=30
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"

# Parse flags
while [[ $# -gt 0 ]]; do
    case $1 in
        --retain-days)
            RETAIN_DAYS="$2"
            shift 2
            ;;
        *)
            echo "Unknown flag: $1"; exit 1
            ;;
    esac
done

# Create backup directory
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/liims_${TIMESTAMP}.sql.gz"

echo "==> LIIMS Database Backup"
echo "    Timestamp:    $TIMESTAMP"
echo "    Backup dir:   $BACKUP_DIR"
echo "    Retain days:  $RETAIN_DAYS"
echo ""

# Verify postgres container is running
if ! docker compose ps postgres --status running -q 2>/dev/null | grep -q .; then
    echo "ERROR: PostgreSQL container is not running."
    echo "       Start it with: docker compose up -d postgres"
    exit 1
fi

# Run pg_dump inside the postgres container, pipe through gzip
echo "==> Creating backup..."
docker compose exec -T postgres \
    pg_dump -U liims -d liims --no-owner --no-privileges --format=plain \
    | gzip > "$BACKUP_FILE"

FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "    Created: $BACKUP_FILE ($FILESIZE)"

# Prune old backups
echo ""
echo "==> Pruning backups older than $RETAIN_DAYS days..."
PRUNED=$(find "$BACKUP_DIR" -name "liims_*.sql.gz" -type f -mtime +$RETAIN_DAYS -print -delete | wc -l)
echo "    Pruned $PRUNED old backup(s)."

# List remaining backups
echo ""
echo "==> Current backups:"
ls -lh "$BACKUP_DIR"/liims_*.sql.gz 2>/dev/null || echo "    (none)"

echo ""
echo "==> Backup complete."
