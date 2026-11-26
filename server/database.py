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
    Automatically seeds or syncs the .env-configured Admin account.
    """
    try:
        import uuid
        from sqlalchemy import text, select
        from services.auth import hash_password, verify_password

        async with primary_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Safe schema upgrades for existing databases
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider VARCHAR(64);"))
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS model VARCHAR(128);"))
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS sources_json TEXT;"))
            await conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS reasoning TEXT;"))
            await conn.execute(text("ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS designation VARCHAR(128);"))

        # Seed or sync .env-configured Admin account
        async with async_session_factory() as session:
            from models import UserModel, SessionModel

            admin_email = settings.ADMIN_ID.strip().lower()
            admin_username = admin_email.split("@")[0] if "@" in admin_email else admin_email

            stmt = select(UserModel).where((UserModel.email == admin_email) | (UserModel.username == admin_username))
            res = await session.execute(stmt)
            admin = res.scalar_one_or_none()

            if not admin:
                logger.info(f"Seeding initial Admin account from .env: {admin_email}")
                admin = UserModel(
                    id=str(uuid.uuid4()),
                    username=admin_username,
                    email=admin_email,
                    hashed_password=hash_password(settings.ADMIN_PASS),
                    role="admin",
                    is_active=True,
                )
                session.add(admin)
                await session.commit()
            else:
                # Keep admin password in sync with .env if updated
                updated = False
                if admin.role != "admin":
                    admin.role = "admin"
                    updated = True
                if not verify_password(settings.ADMIN_PASS, admin.hashed_password):
                    logger.info("Syncing Admin password with .env ADMIN_PASS")
                    admin.hashed_password = hash_password(settings.ADMIN_PASS)
                    updated = True
                if updated:
                    await session.commit()

            # Assign any legacy unassigned sessions to the Admin account
            legacy_stmt = text("UPDATE sessions SET user_id = :admin_id WHERE user_id IS NULL;")
            await session.execute(legacy_stmt, {"admin_id": admin.id})
            await session.commit()

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
