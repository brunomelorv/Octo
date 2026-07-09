import os
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
from app.routers.agenda import router as agenda_router
from app.routers.settings import router as settings_router
from app.routers.upload import router as upload_router
from app.routers.bug_reports import router as bug_reports_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("main")

from app.services.log_service import memory_log_handler
logging.getLogger().addHandler(memory_log_handler)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup log
    logger.info("Starting up Lead Analytics API...")
    try:
        from app.services.database import query
        from app.services.auth_service import init_users_table_and_migrate
        from app.services.settings_service import init_settings_table
        from app.services.bug_report_service import init_bug_reports_table
        await init_users_table_and_migrate()
        await init_settings_table()
        await init_bug_reports_table()

        await query("""
        CREATE TABLE IF NOT EXISTS negocios (
            lead_id TEXT PRIMARY KEY,
            etapa TEXT NOT NULL,
            valor REAL DEFAULT 0.0,
            updated_at TEXT,
            usuario_email TEXT,
            usuario_nome TEXT,
            tags TEXT
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
        try:
            await query("ALTER TABLE negocios ADD COLUMN tags TEXT;")
        except Exception:
            pass
        try:
            await query("ALTER TABLE negocios ADD COLUMN loss_reason TEXT;")
        except Exception:
            pass
        try:
            await query("ALTER TABLE negocios ADD COLUMN loss_comment TEXT;")
        except Exception:
            pass
        try:
            await query("ALTER TABLE chamadas ADD COLUMN data_retorno_agendado TEXT;")
        except Exception:
            pass
        try:
            await query("ALTER TABLE chamadas ADD COLUMN horario_retorno_agendado TEXT;")
        except Exception:
            pass
        try:
            await query("ALTER TABLE chamadas ADD COLUMN tipo_retorno TEXT;")
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
        # Agenda Comments Table
        await query("""
        CREATE TABLE IF NOT EXISTS agenda_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            telefone_normalizado TEXT NOT NULL,
            data_agendamento TEXT NOT NULL,
            comentario TEXT NOT NULL,
            created_at TEXT NOT NULL,
            usuario_email TEXT NOT NULL
        );
        """)

        # Agenda Completions Table
        await query("""
        CREATE TABLE IF NOT EXISTS agenda_completions (
            chamada_id INTEGER PRIMARY KEY,
            completed_at TEXT NOT NULL,
            completed_by TEXT NOT NULL
        );
        """)

        # Migrate old 'Novo' and 'Novo/Sem Contato' stages to unified 'Sem Contato'
        await query("UPDATE negocios SET etapa = 'Sem Contato' WHERE etapa IN ('Novo', 'Novo/Sem Contato');")
        await query("UPDATE negocios_historico SET etapa_anterior = 'Sem Contato' WHERE etapa_anterior IN ('Novo', 'Novo/Sem Contato');")
        await query("UPDATE negocios_historico SET etapa_nova = 'Sem Contato' WHERE etapa_nova IN ('Novo', 'Novo/Sem Contato');")
        logger.info("Database tables initialized and migrated successfully.")
    except Exception as e:
        logger.error(f"Error initializing database tables: {e}")
    yield
    # Shutdown log
    logger.info("Shutting down Lead Analytics API...")

_debug_mode = os.getenv("DEBUG", "False").lower() == "true"

app = FastAPI(
    title="Lead Analytics API",
    description="Backend API for Lead Analytics Dashboard",
    version="1.0.0",
    lifespan=lifespan,
    # Disable interactive docs in production
    docs_url="/docs" if _debug_mode else None,
    redoc_url="/redoc" if _debug_mode else None,
    openapi_url="/openapi.json" if _debug_mode else None,
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

_env_origins = os.getenv("CORS_ORIGINS")
if _env_origins and _env_origins.strip() == "*":
    origins = ["*"]
    _allow_credentials = False  # Required by CORS spec when using wildcard
elif _env_origins:
    origins = [o.strip() for o in _env_origins.split(",") if o.strip()]
    _allow_credentials = True
else:
    origins = _default_origins
    _allow_credentials = True

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=_allow_credentials,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
app.include_router(agenda_router, prefix="/api/agenda", tags=["agenda"])
app.include_router(settings_router, prefix="/api/settings", tags=["settings"])
app.include_router(upload_router, prefix="/api/upload", tags=["upload"])
app.include_router(bug_reports_router, prefix="/api", tags=["bug-reports"])
