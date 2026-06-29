import pytest
from httpx import AsyncClient
from unittest.mock import patch
import pytest_asyncio

@pytest_asyncio.fixture
async def token():
    from app.services.auth_service import create_access_token
    return create_access_token({"sub": "admin@example.com", "role": "admin"})

@pytest.mark.asyncio
async def test_get_kpis(client: AsyncClient, token: str):
    mock_data = {
        "total_leads": 100, 
        "total_com_chamada": 50, 
        "total_agendados": 10, 
        "taxa_contato": 50.0, 
        "conv_sem_contato": 0.0
    }
    with patch("app.routers.leads.leads_service.get_kpis", return_value=mock_data):
        response = await client.get("/api/leads/kpis", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json() == mock_data

@pytest.mark.asyncio
async def test_get_leads_unauthorized(client: AsyncClient):
    response = await client.get("/api/leads/")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_get_leads_success(client: AsyncClient, token: str):
    mock_data = {"items": [], "total": 0, "page": 1, "pages": 0}
    with patch("app.routers.leads.leads_service.get_leads", return_value=mock_data):
        response = await client.get("/api/leads/", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json() == mock_data

@pytest.mark.asyncio
async def test_get_lead_by_phone_invalid_format(client: AsyncClient, token: str):
    # Formato inválido deve retornar 400
    response = await client.get("/api/leads/abc", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 400

@pytest.mark.asyncio
async def test_get_lead_by_phone_not_found(client: AsyncClient, token: str):
    with patch("app.routers.leads.leads_service.get_lead_by_phone", return_value=None):
        response = await client.get("/api/leads/5511999999999", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 404
