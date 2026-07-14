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

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        connection = HTTPConnection(scope)
        initial_session_was_empty = True

        loaded_session = None
        if self.session_cookie in connection.cookies:
            loaded_session = self._load_cookie_session(connection.cookies[self.session_cookie])
        if loaded_session is None:
            for cookie_name in self.legacy_session_cookies:
                if cookie_name not in connection.cookies:
                    continue
                loaded_session = self._load_cookie_session(connection.cookies[cookie_name])
                if loaded_session is not None:
                    break

        if loaded_session is not None:
            scope["session"] = loaded_session
            initial_session_was_empty = False
        else:
            scope["session"] = {}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                if scope.get(SUPPRESS_SESSION_COOKIE_SCOPE_KEY):
                    await send(message)
                    return
                if scope["session"]:
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
            await send(message)

        await self.app(scope, receive, send_wrapper)
