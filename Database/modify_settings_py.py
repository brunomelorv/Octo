import os

filepath = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\backend\app\routers\settings.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

new_routes = """
class CustomTagsData(BaseModel):
    tags: List[str] = ["Quente", "Prioridade", "Falta Dinheiro", "Ligar depois"]

@router.get("/custom-tags", response_model=CustomTagsData)
async def fetch_custom_tags():
    data = await get_settings("custom_tags")
    return CustomTagsData(tags=data.get("tags", ["Quente", "Prioridade", "Falta Dinheiro", "Ligar depois"]))

@router.put("/custom-tags", response_model=CustomTagsData)
async def save_custom_tags(data: CustomTagsData, current_user: UserResponse = Depends(require_user_manager)):
    await update_settings("custom_tags", data.model_dump())
    return data
"""

content = content + new_routes

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Modified routers/settings.py")
