import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.routers.auth import get_current_user
from app.models.user import UserResponse
import app.services.negocios_service as negocios_service

logger = logging.getLogger(__name__)

router = APIRouter()

class NegocioUpdate(BaseModel):
    etapa: str
    valor: float = 0.0
    loss_reason: str | None = None
    loss_comment: str | None = None

@router.get("/")
async def list_negocios(
    campaign_id: str | None = Query(None),
    search: str | None = Query(None),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Lists deals (negocios) filtered by campaign or search term.
    """
    try:
        return await negocios_service.get_negocios(campaign_id=campaign_id, search=search, user=current_user.model_dump())
    except Exception as e:
        logger.exception("Erro ao listar negócios")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")

@router.get("/historico")
async def list_negocios_historico(
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Lists audit logs/history of deal stage and value changes.
    """
    try:
        return await negocios_service.get_negocios_historico()
    except Exception as e:
        logger.exception("Erro ao listar histórico de negócios")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")

@router.put("/{lead_id}")
async def update_negocio(
    lead_id: str,
    data: NegocioUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Updates or inserts a deal's stage (etapa) and value (valor) with audit trail.
    """
    try:
        success = await negocios_service.save_negocio(
            lead_id=lead_id,
            etapa=data.etapa,
            valor=data.valor,
            user_email=current_user.email,
            user_name=current_user.name,
            loss_reason=data.loss_reason,
            loss_comment=data.loss_comment
        )
        if not success:
            raise HTTPException(
                status_code=404,
                detail="Lead não encontrado para atualizar negócio."
            )
        return {"status": "ok", "message": "Negócio atualizado com sucesso."}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao atualizar negócio")
        raise HTTPException(status_code=500, detail="Erro interno do servidor")
