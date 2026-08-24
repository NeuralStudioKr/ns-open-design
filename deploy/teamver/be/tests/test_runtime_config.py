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
    monkeypatch.setattr(settings, "teamver_minimax_api_key", "")
    monkeypatch.setattr(settings, "od_minimax_api_key", "")
    monkeypatch.setattr(settings, "minimax_api_key", "")
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "anthropic")
    monkeypatch.setattr(settings, "teamver_design_default_provider", "")
    monkeypatch.setattr(settings, "teamver_od_api_base_url", "https://api.anthropic.com")
    monkeypatch.setattr(settings, "teamver_od_api_model", "claude-sonnet-4-6")
    monkeypatch.setattr(settings, "teamver_minimax_configured", False)
    monkeypatch.setattr(settings, "teamver_minimax_enabled", False)
    monkeypatch.setattr(settings, "teamver_minimax_base_url", "https://api.minimax.io/v1")
    monkeypatch.setattr(settings, "teamver_minimax_chat_model", "MiniMax-M3")


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


def test_runtime_config_minimax_requires_configured_flag(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "minimax")
    monkeypatch.setattr(settings, "teamver_minimax_configured", False)
    payload = od_runtime_config.resolve_od_runtime_config_payload()
    assert payload == {"configured": False}


def test_runtime_config_minimax_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "minimax")
    monkeypatch.setattr(settings, "teamver_minimax_configured", True)
    payload = od_runtime_config.resolve_od_runtime_config_payload()
    assert payload["configured"] is True
    assert payload["apiKeyConfigured"] is True
    assert "apiKey" not in payload
    assert payload["apiProtocol"] == "minimax"
    assert payload["model"] == "MiniMax-M3"
    assert "minimax.io" in payload["baseUrl"]


def test_runtime_config_from_minimax_managed_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_minimax_api_key", "sk-cp-managed")
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "minimax")
    monkeypatch.setattr(settings, "teamver_od_api_base_url", "")
    monkeypatch.setattr(settings, "teamver_od_api_model", "")

    payload = od_runtime_config.resolve_od_runtime_config_payload()

    assert payload["configured"] is True
    assert payload["apiKeyConfigured"] is True
    assert payload["apiProtocol"] == "minimax"
    assert payload["baseUrl"] == "https://api.minimax.io/v1"
    assert payload["model"] == "MiniMax-M3"
    assert "apiKey" not in payload


def test_runtime_config_from_minimax_default_provider_without_explicit_protocol(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "teamver_minimax_api_key", "sk-cp-managed")
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "")
    monkeypatch.setattr(settings, "teamver_design_default_provider", "minimax")
    monkeypatch.setattr(settings, "teamver_od_api_base_url", "https://api.anthropic.com")
    monkeypatch.setattr(settings, "teamver_od_api_model", "claude-sonnet-4-6")

    payload = od_runtime_config.resolve_od_runtime_config_payload()

    assert payload["configured"] is True
    assert payload["apiProtocol"] == "minimax"
    assert payload["baseUrl"] == "https://api.minimax.io/v1"
    assert payload["model"] == "MiniMax-M3"
    assert "apiKey" not in payload


def test_runtime_config_explicit_protocol_overrides_default_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "teamver_od_api_key", "sk-teamver-managed")
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "anthropic")
    monkeypatch.setattr(settings, "teamver_design_default_provider", "minimax")

    payload = od_runtime_config.resolve_od_runtime_config_payload()

    assert payload["apiProtocol"] == "anthropic"


def test_runtime_config_normalizes_minimax_legacy_host(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "teamver_minimax_api_key", "sk-cp-managed")
    monkeypatch.setattr(settings, "teamver_od_api_protocol", "minimax")
    monkeypatch.setattr(settings, "teamver_od_api_base_url", "https://api.minimaxi.chat/v1")

    payload = od_runtime_config.resolve_od_runtime_config_payload()

    assert payload["baseUrl"] == "https://api.minimax.io/v1"
