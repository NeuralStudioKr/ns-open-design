"""Node identity response header for Design multi-node deployments.

docs-teamver/39_2 (userId hash routing) / 39_5 (검증 체크리스트) — every
response carries ``X-Design-Api-Node`` so operators can confirm which
EC2 replica served a request. Complements the daemon-side
``X-OD-Node-Id`` header (server.ts). Single-node deploys (no
``TEAMVER_DESIGN_NODE_ID`` env) skip the header entirely so behaviour
is unchanged for pre-Phase-4 environments.

Pure ASGI middleware — no BaseHTTPMiddleware — because we only mutate
response headers on the outgoing ``http.response.start`` message.
Zero coroutine-body copy, safe for both buffered JSON and any future
streaming responses.
"""

from __future__ import annotations

import os
from typing import Awaitable, Callable

from starlette.types import ASGIApp, Message, Receive, Scope, Send


def _resolve_node_id() -> str:
    return (os.getenv("TEAMVER_DESIGN_NODE_ID") or "").strip()


class NodeIdMiddleware:
    """Attach ``X-Design-Api-Node`` header when ``TEAMVER_DESIGN_NODE_ID``
    is set. Skipped otherwise (single-node behaviour preserved).

    ``node_id`` is captured at construction time — uvicorn spawns workers
    via fork *after* env is finalised, so per-worker overhead is zero.
    """

    def __init__(self, app: ASGIApp, *, node_id: str | None = None) -> None:
        self._app = app
        self._node_id = node_id if node_id is not None else _resolve_node_id()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self._node_id:
            await self._app(scope, receive, send)
            return

        header_value = self._node_id.encode("latin-1")

        async def send_with_node_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                # Preserve any pre-existing value — never overwrite so a
                # downstream router that explicitly emits a different node
                # id (e.g. proxied response from another host in a rare
                # M2M path) wins. In practice this middleware runs closest
                # to the ASGI boundary so we set the value ourselves.
                if not any(h[0].lower() == b"x-design-api-node" for h in headers):
                    headers.append((b"x-design-api-node", header_value))
                    message = {**message, "headers": headers}
            await send(message)

        await self._app(scope, receive, send_with_node_id)


__all__ = ["NodeIdMiddleware"]
