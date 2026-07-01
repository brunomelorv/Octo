import sqlite3
conn = sqlite3.connect('leads.db')
c = conn.cursor()
c.execute("INSERT INTO leads (id, full_name, phone, created_time) VALUES ('lead_test_1', 'Test Lead', '5511999999999', '2026-07-01T10:00:00')")
c.execute("INSERT INTO leads (id, full_name, phone, created_time) VALUES ('lead_test_2', 'Test Lead 2', '5511999999998', '2026-07-01T10:01:00')")
c.execute("INSERT INTO leads (id, full_name, phone, created_time) VALUES ('lead_test_3', 'Test Lead 3', '5511999999997', '2026-07-01T10:02:00')")
conn.commit()
print("Inserted 3 leads")
conn.close()
