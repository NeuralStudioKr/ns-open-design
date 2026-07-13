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
from .exception_handlers import register_exception_handlers
from .routers.auth import router as auth_router
from .routers.design_auth import router as design_auth_router
from .routers.bootstrap import router as bootstrap_router
from .routers.drive import router as drive_router
from .routers.health import router as health_router
from .routers.projects import router as projects_router
from .routers.token_usage import router as token_usage_router
from .routers.runtime_config import router as runtime_config_router
from .routers.internal_usage import router as internal_usage_router
from .routers.internal_billing import router as internal_billing_router
from .routers.usage_report import router as usage_report_router
from .routers.billing_report import router as billing_report_router
from .middleware.csrf import OriginGuardMiddleware
from .middleware.node_id import NodeIdMiddleware
from .middleware.slow_request import SlowRequestMiddleware
from .middleware.teamver_session import TeamverSessionMiddleware
from .teamver_sdk import teamver_client_lifespan

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with teamver_client_lifespan():
        try:
            await asyncio.to_thread(ensure_postgres_schema)
        except Exception:
            logger.exception("Postgres schema ensure failed")
            raise
        yield
    await async_engine.dispose()


app = FastAPI(title=settings.app_name, lifespan=lifespan)
register_exception_handlers(app)
_bff_secret = (settings.design_bff_session_secret or settings.teamver_jwt_secret or "dev-bff-session-secret").strip()
# Starlette wraps middlewares in REVERSE add order — the LAST add_middleware
# call becomes the OUTERMOST layer. Effective execution order for this stack:
#   request  → CORS → SlowRequest → OriginGuard → Session → endpoint
#   response ← CORS ← SlowRequest ← OriginGuard ← Session ← endpoint
# Consequences:
#  * CORS preflight (OPTIONS) short-circuits BEFORE SlowRequest → preflight
#    time is intentionally NOT counted toward p95.
#  * SlowRequest wraps OriginGuard + Session + endpoint → real user-facing
#    latency (origin rejects, session cookie work, endpoint) is fully
#    captured. This is what we want CloudWatch metric filters to score.
app.add_middleware(TeamverSessionMiddleware, secret_key=_bff_secret, same_site="lax")
app.add_middleware(OriginGuardMiddleware)
app.add_middleware(SlowRequestMiddleware)
# Node identity header (docs-teamver/39_2 · 39_5). Registered late so it
# is one of the outermost middlewares — the header is attached on the
# outgoing http.response.start regardless of downstream short-circuits
# (Origin guard 403, CORS preflight OPTIONS, etc.), keeping the target
# node discoverable even on error responses.
app.add_middleware(NodeIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    **build_fastapi_cors_kwargs(
        settings.cors_origins,
        cors_teamver_subdomain_regex=settings.cors_teamver_subdomain_regex,
    ),
)

app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(auth_router)
app.include_router(design_auth_router)
app.include_router(bootstrap_router)
app.include_router(drive_router)
app.include_router(runtime_config_router)
app.include_router(projects_router)
app.include_router(usage_report_router)
app.include_router(billing_report_router)
app.include_router(internal_usage_router)
app.include_router(internal_billing_router)
app.include_router(token_usage_router, prefix=settings.api_prefix)
