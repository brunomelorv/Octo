import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\backend\app\main.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the create table query
old_create = """
        CREATE TABLE IF NOT EXISTS negocios (
            lead_id TEXT PRIMARY KEY,
            etapa TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            updated_at TEXT,
            usuario_email TEXT,
            usuario_nome TEXT
        );
"""

new_create = """
        CREATE TABLE IF NOT EXISTS negocios (
            lead_id TEXT PRIMARY KEY,
            etapa TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            updated_at TEXT,
            usuario_email TEXT,
            usuario_nome TEXT,
            tags TEXT
        );
"""
content = content.replace(old_create, new_create)

# Replace the migrations block
old_migration = """        try:
            await query("ALTER TABLE negocios ADD COLUMN usuario_nome TEXT;")
        except Exception:
            pass"""

new_migration = """        try:
            await query("ALTER TABLE negocios ADD COLUMN usuario_nome TEXT;")
        except Exception:
            pass
        try:
            await query("ALTER TABLE negocios ADD COLUMN tags TEXT;")
        except Exception:
            pass"""
content = content.replace(old_migration, new_migration)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Modified main.py safely")
