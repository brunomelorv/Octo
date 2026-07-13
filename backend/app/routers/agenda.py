from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.agenda_service import get_agenda, add_agenda_comment, complete_agenda_item, reschedule_agenda_item
from app.routers.auth import get_current_user
from app.models.user import UserResponse

router = APIRouter()

class CommentRequest(BaseModel):
    phone: str
    date_str: str
    comment: str
    user_email: str = ""  # Kept for backward compat; ignored in favor of JWT

class CompleteRequest(BaseModel):
    chamada_id: int
    user_email: str = ""  # Kept for backward compat; ignored in favor of JWT
    phone: Optional[str] = None
    lead_name: Optional[str] = None
    loss_reason: Optional[str] = None
    loss_comment: Optional[str] = None
    deal_stage: Optional[str] = None

class RescheduleRequest(BaseModel):
    phone: str
    lead_name: str
    new_date_str: str
    new_time_str: str
    user_email: str = ""  # Kept for backward compat; ignored in favor of JWT
    comment: Optional[str] = None

@router.get("/")
async def read_agenda(date: str, current_user: UserResponse = Depends(get_current_user)):
    return await get_agenda(date, current_user.model_dump())

@router.post("/comments")
async def create_agenda_comment(req: CommentRequest, current_user: UserResponse = Depends(get_current_user)):
    # Use authenticated user's email, not the client-supplied value
    comment = await add_agenda_comment(req.phone, req.date_str, req.comment, current_user.email)
    return comment

@router.post("/complete")
async def complete_agenda(req: CompleteRequest, current_user: UserResponse = Depends(get_current_user)):
    # Use authenticated user's email, not the client-supplied value
    success = await complete_agenda_item(
        req.chamada_id, current_user.email, req.phone, req.lead_name, 
        req.loss_reason, req.loss_comment, req.deal_stage
    )
    return {"success": success}

@router.post("/reschedule")
async def reschedule_agenda(req: RescheduleRequest, current_user: UserResponse = Depends(get_current_user)):
    # Use authenticated user's email, not the client-supplied value
    success = await reschedule_agenda_item(req.phone, req.lead_name, req.new_date_str, req.new_time_str, current_user.email, req.comment)
    return {"success": success}

@router.get("/performance")
async def agenda_performance(
    date_start: str, 
    date_end: str, 
    usuario_nome: Optional[str] = None, 
    current_user: UserResponse = Depends(get_current_user)
):
    """Returns agenda performance stats for a date range."""
    from app.services.database import query
    from datetime import datetime, timedelta
    
    # Parse dates
    try:
        start = datetime.strptime(date_start, "%Y-%m-%d")
        end = datetime.strptime(date_end, "%Y-%m-%d")
    except ValueError:
        return {"error": "Invalid date format"}
    
    extra_cond = ""
    extra_params = []
    if usuario_nome and usuario_nome != "all":
        extra_cond = " AND n.usuario_nome = ?"
        extra_params = [usuario_nome]
        
    results = []
    current = start
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        date_formatted = current.strftime("%d/%m/%y")
        
        # Count total agenda items for this date
        total_sql = f"""
        SELECT COUNT(DISTINCT c.telefone_normalizado) as total
        FROM chamadas c
        LEFT JOIN negocios n ON n.lead_id = (SELECT id FROM leads WHERE phone = c.telefone_normalizado LIMIT 1)
        WHERE (c.data_retorno_agendado = ? OR (c.data_retorno_agendado IS NULL AND (c.resumo_ligacao LIKE ? OR c.reuniao_agendada LIKE ? OR c.reuniao_agendada LIKE ?)))
        AND (n.etapa != 'Perdido' OR n.etapa IS NULL)
        {extra_cond}
        """
        total_rows = await query(total_sql, (date_str, f"%{date_formatted}%", f"%{date_str}%", f"%{date_formatted}%", *extra_params))
        total = total_rows[0]["total"] if total_rows else 0
        
        # Count completed items for this date
        completed_sql = f"""
        SELECT COUNT(DISTINCT c.telefone_normalizado) as completed
        FROM chamadas c
        INNER JOIN agenda_completions ac ON ac.chamada_id = c.id
        LEFT JOIN negocios n ON n.lead_id = (SELECT id FROM leads WHERE phone = c.telefone_normalizado LIMIT 1)
        WHERE (c.data_retorno_agendado = ? OR (c.data_retorno_agendado IS NULL AND (c.resumo_ligacao LIKE ? OR c.reuniao_agendada LIKE ? OR c.reuniao_agendada LIKE ?)))
        AND (n.etapa != 'Perdido' OR n.etapa IS NULL)
        {extra_cond}
        """
        completed_rows = await query(completed_sql, (date_str, f"%{date_formatted}%", f"%{date_str}%", f"%{date_formatted}%", *extra_params))
        completed = completed_rows[0]["completed"] if completed_rows else 0
        
        results.append({
            "date": date_str,
            "total": total,
            "completed": completed,
            "pending": total - completed
        })
        
        current += timedelta(days=1)
    
    # Summary totals
    total_all = sum(r["total"] for r in results)
    completed_all = sum(r["completed"] for r in results)
    
    return {
        "daily": results,
        "summary": {
            "total": total_all,
            "completed": completed_all,
            "pending": total_all - completed_all,
            "completion_rate": round((completed_all / total_all * 100), 1) if total_all > 0 else 0
        }
    }

@router.get("/performance-leads")
async def get_performance_leads(
    date_start: str, 
    date_end: str, 
    usuario_nome: Optional[str] = None,
    status: Optional[str] = None, # 'completed', 'pending', 'all'
    current_user: UserResponse = Depends(get_current_user)
):
    """Returns the list of leads/appointments for a performance card in a date range."""
    from app.services.database import query
    from datetime import datetime, timedelta
    
    # Parse dates
    try:
        start = datetime.strptime(date_start, "%Y-%m-%d")
        end = datetime.strptime(date_end, "%Y-%m-%d")
    except ValueError:
        return {"error": "Invalid date format"}
        
    # Generate conditions for dates
    date_conditions = []
    date_params = []
    current = start
    while current <= end:
        date_str = current.strftime("%Y-%m-%d")
        date_formatted = current.strftime("%d/%m/%y")
        date_conditions.append(
            "(c.data_retorno_agendado = ? OR (c.data_retorno_agendado IS NULL AND (c.resumo_ligacao LIKE ? OR c.reuniao_agendada LIKE ? OR c.reuniao_agendada LIKE ?)))"
        )
        date_params.extend([date_str, f"%{date_formatted}%", f"%{date_str}%", f"%{date_formatted}%"])
        current += timedelta(days=1)
        
    if not date_conditions:
        return []
        
    where_dates = " OR ".join(date_conditions)
    
    conditions = [
        f"({where_dates})",
        "(n.etapa != 'Perdido' OR n.etapa IS NULL)",
        "(c.resumo_ligacao NOT LIKE '%{lead desqualificado}%' OR c.resumo_ligacao IS NULL)"
    ]
    params = date_params
    
    if usuario_nome and usuario_nome != "all":
        conditions.append("n.usuario_nome = ?")
        params.append(usuario_nome)
        
    if status == "completed":
        conditions.append("ac.chamada_id IS NOT NULL")
    elif status == "pending":
        conditions.append("ac.chamada_id IS NULL")
        
    where_clause = "WHERE " + " AND ".join(conditions)
    
    sql = f"""
    SELECT DISTINCT
        c.telefone_normalizado as phone,
        c.id as chamada_id,
        c.resumo_ligacao,
        c.data_hora as call_date,
        c.reuniao_agendada,
        c.data_retorno_agendado,
        c.horario_retorno_agendado,
        c.tipo_retorno,
        l.full_name as lead_name,
        l.id as lead_id,
        l.email,
        l.city,
        l.campaign_name,
        n.etapa as deal_stage,
        n.usuario_nome,
        n.valor,
        CASE WHEN ac.chamada_id IS NOT NULL THEN 1 ELSE 0 END as is_completed
    FROM chamadas c
    LEFT JOIN leads l ON c.telefone_normalizado = l.phone
    LEFT JOIN negocios n ON n.lead_id = l.id
    LEFT JOIN agenda_completions ac ON ac.chamada_id = c.id
    {where_clause}
    ORDER BY c.data_hora DESC
    """
    
    rows = await query(sql, tuple(params))
    
    # Deduplicate by phone
    seen_phones = set()
    results = []
    for row in rows:
        phone = row["phone"]
        if phone in seen_phones:
            continue
        results.append({
            "id": row["lead_id"],
            "chamada_id": row["chamada_id"],
            "phone": phone,
            "full_name": row["lead_name"] or "Lead Desconhecido",
            "email": row["email"] or "",
            "city": row["city"] or "",
            "campaign_name": row["campaign_name"] or "",
            "etapa": row["deal_stage"] or "Sem Contato",
            "event_type": row["tipo_retorno"] or "Retorno",
            "time": row["horario_retorno_agendado"] or "",
            "resumo": row["resumo_ligacao"] or "",
            "is_completed": bool(row["is_completed"]),
            "usuario_nome": row["usuario_nome"] or "",
            "valor": row["valor"] or 0.0
        })
        seen_phones.add(phone)
        
    return results
