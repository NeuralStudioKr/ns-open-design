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


def _unverified_ssl_context() -> ssl.SSLContext:
    """TLS without cert verification — libpq ``sslmode=require`` / ``prefer``."""
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def _connect_args() -> dict[str, Any]:
    # libpq sslmode 매핑: AWS RDS 같이 self-signed CA chain 을 쓰는 환경에서
    # asyncpg의 ``ssl=True`` 디폴트(검증 ON) 가 verify-full 처럼 동작해 503/502
    # 가 났다. ``require`` 는 표준상 "암호화는 하되 cert 검증은 안 함" 이므로
    # verify-off SSL context 를 직접 넘긴다.
    mode = (settings.postgres_sslmode or "").strip().lower()
    if mode in {"disable", "allow"}:
        return {"ssl": False}
    if mode in {"verify-ca", "verify-full"}:
        return {"ssl": ssl.create_default_context()}
    if mode in {"", "prefer", "require"}:
        return {"ssl": _unverified_ssl_context()}
    # Unknown mode — still prefer encrypted but unverified over hard failure.
    return {"ssl": _unverified_ssl_context()}


async_engine = create_async_engine(
    _build_async_url(),
    connect_args=_connect_args(),
    pool_pre_ping=True,
)
async_session_maker = async_sessionmaker(expire_on_commit=False, bind=async_engine)


async def get_async_session() -> AsyncIterator[AsyncSession]:
    async with async_session_maker() as session:
        yield session
