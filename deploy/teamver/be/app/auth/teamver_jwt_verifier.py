"""Main BE JWKS RS256 Apps JWT verification."""

from __future__ import annotations

import logging
import threading
from typing import Any, Optional

import jwt
from jwt import PyJWKClient

from ..config import settings

logger = logging.getLogger(__name__)

_jwks_lock = threading.Lock()
_cached_jwks_client: Optional[PyJWKClient] = None
_jwks_url_loaded: str = ""


def teamver_jwks_verifier_enabled() -> bool:
    return bool(
        (settings.teamver_jwks_url or "").strip()
        and (settings.teamver_jwt_issuer or "").strip()
        and (settings.teamver_jwt_audience or "").strip()
    )


def _get_jwks_client() -> PyJWKClient:
    global _cached_jwks_client, _jwks_url_loaded
    url = (settings.teamver_jwks_url or "").strip()
    ttl = max(60, int(settings.teamver_jwks_cache_ttl_sec or 900))
    with _jwks_lock:
        if _cached_jwks_client is None or _jwks_url_loaded != url:
            _cached_jwks_client = PyJWKClient(url, cache_keys=True, lifespan=ttl)
            _jwks_url_loaded = url
        return _cached_jwks_client


def decode_teamver_apps_jwt(token: str) -> dict[str, Any]:
    issuer = (settings.teamver_jwt_issuer or "").strip()
    audience = (settings.teamver_jwt_audience or "").strip()
    signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        issuer=issuer,
        audience=audience,
        options={"require": ["exp", "sub"]},
    )


def invalidate_jwks_cache() -> None:
    global _cached_jwks_client, _jwks_url_loaded
    with _jwks_lock:
        _cached_jwks_client = None
        _jwks_url_loaded = ""


def try_verify_teamver_jwt(token: str) -> Optional[dict[str, Any]]:
    if not teamver_jwks_verifier_enabled():
        return None
    try:
        return decode_teamver_apps_jwt(token)
    except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
        err = str(exc).lower()
        if "unable to find" in err or "kid" in err:
            invalidate_jwks_cache()
            try:
                return decode_teamver_apps_jwt(token)
            except (jwt.InvalidTokenError, jwt.PyJWKClientError):
                return None
        logger.debug("JWKS JWT verify failed: %s", exc)
        return None
