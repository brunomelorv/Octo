import datetime
from app.services.database import query
import app.services.leads_service as leads_service

async def get_negocios(campaign_id=None, search=None, user=None, consultant=None) -> list[dict]:
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
        
    if consultant is not None and consultant.strip() != "":
        c_term = consultant.strip()
        conditions.append("(n.usuario_email = ? OR n.usuario_nome = ?)")
        params.extend([c_term, c_term])
    elif user and user.get("role") == "consultor":
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
    
    # Try to resolve a better name from users table if user_name is email prefix or empty
    if user_email and (not user_name or '@' in user_name or user_name == user_email.split('@')[0]):
        user_rows = await query("SELECT name FROM users WHERE email = ? LIMIT 1", (user_email,))
        if user_rows:
            user_name = user_rows[0]["name"]
        elif not user_name:
            user_name = user_email.split('@')[0]
        
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

async def get_negocios_historico(user: dict = None) -> list[dict]:
    """
    Retrieves a unified audit trail including stage transitions, agenda comments/tags,
    agenda completions, and manual reschedules, joined with lead name.
    """
    # 1. Fetch user email-to-name mapping
    users_rows = await query("SELECT email, name FROM users")
    user_names = {row["email"]: row["name"] for row in users_rows}

    # 2. Stage transitions from negocios_historico
    sql_hist = """
    SELECT h.id, h.lead_id, h.etapa_anterior, h.etapa_nova, h.valor, 
           h.usuario_email, h.usuario_nome, h.data_hora, l.full_name as lead_name
    FROM negocios_historico h
    LEFT JOIN leads l ON l.id = h.lead_id
    ORDER BY h.data_hora DESC
    LIMIT 200
    """
    hist_rows = await query(sql_hist)
    
    merged_history = []
    for r in hist_rows:
        merged_history.append({
            "id": r["id"],
            "lead_id": r["lead_id"],
            "etapa_anterior": r["etapa_anterior"] or "Sem Contato",
            "etapa_nova": r["etapa_nova"],
            "valor": r["valor"] or 0.0,
            "usuario_email": r["usuario_email"],
            "usuario_nome": r["usuario_nome"] or user_names.get(r["usuario_email"], r["usuario_email"].split('@')[0]),
            "data_hora": r["data_hora"],
            "lead_name": r["lead_name"] or "Lead Desconhecido"
        })

    # 3. Comment / Tag registrations from agenda_comments
    sql_comments = """
    SELECT ac.id, ac.telefone_normalizado, ac.comentario, ac.created_at, ac.usuario_email,
           l.id as lead_id, l.full_name as lead_name, n.etapa as current_stage
    FROM agenda_comments ac
    LEFT JOIN leads l ON ac.telefone_normalizado = l.phone
    LEFT JOIN negocios n ON n.lead_id = l.id
    ORDER BY ac.created_at DESC
    LIMIT 200
    """
    comments_rows = await query(sql_comments)
    for r in comments_rows:
        comment = r["comentario"] or ""
        etapa_nova = "Anotação"
        if "[Tag: " in comment:
            tag_part = comment.split("]")[0].replace("[Tag:", "").strip()
            etapa_nova = f"Tag: {tag_part}"
        
        email = r["usuario_email"]
        name = user_names.get(email, email.split('@')[0])
        
        merged_history.append({
            "id": 1000000 + r["id"],
            "lead_id": r["lead_id"] or "",
            "etapa_anterior": r["current_stage"] or "Sem Contato",
            "etapa_nova": etapa_nova,
            "valor": 0.0,
            "usuario_email": email,
            "usuario_nome": name,
            "data_hora": r["created_at"],
            "lead_name": r["lead_name"] or f"Lead ({r['telefone_normalizado']})"
        })

    # 4. Agenda Completions from agenda_completions
    sql_completions = """
    SELECT ac.chamada_id, ac.completed_at, ac.completed_by,
           c.resumo_ligacao, l.id as lead_id, l.full_name as lead_name, n.etapa as current_stage
    FROM agenda_completions ac
    JOIN chamadas c ON ac.chamada_id = c.id
    LEFT JOIN leads l ON c.telefone_normalizado = l.phone
    LEFT JOIN negocios n ON n.lead_id = l.id
    ORDER BY ac.completed_at DESC
    LIMIT 200
    """
    completions_rows = await query(sql_completions)
    for r in completions_rows:
        email = r["completed_by"]
        name = user_names.get(email, email.split('@')[0])
        
        resumo = r["resumo_ligacao"] or ""
        etapa_nova = "Agenda Concluída"
        if "Perdido" in resumo:
            etapa_nova = "Agenda Concluída (Perdido)"
        elif "Ganho" in resumo:
            etapa_nova = "Agenda Concluída (Ganho)"
        
        merged_history.append({
            "id": 2000000 + r["chamada_id"],
            "lead_id": r["lead_id"] or "",
            "etapa_anterior": r["current_stage"] or "Sem Contato",
            "etapa_nova": etapa_nova,
            "valor": 0.0,
            "usuario_email": email,
            "usuario_nome": name,
            "data_hora": r["completed_at"],
            "lead_name": r["lead_name"] or "Lead Desconhecido"
        })

    # 5. Reschedules from chamadas
    sql_reschedules = """
    SELECT c.id, c.data_hora, c.anotacoes as usuario_email, c.resumo_ligacao,
           l.id as lead_id, l.full_name as lead_name, n.etapa as current_stage
    FROM chamadas c
    LEFT JOIN leads l ON c.telefone_normalizado = l.phone
    LEFT JOIN negocios n ON n.lead_id = l.id
    WHERE c.status_ligacao = 'Reagendamento CRM'
    ORDER BY c.data_hora DESC
    LIMIT 200
    """
    reschedules_rows = await query(sql_reschedules)
    for r in reschedules_rows:
        email = r["usuario_email"] or "Sistema"
        name = user_names.get(email, email.split('@')[0]) if email != "Sistema" else "Sistema"
        
        merged_history.append({
            "id": 3000000 + r["id"],
            "lead_id": r["lead_id"] or "",
            "etapa_anterior": r["current_stage"] or "Sem Contato",
            "etapa_nova": "Agenda Reagendada",
            "valor": 0.0,
            "usuario_email": email,
            "usuario_nome": name,
            "data_hora": r["data_hora"],
            "lead_name": r["lead_name"] or "Lead Desconhecido"
        })

    # Sort merged history chronologically descending
    merged_history.sort(key=lambda x: x["data_hora"] or "", reverse=True)

    # Role-based filtering: consultors only see their own activity
    if user and user.get("role") == "consultor":
        user_email = user.get("email", "")
        merged_history = [h for h in merged_history if h["usuario_email"] == user_email]

    return merged_history[:200]

