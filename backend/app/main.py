import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.routers.auth import router as auth_router
from app.routers.campanhas import router as campanhas_router
from app.routers.leads import router as leads_router
from app.routers.negocios import router as negocios_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup log
    logger.info("Starting up Lead Analytics API...")
    try:
        from app.services.database import query
        from app.services.auth_service import init_users_table_and_migrate
        await init_users_table_and_migrate()

        await query("""
        CREATE TABLE IF NOT EXISTS negocios (
            lead_id TEXT PRIMARY KEY,
            etapa TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            updated_at TEXT,
            usuario_email TEXT,
            usuario_nome TEXT
        );
        """)
        # Backwards compatibility migrations
        try:
            await query("ALTER TABLE negocios ADD COLUMN usuario_email TEXT;")
        except Exception:
            pass
        try:
            await query("ALTER TABLE negocios ADD COLUMN usuario_nome TEXT;")
        except Exception:
            pass
            
        # Audit Log Table
        await query("""
        CREATE TABLE IF NOT EXISTS negocios_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id TEXT NOT NULL,
            etapa_anterior TEXT,
            etapa_nova TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            usuario_email TEXT NOT NULL,
            usuario_nome TEXT NOT NULL,
            data_hora TEXT NOT NULL
        );
        """)
        logger.info("Database tables 'negocios' and 'negocios_historico' initialized successfully.")
    except Exception as e:
        logger.error(f"Error initializing database tables: {e}")
    yield
    # Shutdown log
    logger.info("Shutting down Lead Analytics API...")

app = FastAPI(
    title="Lead Analytics API",
    description="Backend API for Lead Analytics Dashboard",
    version="1.0.0",
    lifespan=lifespan
)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Muitas tentativas. Tente novamente em alguns minutos."},
    )

# CORS configurations
_default_origins = [
    "http://localhost:3000",
    "http://localhost:5500",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5173",
]

import os
_env_origins = os.getenv("CORS_ORIGINS")
origins = [o.strip() for o in _env_origins.split(",") if o.strip()] if _env_origins else _default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Security headers middleware (M4 — mitigates XSS to protect localStorage tokens)
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data:; "
            "connect-src 'self'"
        )
        return response

app.add_middleware(SecurityHeadersMiddleware)

# Health check router
health_router = APIRouter()

@health_router.get("/health")
async def health_check():
    return {"status": "ok", "version": "1.0.0"}

app.include_router(health_router)

# API routers
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(campanhas_router, prefix="/api/campanhas", tags=["campanhas"])
app.include_router(leads_router, prefix="/api/leads", tags=["leads"])
app.include_router(negocios_router, prefix="/api/negocios", tags=["negocios"])
