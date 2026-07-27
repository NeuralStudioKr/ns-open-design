"""Shared Main SSO user identity helpers (hash only — no request/session deps)."""

from __future__ import annotations

import hashlib


def main_sso_user_identity_hash(user_id: str) -> str:
    """SHA-256 hex of casefolded user id — FE compare token without raw PII."""
    normalized = user_id.strip().casefold()
    if not normalized:
        return ""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()
