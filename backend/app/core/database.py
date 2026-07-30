"""Async database plumbing shared by every module.

- `engine`     : the async SQLAlchemy engine
- `Base`       : declarative base all models inherit from
- `get_session`: FastAPI dependency yielding a request-scoped session

Models are collected on `Base.metadata`, so `init_models()` (dev) or Alembic
(prod) can create them all at once.
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=settings.is_dev, future=True)

SessionFactory = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a session and guarantee it is closed after the request."""
    async with SessionFactory() as session:
        yield session


async def init_models() -> None:
    """Create all tables from the registered metadata (dev/bootstrap only).

    Importing the models registry ensures every table is known before create_all.
    Production should use Alembic migrations instead.
    """
    from app import models_registry  # noqa: F401  (side-effect import)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
