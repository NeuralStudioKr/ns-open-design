from __future__ import annotations

import asyncio
from http.cookies import SimpleCookie
from typing import Any

from app.middleware.teamver_session import TeamverSessionMiddleware


def _cookie_value(set_cookie: str) -> str:
    cookie = SimpleCookie()
    cookie.load(set_cookie)
    return next(iter(cookie.values())).value


async def _call_middleware(
    middleware: TeamverSessionMiddleware,
    *,
    cookie_header: str | None = None,
) -> list[dict[str, Any]]:
    sent: list[dict[str, Any]] = []
    headers: list[tuple[bytes, bytes]] = []
    if cookie_header:
        headers.append((b"cookie", cookie_header.encode("utf-8")))
    scope: dict[str, Any] = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/v1/auth/session",
        "raw_path": b"/api/v1/auth/session",
        "query_string": b"",
        "headers": headers,
        "client": ("testclient", 50000),
        "server": ("testserver", 443),
    }

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    await middleware(scope, receive, send)
    return sent


def _set_cookie_headers(messages: list[dict[str, Any]]) -> list[str]:
    for message in messages:
        if message["type"] != "http.response.start":
            continue
        return [
            value.decode("utf-8")
            for key, value in message.get("headers", [])
            if key.lower() == b"set-cookie"
        ]
    return []


def test_session_middleware_uses_app_specific_cookie_name() -> None:
    async def app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {"user_id": "u1", "access_token": "token"}
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = TeamverSessionMiddleware(
        app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
        legacy_session_cookies=("session",),
    )

    messages = asyncio.run(_call_middleware(middleware))
    cookies = _set_cookie_headers(messages)

    assert len(cookies) == 1
    assert cookies[0].startswith("teamver_design_bff_session=")
    assert "path=/" in cookies[0]


def test_session_middleware_migrates_legacy_session_cookie() -> None:
    async def seed_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {"user_id": "u1", "access_token": "legacy-token"}
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    legacy = TeamverSessionMiddleware(seed_app, secret_key="test-secret", session_cookie="session")
    legacy_messages = asyncio.run(_call_middleware(legacy))
    legacy_cookie = _cookie_value(_set_cookie_headers(legacy_messages)[0])

    seen: dict[str, Any] = {}

    async def app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        seen.update(scope["session"].get("teamver_bff_v1") or {})
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = TeamverSessionMiddleware(
        app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
        legacy_session_cookies=("session",),
    )

    messages = asyncio.run(_call_middleware(middleware, cookie_header=f"session={legacy_cookie}"))
    cookies = _set_cookie_headers(messages)

    assert seen == {"user_id": "u1", "access_token": "legacy-token"}
    assert len(cookies) == 2
    assert cookies[0].startswith("teamver_design_bff_session=")
    assert cookies[1].startswith("session=null")
    assert "expires=Thu, 01 Jan 1970" in cookies[1]


def test_session_middleware_ignores_foreign_generic_session_cookie() -> None:
    seen: dict[str, Any] = {}

    async def app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        seen.update(scope["session"])
        await send({"type": "http.response.start", "status": 204, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    middleware = TeamverSessionMiddleware(
        app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
        legacy_session_cookies=("session",),
    )

    messages = asyncio.run(_call_middleware(middleware, cookie_header="session=main-be-cookie"))

    assert seen == {}
    assert _set_cookie_headers(messages) == []


def test_session_middleware_omits_set_cookie_when_session_unchanged() -> None:
    """HA rotation-race: unmodified reads must not overwrite a sibling node's Set-Cookie."""

    async def seed_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {
            "user_id": "u1",
            "access_token": "a0",
            "refresh_token": "r0",
        }
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = TeamverSessionMiddleware(
        app=seed_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
    )
    seed_messages = asyncio.run(_call_middleware(middleware))
    seeded_cookie = _cookie_value(_set_cookie_headers(seed_messages)[0])

    seen: dict[str, Any] = {}

    async def read_only_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        seen.update(scope["session"].get("teamver_bff_v1") or {})
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    read_middleware = TeamverSessionMiddleware(
        app=read_only_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
    )
    messages = asyncio.run(
        _call_middleware(
            read_middleware,
            cookie_header=f"teamver_design_bff_session={seeded_cookie}",
        )
    )

    assert seen == {"user_id": "u1", "access_token": "a0", "refresh_token": "r0"}
    assert _set_cookie_headers(messages) == []


def test_session_middleware_reissues_cookie_when_session_mutated() -> None:
    async def seed_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {"user_id": "u1", "access_token": "a0"}
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    seed_middleware = TeamverSessionMiddleware(
        app=seed_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
    )
    seeded = _cookie_value(_set_cookie_headers(asyncio.run(_call_middleware(seed_middleware)))[0])

    async def rotate_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {"user_id": "u1", "access_token": "a1"}
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = TeamverSessionMiddleware(
        app=rotate_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
    )
    messages = asyncio.run(
        _call_middleware(
            middleware,
            cookie_header=f"teamver_design_bff_session={seeded}",
        )
    )
    cookies = _set_cookie_headers(messages)

    assert len(cookies) == 1
    assert cookies[0].startswith("teamver_design_bff_session=")
    assert _cookie_value(cookies[0]) != seeded


def test_session_middleware_still_migrates_legacy_cookie_without_mutation() -> None:
    """Legacy migration must happen on first sight even for read-only handlers."""

    async def seed_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {"user_id": "u1", "access_token": "legacy"}
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    legacy_middleware = TeamverSessionMiddleware(
        app=seed_app, secret_key="test-secret", session_cookie="session"
    )
    legacy_cookie = _cookie_value(
        _set_cookie_headers(asyncio.run(_call_middleware(legacy_middleware)))[0]
    )

    async def read_only_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = TeamverSessionMiddleware(
        app=read_only_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
        legacy_session_cookies=("session",),
    )
    messages = asyncio.run(
        _call_middleware(middleware, cookie_header=f"session={legacy_cookie}")
    )
    cookies = _set_cookie_headers(messages)

    assert len(cookies) == 2
    assert cookies[0].startswith("teamver_design_bff_session=")
    assert cookies[1].startswith("session=null")
    assert "expires=Thu, 01 Jan 1970" in cookies[1]


def test_session_middleware_deletes_cookie_when_session_cleared() -> None:
    async def seed_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {"user_id": "u1", "access_token": "a0"}
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    seed_middleware = TeamverSessionMiddleware(
        app=seed_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
        legacy_session_cookies=("session",),
    )
    seeded = _cookie_value(_set_cookie_headers(asyncio.run(_call_middleware(seed_middleware)))[0])

    async def clear_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"].clear()
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = TeamverSessionMiddleware(
        app=clear_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
        legacy_session_cookies=("session",),
    )
    messages = asyncio.run(
        _call_middleware(
            middleware,
            cookie_header=f"teamver_design_bff_session={seeded}",
        )
    )
    cookies = _set_cookie_headers(messages)

    assert len(cookies) == 2
    assert cookies[0].startswith("teamver_design_bff_session=null")
    assert cookies[1].startswith("session=null")
    assert all("expires=Thu, 01 Jan 1970" in cookie for cookie in cookies)


def test_session_middleware_suppresses_set_cookie_when_flag_set() -> None:
    async def suppress_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {"user_id": "u1", "access_token": "a1"}
        scope["teamver_suppress_session_cookie"] = True
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    middleware = TeamverSessionMiddleware(
        app=suppress_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
    )
    messages = asyncio.run(_call_middleware(middleware))

    assert _set_cookie_headers(messages) == []


def test_session_middleware_abandon_omits_delete_set_cookie() -> None:
    """HA-loser abandon must not emit delete Set-Cookie (sibling winner wipe)."""
    from app.auth.bff_session import abandon_bff_session_keep_browser_cookie
    from starlette.requests import Request

    async def seed_app(scope: dict[str, Any], _receive: Any, send: Any) -> None:
        scope["session"]["teamver_bff_v1"] = {"user_id": "u1", "access_token": "a0"}
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    seed_middleware = TeamverSessionMiddleware(
        app=seed_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
        legacy_session_cookies=("session",),
    )
    seeded = _cookie_value(_set_cookie_headers(asyncio.run(_call_middleware(seed_middleware)))[0])

    async def abandon_app(scope: dict[str, Any], receive: Any, send: Any) -> None:
        request = Request(scope, receive)
        abandon_bff_session_keep_browser_cookie(request)
        await send({"type": "http.response.start", "status": 401, "headers": []})
        await send({"type": "http.response.body", "body": b"expired"})

    middleware = TeamverSessionMiddleware(
        app=abandon_app,
        secret_key="test-secret",
        session_cookie="teamver_design_bff_session",
        legacy_session_cookies=("session",),
    )
    messages = asyncio.run(
        _call_middleware(
            middleware,
            cookie_header=f"teamver_design_bff_session={seeded}",
        )
    )

    assert _set_cookie_headers(messages) == []
