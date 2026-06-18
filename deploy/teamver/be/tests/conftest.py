"""Pytest bootstrap — stub teamver-app-sdk when wheel is not installed locally."""
from __future__ import annotations

import importlib.util
import sys
import types
from typing import Any


def _ensure_teamver_sdk_stub() -> None:
    if importlib.util.find_spec("teamver_app_sdk") is not None:
        return
    if "teamver_app_sdk" in sys.modules:
        return

    root = types.ModuleType("teamver_app_sdk")

    class TeamverAppClient:
        @classmethod
        def from_env(cls, **_: Any) -> "TeamverAppClient":
            return cls()

        async def aclose(self) -> None:
            return None

        def __init__(self) -> None:
            self.config = types.SimpleNamespace(auth_cookie_name="teamver_access_token")
            self.drive = types.SimpleNamespace()

    root.TeamverAppClient = TeamverAppClient

    errors = types.ModuleType("teamver_app_sdk.errors")

    class TeamverAPIError(Exception):
        status_code: int | None = None
        code: str | None = None
        response_body: object = None
        params: object = None

    class AuthenticationError(TeamverAPIError):
        pass

    class MainBEUnavailableError(TeamverAPIError):
        pass

    class AppDisabledError(TeamverAPIError):
        pass

    class PermissionDeniedError(TeamverAPIError):
        pass

    class WorkspaceNotFoundError(TeamverAPIError):
        pass

    for name, cls in [
        ("TeamverAPIError", TeamverAPIError),
        ("AuthenticationError", AuthenticationError),
        ("MainBEUnavailableError", MainBEUnavailableError),
        ("AppDisabledError", AppDisabledError),
        ("PermissionDeniedError", PermissionDeniedError),
        ("WorkspaceNotFoundError", WorkspaceNotFoundError),
    ]:
        setattr(errors, name, cls)

    auth = types.ModuleType("teamver_app_sdk.auth")

    def extract_access_token_from_headers(
        *,
        authorization: str | None = None,
        cookie_token: str | None = None,
        **_kwargs: Any,
    ) -> str | None:
        if cookie_token:
            return cookie_token
        if authorization and authorization.lower().startswith("bearer "):
            return authorization[7:].strip() or None
        return None

    auth.extract_access_token_from_headers = extract_access_token_from_headers

    models = types.ModuleType("teamver_app_sdk.models")
    models.AppContext = object
    models.AppBootstrap = object
    models.WorkspacePermissions = object

    enums = types.ModuleType("teamver_app_sdk.enums")

    class AppKey:
        DESIGN = "design"

    enums.AppKey = AppKey

    registry = types.ModuleType("teamver_app_sdk.registry")

    class AppServiceRegistryCredentials:
        def __init__(self, **kwargs: Any) -> None:
            for k, v in kwargs.items():
                setattr(self, k, v)

    class BillingClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.args = args
            self.kwargs = kwargs

        async def reserve(self, *args: Any, **kwargs: Any) -> Any:
            return None

        async def commit(self, *args: Any, **kwargs: Any) -> Any:
            return None

        async def refund(self, *args: Any, **kwargs: Any) -> Any:
            return None

        async def aclose(self) -> None:
            return None

    registry.AppServiceRegistryCredentials = AppServiceRegistryCredentials
    registry.BillingClient = BillingClient

    fastapi_mod = types.ModuleType("teamver_app_sdk.integrations.fastapi")

    def create_teamver_context_dependency(*_: Any, **__: Any):
        async def _dep(**___: Any):
            raise RuntimeError("teamver context stub")

        return _dep

    def require_teamver_internal_api_key(expected_key: str):
        from fastapi import Header

        async def _dep(
            x_teamver_internal_api_key: str | None = Header(default=None, alias="X-Teamver-Internal-Api-Key"),
        ) -> bool:
            if not expected_key:
                from fastapi import HTTPException

                raise HTTPException(status_code=500, detail="internal_api_key_not_configured")
            if (x_teamver_internal_api_key or "").strip() != expected_key.strip():
                from fastapi import HTTPException

                raise HTTPException(status_code=401, detail="invalid_internal_api_key")
            return True

        return _dep

    fastapi_mod.create_teamver_context_dependency = create_teamver_context_dependency
    fastapi_mod.require_teamver_internal_api_key = require_teamver_internal_api_key

    sys.modules["teamver_app_sdk"] = root
    sys.modules["teamver_app_sdk.errors"] = errors
    sys.modules["teamver_app_sdk.auth"] = auth
    sys.modules["teamver_app_sdk.models"] = models
    sys.modules["teamver_app_sdk.enums"] = enums
    sys.modules["teamver_app_sdk.registry"] = registry
    sys.modules["teamver_app_sdk.integrations"] = types.ModuleType("teamver_app_sdk.integrations")
    sys.modules["teamver_app_sdk.integrations.fastapi"] = fastapi_mod


_ensure_teamver_sdk_stub()
