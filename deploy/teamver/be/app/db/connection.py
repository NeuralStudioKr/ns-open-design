from __future__ import annotations

import os
import ssl
from typing import Any, AsyncIterator

from sqlalchemy.engine.url import URL
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from ..config import settings


def _pos_int_env(name: str, default: int, minimum: int = 0) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value >= minimum else default


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


# Multi-worker uvicorn 환경에서 각 워커가 독립 pool 을 가진다. RDS
# ``max_connections`` 초과를 피하기 위해 워커수 × (pool_size+max_overflow)
# 가 RDS 여유치 이내여야 한다 (t3.xlarge 상용 3 워커 × 20 = 60 curve).
# pool_recycle 은 RDS idle timeout (t3 계열 ~5–10min) 전에 재사용 커넥션을
# 강제 리사이클해 stale connection 요청 지연을 방지.
# pool_pre_ping=True: 재기동/네트워크 hiccup 방어 (요청당 +1ms).
#
# 모든 값이 env override 지원 — RDS 클래스 변경/부하 스파이크 대응에 재빌드
# 없이 조정. 상용 SSOT 는 .env.production.
_POOL_SIZE = _pos_int_env("DB_POOL_SIZE", default=10, minimum=1)
_MAX_OVERFLOW = _pos_int_env("DB_POOL_MAX_OVERFLOW", default=10, minimum=0)
_POOL_RECYCLE = _pos_int_env("DB_POOL_RECYCLE_SEC", default=1800, minimum=60)
_POOL_TIMEOUT = _pos_int_env("DB_POOL_TIMEOUT_SEC", default=30, minimum=1)

async_engine = create_async_engine(
    _build_async_url(),
    connect_args=_connect_args(),
    pool_pre_ping=True,
    pool_size=_POOL_SIZE,
    max_overflow=_MAX_OVERFLOW,
    pool_recycle=_POOL_RECYCLE,
    pool_timeout=_POOL_TIMEOUT,
)
async_session_maker = async_sessionmaker(expire_on_commit=False, bind=async_engine)


def get_pool_stats() -> dict[str, int | str]:
    """Non-secret pool observability for /api/healthz/deps.

    Uses SQLAlchemy pool ``status()`` accessors. Values are per-worker
    (uvicorn workers 는 별도 프로세스 → 별도 pool). CloudWatch 에서
    burst 를 감지하려면 워커별로 aggregation 필요.
    """
    pool = async_engine.pool
    try:
        return {
            "size": int(getattr(pool, "size", lambda: 0)()),
            "checked_out": int(getattr(pool, "checkedout", lambda: 0)()),
            "checked_in": int(getattr(pool, "checkedin", lambda: 0)()),
            "overflow": int(getattr(pool, "overflow", lambda: 0)()),
            "configured_size": _POOL_SIZE,
            "configured_max_overflow": _MAX_OVERFLOW,
        }
    except Exception:  # pragma: no cover — never surface pool errors as health
        return {
            "size": -1,
            "checked_out": -1,
            "checked_in": -1,
            "overflow": -1,
            "configured_size": _POOL_SIZE,
            "configured_max_overflow": _MAX_OVERFLOW,
        }


async def get_async_session() -> AsyncIterator[AsyncSession]:
    async with async_session_maker() as session:
        yield session
