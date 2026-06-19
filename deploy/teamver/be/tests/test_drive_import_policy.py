from __future__ import annotations

import pytest

from app.services.drive_import_policy import validate_drive_import_file_type


@pytest.mark.parametrize(
    ("filename", "mime_type"),
    [
        ("logo.png", "image/png"),
        ("deck.pptx", None),
        ("notes.md", "text/markdown"),
        ("data.csv", "text/csv"),
    ],
)
def test_validate_drive_import_file_type_allows_slide_friendly(
    filename: str,
    mime_type: str | None,
) -> None:
    assert validate_drive_import_file_type(filename, mime_type) is None


@pytest.mark.parametrize(
    ("filename", "mime_type"),
    [
        ("clip.mp4", "video/mp4"),
        ("setup.exe", "application/octet-stream"),
        ("installer.pkg", None),
        ("virus.scr", None),
        ("archive.zip", None),
        ("unknown.bin", "application/octet-stream"),
    ],
)
def test_validate_drive_import_file_type_blocks_unsupported(
    filename: str,
    mime_type: str | None,
) -> None:
    assert validate_drive_import_file_type(filename, mime_type) == "unsupported_drive_import_file_type"


def test_validate_drive_import_file_type_rejects_empty_filename() -> None:
    assert validate_drive_import_file_type("   ", None) == "invalid_filename"
