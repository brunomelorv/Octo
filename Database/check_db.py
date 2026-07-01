import sqlite3
import json

db_path = 'leads.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("--- Settings ---")
try:
    cursor.execute("SELECT value FROM settings WHERE key = 'distribuicao'")
    row = cursor.fetchone()
    if row:
        print(json.dumps(json.loads(row[0]), indent=2))
    else:
        print("No distribuicao setting found.")
except Exception as e:
    print(f"Error reading settings: {e}")

print("\n--- Users ---")
try:
    cursor.execute("SELECT id, email, name, active FROM users")
    users = cursor.fetchall()
    for u in users:
        print(u)
except Exception as e:
    print(f"Error reading users: {e}")

print("\n--- Negocios Distribution ---")
try:
    cursor.execute("SELECT usuario_email, count(*) FROM negocios GROUP BY usuario_email")
    counts = cursor.fetchall()
    for c in counts:
        print(c)
except Exception as e:
    print(f"Error reading negocios: {e}")

conn.close()
