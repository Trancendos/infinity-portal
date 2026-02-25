# tests/conftest.py — Shared test fixtures
import os
import uuid
import asyncio
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Use SQLite for tests
TEST_DB_URL = "sqlite+aiosqlite:///./test.db"
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-unit-tests-only-min-32-chars"
os.environ["ENVIRONMENT"] = "test"

from models import Base, User, Organisation, UserRole, OrgPlan, utcnow
from auth import AuthService
from database import get_db_session
from main import app


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine):
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(db_engine):
    """HTTP test client with overridden DB dependency"""
    session_factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_org(db_session):
    """Create a test organisation"""
    org = Organisation(
        id=str(uuid.uuid4()),
        name="Test Organisation",
        slug="test-org",
        plan=OrgPlan.PRO,
        region_iso_code="GB",
        compliance_tier="standard",
        is_active=True,
        settings={},
    )
    db_session.add(org)
    await db_session.commit()
    await db_session.refresh(org)
    return org


@pytest_asyncio.fixture
async def test_user(db_session, test_org):
    """Create a test user"""
    user = User(
        id=str(uuid.uuid4()),
        email="testuser@infinity-os.dev",
        display_name="Test User",
        password_hash=AuthService.hash_password("TestPassword123!"),
        organisation_id=test_org.id,
        role=UserRole.USER,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session, test_org):
    """Create an admin user"""
    user = User(
        id=str(uuid.uuid4()),
        email="admin@infinity-os.dev",
        display_name="Admin User",
        password_hash=AuthService.hash_password("AdminPassword123!"),
        organisation_id=test_org.id,
        role=UserRole.ORG_ADMIN,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def super_admin(db_session, test_org):
    """Create a super admin user"""
    user = User(
        id=str(uuid.uuid4()),
        email="superadmin@infinity-os.dev",
        display_name="Super Admin",
        password_hash=AuthService.hash_password("SuperAdmin123!!"),
        organisation_id=test_org.id,
        role=UserRole.SUPER_ADMIN,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


def get_auth_headers(user: User) -> dict:
    """Generate auth headers for a user"""
    token_data = {
        "sub": user.id,
        "email": user.email,
        "organisation_id": user.organisation_id,
        "role": user.role.value if isinstance(user.role, UserRole) else user.role,
    }
    token = AuthService.create_access_token(token_data)
    return {"Authorization": f"Bearer {token}"}