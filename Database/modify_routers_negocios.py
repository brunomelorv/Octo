import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\backend\app\routers\negocios.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

old_model = """class NegocioUpdate(BaseModel):
    etapa: str
    valor: float = 0.0
    loss_reason: str | None = None
    loss_comment: str | None = None"""

new_model = """class NegocioUpdate(BaseModel):
    etapa: str
    valor: float = 0.0
    loss_reason: str | None = None
    loss_comment: str | None = None
    tags: str | None = None"""

content = content.replace(old_model, new_model)

old_call = """            etapa=data.etapa,
            valor=data.valor,
            user_email=current_user.email,
            user_name=current_user.name,
            loss_reason=data.loss_reason,
            loss_comment=data.loss_comment"""

new_call = """            etapa=data.etapa,
            valor=data.valor,
            user_email=current_user.email,
            user_name=current_user.name,
            loss_reason=data.loss_reason,
            loss_comment=data.loss_comment,
            tags=data.tags"""

content = content.replace(old_call, new_call)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Modified routers/negocios.py")
