import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from pydantic import BaseModel

from app.routers.auth import get_current_user

from app.models.user import UserResponse

import app.services.negocios_service as negocios_service
import app.services.export_service as export_service
from app.services.database import query as db_query
from fastapi.responses import Response
from urllib.parse import quote



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

    consultant: str | None = Query(None),

    current_user: UserResponse = Depends(get_current_user)

):

    """

    Lists deals (negocios) filtered by campaign, search term, or consultant.

    """

    try:

        return await negocios_service.get_negocios(
            campaign_id=campaign_id, 
            search=search, 
            user=current_user.model_dump(),
            consultant=consultant
        )

    except Exception as e:

        logger.exception("Erro ao listar negócios")

        raise HTTPException(status_code=500, detail="Erro interno do servidor")



@router.get("/historico")

async def list_negocios_historico(

    date_start: str | None = None,

    date_end: str | None = None,

    current_user: UserResponse = Depends(get_current_user)

):

    """

    Lists audit logs/history of deal stage and value changes.

    Optional date_start/date_end (YYYY-MM-DD) filter the window in SQL, so a filtered
    period returns every event instead of only the most recent ones.

    """

    try:

        return await negocios_service.get_negocios_historico(
            user=current_user.model_dump(),
            date_start=date_start,
            date_end=date_end,
        )

    except Exception as e:

        logger.exception("Erro ao listar histórico de negócios")

        raise HTTPException(status_code=500, detail="Erro interno do servidor")


@router.get("/export-performance")

async def export_performance(

    date_start: str | None = None,

    date_end: str | None = None,

    consultant_email: str | None = None,

    period_label: str | None = None,

    current_user: UserResponse = Depends(get_current_user)

):

    """

    Builds the Performance page summary as an .xlsx workbook, honouring the date window and
    the operator filter. period_label is the human label shown on the page (e.g. "Este Mês")
    and is written into the Resumo sheet.

    """

    try:

        content, filename = await export_service.build_performance_workbook(
            date_start=date_start,
            date_end=date_end,
            consultant_email=consultant_email,
            period_label=period_label,
            user=current_user.model_dump(),
        )

        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
                # Lets the browser read the header through the CORS layer.
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )

    except ValueError as e:

        raise HTTPException(status_code=400, detail=str(e))

    except Exception as e:

        logger.exception("Erro ao exportar performance para Excel")

        raise HTTPException(status_code=500, detail="Erro ao gerar o arquivo Excel")


@router.get("/kanban-stats")

async def get_kanban_stats(

    date_start: str | None = None,

    date_end: str | None = None,

    consultant_email: str | None = None,

    current_user: UserResponse = Depends(get_current_user)

):

    """

    Returns per-stage aggregates for the kanban columns, plus a pipeline summary.

    """

    try:

        return await negocios_service.get_kanban_stats(
            date_start=date_start,
            date_end=date_end,
            consultant_email=consultant_email,
            user=current_user.model_dump(),
        )

    except Exception as e:

        logger.exception("Erro ao obter estatísticas do kanban")

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

        # IDOR protection: consultors can only update their own or unassigned deals
        if current_user.role == "consultor":
            existing = await db_query(
                "SELECT usuario_email FROM negocios WHERE lead_id = ?", (lead_id,)
            )
            if existing:
                owner = existing[0].get("usuario_email")
                if owner and owner.strip().lower() != current_user.email.strip().lower():
                    raise HTTPException(
                        status_code=403,
                        detail="Você não tem permissão para alterar este negócio."
                    )

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

