from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings


def hosted_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "deploy_env": "staging",
        "od_project_storage": "s3",
        "auth_disabled": False,
        "allow_no_jwt_local_mode": False,
        "teamver_internal_api_key": "m2m-key",
        "teamver_od_api_key": "model-key",
        "teamver_registry_app_id": "ai-design",
        "teamver_registry_key_id": "registry-key",
        "teamver_registry_access_key": "registry-secret",
    }
    values.update(overrides)
    return Settings(**values)


def test_staging_accepts_complete_hosted_credentials() -> None:
    assert hosted_settings().deploy_env == "staging"


@pytest.mark.parametrize(
    ("field", "message"),
    [
        ("teamver_internal_api_key", "TEAMVER_INTERNAL_API_KEY"),
        ("teamver_od_api_key", "TEAMVER_OD_API_KEY"),
    ],
)
def test_hosted_rejects_missing_runtime_credentials(field: str, message: str) -> None:
    with pytest.raises(ValidationError, match=message):
        hosted_settings(**{field: ""})


def test_staging_requires_registry_credentials_or_explicit_kill_switch() -> None:
    missing = {
        "teamver_registry_app_id": "",
        "teamver_registry_key_id": "",
        "teamver_registry_access_key": "",
    }
    with pytest.raises(ValidationError, match="TEAMVER_REGISTRY"):
        hosted_settings(**missing, teamver_billing_disabled=False)

    assert hosted_settings(**missing, teamver_billing_disabled=True).teamver_billing_disabled


def test_production_accepts_kill_switch_without_registry() -> None:
    missing = {
        "deploy_env": "production",
        "teamver_registry_app_id": "",
        "teamver_registry_key_id": "",
        "teamver_registry_access_key": "",
    }
    with pytest.raises(ValidationError, match="TEAMVER_REGISTRY"):
        hosted_settings(**missing, teamver_billing_disabled=False)

    assert hosted_settings(**missing, teamver_billing_disabled=True).teamver_billing_disabled
