import pytest
import pytest_asyncio
from httpx import AsyncClient
from app.services.database import query

@pytest_asyncio.fixture
async def token():
    from app.services.auth_service import create_access_token
    return create_access_token({"sub": "admin@example.com", "role": "admin"})

@pytest_asyncio.fixture(autouse=True)
async def setup_leads_table(app_setup):
    await query("""
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            created_time TEXT,
            ad_id TEXT,
            ad_name TEXT,
            adset_id TEXT,
            adset_name TEXT,
            campaign_id TEXT,
            campaign_name TEXT,
            form_id TEXT,
            form_name TEXT,
            is_organic INTEGER,
            platform TEXT,
            full_name TEXT,
            phone TEXT,
            city TEXT,
            email TEXT,
            lead_status TEXT,
            source_file TEXT
        );
    """)

@pytest.mark.asyncio
async def test_update_lead_success(client: AsyncClient, token: str):
    await query(
        "INSERT INTO leads (id, full_name, email, phone, city) VALUES (?, ?, ?, ?, ?)",
        ("lead_100", "Carlos Silva", "carlos@example.com", "5511988887777", "São Paulo")
    )
    
    payload = {
        "full_name": "Carlos Silva Editado",
        "city": "Campinas"
    }
    
    response = await client.put(
        "/api/leads/lead_100",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "lead_100"
    assert data["full_name"] == "Carlos Silva Editado"
    assert data["city"] == "Campinas"
    assert data["email"] == "carlos@example.com"
    
    # Check DB
    rows = await query("SELECT * FROM leads WHERE id = ?", ("lead_100",))
    assert rows[0]["full_name"] == "Carlos Silva Editado"
    assert rows[0]["city"] == "Campinas"

@pytest.mark.asyncio
async def test_update_lead_not_found(client: AsyncClient, token: str):
    response = await client.put(
        "/api/leads/non_existent_lead",
        json={"full_name": "Novo Nome"},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Lead não encontrado"

@pytest.mark.asyncio
async def test_update_lead_unauthorized(client: AsyncClient):
    response = await client.put(
        "/api/leads/lead_100",
        json={"full_name": "Novo Nome"}
    )
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_bulk_update_leads(client: AsyncClient, token: str):
    await query(
        "INSERT INTO leads (id, full_name, campaign_name, lead_status) VALUES (?, ?, ?, ?)",
        ("lead_201", "Lead One", "Old Camp", "Novo")
    )
    await query(
        "INSERT INTO leads (id, full_name, campaign_name, lead_status) VALUES (?, ?, ?, ?)",
        ("lead_202", "Lead Two", "Old Camp", "Novo")
    )
    
    payload = {
        "ids": ["lead_201", "lead_202"],
        "campaign_name": "Campanha Premium",
        "lead_status": "Qualificado"
    }
    
    response = await client.post(
        "/api/leads/bulk-update",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["updated_count"] == 2
    
    # Check DB
    rows = await query("SELECT * FROM leads WHERE id IN ('lead_201', 'lead_202')")
    assert len(rows) == 2
    for r in rows:
        assert r["campaign_name"] == "Campanha Premium"
        assert r["lead_status"] == "Qualificado"

@pytest.mark.asyncio
async def test_bulk_delete_leads(client: AsyncClient, token: str):
    await query(
        "INSERT INTO leads (id, full_name) VALUES (?, ?)",
        ("lead_301", "Lead Delete 1")
    )
    await query(
        "INSERT INTO leads (id, full_name) VALUES (?, ?)",
        ("lead_302", "Lead Delete 2")
    )
    
    payload = {
        "ids": ["lead_301", "lead_302"]
    }
    
    response = await client.post(
        "/api/leads/bulk-delete",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["deleted_count"] == 2
    
    # Check DB
    rows = await query("SELECT * FROM leads WHERE id IN ('lead_301', 'lead_302')")
    assert len(rows) == 0
