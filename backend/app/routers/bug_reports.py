from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
from app.routers.auth import get_current_user
from app.models.user import UserResponse
from app.services.log_service import memory_log_handler
import app.services.bug_report_service as bug_service

router = APIRouter(prefix="/bug-reports", tags=["bug-reports"])

class BugReportCreate(BaseModel):
    title: str
    description: str
    include_logs: bool = True

class BugReportResponse(BaseModel):
    id: int
    user_id: int
    username: str
    title: str
    description: str
    logs: str
    status: str
    created_at: str

async def require_master(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    if current_user.role != "master":
        raise HTTPException(
            status_code=403,
            detail="Acesso negado. Apenas usuários com perfil Master possuem essa permissão."
        )
    return current_user

@router.post("/", response_model=BugReportResponse)
async def submit_bug_report(
    data: BugReportCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        logs_text = ""
        if data.include_logs:
            logs_list = memory_log_handler.get_logs()
            logs_text = "\n".join(logs_list)

        report = await bug_service.create_bug_report(
            user_id=current_user.id,
            username=current_user.username,
            title=data.title,
            description=data.description,
            logs=logs_text
        )
        return BugReportResponse(**report)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar reporte de erro: {str(e)}")

@router.get("/", response_model=List[BugReportResponse])
async def list_reports(current_user: UserResponse = Depends(require_master)):
    try:
        reports = await bug_service.list_bug_reports()
        return [BugReportResponse(**r) for r in reports]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao listar reportes: {str(e)}")

@router.put("/{report_id}/resolve")
async def resolve_report(report_id: int, current_user: UserResponse = Depends(require_master)):
    try:
        success = await bug_service.resolve_bug_report(report_id)
        if not success:
            raise HTTPException(status_code=404, detail="Reporte de erro não encontrado")
        return {"success": True, "message": "Reporte de erro marcado como resolvido."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar reporte: {str(e)}")

@router.delete("/{report_id}")
async def delete_report(report_id: int, current_user: UserResponse = Depends(require_master)):
    try:
        success = await bug_service.delete_bug_report(report_id)
        if not success:
            raise HTTPException(status_code=404, detail="Reporte de erro não encontrado")
        return {"success": True, "message": "Reporte de erro deletado com sucesso."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao deletar reporte: {str(e)}")

@router.get("/system-logs")
async def get_system_logs(current_user: UserResponse = Depends(require_master)):
    try:
        logs_list = memory_log_handler.get_logs()
        return {"logs": logs_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao obter logs do sistema: {str(e)}")
