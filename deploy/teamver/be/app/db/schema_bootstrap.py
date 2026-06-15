from __future__ import annotations

import logging
from pathlib import Path

from ..config import settings

logger = logging.getLogger(__name__)

_CREATE_SQL_PATH = Path(__file__).resolve().parents[2] / "scripts" / "create_schema.sql"


def iter_sql_statements(sql: str) -> list[str]:
    statements: list[str] = []
    buf: list[str] = []
    for line in sql.splitlines():
        if line.strip().startswith("--"):
            continue
        buf.append(line)
        if line.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip()
            buf = []
            if stmt:
                statements.append(stmt)
    return statements


def _run_sql_file(path: Path) -> None:
    import psycopg

    sql = path.read_text(encoding="utf-8")
    statements = iter_sql_statements(sql)
    with psycopg.connect(settings.postgres_conninfo) as conn:
        for stmt in statements:
            conn.execute(stmt)
        conn.commit()


def _table_exists(table_name: str = "ai_model_token_usages") -> bool:
    import psycopg

    with psycopg.connect(settings.postgres_conninfo) as conn:
        row = conn.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = %s
            """,
            (table_name,),
        ).fetchone()
    return row is not None


def apply_postgres_schema() -> None:
    _run_sql_file(_CREATE_SQL_PATH)
    logger.info("Applied schema from %s", _CREATE_SQL_PATH)


def ensure_postgres_schema() -> None:
    if _table_exists():
        return
    apply_postgres_schema()
