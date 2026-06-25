import datetime
from app.services.database import query
import app.services.leads_service as leads_service

async def get_negocios(campaign_id=None, search=None) -> list[dict]:
    """
    Retrieves all leads mapped as deals, with their saved stage and deal values.
    Defaults staging dynamically based on latest call metrics.
    """
    conditions = []
    params = []
    
    if campaign_id is not None and campaign_id != "" and campaign_id != "all":
        conditions.append("(l.campaign_id = ? OR l.campaign_name = ?)")
        params.extend([campaign_id, campaign_id])
        
    if search is not None and search.strip() != "":
        s_term = f"%{search.strip()}%"
        conditions.append("(l.full_name LIKE ? OR l.phone LIKE ? OR l.email LIKE ? OR l.campaign_name LIKE ? OR l.city LIKE ?)")
        params.extend([s_term, s_term, s_term, s_term, s_term])
        
    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)
        
    sql = f"""
    SELECT l.id, l.full_name, l.phone, l.email, l.city, l.campaign_name, l.platform, l.created_time,
           n.etapa, n.valor, n.updated_at,
           c.data_hora as call_date, 
           c.duracao_segundos as call_duration, 
           c.resumo_ligacao as call_summary, 
           c.reuniao_agendada, 
           c.tag as call_tag, 
           c.status_ligacao as call_status_orig,
           c.link_gravacao as call_recording,
           c.telefone_normalizado as call_phone
    FROM leads l
    LEFT JOIN negocios n ON n.lead_id = l.id
    LEFT JOIN (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY telefone_normalizado ORDER BY data_hora DESC) as rn
        FROM chamadas
    ) c ON c.telefone_normalizado = l.phone AND c.rn = 1
    {where_clause}
    ORDER BY l.created_time DESC
    """
    
    rows = await query(sql, tuple(params))
    
    negocios_list = []
    for row in rows:
        item = dict(row)
        
        # Determine status_chamada dynamically
        call_phone = row.get("call_phone")
        if call_phone:
            call_dict = {
                "resumo_ligacao": row.get("call_summary"),
                "tag": row.get("call_tag"),
                "duracao_segundos": row.get("call_duration"),
                "reuniao_agendada": row.get("reuniao_agendada")
            }
            classif, _, _ = leads_service.classify_call_dynamic(call_dict)
            item["status_chamada"] = classif
        else:
            item["status_chamada"] = "Sem Ligação"
            
        # Determine stage (etapa)
        if not item.get("etapa"):
            status_chamada = item["status_chamada"]
            if status_chamada == "Agendou Reunião":
                item["etapa"] = "Reunião Agendada"
            elif status_chamada == "Lead Qualificado":
                item["etapa"] = "Qualificado"
            elif status_chamada in ("Caixa Postal / Não Atendido",):
                item["etapa"] = "Sem Contato"
            elif status_chamada != "Sem Ligação":
                item["etapa"] = "Contatado"
            else:
                item["etapa"] = "Novo"
                
        if item.get("valor") is None:
            item["valor"] = 0.0
            
        negocios_list.append(item)
        
    return negocios_list

async def save_negocio(lead_id: str, etapa: str, valor: float = 0.0, user_email: str = "", user_name: str = "") -> bool:
    """
    Saves or updates a deal's stage and value, and writes a history audit log.
    """
    updated_at = datetime.datetime.now().isoformat()
    # Check if lead exists
    lead_rows = await query("SELECT id, phone FROM leads WHERE id = ?", (lead_id,))
    if not lead_rows:
        return False
    lead = lead_rows[0]
        
    # Check if entry already exists in negocios to get previous stage
    exists = await query("SELECT etapa FROM negocios WHERE lead_id = ?", (lead_id,))
    
    if exists:
        etapa_anterior = exists[0]["etapa"]
        await query(
            "UPDATE negocios SET etapa = ?, valor = ?, updated_at = ?, usuario_email = ?, usuario_nome = ? WHERE lead_id = ?",
            (etapa, valor, updated_at, user_email, user_name, lead_id)
        )
    else:
        # Determine dynamic previous stage for history accuracy
        phone = lead.get("phone")
        etapa_anterior = "Novo"
        if phone:
            call_rows = await query(
                "SELECT * FROM chamadas WHERE telefone_normalizado = ? ORDER BY data_hora DESC LIMIT 1",
                (phone,)
            )
            if call_rows:
                classif, _, _ = leads_service.classify_call_dynamic(dict(call_rows[0]))
                if classif == "Agendou Reunião":
                    etapa_anterior = "Reunião Agendada"
                elif classif == "Lead Qualificado":
                    etapa_anterior = "Qualificado"
                elif classif in ("Caixa Postal / Não Atendido",):
                    etapa_anterior = "Sem Contato"
                elif classif != "Sem Ligação":
                    etapa_anterior = "Contatado"
                    
        await query(
            "INSERT INTO negocios (lead_id, etapa, valor, updated_at, usuario_email, usuario_nome) VALUES (?, ?, ?, ?, ?, ?)",
            (lead_id, etapa, valor, updated_at, user_email, user_name)
        )
        
    # Insert audit entry into history table
    await query(
        "INSERT INTO negocios_historico (lead_id, etapa_anterior, etapa_nova, valor, usuario_email, usuario_nome, data_hora) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (lead_id, etapa_anterior, etapa, valor, user_email, user_name, updated_at)
    )
    return True
