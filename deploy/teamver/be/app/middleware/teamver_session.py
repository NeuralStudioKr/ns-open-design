"""Session cookie middleware with opt-out for stale multi-node responses."""

from __future__ import annotations

import typing
from base64 import b64decode, b64encode
import json

import itsdangerous
from itsdangerous.exc import BadSignature
from starlette.datastructures import MutableHeaders, Secret
from starlette.requests import HTTPConnection
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ..auth.bff_session import SUPPRESS_SESSION_COOKIE_SCOPE_KEY


class TeamverSessionMiddleware:
    """Starlette SessionMiddleware + suppress flag for stale Set-Cookie races."""

    def __init__(
        self,
        app: ASGIApp,
        secret_key: str | Secret,
        session_cookie: str = "session",
        max_age: int | None = 14 * 24 * 60 * 60,
        path: str = "/",
        same_site: typing.Literal["lax", "strict", "none"] = "lax",
        https_only: bool = False,
        domain: str | None = None,
        legacy_session_cookies: typing.Sequence[str] = (),
    ) -> None:
        self.app = app
        self.signer = itsdangerous.TimestampSigner(str(secret_key))
        self.session_cookie = session_cookie
        self.max_age = max_age
        self.path = path
        self.legacy_session_cookies = tuple(
            cookie for cookie in legacy_session_cookies if cookie and cookie != session_cookie
        )
        self.security_flags = "httponly; samesite=" + same_site
        if https_only:
            self.security_flags += "; secure"
        if domain is not None:
            self.security_flags += f"; domain={domain}"

    def _load_cookie_session(self, value: str) -> dict[str, typing.Any] | None:
        data = value.encode("utf-8")
        try:
            unsigned = self.signer.unsign(data, max_age=self.max_age)
            loaded = json.loads(b64decode(unsigned))
        except (BadSignature, ValueError, json.JSONDecodeError):
            return None
        if isinstance(loaded, dict):
            return loaded
        return None

    @staticmethod
    def _stable_dump(payload: dict[str, typing.Any]) -> str:
        return json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        connection = HTTPConnection(scope)
        initial_session_was_empty = True

        loaded_session = None
        source_cookie_name: str | None = None
        if self.session_cookie in connection.cookies:
            loaded_session = self._load_cookie_session(connection.cookies[self.session_cookie])
            if loaded_session is not None:
                source_cookie_name = self.session_cookie
        if loaded_session is None:
            for cookie_name in self.legacy_session_cookies:
                if cookie_name not in connection.cookies:
                    continue
                loaded_session = self._load_cookie_session(connection.cookies[cookie_name])
                if loaded_session is not None:
                    source_cookie_name = cookie_name
                    break

        if loaded_session is not None:
            scope["session"] = loaded_session
            initial_session_was_empty = False
            initial_serialized: str | None = self._stable_dump(loaded_session)
        else:
            scope["session"] = {}
            initial_serialized = None

        # Legacy cookies MUST be migrated on first sight: emit Set-Cookie for the
        # canonical name even when the handler does not mutate the session, so
        # subsequent requests carry the app-specific cookie.
        must_migrate_legacy_cookie = (
            source_cookie_name is not None and source_cookie_name != self.session_cookie
        )

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                if scope.get(SUPPRESS_SESSION_COOKIE_SCOPE_KEY):
                    await send(message)
                    return
                if scope["session"]:
                    current_serialized = self._stable_dump(scope["session"])
                    if (
                        current_serialized == initial_serialized
                        and not must_migrate_legacy_cookie
                    ):
                        # Session was not mutated on this request. Re-signing and
                        # re-emitting the same signed value on every response would
                        # overwrite a sibling ALB node's freshly rotated Set-Cookie
                        # in the browser and force a session_expired cascade on the
                        # next refresh. Stay silent so the winning node's cookie
                        # can propagate unopposed.
                        # See docs-teamver/39_10_HA_세션쿠키_경합_해결.md.
                        await send(message)
                        return
                    data = b64encode(json.dumps(scope["session"]).encode("utf-8"))
                    data = self.signer.sign(data)
                    headers = MutableHeaders(scope=message)
                    header_value = (
                        "{session_cookie}={data}; path={path}; {max_age}{security_flags}".format(
                            session_cookie=self.session_cookie,
                            data=data.decode("utf-8"),
                            path=self.path,
                            max_age=f"Max-Age={self.max_age}; " if self.max_age else "",
                            security_flags=self.security_flags,
                        )
                    )
                    headers.append("Set-Cookie", header_value)
                    if must_migrate_legacy_cookie:
                        # Expire the Design host-only legacy cookie so logout /
                        # hard-clear cannot be undone by legacy-name fallback.
                        for legacy_name in self.legacy_session_cookies:
                            headers.append(
                                "Set-Cookie",
                                (
                                    "{cookie}=null; path={path}; "
                                    "expires=Thu, 01 Jan 1970 00:00:00 GMT; "
                                    "{security_flags}"
                                ).format(
                                    cookie=legacy_name,
                                    path=self.path,
                                    security_flags=self.security_flags,
                                ),
                            )
                elif not initial_session_was_empty:
                    headers = MutableHeaders(scope=message)
                    header_value = (
                        "{session_cookie}={data}; path={path}; {expires}{security_flags}".format(
                            session_cookie=self.session_cookie,
                            data="null",
                            path=self.path,
                            expires="expires=Thu, 01 Jan 1970 00:00:00 GMT; ",
                            security_flags=self.security_flags,
                        )
                    )
                    headers.append("Set-Cookie", header_value)
                    # Also wipe any legacy sibling that might resurrect the
                    # session on the next request via fallback load.
                    for legacy_name in self.legacy_session_cookies:
                        headers.append(
                            "Set-Cookie",
                            (
                                "{cookie}=null; path={path}; "
                                "expires=Thu, 01 Jan 1970 00:00:00 GMT; "
                                "{security_flags}"
                            ).format(
                                cookie=legacy_name,
                                path=self.path,
                                security_flags=self.security_flags,
                            ),
                        )
            await send(message)

        await self.app(scope, receive, send_wrapper)
