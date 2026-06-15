from __future__ import annotations

import os
from pathlib import Path


def load_dotenv_files() -> None:
    """Load ``deploy/teamver/.env`` (and ``be/.env``) without overriding existing env vars."""

    app_dir = Path(__file__).resolve().parent
    candidates = (
        app_dir.parents[1] / ".env",  # deploy/teamver/.env
        app_dir.parent / ".env",       # deploy/teamver/be/.env
    )
    for path in candidates:
        if not path.is_file():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            if not key or key in os.environ:
                continue
            value = value.strip().strip("\"'")
            os.environ[key] = value
        break
