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
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    
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
    token = login_response.json()["access_token"]
    
    # 2. Access protected route
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "admin@example.com"
