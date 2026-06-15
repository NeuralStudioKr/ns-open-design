from __future__ import annotations

import ssl
from typing import Any, AsyncIterator

from sqlalchemy.engine.url import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from ..config import settings


def _build_async_url() -> URL:
    password = settings.postgres_password
    if not password:
        raise RuntimeError("POSTGRES_PASSWD or POSTGRES_PASSWORD is not set.")
    return URL.create(
        "postgresql+asyncpg",
        username=settings.postgres_user,
        password=password,
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
    )


def _connect_args() -> dict[str, Any]:
    mode = (settings.postgres_sslmode or "").strip().lower()
    if mode in {"disable", "allow"}:
        return {"ssl": False}
    if mode in {"verify-ca", "verify-full"}:
        return {"ssl": ssl.create_default_context()}
    return {"ssl": True}


async_engine = create_async_engine(
    _build_async_url(),
    connect_args=_connect_args(),
    pool_pre_ping=True,
)
async_session_maker = async_sessionmaker(expire_on_commit=False, bind=async_engine)


async def get_async_session() -> AsyncIterator[AsyncSession]:
    async with async_session_maker() as session:
        yield session
