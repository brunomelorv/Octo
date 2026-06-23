import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware

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

# CORS configurations
origins = [
    "http://localhost:3000",
    "http://localhost:5500",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
