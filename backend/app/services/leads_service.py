from app.services.database import query

async def get_leads(status=None, campanha_id=None, page=1, page_size=50) -> dict:
    """
    Selects leads from the leads table with optional filters on lead_status and campaign_id.
    Returns a paginated dictionary structure.
    """
    conditions = []
    params = []
    
    if status is not None:
        conditions.append("lead_status = ?")
        params.append(status)
        
    if campanha_id is not None:
        conditions.append("campaign_id = ?")
        params.append(campanha_id)
        
    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)
        
    # Count total items matching criteria
    count_sql = f"SELECT COUNT(*) as total FROM leads {where_clause}"
    count_res = await query(count_sql, tuple(params))
    total = count_res[0]["total"] if count_res else 0
    
    # Pagination math
    pages = (total + page_size - 1) // page_size if total > 0 else 0
    
    # Items query
    items_sql = f"SELECT * FROM leads {where_clause} ORDER BY created_time DESC LIMIT ? OFFSET ?"
    items_params = list(params)
    items_params.extend([page_size, (page - 1) * page_size])
    items = await query(items_sql, tuple(items_params))
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": pages
    }

async def get_lead_by_phone(phone: str) -> dict | None:
    """
    Retrieves a single lead and all associated calls by phone.
    Joins leads and chamadas tables.
    """
    # Fetch lead
    lead_rows = await query("SELECT * FROM leads WHERE phone = ? LIMIT 1", (phone,))
    if not lead_rows:
        return None
    lead = lead_rows[0]
    
    # Fetch associated calls
    calls = await query(
        "SELECT * FROM chamadas WHERE telefone_normalizado = ? ORDER BY data_hora DESC",
        (phone,)
    )
    
    lead_dict = dict(lead)
    lead_dict["chamadas"] = [dict(call) for call in calls]
    return lead_dict

async def get_kpis() -> dict:
    """
    Calculates KPI metrics directly on SQLite.
    Returns total_leads, total_com_chamada, total_agendados, contact rate,
    and conversion rate without contact.
    """
    # total_leads
    res_total = await query("SELECT COUNT(*) as total FROM leads")
    total_leads = res_total[0]["total"] if res_total else 0
    
    # total_com_chamada
    res_chamada = await query(
        "SELECT COUNT(*) as total FROM leads "
        "WHERE phone IN (SELECT DISTINCT telefone_normalizado FROM chamadas)"
    )
    total_com_chamada = res_chamada[0]["total"] if res_chamada else 0
    
    # total_agendados (reuniao_agendada IS NOT NULL and not empty string)
    res_agendados = await query(
        "SELECT COUNT(*) as total FROM leads "
        "WHERE phone IN (SELECT DISTINCT telefone_normalizado FROM chamadas WHERE reuniao_agendada IS NOT NULL AND reuniao_agendada != '')"
    )
    total_agendados = res_agendados[0]["total"] if res_agendados else 0
    
    # taxa_contato (%)
    taxa_contato = (total_com_chamada / total_leads * 100.0) if total_leads > 0 else 0.0
    
    # conv_sem_contato (%)
    # percentage of leads without calls that scheduled a meeting.
    # since meetings only exist within calls in the schema, this is 0.0.
    conv_sem_contato = 0.0
    
    return {
        "total_leads": total_leads,
        "total_com_chamada": total_com_chamada,
        "total_agendados": total_agendados,
        "taxa_contato": round(taxa_contato, 2),
        "conv_sem_contato": round(conv_sem_contato, 2)
    }
