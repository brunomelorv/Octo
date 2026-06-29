import sqlite3
import logging
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from slowapi import Limiter
from slowapi.util import get_remote_address
from pydantic import BaseModel
from app.models.user import UserCreate, UserUpdate, PasswordChange, UserLogin, UserResponse, TokenResponse
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    change_own_password,
    get_current_user_from_token,
    list_users,
    create_user,
    update_user,
    delete_user,
    ACCESS_TOKEN_EXPIRE_HOURS
)

logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()

limiter = Limiter(key_func=get_remote_address)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserResponse:
    token = credentials.credentials
    user = await get_current_user_from_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_response = UserResponse(**user)
    if not user_response.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta desativada. Contate o administrador.",
        )
    return user_response

async def require_user_manager(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    if current_user.role not in ("master", "head", "administrativo"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso não autorizado para gerenciar usuários",
        )
    return current_user

@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, credentials: UserLogin):
    user = await authenticate_user(credentials.email, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos"
        )
    
    # Generate token
    token_data = {"sub": user["email"], "role": user.get("role", "user")}
    access_token = create_access_token(data=token_data)
    
    expires_in_seconds = ACCESS_TOKEN_EXPIRE_HOURS * 3600
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in_seconds
    )

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: UserResponse = Depends(get_current_user)):
    return current_user

@router.post("/me/password")
async def change_password(
    data: PasswordChange,
    current_user: UserResponse = Depends(get_current_user),
):
    if len(data.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A nova senha deve ter pelo menos 6 caracteres",
        )
    changed = await change_own_password(
        email=current_user.email,
        current_password=data.current_password,
        new_password=data.new_password,
    )
    if not changed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta",
        )
    return {"message": "Senha atualizada com sucesso"}

class AvatarUpdate(BaseModel):
    avatar_base64: str

@router.patch("/me/avatar", response_model=UserResponse)
async def update_my_avatar(data: AvatarUpdate, current_user: UserResponse = Depends(get_current_user)):
    user = await update_user(int(current_user.id), {"avatar_base64": data.avatar_base64})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return user

@router.get("/users", response_model=list[UserResponse])
async def get_users(_: UserResponse = Depends(require_user_manager)):
    return await list_users()

@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def post_user(data: UserCreate, _: UserResponse = Depends(require_user_manager)):
    try:
        return await create_user(
            email=data.email.strip().lower(),
            name=data.name.strip(),
            password=data.password,
            role=data.role,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ja existe um usuario com este e-mail",
        )

@router.patch("/users/{user_id}", response_model=UserResponse)
async def patch_user(user_id: int, data: UserUpdate, _: UserResponse = Depends(require_user_manager)):
    fields = data.model_dump(exclude_unset=True)
    if "email" in fields and fields["email"]:
        fields["email"] = fields["email"].strip().lower()
    if "name" in fields and fields["name"]:
        fields["name"] = fields["name"].strip()
    try:
        user = await update_user(user_id, fields)
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ja existe um usuario com este e-mail",
        )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
    return user

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_user(user_id: int, current_user: UserResponse = Depends(require_user_manager)):
    if str(user_id) == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode excluir sua própria conta",
        )
    deleted = await delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
