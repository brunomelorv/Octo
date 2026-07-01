import sqlite3
conn = sqlite3.connect('leads.db')
c = conn.cursor()
c.execute("SELECT l.phone, l.full_name, n.etapa FROM leads l LEFT JOIN negocios n ON l.id = n.lead_id WHERE l.full_name LIKE '%Olga%Domingues%'")
print("Lead info:", c.fetchall())

c.execute("SELECT data_hora, resumo_ligacao FROM chamadas WHERE nome_contato LIKE '%Olga%Domingues%' OR telefone_normalizado IN (SELECT phone FROM leads WHERE full_name LIKE '%Olga%Domingues%') ORDER BY data_hora DESC")
print("Chamadas:", c.fetchall())
conn.close()
