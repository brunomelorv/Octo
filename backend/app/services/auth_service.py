import os
import json
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv

load_dotenv()

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY", "super-secret-key-change-it-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        # Fallback to plain comparison if not a valid bcrypt hash
        return plain_password == hashed_password

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_users_dict() -> dict:
    users_raw = os.getenv("USERS_JSON")
    if not users_raw:
        # Provide a default fallback user for convenience
        default_admin_password_hash = hash_password("admin123")
        return {
            "admin@example.com": {
                "id": "1",
                "email": "admin@example.com",
                "name": "Administrador",
                "password": default_admin_password_hash,
                "role": "admin"
            }
        }
    try:
        data = json.loads(users_raw)
        user_dict = {}
        if isinstance(data, list):
            for idx, user in enumerate(data):
                if isinstance(user, dict) and "email" in user:
                    user_copy = user.copy()
                    if "id" not in user_copy:
                        user_copy["id"] = str(idx + 1)
                    user_dict[user["email"]] = user_copy
        elif isinstance(data, dict):
            for idx, (email, user) in enumerate(data.items()):
                if isinstance(user, dict):
                    user_copy = user.copy()
                    if "id" not in user_copy:
                        user_copy["id"] = str(idx + 1)
                    if "email" not in user_copy:
                        user_copy["email"] = email
                    user_dict[email] = user_copy
        else:
            raise ValueError("USERS_JSON format must be a list or dict")
        return user_dict
    except Exception as e:
        # In case parsing fails
        import logging
        logging.getLogger("auth_service").error(f"Error parsing USERS_JSON: {e}")
        default_admin_password_hash = hash_password("admin123")
        return {
            "admin@example.com": {
                "id": "1",
                "email": "admin@example.com",
                "name": "Administrador",
                "password": default_admin_password_hash,
                "role": "admin"
            }
        }

def get_current_user_from_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        users = get_users_dict()
        user = users.get(email)
        if user:
            user_data = user.copy()
            user_data.pop("password", None)
            return user_data
        return None
    except JWTError:
        return None
