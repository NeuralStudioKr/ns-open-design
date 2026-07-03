from __future__ import annotations

import os
from urllib.parse import quote_plus

from pydantic import BaseModel, Field, model_validator

from .env_loader import load_dotenv_files

load_dotenv_files()


def _env_bool(name: str, *, default: bool) -> bool:
    v = os.getenv(name)
    if v is None or not str(v).strip():
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "on"}


def _env_nonneg_int(name: str, *, default: int = 0) -> int:
    v = os.getenv(name)
    if v is None or not str(v).strip():
        return default
    try:
        return max(0, int(str(v).strip()))
    except ValueError:
        return default


class Settings(BaseModel):
    app_name: str = "Teamver Design API"
    api_prefix: str = "/api"
    deploy_env: str = os.getenv("TEAMVER_DEPLOY_ENV", "local")

    teamver_api_base_url: str = os.getenv("TEAMVER_API_BASE_URL", "http://localhost:8001")
    teamver_jwt_secret: str = os.getenv("TEAMVER_JWT_SECRET", "")
    teamver_jwt_algorithm: str = os.getenv("TEAMVER_JWT_ALGORITHM", "HS256")
    teamver_jwt_issuer: str = os.getenv("TEAMVER_JWT_ISSUER", "")
    teamver_jwks_url: str = os.getenv("TEAMVER_JWKS_URL", "")
    teamver_jwt_audience: str = os.getenv("TEAMVER_JWT_AUDIENCE", "teamver-design")
    teamver_jwks_cache_ttl_sec: int = int(os.getenv("TEAMVER_JWKS_CACHE_TTL_SEC", "900"))
    teamver_main_login_url: str = os.getenv("TEAMVER_MAIN_LOGIN_URL", "")
    teamver_bff_session_enabled: bool = Field(
        default_factory=lambda: _env_bool("TEAMVER_BFF_SESSION_ENABLED", default=True)
    )
    design_bff_session_secret: str = os.getenv("DESIGN_BFF_SESSION_SECRET", "")
    design_public_origin: str = os.getenv("DESIGN_PUBLIC_ORIGIN", "")
    teamver_bootstrap_cache_stale_grace_seconds: float = float(
        os.getenv("TEAMVER_BOOTSTRAP_CACHE_STALE_GRACE_SECONDS", "300")
    )
    teamver_auth_cookie_name: str = os.getenv("TEAMVER_AUTH_COOKIE_NAME", "teamver_access_token")
    teamver_auth_cookie_domain: str = os.getenv("TEAMVER_AUTH_COOKIE_DOMAIN", "")
    teamver_auth_cookie_secure: bool = Field(
        default_factory=lambda: _env_bool("TEAMVER_AUTH_COOKIE_SECURE", default=True)
    )
    teamver_auth_cookie_samesite: str = os.getenv("TEAMVER_AUTH_COOKIE_SAMESITE", "lax")
    teamver_app_key: str = os.getenv("TEAMVER_APP_KEY", "design")
    teamver_internal_api_key: str = os.getenv("TEAMVER_INTERNAL_API_KEY", "")
    teamver_bootstrap_cache_ttl_seconds: float = float(
        os.getenv("TEAMVER_BOOTSTRAP_CACHE_TTL_SECONDS", "120")
    )
    teamver_http_timeout_seconds: float = float(os.getenv("TEAMVER_HTTP_TIMEOUT_SECONDS", "5"))
    teamver_drive_proxy_long_timeout_seconds: float = float(
        os.getenv("TEAMVER_DRIVE_PROXY_LONG_TIMEOUT_SECONDS", "30")
    )
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
    teamver_billing_disabled: bool = Field(
        default_factory=lambda: _env_bool("TEAMVER_BILLING_DISABLED", default=False)
    )
    teamver_billing_reserve_amount: int = Field(
        default_factory=lambda: _env_nonneg_int("TEAMVER_BILLING_RESERVE_AMOUNT", default=0)
    )
    design_billing_max_reserve_t: int = Field(
        default_factory=lambda: _env_nonneg_int("DESIGN_BILLING_MAX_RESERVE_T", default=0)
    )
    design_billing_reserve_input_tokens: int = Field(
        default_factory=lambda: _env_nonneg_int("DESIGN_BILLING_RESERVE_INPUT_TOKENS", default=32_000)
    )
    design_billing_reserve_output_tokens: int = Field(
        default_factory=lambda: _env_nonneg_int("DESIGN_BILLING_RESERVE_OUTPUT_TOKENS", default=8192)
    )
    design_model_prices_json: str = os.getenv("DESIGN_MODEL_PRICES_JSON", "")

    # Embed managed API mode — server env only (never VITE_* / git)
    teamver_od_api_protocol: str = os.getenv("TEAMVER_OD_API_PROTOCOL", "anthropic")
    teamver_od_api_base_url: str = os.getenv(
        "TEAMVER_OD_API_BASE_URL", "https://api.anthropic.com"
    )
    teamver_od_api_model: str = os.getenv("TEAMVER_OD_API_MODEL", "claude-sonnet-4-6")
    teamver_od_api_key: str = os.getenv("TEAMVER_OD_API_KEY", "")
    teamver_od_anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")

    cors_origins: str = os.getenv("CORS_ORIGINS", "")
    cors_teamver_subdomain_regex: bool = Field(
        default_factory=lambda: _env_bool("CORS_TEAMVER_SUBDOMAIN_REGEX", default=True)
    )

    be_port: int = int(os.getenv("BE_PORT", "16000"))

    od_daemon_base_url: str = os.getenv("OD_DAEMON_BASE_URL", "http://127.0.0.1:7456")
    od_api_token: str = os.getenv("OD_API_TOKEN", "")
    od_daemon_timeout_seconds: float = float(os.getenv("OD_DAEMON_TIMEOUT_SECONDS", "120"))
    # Observability only — mirrors daemon compose env (healthz/deps config block).
    od_project_storage: str = os.getenv("OD_PROJECT_STORAGE", "local")
    # Optional default Drive folder for publish (workspace folder id).
    teamver_drive_publish_folder_id: str = os.getenv("TEAMVER_DRIVE_PUBLISH_FOLDER_ID", "")
    # Safety net for Drive presigned endpoints that reject async streaming PUT.
    # Normal path stays streamed; fallback is used only after a stream PUT failure.
    teamver_drive_publish_stream_fallback_max_bytes: int = Field(
        default_factory=lambda: _env_nonneg_int(
            "TEAMVER_DRIVE_PUBLISH_STREAM_FALLBACK_MAX_BYTES",
            default=67_108_864,
        )
    )

    postgres_host: str = os.getenv("POSTGRES_HOST", "design-db")
    postgres_port: int = int(os.getenv("POSTGRES_PORT", "5432"))
    postgres_db: str = os.getenv("POSTGRES_DB", "teamver_design")
    postgres_user: str = os.getenv("POSTGRES_USER", "postgres")
    postgres_sslmode: str = os.getenv("POSTGRES_SSLMODE", "disable")
    postgres_reset_schema: bool = Field(
        default_factory=lambda: _env_bool("POSTGRES_RESET_SCHEMA", default=False)
    )

    @model_validator(mode="after")
    def validate_hosted_guards(self) -> "Settings":
        deploy_env = self.deploy_env.strip().lower()
        if deploy_env not in {"staging", "production"}:
            return self
        if self.od_project_storage.strip().lower() != "s3":
            raise ValueError(f"OD_PROJECT_STORAGE=s3 is required in {deploy_env}")
        if self.auth_disabled or self.allow_no_jwt_local_mode:
            raise ValueError(f"local auth fallback is forbidden in {deploy_env}")
        if not self.teamver_internal_api_key.strip():
            raise ValueError(f"TEAMVER_INTERNAL_API_KEY is required in {deploy_env}")
        if self.teamver_jwt_secret.strip():
            raise ValueError(f"TEAMVER_JWT_SECRET is forbidden in {deploy_env} — use JWKS RS256")
        if not (self.teamver_jwks_url or "").strip():
            raise ValueError(f"TEAMVER_JWKS_URL is required in {deploy_env}")
        if not (self.teamver_jwt_issuer or "").strip():
            raise ValueError(f"TEAMVER_JWT_ISSUER is required in {deploy_env}")
        if not (self.teamver_jwt_audience or "").strip():
            raise ValueError(f"TEAMVER_JWT_AUDIENCE is required in {deploy_env}")
        if self.teamver_bff_session_enabled and not self.design_bff_session_secret.strip():
            raise ValueError(f"DESIGN_BFF_SESSION_SECRET is required in {deploy_env}")
        if not (self.teamver_main_login_url or "").strip():
            raise ValueError(f"TEAMVER_MAIN_LOGIN_URL is required in {deploy_env}")
        if not self.teamver_od_api_key.strip():
            raise ValueError(f"TEAMVER_OD_API_KEY is required in {deploy_env}")
        registry_configured = all(
            value.strip()
            for value in (
                self.teamver_registry_app_id,
                self.teamver_registry_key_id,
                self.teamver_registry_access_key,
            )
        )
        if not registry_configured and not self.teamver_billing_disabled:
            raise ValueError(
                f"TEAMVER_REGISTRY_* credentials or TEAMVER_BILLING_DISABLED=1 "
                f"are required in {deploy_env}"
            )
        return self

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
