import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test the health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

@pytest.mark.asyncio
async def test_login_success(client: AsyncClient):
    """Test successful login with valid credentials."""
    response = await client.post("/api/auth/login", json={
        "email": "admin@example.com",
        "password": "admin123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" not in data
    assert data["token_type"] == "bearer"
    assert "token" in response.cookies
    
@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient):
    """Test login failure with wrong password."""
    response = await client.post("/api/auth/login", json={
        "email": "admin@example.com",
        "password": "wrongpassword"
    })
    assert response.status_code == 401
    
@pytest.mark.asyncio
async def test_protected_route_without_token(client: AsyncClient):
    """Test that protected routes deny access without an Authorization token."""
    response = await client.get("/api/auth/me")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_protected_route_with_token(client: AsyncClient):
    """Test that a valid token grants access to protected routes."""
    # 1. Get the token
    login_response = await client.post("/api/auth/login", json={
        "email": "admin@example.com",
        "password": "admin123"
    })
    assert "token" in login_response.cookies
    token = login_response.cookies["token"]
    
    # 2. Access protected route (using cookie)
    response = await client.get("/api/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "admin@example.com"

    # 3. Access protected route (using header to make sure Bearer format works)
    # We clear the client's cookies for this request by passing cookies={} to test the Header path
    response_header = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        cookies={}
    )
    assert response_header.status_code == 200
    assert response_header.json()["email"] == "admin@example.com"


@pytest.mark.asyncio
async def test_master_user_seeding(app_setup, monkeypatch):
    """Test that a master user is seeded when the users table is empty."""
    from app.services.database import get_db
    from app.services.auth_service import init_users_table_and_migrate, get_user_by_email
    
    # 1. Temporarily clear the USERS_JSON so no legacy users are migrated
    monkeypatch.setenv("USERS_JSON", "")
    
    # 2. Configure master user env variables
    monkeypatch.setenv("MASTER_USER_EMAIL", "test-master@example.com")
    monkeypatch.setenv("MASTER_USER_PASSWORD", "TestMasterPassword123!")
    monkeypatch.setenv("MASTER_USER_NAME", "Test Master User")
    
    # 3. Truncate users table
    db = await get_db()
    try:
        await db.execute("DELETE FROM users;")
        await db.commit()
    finally:
        await db.close()
        
    # 4. Run init/migration
    await init_users_table_and_migrate()
    
    # 5. Check if the master user was created
    user = await get_user_by_email("test-master@example.com")
    assert user is not None
    assert user["name"] == "Test Master User"
    assert user["role"] == "master"

