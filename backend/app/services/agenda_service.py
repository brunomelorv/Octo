import re
from datetime import datetime
from app.services.database import query

async def get_agenda(date_str: str) -> list[dict]:
    # date_str is expected to be YYYY-MM-DD
    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d")
        target_date_formatted = target_date.strftime("%d/%m/%y") # e.g., 30/06/26
    except ValueError:
        return []

    # Query calls that have scheduled events for the target date
    # Looking for 'agendado para: DD/MM/YY' or similar in resumo_ligacao
    # Since sqlite doesn't have regex, we fetch all that have the date string
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
    WHERE c.resumo_ligacao LIKE '%{target_date_formatted}%'
       OR c.reuniao_agendada LIKE '%{date_str}%'
       OR c.reuniao_agendada LIKE '%{target_date_formatted}%'
    ORDER BY c.data_hora DESC
    """
    
    rows = await query(sql)
    
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
            rf"(Retorno|Reunião)\s+agendad[oa]\s+para:\s+{target_date_formatted}(?:\s+(\d{{1,2}}:\d{{2}}\s*(?:AM|PM|am|pm)?))?",
            resumo,
            re.IGNORECASE
        )
        if match:
            matched_type = match.group(1).strip()
            if matched_type.lower() == "reunião":
                event_type = "Reunião"
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
    
    # Return the newly created comment
    rows = await query(
        "SELECT id, comentario, created_at, usuario_email FROM agenda_comments WHERE telefone_normalizado = ? AND data_agendamento = ? ORDER BY id DESC LIMIT 1",
        (phone, date_str)
    )
    return dict(rows[0]) if rows else None

async def complete_agenda_item(chamada_id: int, user_email: str, phone: str = None, lead_name: str = None, loss_reason: str = None, loss_comment: str = None) -> bool:
    created_at = datetime.now().isoformat()
    await query(
        "INSERT OR IGNORE INTO agenda_completions (chamada_id, completed_at, completed_by) VALUES (?, ?, ?)",
        (chamada_id, created_at, user_email)
    )
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
        "INSERT INTO chamadas (nome_contato, telefone_normalizado, data_hora, resumo_ligacao, status_ligacao, source_file) VALUES (?, ?, ?, ?, ?, ?)",
        (lead_name, phone, created_at, resumo, "Reagendamento CRM", "CRM_MANUAL")
    )
    return True
