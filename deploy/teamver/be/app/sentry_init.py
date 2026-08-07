"""Sentry SDK bootstrap for teamver-design-api (neuralstudio / teamver-design-api)."""

from __future__ import annotations

import os

import sentry_sdk

# Public DSN for teamver-design-api — override with SENTRY_DSN in hosted env.
_DEFAULT_DSN = (
    "https://35a97b930ec504d4a813ad3a2133e816@o4511844488708096.ingest.us.sentry.io/4511868487139328"
)


def _sentry_before_send(event, hint):
    """
    Exclude auth/network noise from ingest (136 policy).
    Mirror: ns-worksp-be/main.py::_sentry_before_send
    """
    exc_info = (hint or {}).get("exc_info")
    if exc_info and len(exc_info) >= 2:
        exc = exc_info[1]
        code = getattr(exc, "status_code", None)
        if isinstance(code, int) and code in (401, 403, 404, 429):
            return None
        msg = str(exc).lower()
        for needle in (
            "invalid credentials",
            "unauthorized",
            "forbidden",
            "not authenticated",
            "permission denied",
            "authentication failed",
            "incorrect password",
        ):
            if needle in msg:
                return None

    message = (event.get("message") or "").lower()
    logentry = event.get("logentry") or {}
    formatted = (logentry.get("message") or logentry.get("formatted") or "").lower()
    blob = f"{message}\n{formatted}"
    for ex in (event.get("exception") or {}).get("values") or []:
        blob += f"\n{ex.get('type') or ''}\n{ex.get('value') or ''}"
    blob = blob.lower()
    for needle in (
        "invalid credentials",
        "unauthorized",
        "forbidden",
        "not authenticated",
        "permission denied",
        "authentication failed",
    ):
        if needle in blob:
            return None

    tags = event.get("tags") or {}
    if isinstance(tags, dict):
        status = tags.get("http.status_code") or tags.get("status_code")
        try:
            if int(status) in (401, 403, 404, 429):
                return None
        except (TypeError, ValueError):
            pass

    return event


def resolve_sentry_environment() -> str:
    explicit = (
        os.getenv("SENTRY_ENVIRONMENT")
        or os.getenv("TEAMVER_DEPLOY_ENV")
        or os.getenv("ENV")
        or ""
    ).strip()
    if explicit:
        return explicit
    return "local"


def init_sentry() -> None:
    traces_rate = os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")
    try:
        rate = float(traces_rate)
    except ValueError:
        rate = 0.1
    sentry_sdk.init(
        dsn=os.getenv("SENTRY_DSN", _DEFAULT_DSN),
        send_default_pii=True,
        traces_sample_rate=rate,
        environment=resolve_sentry_environment(),
        before_send=_sentry_before_send,
    )
