from fastapi import APIRouter, Depends, HTTPException, Query
from app.routers.auth import get_current_user
from app.models.user import UserResponse
import app.services.leads_service as leads_service

router = APIRouter()

@router.get("/kpis")
async def get_kpis(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns general analytical KPIs for leads.
    """
    try:
        return await leads_service.get_kpis()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao obter KPIs: {str(e)}"
        )

@router.get("/")
async def list_leads(
    status: str | None = Query(None),
    campanha_id: str | None = Query(None),
    search: str | None = Query(None),
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
            page=page,
            page_size=page_size
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao listar leads: {str(e)}"
        )

@router.get("/dashboard-data")
async def get_dashboard_data(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns the complete aggregated analytical dashboard data from the database.
    """
    try:
        return await leads_service.get_dashboard_data()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao obter dados do dashboard: {str(e)}"
        )

@router.get("/{phone}")
async def get_lead_by_phone(
    phone: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Retrieves detailed info of a lead and its calls history using phone number.
    """
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
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao obter lead: {str(e)}"
        )


