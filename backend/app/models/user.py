from typing import Optional
from enum import Enum
from pydantic import BaseModel


class UserRole(str, Enum):
    admin = "admin"
    user = "user"


class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: UserRole = UserRole.user

class UserUpdate(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[UserRole] = None
    password: Optional[str] = None
    active: Optional[bool] = None
    must_change_password: Optional[bool] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    active: bool = True
    must_change_password: bool = False

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
