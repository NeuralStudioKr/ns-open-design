from app.services.main_canvas_client import (
    main_api_url,
    main_canvas_request_headers,
    main_session_canvas_item_path,
)


def test_main_session_canvas_item_path_encodes_segments() -> None:
    path = main_session_canvas_item_path("sess/id", "art/id", suffix="export-html")
    assert path == "/api/v2/session/sess%2Fid/canvas/item/art%2Fid/export-html"


def test_main_canvas_request_headers_includes_workspace() -> None:
    headers = main_canvas_request_headers("tok", "ws-9")
    assert headers["Authorization"] == "Bearer tok"
    assert headers["X-Workspace-Id"] == "ws-9"


def test_main_api_url_joins_base(monkeypatch) -> None:
    from app.services import main_canvas_client as mod

    monkeypatch.setattr(mod.settings, "teamver_api_base_url", "https://main.example")
    assert main_api_url("/api/v2/healthz") == "https://main.example/api/v2/healthz"
