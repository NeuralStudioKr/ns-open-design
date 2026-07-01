"""Teamver Apps JWT resolution — JWKS RS256 with HS256 local fallback."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Optional

import jwt
from fastapi import Request

from ..config import settings
from .teamver_jwt_verifier import teamver_jwks_verifier_enabled, try_verify_teamver_jwt

AuthSource = Literal["bearer", "cookie"]


@dataclass(frozen=True)
class TeamverJwtContext:
    authenticated: bool
    user_id: Optional[str] = None
    bearer_token: Optional[str] = None
    auth_source: Optional[AuthSource] = None


def extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return authorization.strip() or None


def user_id_from_payload(payload: dict[str, Any]) -> Optional[str]:
    user_id = str(payload.get("user_id") or payload.get("sub") or "").strip()
    return user_id or None


def _jwt_header_alg(token: str) -> str | None:
    raw = (token or "").strip()
    if raw.count(".") != 2:
        return None
    try:
        header = jwt.get_unverified_header(raw)
        alg = header.get("alg")
        return str(alg).strip() if alg else None
    except jwt.InvalidTokenError:
        return None


def resolve_teamver_jwt(
    *,
    authorization: Optional[str] = None,
    cookie_token: Optional[str] = None,
) -> TeamverJwtContext:
    token = extract_bearer(authorization)
    source: AuthSource | None = None
    if not token and cookie_token and cookie_token.strip():
        token = cookie_token.strip()
        source = "cookie"
    elif token:
        source = "bearer"

    if not token:
        return TeamverJwtContext(authenticated=False)

    if teamver_jwks_verifier_enabled():
        payload = try_verify_teamver_jwt(token)
        if payload:
            user_id = user_id_from_payload(payload)
            if user_id:
                return TeamverJwtContext(
                    authenticated=True,
                    user_id=user_id,
                    bearer_token=token,
                    auth_source=source,
                )

    secret = (settings.teamver_jwt_secret or "").strip()
    algo = settings.teamver_jwt_algorithm or "HS256"
    if not secret:
        return TeamverJwtContext(authenticated=False, bearer_token=token, auth_source=source)

    header_alg = (_jwt_header_alg(token) or "").upper()
    if header_alg == "RS256" and teamver_jwks_verifier_enabled():
        return TeamverJwtContext(authenticated=False, bearer_token=token, auth_source=source)

    try:
        payload = jwt.decode(token, secret, algorithms=[algo])
        user_id = user_id_from_payload(payload)
        if not user_id:
            return TeamverJwtContext(authenticated=False, bearer_token=token, auth_source=source)
        return TeamverJwtContext(
            authenticated=True,
            user_id=user_id,
            bearer_token=token,
            auth_source=source,
        )
    except jwt.InvalidTokenError:
        return TeamverJwtContext(authenticated=False, bearer_token=token, auth_source=source)


def teamver_jwt_from_request(request: Request) -> TeamverJwtContext:
    cookie_name = (settings.teamver_auth_cookie_name or "teamver_access_token").strip()
    return resolve_teamver_jwt(
        authorization=request.headers.get("authorization") or request.headers.get("Authorization"),
        cookie_token=request.cookies.get(cookie_name),
    )
