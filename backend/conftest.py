import os
import pytest
import pytest_asyncio
import tempfile
from pathlib import Path
from httpx import AsyncClient, ASGITransport

@pytest.fixture(autouse=True)
def setup_test_env(monkeypatch):
    """Sets up environment variables for testing before any app code is imported."""
    # Use a temporary file for the database so all connections share the same DB
    temp_dir = tempfile.TemporaryDirectory()
    db_path = str(Path(temp_dir.name) / "test.db")
    
    monkeypatch.setenv("DB_PATH", db_path)
    monkeypatch.setenv("SECRET_KEY", "dummy-secret-key-for-testing")
    
    # Provide a default admin user via USERS_JSON for auth service migrations
    users_json = '{"admin@example.com": {"password": "admin123", "role": "admin", "name": "Admin"}}'
    monkeypatch.setenv("USERS_JSON", users_json)
    
    from app.main import limiter
    limiter.enabled = False
    
    yield
    
    temp_dir.cleanup()

@pytest_asyncio.fixture
async def app_setup():
    """Initializes the database schema required for the tests."""
    from app.services.auth_service import init_users_table_and_migrate
    from app.services.database import query
    
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
    yield

@pytest_asyncio.fixture
async def client(app_setup):
    """Provides an async test client for FastAPI."""
    from app.main import app
    # Disable rate limiter for testing
    app.state.limiter.enabled = False
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
