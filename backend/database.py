# database.py - Complete async database setup
import os
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from contextlib import asynccontextmanager

# Database configuration
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://infinity_os:secure_password@localhost/infinity_os"
)

# Create async engine with connection pooling
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    future=True,
    pool_size=20,
    max_overflow=0,
    pool_pre_ping=True,
    pool_recycle=3600,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db_session():
    """Dependency for getting database session (FastAPI Depends)"""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database and create tables"""
    from models import Base

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    print("✅ Database initialized successfully")


async def close_db():
    """Close database connection pool"""
    await engine.dispose()


@asynccontextmanager
async def get_db_context():
    """Context manager for database operations outside of FastAPI request cycle"""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
