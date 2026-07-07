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

@router.get("/")
async def read_agenda(date: str, current_user: UserResponse = Depends(get_current_user)):
    return await get_agenda(date)

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
    success = await reschedule_agenda_item(req.phone, req.lead_name, req.new_date_str, req.new_time_str, current_user.email)
    return {"success": success}
