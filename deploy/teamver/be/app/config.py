from __future__ import annotations

import os
from urllib.parse import quote_plus

from pydantic import BaseModel, Field

from .env_loader import load_dotenv_files

load_dotenv_files()


def _env_bool(name: str, *, default: bool) -> bool:
    v = os.getenv(name)
    if v is None or not str(v).strip():
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "on"}


class Settings(BaseModel):
    app_name: str = "Teamver Design API"
    api_prefix: str = "/api"

    teamver_api_base_url: str = os.getenv("TEAMVER_API_BASE_URL", "http://localhost:8001")
    teamver_jwt_secret: str = os.getenv("TEAMVER_JWT_SECRET", "")
    teamver_jwt_algorithm: str = os.getenv("TEAMVER_JWT_ALGORITHM", "HS256")
    teamver_auth_cookie_name: str = os.getenv("TEAMVER_AUTH_COOKIE_NAME", "teamver_access_token")
    teamver_app_key: str = os.getenv("TEAMVER_APP_KEY", "design")
    teamver_internal_api_key: str = os.getenv("TEAMVER_INTERNAL_API_KEY", "")
    teamver_bootstrap_cache_ttl_seconds: float = float(
        os.getenv("TEAMVER_BOOTSTRAP_CACHE_TTL_SECONDS", "120")
    )
    teamver_http_timeout_seconds: float = float(os.getenv("TEAMVER_HTTP_TIMEOUT_SECONDS", "5"))
    teamver_bootstrap_enabled: bool = Field(
        default_factory=lambda: _env_bool("TEAMVER_BOOTSTRAP_ENABLED", default=True)
    )
    trust_teamver_proxy_headers: bool = Field(
        default_factory=lambda: _env_bool("TRUST_TEAMVER_PROXY_HEADERS", default=False)
    )

    # 로컬·데모 — Slide BFF ``ALLOW_NO_JWT_LOCAL_MODE`` 동형
    auth_disabled: bool = Field(default_factory=lambda: _env_bool("AUTH_DISABLED", default=False))
    allow_no_jwt_local_mode: bool = Field(
        default_factory=lambda: _env_bool("ALLOW_NO_JWT_LOCAL_MODE", default=True)
    )
    dev_user_id: str = os.getenv("DEV_USER_ID", "dev-user")
    dev_email: str = os.getenv("DEV_EMAIL", "dev@local.teamver")
    dev_display_name: str = os.getenv("DEV_DISPLAY_NAME", "Dev User")
    dev_workspace_id: str = os.getenv("DEV_WORKSPACE_ID", "dev-workspace")

    # Registry billing (Phase 2) — Admin 발급
    teamver_registry_app_id: str = os.getenv("TEAMVER_REGISTRY_APP_ID", "")
    teamver_registry_key_id: str = os.getenv("TEAMVER_REGISTRY_KEY_ID", "")
    teamver_registry_access_key: str = os.getenv("TEAMVER_REGISTRY_ACCESS_KEY", "")

    cors_origins: str = os.getenv("CORS_ORIGINS", "")
    cors_teamver_subdomain_regex: bool = Field(
        default_factory=lambda: _env_bool("CORS_TEAMVER_SUBDOMAIN_REGEX", default=True)
    )

    be_port: int = int(os.getenv("BE_PORT", "16000"))

    postgres_host: str = os.getenv("POSTGRES_HOST", "design-db")
    postgres_port: int = int(os.getenv("POSTGRES_PORT", "5432"))
    postgres_db: str = os.getenv("POSTGRES_DB", "teamver_design")
    postgres_user: str = os.getenv("POSTGRES_USER", "postgres")
    postgres_sslmode: str = os.getenv("POSTGRES_SSLMODE", "disable")
    postgres_reset_schema: bool = Field(
        default_factory=lambda: _env_bool("POSTGRES_RESET_SCHEMA", default=False)
    )

    @property
    def postgres_password(self) -> str | None:
        return os.getenv("POSTGRES_PASSWD") or os.getenv("POSTGRES_PASSWORD")

    @property
    def postgres_conninfo(self) -> str:
        password = self.postgres_password
        if not password:
            raise RuntimeError("POSTGRES_PASSWD or POSTGRES_PASSWORD is not set.")
        user = quote_plus(self.postgres_user)
        pw = quote_plus(password)
        db = quote_plus(self.postgres_db)
        return (
            f"postgresql://{user}:{pw}@{self.postgres_host}:{self.postgres_port}/{db}"
            f"?sslmode={quote_plus(self.postgres_sslmode)}"
        )


settings = Settings()
