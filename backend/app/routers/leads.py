import re
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from app.routers.auth import get_current_user
from app.models.user import UserResponse
import app.services.leads_service as leads_service

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/kpis")
async def get_kpis(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns general analytical KPIs for leads.
    """
    try:
        return await leads_service.get_kpis(user=current_user.model_dump())
    except Exception as e:
        logger.exception("Erro ao obter KPIs")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")

@router.get("/")
async def list_leads(
    status: str | None = Query(None),
    campanha_id: str | None = Query(None),
    search: str | None = Query(None),
    consultant: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Lists leads with optional pagination, filters, and search query.
    """
    try:
        return await leads_service.get_leads(
            status=status,
            campanha_id=campanha_id,
            search=search,
            consultant=consultant,
            page=page,
            page_size=page_size,
            user=current_user.model_dump()
        )
    except Exception as e:
        logger.exception("Erro ao listar leads")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")

@router.get("/dashboard-data")
async def get_dashboard_data(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns the complete aggregated analytical dashboard data from the database.
    """
    try:
        return await leads_service.get_dashboard_data(user=current_user.model_dump())
    except Exception as e:
        logger.exception("Erro ao obter dados do dashboard")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")


@router.get("/consultants-performance")
async def get_consultants_performance(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns performance metrics per consultant.
    """
    try:
        return await leads_service.get_consultants_performance()
    except Exception as e:
        logger.exception("Erro ao obter performance dos consultores")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")

@router.get("/{phone}")
async def get_lead_by_phone(
    phone: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieves detailed info of a lead and its calls history using phone number.
    """
    if not re.match(r'^\+?\d{8,15}$', phone):
        raise HTTPException(
            status_code=400,
            detail="Formato de telefone inválido"
        )
    try:
        lead = await leads_service.get_lead_by_phone(phone)
        if not lead:
            raise HTTPException(
                status_code=404,
                detail="Lead não encontrado"
            )
        return lead
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao obter lead")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")
