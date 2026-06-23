from fastapi import APIRouter, Depends, HTTPException
from app.routers.auth import get_current_user
from app.models.user import UserResponse
import app.services.campanhas_service as campanhas_service

router = APIRouter()

@router.get("/")
async def list_campanhas(current_user: UserResponse = Depends(get_current_user)):
    """
    Returns the list of campaigns with summary metrics.
    """
    try:
        return await campanhas_service.get_campanhas()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao obter campanhas: {str(e)}"
        )
