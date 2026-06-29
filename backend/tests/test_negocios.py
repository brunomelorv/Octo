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
