from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .cors import build_fastapi_cors_kwargs
from .db.connection import async_engine
from .db.schema_bootstrap import ensure_postgres_schema
from .routers.auth import router as auth_router
from .routers.bootstrap import router as bootstrap_router
from .routers.health import router as health_router
from .routers.token_usage import router as token_usage_router
from .routers.usage_report import router as usage_report_router
from .teamver_sdk import teamver_client_lifespan

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with teamver_client_lifespan():
        await asyncio.to_thread(ensure_postgres_schema)
        yield
    await async_engine.dispose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    **build_fastapi_cors_kwargs(
        settings.cors_origins,
        cors_teamver_subdomain_regex=settings.cors_teamver_subdomain_regex,
    ),
)

app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(auth_router)
app.include_router(bootstrap_router)
app.include_router(usage_report_router)
app.include_router(token_usage_router, prefix=settings.api_prefix)
