import re
from datetime import datetime
from app.services.database import query

async def get_agenda(date_str: str, user: dict = None) -> list[dict]:
    # date_str is expected to be YYYY-MM-DD
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        target_date_formatted = target_date.strftime("%d/%m/%y") # e.g., 30/06/26
    except ValueError:
        return []

    # Query calls that have scheduled events for the target date
    # Looking for 'agendado para: DD/MM/YY' or similar in resumo_ligacao
    # Since sqlite doesn't have regex, we fetch all that have the date string
    conditions = [
        "(c.resumo_ligacao LIKE ? OR c.reuniao_agendada LIKE ? OR c.reuniao_agendada LIKE ?)",
        "(n.etapa != 'Perdido' OR n.etapa IS NULL)",
        "(c.resumo_ligacao NOT LIKE '%{lead desqualificado}%' OR c.resumo_ligacao IS NULL)"
    ]
    params = [f"%{target_date_formatted}%", f"%{date_str}%", f"%{target_date_formatted}%"]

    if user and user.get("role") == "consultor":
        conditions.append("(n.usuario_email = ? OR n.usuario_email IS NULL)")
        params.append(user["email"])

    where_clause = "WHERE " + " AND ".join(conditions)

    sql = f"""
    SELECT 
        c.id as chamada_id,
        c.telefone_normalizado as phone,
        c.resumo_ligacao,
        c.data_hora as call_date,
        c.reuniao_agendada,
        l.full_name as lead_name,
        l.id as lead_id,
        n.etapa as deal_stage,
        CASE WHEN ac.chamada_id IS NOT NULL THEN 1 ELSE 0 END as is_completed
    FROM chamadas c
    LEFT JOIN leads l ON c.telefone_normalizado = l.phone
    LEFT JOIN negocios n ON n.lead_id = l.id
    LEFT JOIN agenda_completions ac ON ac.chamada_id = c.id
    {where_clause}
    ORDER BY c.data_hora DESC
    """
    
    rows = await query(sql, tuple(params))
    
    agenda_items = []
    # Deduplicate by phone
    seen_phones = set()
    
    for row in rows:
        phone = row["phone"]
        if phone in seen_phones:
            continue
            
        resumo = row.get("resumo_ligacao") or ""
        reuniao_field = row.get("reuniao_agendada")
        
        # Extract the exact time and type if available
        # Example: "Retorno agendado para: 30/06/26 03:00 PM"
        time_str = ""
        event_type = "Retorno" # Default
        
        if reuniao_field and str(reuniao_field).lower() != 'none' and str(reuniao_field).strip() != '':
            event_type = "Reunião"
            
        match = re.search(
            rf"(Retorno|Reunião|Tarefa|Chamada)\s+agendad[oa]\s+para:\s+{target_date_formatted}(?:\s+(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?))?",
            resumo,
            re.IGNORECASE
        )
        if match:
            matched_type = match.group(1).strip()
            if matched_type.lower() == "reunião":
                event_type = "Reunião"
            elif matched_type.lower() == "tarefa":
                event_type = "Tarefa"
            elif matched_type.lower() == "chamada":
                event_type = "Chamada"
            else:
                event_type = "Retorno"
                
            if match.group(2):
                raw_time = match.group(2).strip()
                try:
                    if 'AM' in raw_time.upper() or 'PM' in raw_time.upper():
                        dt_time = datetime.strptime(raw_time.upper(), "%I:%M %p")
                    else:
                        dt_time = datetime.strptime(raw_time, "%H:%M")
                    time_str = dt_time.strftime("%H:%M")
                except ValueError:
                    time_str = raw_time
        else:
            # Fallback if no exact regex match, but the query matched
            if "reunião" in resumo.lower() and "retorno" not in resumo.lower():
                event_type = "Reunião"
                
        # Fetch comments for this phone and date
        comments_sql = "SELECT id, comentario, created_at, usuario_email FROM agenda_comments WHERE telefone_normalizado = ? AND data_agendamento = ? ORDER BY created_at DESC"
        comments = await query(comments_sql, (phone, date_str))
        
        agenda_items.append({
            "chamada_id": row["chamada_id"],
            "phone": phone,
            "lead_name": row["lead_name"] or "Lead Desconhecido",
            "lead_id": row["lead_id"],
            "deal_stage": row["deal_stage"],
            "event_type": event_type,
            "time": time_str,
            "resumo": resumo,
            "is_completed": bool(row["is_completed"]),
            "comments": [dict(c) for c in comments]
        })
        seen_phones.add(phone)
        
    agenda_items.sort(key=lambda x: x["time"] or "23:59")
    return agenda_items

async def add_agenda_comment(phone: str, date_str: str, comment: str, user_email: str) -> dict:
    created_at = datetime.now().isoformat()
    await query(
        "INSERT INTO agenda_comments (telefone_normalizado, data_agendamento, comentario, created_at, usuario_email) VALUES (?, ?, ?, ?, ?)",
        (phone, date_str, comment, created_at, user_email)
    )
    
    # Update performance metrics and history by inserting a CRM event into chamadas
    await query(
        "INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, resumo_ligacao, status_ligacao, anotacoes, source_file) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("Lead", phone, created_at, f"Anotação/Tag registrada no CRM por {user_email}", "Anotação CRM", comment, "CRM_MANUAL")
    )
    
    # Parse tag, date and time from comment to create a future schedule event in chamadas
    # Format from frontend: [Tag: TagName - Data: YYYY-MM-DD - Horário: HH:MM] Comment
    tag_name, date_val, time_val = None, None, None
    comment_clean = comment.strip()
    if comment_clean.startswith("[") and "]" in comment_clean:
        header = comment_clean[1:comment_clean.index("]")]
        parts = [p.strip() for p in header.split(" - ")]
        for part in parts:
            if part.lower().startswith("tag:"):
                tag_name = part[4:].strip()
            elif part.lower().startswith("data:"):
                date_val = part[5:].strip()
            elif part.lower().startswith("horário:") or part.lower().startswith("horario:"):
                time_val = part[8:].strip()
                
    if tag_name in ("Tarefa", "Chamada") and date_val:
            # Get lead name
            lead_rows = await query("SELECT full_name FROM leads WHERE phone = ? LIMIT 1", (phone,))
            lead_name = lead_rows[0]["full_name"] if lead_rows else "Lead"
            
            # Format date from YYYY-MM-DD to DD/MM/YY
            try:
                dt = datetime.strptime(date_val, "%Y-%m-%d")
                formatted_date = dt.strftime("%d/%m/%y")
            except Exception:
                formatted_date = date_val
                
            time_str = time_val if time_val else "00:00"
            resumo = f"{tag_name} agendada para: {formatted_date} {time_str}"
            
            # Insert the future schedule record in chamadas
            await query(
                "INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, resumo_ligacao, status_ligacao, anotacoes, source_file) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (lead_name, phone, created_at, resumo, f"{tag_name} Agendada", f"Agendamento automático via tag por {user_email}", "CRM_MANUAL")
            )
            
            # Track this action in negocios_historico too so it shows up in Performance!
            lead_id_rows = await query("SELECT id FROM leads WHERE phone = ? LIMIT 1", (phone,))
            if lead_id_rows:
                lead_id = lead_id_rows[0]["id"]
                negocios_rows = await query("SELECT etapa FROM negocios WHERE lead_id = ? LIMIT 1", (lead_id,))
                current_stage = negocios_rows[0]["etapa"] if negocios_rows else "Sem Contato"
                
                await query(
                    "INSERT INTO negocios_historico (lead_id, etapa_anterior, etapa_nova, valor, usuario_email, usuario_nome, data_hora) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (lead_id, current_stage, f"Tag: {tag_name}", 0.0, user_email, user_email.split('@')[0], created_at)
                )

    # Return the newly created comment
    rows = await query(
        "SELECT id, comentario, created_at, usuario_email FROM agenda_comments WHERE telefone_normalizado = ? AND data_agendamento = ? ORDER BY id DESC LIMIT 1",
        (phone, date_str)
    )
    return dict(rows[0]) if rows else None

async def complete_agenda_item(chamada_id: int, user_email: str, phone: str = None, lead_name: str = None, loss_reason: str = None, loss_comment: str = None, deal_stage: str = None) -> bool:
    created_at = datetime.now().isoformat()
    await query(
        "INSERT OR IGNORE INTO agenda_completions (chamada_id, completed_at, completed_by) VALUES (?, ?, ?)",
        (chamada_id, created_at, user_email)
    )
    
    if deal_stage and phone:
        # Get lead id to sync with Kanban
        lead_rows = await query("SELECT id FROM leads WHERE phone = ? LIMIT 1", (phone,))
        if lead_rows:
            lead_id = lead_rows[0]["id"]
            import app.services.negocios_service as negocios_service
            # Sync the kanban stage just like dragging a card
            await negocios_service.save_negocio(lead_id, deal_stage, 0.0, user_email, user_email.split('@')[0], loss_reason, loss_comment)
            
    return True

async def reschedule_agenda_item(phone: str, lead_name: str, new_date_str: str, new_time_str: str, user_email: str) -> bool:
    try:
        dt = datetime.strptime(new_date_str, "%Y-%m-%d")
        formatted_date = dt.strftime("%d/%m/%y")
    except ValueError:
        return False

    created_at = datetime.now().isoformat()
    
    # Format time string if needed to look like AM/PM or 24h as desired. The regex looks for HH:MM AM/PM or just HH:MM.
    # Let's just store HH:MM
    resumo = f"Agendamento manual pelo consultor. Retorno agendado para: {formatted_date} {new_time_str}"
    
    await query(
        "INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, resumo_ligacao, status_ligacao, anotacoes, source_file) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (lead_name, phone, created_at, resumo, "Reagendamento CRM", user_email, "CRM_MANUAL")
    )
    return True
