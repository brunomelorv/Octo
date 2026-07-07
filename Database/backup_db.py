#!/usr/bin/env python3
"""
backup_db.py — SQLite backup script for Lead Analytics CRM.

Usage (manual):
    python backup_db.py

Usage (cron — diário às 02:00):
    0 2 * * * /usr/local/bin/python /app/Database/backup_db.py >> /var/log/backup.log 2>&1

Behavior:
  - Creates a timestamped copy of leads.db in /app/Database/backups/
  - Keeps the last 30 daily backups (older ones are deleted)
  - Uses SQLite Online Backup API for a safe, consistent snapshot
"""

import os
import sys
import sqlite3
import logging
import shutil
from datetime import datetime, timedelta
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [backup] %(levelname)s %(message)s",
)
logger = logging.getLogger("backup_db")

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH = Path(os.getenv("DB_PATH", "/app/Database/leads.db"))
BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "/app/Database/backups"))
KEEP_DAYS = int(os.getenv("BACKUP_KEEP_DAYS", "30"))
# ─────────────────────────────────────────────────────────────────────────────


def run_backup() -> Path:
    """Creates a safe online backup of the SQLite database."""
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Banco de dados não encontrado: {DB_PATH}")

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_path = BACKUP_DIR / f"leads_{timestamp}.db"

    # SQLite Online Backup API — consistent snapshot even while DB is in use
    src = sqlite3.connect(str(DB_PATH))
    dst = sqlite3.connect(str(backup_path))
    try:
        src.backup(dst, pages=100)
        dst.close()
        src.close()
    except Exception:
        dst.close()
        src.close()
        if backup_path.exists():
            backup_path.unlink()
        raise

    size_kb = backup_path.stat().st_size // 1024
    logger.info("Backup criado: %s (%d KB)", backup_path.name, size_kb)
    return backup_path


def prune_old_backups() -> int:
    """Removes backup files older than KEEP_DAYS days. Returns count deleted."""
    if not BACKUP_DIR.exists():
        return 0

    cutoff = datetime.utcnow() - timedelta(days=KEEP_DAYS)
    deleted = 0
    for f in sorted(BACKUP_DIR.glob("leads_*.db")):
        mtime = datetime.utcfromtimestamp(f.stat().st_mtime)
        if mtime < cutoff:
            f.unlink()
            logger.info("Backup antigo removido: %s", f.name)
            deleted += 1
    return deleted


if __name__ == "__main__":
    try:
        backup_path = run_backup()
        pruned = prune_old_backups()
        logger.info("Backup concluído. Arquivos antigos removidos: %d", pruned)
        sys.exit(0)
    except Exception as exc:
        logger.error("Falha no backup: %s", exc)
        sys.exit(1)
