import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\Database\build_database.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

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

if old_create in content:
    content = content.replace(old_create, new_create)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("Modified build_database.py safely")
else:
    print("Could not find block in build_database.py")
