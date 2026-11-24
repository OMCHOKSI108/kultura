import logging
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base
from config import settings

logger = logging.getLogger("kultura.database")

Base = declarative_base()

# Strict PostgreSQL Async Engine
primary_engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False,
)

async_session_factory = async_sessionmaker(
    bind=primary_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db() -> None:
    """
    Initialize database tables with strict PostgreSQL requirement.
    Fails immediately if PostgreSQL database cannot be reached.
    """
    try:
        from sqlalchemy import text
        async with primary_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Safe schema upgrades for existing databases
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider VARCHAR(64);"))
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS model VARCHAR(128);"))
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS sources_json TEXT;"))
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reasoning TEXT;"))
        logger.info(
            f"Strict PostgreSQL connected successfully: {primary_engine.url.render_as_string(hide_password=True)}"
        )
    except Exception as e:
        logger.critical(
            f"STRICT POSTGRESQL ERROR: Could not connect to PostgreSQL database at {settings.DATABASE_URL}. "
            f"Error details: {e}"
        )
        raise RuntimeError(
            f"Strict PostgreSQL connection failed. Ensure PostgreSQL 16 is running on {settings.POSTGRES_HOST}:{settings.POSTGRES_PORT} with database '{settings.POSTGRES_DB}'."
        ) from e


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for yielding an active async PostgreSQL DB session."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
