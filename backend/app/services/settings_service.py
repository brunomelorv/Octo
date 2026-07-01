import json
from typing import Dict, Any
from app.services.database import get_db

async def init_settings_table():
    db = await get_db()
    try:
        await db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        """)
        # Insert default permissions if not exists
        await db.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('permissions', '{}')"
        )
        await db.commit()

        # Migrate existing permissions to include the new 'campanhas' page
        async with db.execute("SELECT value FROM settings WHERE key = 'permissions'") as cursor:
            row = await cursor.fetchone()
            if row and row["value"]:
                try:
                    perms = json.loads(row["value"])
                    roles = perms.get("roles", {})
                    updated = False
                    for role, role_perms in roles.items():
                        if isinstance(role_perms, list) and "campanhas" not in role_perms:
                            role_perms.append("campanhas")
                            updated = True
                    if updated:
                        await db.execute(
                            "UPDATE settings SET value = ? WHERE key = 'permissions'",
                            (json.dumps(perms),)
                        )
                        await db.commit()
                except Exception as e:
                    print("Error migrating permissions settings:", e)
    finally:
        await db.close()

async def get_settings(key: str) -> Dict[str, Any]:
    db = await get_db()
    try:
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            if row and row["value"]:
                return json.loads(row["value"])
            return {}
    finally:
        await db.close()

async def update_settings(key: str, value: Dict[str, Any]) -> bool:
    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, json.dumps(value))
        )
        await db.commit()
        return True
    finally:
        await db.close()
