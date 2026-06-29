import os
import json
import uuid
import base64
import hashlib
import hmac
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from dotenv import load_dotenv
from app.services.database import get_db

load_dotenv()

# JWT configuration
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY environment variable is required. "
        "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 8

PASSWORD_HASH_PREFIX = "$sha256-bcrypt$"

def _password_bytes(password: str) -> bytes:
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)

def hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt())
    return PASSWORD_HASH_PREFIX + hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        if hashed_password.startswith(PASSWORD_HASH_PREFIX):
            stored_hash = hashed_password[len(PASSWORD_HASH_PREFIX):].encode("utf-8")
            candidate_hash = bcrypt.hashpw(_password_bytes(plain_password), stored_hash)
            return hmac.compare_digest(candidate_hash, stored_hash)
        if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
            candidate_hash = bcrypt.hashpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
            return hmac.compare_digest(candidate_hash, hashed_password.encode("utf-8"))
        return False  # Reject unknown hash formats
    except Exception:
        return False

def is_password_hash(password: str) -> bool:
    return password.startswith(PASSWORD_HASH_PREFIX) or password.startswith(("$2a$", "$2b$", "$2y$"))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.utcnow()
    expire = now + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
    })
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_users_dict(include_default: bool = True) -> dict:
    """Legacy .env user loader used only for migration/fallback compatibility."""
    users_raw = os.getenv("USERS_JSON")
    if not users_raw:
        if not include_default:
            return {}
        # Provide a default fallback user for convenience
        default_admin_password_hash = hash_password("admin123")
        return {
            "admin@example.com": {
                "id": "1",
                "email": "admin@example.com",
                "name": "Administrador",
                "password": default_admin_password_hash,
                "role": "master"
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
                "role": "master"
            }
        }

async def init_users_table_and_migrate() -> None:
    db = await get_db()
    try:
        await db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'consultor',
            active INTEGER NOT NULL DEFAULT 1,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            avatar_base64 TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT
        );
        """)
        try:
            await db.execute("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;")
        except Exception:
            pass

        try:
            await db.execute("ALTER TABLE users ADD COLUMN avatar_base64 TEXT;")
        except Exception:
            pass

        # Migrate legacy roles
        await db.execute("UPDATE users SET role = 'master' WHERE role = 'admin'")
        await db.execute("UPDATE users SET role = 'consultor' WHERE role = 'user'")

        users = get_users_dict(include_default=False)
        for email, user in users.items():
            password = user.get("password", "")
            password_hash = password if is_password_hash(password) else hash_password(password)
            await db.execute(
                """
                INSERT INTO users (email, name, password_hash, role, active, must_change_password)
                VALUES (?, ?, ?, ?, 1, 0)
                ON CONFLICT(email) DO NOTHING;
                """,
                (
                    email,
                    user.get("name") or email,
                    password_hash,
                    user.get("role", "consultor"),
                ),
            )
        await db.commit()
    finally:
        await db.close()

def normalize_user(row: dict) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "active": bool(row["active"]),
        "must_change_password": bool(row.get("must_change_password", 0)),
        "avatar_base64": row.get("avatar_base64")
    }

async def get_user_by_email(email: str, include_inactive: bool = False) -> Optional[dict]:
    db = await get_db()
    try:
        sql = "SELECT * FROM users WHERE email = ?"
        params = [email]
        if not include_inactive:
            sql += " AND active = 1"
        async with db.execute(sql, tuple(params)) as cursor:
            return await cursor.fetchone()
    finally:
        await db.close()

async def authenticate_user(email: str, password: str) -> Optional[dict]:
    user = await get_user_by_email(email)
    if not user or not verify_password(password, user.get("password_hash", "")):
        return None
    return user

async def list_users() -> list[dict]:
    db = await get_db()
    try:
        async with db.execute(
            "SELECT id, email, name, role, active, must_change_password, avatar_base64 FROM users ORDER BY name COLLATE NOCASE"
        ) as cursor:
            rows = await cursor.fetchall()
            return [normalize_user(row) for row in rows]
    finally:
        await db.close()

async def create_user(email: str, name: str, password: str, role: str = "consultor") -> dict:
    db = await get_db()
    try:
        cursor = await db.execute(
            """
            INSERT INTO users (email, name, password_hash, role, active, must_change_password)
            VALUES (?, ?, ?, ?, 1, 1);
            """,
            (email, name, hash_password(password), role),
        )
        await db.commit()
        user_id = cursor.lastrowid
        async with db.execute(
            "SELECT id, email, name, role, active, must_change_password, avatar_base64 FROM users WHERE id = ?",
            (user_id,),
        ) as result:
            row = await result.fetchone()
            return normalize_user(row)
    finally:
        await db.close()

async def update_user(user_id: int, fields: dict) -> Optional[dict]:
    allowed_fields = {
        "email": "email",
        "name": "name",
        "role": "role",
        "active": "active",
        "must_change_password": "must_change_password",
        "avatar_base64": "avatar_base64",
    }
    assignments = []
    values = []

    for field, column in allowed_fields.items():
        if field in fields and fields[field] is not None:
            value = fields[field]
            if field in ("active", "must_change_password"):
                value = 1 if value else 0
            assignments.append(f"{column} = ?")
            values.append(value)

    if fields.get("password"):
        assignments.append("password_hash = ?")
        values.append(hash_password(fields["password"]))
        assignments.append("must_change_password = ?")
        values.append(1)

    db = await get_db()
    try:
        if assignments:
            assignments.append("updated_at = CURRENT_TIMESTAMP")
            values.append(user_id)
            await db.execute(
                f"UPDATE users SET {', '.join(assignments)} WHERE id = ?",
                tuple(values),
            )
            await db.commit()

        async with db.execute(
            "SELECT id, email, name, role, active, must_change_password, avatar_base64 FROM users WHERE id = ?",
            (user_id,),
        ) as cursor:
            row = await cursor.fetchone()
            return normalize_user(row) if row else None
    finally:
        await db.close()

async def change_own_password(email: str, current_password: str, new_password: str) -> bool:
    user = await get_user_by_email(email)
    if not user:
        return False
    if not verify_password(current_password, user.get("password_hash", "")):
        return False
    db = await get_db()
    try:
        await db.execute(
            """
            UPDATE users
            SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP
            WHERE email = ?;
            """,
            (hash_password(new_password), email),
        )
        await db.commit()
        return True
    finally:
        await db.close()

async def delete_user(user_id: int) -> bool:
    db = await get_db()
    try:
        cursor = await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.commit()
        return cursor.rowcount > 0
    finally:
        await db.close()

async def get_current_user_from_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        user = await get_user_by_email(email)
        if user:
            return normalize_user(user)
        return None
    except JWTError:
        return None
