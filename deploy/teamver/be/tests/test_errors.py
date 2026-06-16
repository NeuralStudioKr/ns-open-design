from __future__ import annotations

from app.errors import ApiError, BadRequestError, status_code_to_error_code


def test_status_code_to_error_code() -> None:
    assert status_code_to_error_code(401) == "unauthorized"
    assert status_code_to_error_code(418) == "http_error"


def test_domain_error_response_shape() -> None:
    exc = BadRequestError("workspace_id_mismatch")
    body = exc.to_response_content()
    assert body == {
        "error": {
            "code": "bad_request",
            "message": "workspace_id_mismatch",
        }
    }


def test_api_error_custom_status() -> None:
    exc = ApiError(403, "app.disabled", code="app.disabled")
    assert exc.status_code == 403
    assert exc.code == "app.disabled"
