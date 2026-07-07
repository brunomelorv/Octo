import pytest
from httpx import AsyncClient
from unittest.mock import patch
import pytest_asyncio

@pytest_asyncio.fixture
async def token():
    from app.services.auth_service import create_access_token
    return create_access_token({"sub": "admin@example.com", "role": "admin"})

@pytest.mark.asyncio
async def test_list_negocios(client: AsyncClient, token: str):
    mock_data = [{"lead_id": "1", "etapa": "Novo", "valor": 0}]
    with patch("app.routers.negocios.negocios_service.get_negocios", return_value=mock_data):
        response = await client.get("/api/negocios/", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json() == mock_data

@pytest.mark.asyncio
async def test_update_negocio(client: AsyncClient, token: str):
    with patch("app.routers.negocios.negocios_service.save_negocio", return_value=True):
        response = await client.put(
            "/api/negocios/1", 
            json={"etapa": "Contatado", "valor": 500.0}, 
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_update_negocio_not_found(client: AsyncClient, token: str):
    with patch("app.routers.negocios.negocios_service.save_negocio", return_value=False):
        response = await client.put(
            "/api/negocios/999", 
            json={"etapa": "Contatado", "valor": 500.0}, 
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 404

@pytest.mark.asyncio
async def test_historico_negocios(client: AsyncClient, token: str):
    mock_data = [{"lead_id": "1", "etapa_anterior": "Novo", "etapa_nova": "Contatado"}]
    with patch("app.routers.negocios.negocios_service.get_negocios_historico", return_value=mock_data):
        response = await client.get("/api/negocios/historico", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json() == mock_data


@pytest.mark.asyncio
async def test_update_negocio_consultor_own_deal(client: AsyncClient):
    from app.services.auth_service import create_access_token
    from app.services.database import query
    
    await query("DELETE FROM users WHERE email = 'consultor1@example.com'")
    await query(
        "INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, ?, ?)",
        ("consultor1@example.com", "Consultor Um", "dummyhash", "consultor", 1)
    )
    
    await query("DELETE FROM negocios WHERE lead_id = 'test-lead-1'")
    await query(
        "INSERT INTO negocios (lead_id, etapa, valor, usuario_email, usuario_nome) VALUES (?, ?, ?, ?, ?)",
        ("test-lead-1", "Sem Contato", 0.0, "consultor1@example.com", "Consultor Um")
    )
    
    consultor_token = create_access_token({"sub": "consultor1@example.com", "role": "consultor"})
    
    with patch("app.routers.negocios.negocios_service.save_negocio", return_value=True):
        response = await client.put(
            "/api/negocios/test-lead-1",
            json={"etapa": "Contatado", "valor": 100.0},
            headers={"Authorization": f"Bearer {consultor_token}"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_update_negocio_consultor_unassigned_deal(client: AsyncClient):
    from app.services.auth_service import create_access_token
    from app.services.database import query
    
    await query("DELETE FROM users WHERE email = 'consultor1@example.com'")
    await query(
        "INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, ?, ?)",
        ("consultor1@example.com", "Consultor Um", "dummyhash", "consultor", 1)
    )
    
    await query("DELETE FROM negocios WHERE lead_id = 'test-lead-unassigned'")
    
    consultor_token = create_access_token({"sub": "consultor1@example.com", "role": "consultor"})
    
    with patch("app.routers.negocios.negocios_service.save_negocio", return_value=True):
        response = await client.put(
            "/api/negocios/test-lead-unassigned",
            json={"etapa": "Contatado", "valor": 100.0},
            headers={"Authorization": f"Bearer {consultor_token}"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_update_negocio_consultor_other_deal(client: AsyncClient):
    from app.services.auth_service import create_access_token
    from app.services.database import query
    
    await query("DELETE FROM users WHERE email = 'consultor1@example.com'")
    await query(
        "INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, ?, ?)",
        ("consultor1@example.com", "Consultor Um", "dummyhash", "consultor", 1)
    )
    
    await query("DELETE FROM negocios WHERE lead_id = 'test-lead-other'")
    await query(
        "INSERT INTO negocios (lead_id, etapa, valor, usuario_email, usuario_nome) VALUES (?, ?, ?, ?, ?)",
        ("test-lead-other", "Sem Contato", 0.0, "other@example.com", "Other Consultor")
    )
    
    consultor_token = create_access_token({"sub": "consultor1@example.com", "role": "consultor"})
    
    response = await client.put(
        "/api/negocios/test-lead-other",
        json={"etapa": "Contatado", "valor": 100.0},
        headers={"Authorization": f"Bearer {consultor_token}"}
    )
    assert response.status_code == 403
    assert "Você não tem permissão" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_negocio_consultor_own_deal_case_insensitive(client: AsyncClient):
    from app.services.auth_service import create_access_token
    from app.services.database import query
    
    await query("DELETE FROM users WHERE email = 'consultor1@example.com'")
    await query(
        "INSERT INTO users (email, name, password_hash, role, active) VALUES (?, ?, ?, ?, ?)",
        ("consultor1@example.com", "Consultor Um", "dummyhash", "consultor", 1)
    )
    
    await query("DELETE FROM negocios WHERE lead_id = 'test-lead-case'")
    await query(
        "INSERT INTO negocios (lead_id, etapa, valor, usuario_email, usuario_nome) VALUES (?, ?, ?, ?, ?)",
        ("test-lead-case", "Sem Contato", 0.0, "Consultor1@Example.Com", "Consultor Um")
    )
    
    consultor_token = create_access_token({"sub": "consultor1@example.com", "role": "consultor"})
    
    with patch("app.routers.negocios.negocios_service.save_negocio", return_value=True):
        response = await client.put(
            "/api/negocios/test-lead-case",
            json={"etapa": "Contatado", "valor": 100.0},
            headers={"Authorization": f"Bearer {consultor_token}"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_save_negocio_preserves_owner(app_setup):
    from app.services.database import query
    import app.services.negocios_service as negocios_service
    
    await query("""
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            full_name TEXT,
            phone TEXT
        );
    """)
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
    await query("DELETE FROM leads WHERE id = 'test-lead-preserve'")
    await query("INSERT INTO leads (id, full_name, phone) VALUES (?, ?, ?)", ("test-lead-preserve", "Preserve Lead", "123456789"))
    
    await query("DELETE FROM negocios WHERE lead_id = 'test-lead-preserve'")
    await query(
        "INSERT INTO negocios (lead_id, etapa, valor, usuario_email, usuario_nome) VALUES (?, ?, ?, ?, ?)",
        ("test-lead-preserve", "Sem Contato", 10.0, "original_owner@example.com", "Original Owner")
    )
    
    success = await negocios_service.save_negocio(
        lead_id="test-lead-preserve",
        etapa="Contatado",
        valor=200.0,
        user_email="updater@example.com",
        user_name="Updater User"
    )
    assert success is True
    
    rows = await query("SELECT usuario_email, usuario_nome, valor, etapa FROM negocios WHERE lead_id = ?", ("test-lead-preserve",))
    assert len(rows) == 1
    assert rows[0]["usuario_email"] == "original_owner@example.com"
    assert rows[0]["usuario_nome"] == "Original Owner"
    assert rows[0]["valor"] == 200.0
    assert rows[0]["etapa"] == "Contatado"

