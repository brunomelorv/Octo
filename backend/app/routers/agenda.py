from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.agenda_service import get_agenda, add_agenda_comment, complete_agenda_item, reschedule_agenda_item

router = APIRouter()

class CommentRequest(BaseModel):
    phone: str
    date_str: str
    comment: str
    user_email: str

class CompleteRequest(BaseModel):
    chamada_id: int
    user_email: str
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
    user_email: str

@router.get("/")
async def read_agenda(date: str):
    return await get_agenda(date)

@router.post("/comments")
async def create_agenda_comment(req: CommentRequest):
    comment = await add_agenda_comment(req.phone, req.date_str, req.comment, req.user_email)
    return comment
@router.post("/complete")
async def complete_agenda(req: CompleteRequest):
    success = await complete_agenda_item(
        req.chamada_id, req.user_email, req.phone, req.lead_name, 
        req.loss_reason, req.loss_comment, req.deal_stage
    )
    return {"success": success}

@router.post("/reschedule")
async def reschedule_agenda(req: RescheduleRequest):
    success = await reschedule_agenda_item(req.phone, req.lead_name, req.new_date_str, req.new_time_str, req.user_email)
    return {"success": success}
