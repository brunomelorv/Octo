import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\backend\app\services\negocios_service.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

old_query = """    SELECT l.id, l.full_name, l.phone, l.email, l.city, l.campaign_name, l.platform, l.created_time,
           n.etapa, n.valor, n.updated_at, n.usuario_email, n.usuario_nome,
           c.data_hora as call_date,"""

new_query = """    SELECT l.id, l.full_name, l.phone, l.email, l.city, l.campaign_name, l.platform, l.created_time,
           n.etapa, n.valor, n.updated_at, n.usuario_email, n.usuario_nome, n.tags,
           c.data_hora as call_date,"""

content = content.replace(old_query, new_query)

old_def = """async def save_negocio(lead_id: str, etapa: str, valor: float = 0.0, user_email: str = "", user_name: str = "", loss_reason: str = None, loss_comment: str = None) -> bool:"""

new_def = """async def save_negocio(lead_id: str, etapa: str, valor: float = 0.0, user_email: str = "", user_name: str = "", loss_reason: str = None, loss_comment: str = None, tags: str = None) -> bool:"""

content = content.replace(old_def, new_def)

old_update = """        await query(
            "UPDATE negocios SET etapa = ?, valor = ?, updated_at = ?, usuario_email = ?, usuario_nome = ? WHERE lead_id = ?",
            (etapa, valor, updated_at, user_email, user_name, lead_id)
        )"""

new_update = """        if tags is not None:
            await query(
                "UPDATE negocios SET etapa = ?, valor = ?, updated_at = ?, usuario_email = ?, usuario_nome = ?, tags = ? WHERE lead_id = ?",
                (etapa, valor, updated_at, user_email, user_name, tags, lead_id)
            )
        else:
            await query(
                "UPDATE negocios SET etapa = ?, valor = ?, updated_at = ?, usuario_email = ?, usuario_nome = ? WHERE lead_id = ?",
                (etapa, valor, updated_at, user_email, user_name, lead_id)
            )"""

content = content.replace(old_update, new_update)

old_insert = """        await query(
            "INSERT INTO negocios (lead_id, etapa, valor, updated_at, usuario_email, usuario_nome) VALUES (?, ?, ?, ?, ?, ?)",
            (lead_id, etapa, valor, updated_at, user_email, user_name)
        )"""

new_insert = """        await query(
            "INSERT INTO negocios (lead_id, etapa, valor, updated_at, usuario_email, usuario_nome, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (lead_id, etapa, valor, updated_at, user_email, user_name, tags or "")
        )"""

content = content.replace(old_insert, new_insert)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Modified services/negocios_service.py")
