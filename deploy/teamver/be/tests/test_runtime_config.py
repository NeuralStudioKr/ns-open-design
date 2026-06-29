from __future__ import annotations

import os

import pytest

os.environ.setdefault("POSTGRES_PASSWORD", "test")

from app.services import od_runtime_config
from app.config import settings


@pytest.fixture(autouse=True)
def _reset_runtime_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_od_api_key", "")
    monkeypatch.setattr(settings, "teamver_od_anthropic_api_key", "")
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "anthropic")
    monkeypatch.setattr(settings, "teamver_od_api_base_url", "https://api.anthropic.com")
    monkeypatch.setattr(settings, "teamver_od_api_model", "claude-sonnet-4-6")


def test_runtime_config_unconfigured_when_no_key() -> None:
    payload = od_runtime_config.resolve_od_runtime_config_payload()
    assert payload == {"configured": False}


def test_runtime_config_from_teamver_od_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_od_api_key", "sk-teamver-managed")
    payload = od_runtime_config.resolve_od_runtime_config_payload()
    assert payload["configured"] is True
    assert payload["apiKeyConfigured"] is True
    assert "apiKey" not in payload
    assert payload["apiProtocol"] == "anthropic"
    assert payload["model"] == "claude-sonnet-4-6"


def test_runtime_config_falls_back_to_anthropic_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_od_anthropic_api_key", "sk-anthropic-fallback")
    payload = od_runtime_config.resolve_od_runtime_config_payload()
    assert payload["configured"] is True
    assert payload["apiKeyConfigured"] is True
    assert "apiKey" not in payload


def test_runtime_config_invalid_protocol_defaults_to_anthropic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_od_api_key", "sk-x")
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "not-a-provider")
    payload = od_runtime_config.resolve_od_runtime_config_payload()
    assert payload["apiProtocol"] == "anthropic"
    assert "apiKey" not in payload


def test_runtime_config_normalizes_legacy_anthropic_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_od_api_key", "sk-x")
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "anthropic")
    monkeypatch.setattr(settings, "teamver_od_api_model", "claude-sonnet-4-5")
    payload = od_runtime_config.resolve_od_runtime_config_payload()
    assert payload["model"] == "claude-sonnet-4-6"
