from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.models.user import UserLogin, UserResponse, TokenResponse
from app.services.auth_service import (
    get_users_dict,
    verify_password,
    create_access_token,
    get_current_user_from_token,
    ACCESS_TOKEN_EXPIRE_HOURS
)

router = APIRouter()
security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserResponse:
    token = credentials.credentials
    user = get_current_user_from_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return UserResponse(**user)

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    users = get_users_dict()
    user = users.get(credentials.email)
    if not user or not verify_password(credentials.password, user.get("password", "")):
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
