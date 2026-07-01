import datetime
from app.services.database import query
import app.services.leads_service as leads_service

async def get_negocios(campaign_id=None, search=None, user=None) -> list[dict]:
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
        
    if user and user.get("role") == "consultor":
        conditions.append("(n.usuario_email = ? OR n.usuario_email IS NULL)")
        params.append(user["email"])
        
    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)
        
    sql = f"""
    SELECT l.id, l.full_name, l.phone, l.email, l.city, l.campaign_name, l.platform, l.created_time,
           n.etapa, n.valor, n.updated_at, n.usuario_email, n.usuario_nome, n.tags,
           c.data_hora as call_date, 
           c.duracao_segundos as call_duration, 
           c.resumo_ligacao as call_summary, 
           c.reuniao_agendada, 
           c.tag as call_tag, 
           c.status_ligacao as call_status_orig,
           c.link_gravacao as call_recording,
           c.telefone_normalizado as call_phone,
           c.anotacoes as call_anotacoes
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
            resumo_lower = (row.get("call_summary") or "").lower()
            reuniao_field = row.get("reuniao_agendada")
            if (reuniao_field and str(reuniao_field).lower() != 'none' and str(reuniao_field).strip() != '') or "reunião agendada" in resumo_lower:
                item["etapa"] = "Reunião Agendada"
            elif "{lead quente}" in resumo_lower or "retorno agendado" in resumo_lower:
                item["etapa"] = "Qualificado"
            elif row.get("call_phone"):
                if "{lead desqualificado}" in resumo_lower:
                    item["etapa"] = "Perdido"
                else:
                    item["etapa"] = "Contatado"
            else:
                item["etapa"] = "Sem Contato"
                
        if item.get("valor") is None:
            item["valor"] = 0.0
            
        negocios_list.append(item)
        
    return negocios_list

async def save_negocio(lead_id: str, etapa: str, valor: float = 0.0, user_email: str = "", user_name: str = "", loss_reason: str = None, loss_comment: str = None, tags: str = None) -> bool:
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
        if tags is not None:
            await query(
                "UPDATE negocios SET etapa = ?, valor = ?, updated_at = ?, usuario_email = ?, usuario_nome = ?, tags = ? WHERE lead_id = ?",
                (etapa, valor, updated_at, user_email, user_name, tags, lead_id)
            )
        else:
            await query(
                "UPDATE negocios SET etapa = ?, valor = ?, updated_at = ?, usuario_email = ?, usuario_nome = ? WHERE lead_id = ?",
                (etapa, valor, updated_at, user_email, user_name, lead_id)
            )
    else:
        # Determine dynamic previous stage for history accuracy
        phone = lead.get("phone")
        etapa_anterior = "Sem Contato"
        if phone:
            call_rows = await query(
                "SELECT * FROM chamadas WHERE telefone_normalizado = ? ORDER BY data_hora DESC LIMIT 1",
                (phone,)
            )
            if call_rows:
                resumo_lower = (call_rows[0].get("resumo_ligacao") or "").lower()
                reuniao_field = call_rows[0].get("reuniao_agendada")
                if (reuniao_field and str(reuniao_field).lower() != 'none' and str(reuniao_field).strip() != '') or "reunião agendada" in resumo_lower:
                    etapa_anterior = "Reunião Agendada"
                elif "{lead quente}" in resumo_lower or "retorno agendado" in resumo_lower:
                    etapa_anterior = "Qualificado"
                elif "{lead desqualificado}" in resumo_lower:
                    etapa_anterior = "Perdido"
                else:
                    etapa_anterior = "Contatado"
                    
        await query(
            "INSERT INTO negocios (lead_id, etapa, valor, updated_at, usuario_email, usuario_nome, tags) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (lead_id, etapa, valor, updated_at, user_email, user_name, tags or "")
        )
        
    # Insert audit entry into history table
    await query(
        "INSERT INTO negocios_historico (lead_id, etapa_anterior, etapa_nova, valor, usuario_email, usuario_nome, data_hora) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (lead_id, etapa_anterior, etapa, valor, user_email, user_name, updated_at)
    )
    
    # Update performance metrics by inserting a CRM resolution event into chamadas
    if etapa in ["Ganho", "Perdido", "KYC/COF/Contrato"] and etapa != etapa_anterior:
        phone = lead.get("phone")
        if phone:
            resumo = ""
            status_ligacao = ""
            if etapa == "Ganho":
                resumo = f"{{lead quente}} Negócio marcado como Ganho no CRM por {user_name}."
                status_ligacao = "Ganho CRM"
            elif etapa == "KYC/COF/Contrato":
                resumo = f"{{lead quente}} Negócio avançou para KYC/COF/Contrato no CRM por {user_name}."
                status_ligacao = "KYC CRM"
            elif etapa == "Perdido":
                r_reason = loss_reason or "Desqualificado no Kanban"
                r_comment = loss_comment or ""
                resumo = f"{{lead desqualificado}} Negócio marcado como Perdido no CRM por {user_name}. Motivo: {r_reason}. Comentário: {r_comment}"
                status_ligacao = "Perdido CRM"
                
            await query(
                "INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, resumo_ligacao, status_ligacao, source_file) VALUES (?, ?, ?, ?, ?, ?)",
                (lead.get("full_name") or "Lead", phone, updated_at, resumo, status_ligacao, "CRM_MANUAL")
            )
            
    return True

async def get_negocios_historico() -> list[dict]:
    """
    Retrieves the complete audit trail from negocios_historico, joined with lead name.
    """
    sql = """
    SELECT h.id, h.lead_id, h.etapa_anterior, h.etapa_nova, h.valor, 
           h.usuario_email, h.usuario_nome, h.data_hora, l.full_name as lead_name
    FROM negocios_historico h
    LEFT JOIN leads l ON l.id = h.lead_id
    ORDER BY h.data_hora DESC
    LIMIT 200
    """
    rows = await query(sql)
    return [dict(row) for row in rows]
