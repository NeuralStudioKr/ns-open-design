"""Design run billing lifecycle — Registry Phase 2 (09 §3 / 11 §B-1..B-3).

Thin orchestrator on top of :mod:`teamver_billing` that:

- best-effort ``reserve_credits`` before a design run starts;
- ``commit_usage`` when the run succeeds;
- ``refund_usage`` when the run aborts.

The orchestrator MUST never break a run when registry credentials are not
configured (e.g. local dev, single-tenant standalone) — instead it logs a
``teamver_usage_5xx`` marker so the CloudWatch metric filter
(:file:`deploy/teamver/scripts/print_cloudwatch_alarm_commands.sh`) can pick it
up without alarming on benign credential-missing cases.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from ..config import settings
from . import teamver_billing

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReservationResult:
    """Outcome of :func:`reserve_run`.

    ``usage_id`` is ``None`` when registry credentials are not configured
    (caller can proceed without billing in dev/single-tenant). ``ok=False`` +
    ``usage_id=None`` means an unexpected error occurred — caller should refuse
    to start the run.
    """

    ok: bool
    usage_id: str | None
    raw: dict[str, Any] | None = None
    error: str | None = None


def _registry_configured() -> bool:
    return bool(
        (settings.teamver_registry_app_id or "").strip()
        and (settings.teamver_registry_key_id or "").strip()
        and (settings.teamver_registry_access_key or "").strip()
    )


def registry_configured() -> bool:
    """Public read-only accessor for healthz / status reporting.

    External callers (e.g. ``services/health_deps``) should use this instead
    of poking into ``settings`` directly so any future credential-source
    refactor (vault, instance metadata, …) stays encapsulated here.
    """
    return _registry_configured()


def _extract_usage_id(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    candidate = payload.get("usage_id") or payload.get("usageId")
    if isinstance(candidate, str) and candidate.strip():
        return candidate.strip()
    return None


async def reserve_run(
    *,
    workspace_id: str,
    amount: int,
    reason: str = "design_run",
) -> ReservationResult:
    workspace_id = (workspace_id or "").strip()
    if not workspace_id:
        return ReservationResult(ok=False, usage_id=None, error="missing_workspace_id")
    if amount < 0:
        return ReservationResult(ok=False, usage_id=None, error="invalid_amount")

    if not _registry_configured():
        logger.info(
            "billing reserve skipped — registry credentials not configured workspace=%s",
            workspace_id,
        )
        return ReservationResult(ok=True, usage_id=None, error="registry_not_configured")

    try:
        payload = await teamver_billing.reserve_credits(
            workspace_id=workspace_id,
            amount=amount,
            reason=reason,
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception(
            "teamver_usage_5xx billing reserve failed workspace=%s amount=%s",
            workspace_id,
            amount,
        )
        return ReservationResult(ok=False, usage_id=None, error=str(exc))

    usage_id = _extract_usage_id(payload)
    if not usage_id:
        logger.warning(
            "billing reserve returned no usage_id workspace=%s payload=%s",
            workspace_id,
            payload,
        )
        return ReservationResult(
            ok=False, usage_id=None, raw=payload, error="missing_usage_id"
        )
    return ReservationResult(ok=True, usage_id=usage_id, raw=payload)


async def commit_run(*, usage_id: str | None) -> bool:
    if not usage_id:
        return True
    try:
        await teamver_billing.commit_usage(usage_id=usage_id)
    except Exception:
        logger.exception(
            "teamver_usage_5xx billing commit failed usage_id=%s", usage_id
        )
        return False
    return True


async def refund_run(
    *, usage_id: str | None, reason: str = "design_run_failed"
) -> bool:
    if not usage_id:
        return True
    try:
        await teamver_billing.refund_usage(usage_id=usage_id, reason=reason)
    except Exception:
        logger.exception(
            "teamver_usage_5xx billing refund failed usage_id=%s reason=%s",
            usage_id,
            reason,
        )
        return False
    return True
