from datetime import datetime
from typing import List, Dict, Any
from app.services.database import get_db, query

async def init_bug_reports_table():
    db = await get_db()
    try:
        await db.execute("""
        CREATE TABLE IF NOT EXISTS bug_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT,
            title TEXT,
            description TEXT,
            logs TEXT,
            status TEXT DEFAULT 'pending',
            created_at TEXT
        );
        """)
        await db.commit()
    finally:
        await db.close()

async def create_bug_report(user_id: int, username: str, title: str, description: str, logs: str) -> Dict[str, Any]:
    db = await get_db()
    created_at = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    try:
        cursor = await db.execute(
            """
            INSERT INTO bug_reports (user_id, username, title, description, logs, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, username, title, description, logs, created_at)
        )
        report_id = cursor.lastrowid
        await db.commit()
        return {
            "id": report_id,
            "user_id": user_id,
            "username": username,
            "title": title,
            "description": description,
            "logs": logs,
            "status": "pending",
            "created_at": created_at
        }
    finally:
        await db.close()

async def list_bug_reports() -> List[Dict[str, Any]]:
    return await query("SELECT * FROM bug_reports ORDER BY id DESC")

async def resolve_bug_report(report_id: int) -> bool:
    db = await get_db()
    try:
        await db.execute("UPDATE bug_reports SET status = 'resolved' WHERE id = ?", (report_id,))
        await db.commit()
        return True
    finally:
        await db.close()

async def delete_bug_report(report_id: int) -> bool:
    db = await get_db()
    try:
        await db.execute("DELETE FROM bug_reports WHERE id = ?", (report_id,))
        await db.commit()
        return True
    finally:
        await db.close()
