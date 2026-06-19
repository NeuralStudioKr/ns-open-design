"""Drive import file-type policy — keep in sync with apps/web embedFileAttachPolicy.ts (loop 162)."""

from __future__ import annotations

# Slide-friendly extensions (embed §2.4 / Phase 2-4).
_ALLOWED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".ico",
    ".avif",
    ".pdf",
    ".ppt",
    ".pptx",
    ".odp",
    ".key",
    ".md",
    ".markdown",
    ".txt",
    ".csv",
    ".tsv",
    ".json",
    ".html",
    ".htm",
}

# Explicit block list — executables, media, archives.
_BLOCKED_EXTENSIONS = {
    ".exe",
    ".bat",
    ".cmd",
    ".com",
    ".msi",
    ".dmg",
    ".app",
    ".deb",
    ".rpm",
    ".pkg",
    ".ps1",
    ".scr",
    ".sh",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".webm",
    ".mp3",
    ".wav",
    ".flac",
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
}


def _mime_is_slide_friendly(mime_type: str) -> bool:
    mime = mime_type.strip().lower()
    if not mime:
        return False
    if mime.startswith("image/"):
        return True
    if mime == "application/pdf":
        return True
    if "presentation" in mime or "powerpoint" in mime:
        return True
    if mime.startswith("text/"):
        return True
    if mime in {"application/json", "text/csv", "text/html"}:
        return True
    return False


def validate_drive_import_file_type(filename: str, mime_type: str | None) -> str | None:
    """Return error_code when the file type is outside slide-friendly import policy."""

    name = filename.strip()
    if not name:
        return "invalid_filename"

    dot = name.rfind(".")
    suffix = name[dot:].lower() if dot > 0 else ""

    if suffix and suffix in _BLOCKED_EXTENSIONS:
        return "unsupported_drive_import_file_type"

    if suffix and suffix in _ALLOWED_EXTENSIONS:
        return None

    mime = (mime_type or "").strip()
    if mime and _mime_is_slide_friendly(mime):
        return None

    return "unsupported_drive_import_file_type"
