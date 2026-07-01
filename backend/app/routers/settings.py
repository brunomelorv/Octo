from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Dict, Any, List

from app.routers.auth import require_user_manager, get_current_user
from app.services.settings_service import get_settings, update_settings
from app.models.user import UserResponse

router = APIRouter()

class PermissionsData(BaseModel):
    roles: Dict[str, List[str]] = {}
    users: Dict[str, List[str]] = {}

DEFAULT_ROLE_PERMISSIONS = {
    "master": ["dashboard", "leads", "negocios", "performance", "usuarios", "importar_leads", "configuracoes", "personalizacao", "distribuicao_leads", "agenda", "campanhas"],
    "head": ["dashboard", "leads", "negocios", "performance", "usuarios", "importar_leads", "configuracoes", "personalizacao", "distribuicao_leads", "agenda", "campanhas"],
    "administrativo": ["dashboard", "leads", "negocios", "usuarios", "importar_leads", "configuracoes", "personalizacao", "distribuicao_leads", "agenda", "campanhas"],
    "consultor": ["dashboard", "leads", "negocios", "performance", "agenda", "campanhas"],
}

@router.get("/permissions", response_model=PermissionsData)
async def fetch_permissions(current_user: UserResponse = Depends(require_user_manager)):
    data = await get_settings("permissions")
    roles = data.get("roles", {})
    
    # Merge saved roles with defaults for missing roles
    merged_roles = {**DEFAULT_ROLE_PERMISSIONS}
    for role, perms in roles.items():
        if isinstance(perms, list):  # If explicitly saved as list (even empty), keep it.
            merged_roles[role] = perms
            
    return PermissionsData(
        roles=merged_roles,
        users=data.get("users", {})
    )

@router.put("/permissions", response_model=PermissionsData)
async def save_permissions(data: PermissionsData, current_user: UserResponse = Depends(require_user_manager)):
    await update_settings("permissions", data.model_dump())
    return data

@router.get("/my-permissions", response_model=List[str])
async def fetch_my_permissions(current_user: UserResponse = Depends(get_current_user)):
    data = await get_settings("permissions")
    users_perms = data.get("users", {})
    roles_perms = data.get("roles", {})
    
    # User-specific permissions override role permissions
    if str(current_user.id) in users_perms:
        return users_perms[str(current_user.id)]
    
    # Role-specific permissions
    if current_user.role in roles_perms and isinstance(roles_perms[current_user.role], list):
        return roles_perms[current_user.role]
        
    # Default to role specific fallback
    return DEFAULT_ROLE_PERMISSIONS.get(current_user.role, [])

class PersonalizacaoData(BaseModel):
    system_name: str = "Portal do Frank"
    logo_base64: str = ""
    favicon_base64: str = ""
    primary_color: str = ""

@router.get("/personalizacao", response_model=PersonalizacaoData)
async def fetch_personalizacao():
    # Publicly accessible so it can be shown on login page
    data = await get_settings("personalizacao")
    return PersonalizacaoData(
        system_name=data.get("system_name", "Portal do Frank"),
        logo_base64=data.get("logo_base64", ""),
        favicon_base64=data.get("favicon_base64", ""),
        primary_color=data.get("primary_color", "")
    )

@router.put("/personalizacao", response_model=PersonalizacaoData)
async def save_personalizacao(data: PersonalizacaoData, current_user: UserResponse = Depends(require_user_manager)):
    await update_settings("personalizacao", data.model_dump())
    return data

class DistribuicaoData(BaseModel):
    auto_distribute: bool = False
    participating_users: List[str] = []

@router.get("/distribuicao", response_model=DistribuicaoData)
async def fetch_distribuicao(current_user: UserResponse = Depends(require_user_manager)):
    data = await get_settings("distribuicao")
    return DistribuicaoData(
        auto_distribute=data.get("auto_distribute", False),
        participating_users=data.get("participating_users", [])
    )

@router.put("/distribuicao", response_model=DistribuicaoData)
async def save_distribuicao(data: DistribuicaoData, current_user: UserResponse = Depends(require_user_manager)):
    await update_settings("distribuicao", data.model_dump())
    return data


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
