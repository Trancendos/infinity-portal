# tests/conftest.py - Pytest configuration with async test DB
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Force test environment
os.environ["ENVIRONMENT"] = "test"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only"

from main import app  # noqa: E402
from database import get_db_session  # noqa: E402
from models import Base  # noqa: E402


@pytest_asyncio.fixture
async def test_db():
    """Create in-memory SQLite test database"""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False,
    )

    async def override_get_db():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db

    yield session_maker

    await engine.dispose()
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def client(test_db):
    """Create async test client"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def auth_token(client: AsyncClient) -> str:
    """Register a user and return auth token"""
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "fixture@example.com", "password": "securepassword123"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest_asyncio.fixture
async def auth_headers(auth_token: str) -> dict:
    """Return auth headers dict"""
    return {"Authorization": f"Bearer {auth_token}"}
