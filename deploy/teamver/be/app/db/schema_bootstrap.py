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
    """API startup: create missing tables only — never DROP."""
    if _table_exists():
        logger.info("Postgres schema already present")
        apply_postgres_schema_patches()
        return
    logger.warning("Postgres schema incomplete — applying create_schema.sql")
    apply_postgres_schema()
    apply_postgres_schema_patches()


def apply_postgres_schema_patches() -> None:
    """Idempotent ALTER/INDEX for existing deployments."""
    import psycopg

    patches = [
        "ALTER TABLE ai_model_token_usages ADD COLUMN IF NOT EXISTS run_id TEXT;",
        """
        CREATE UNIQUE INDEX IF NOT EXISTS uq_token_usage_workspace_run
          ON ai_model_token_usages (workspace_id, run_id)
          WHERE run_id IS NOT NULL AND run_id <> '';
        """,
        """
        CREATE TABLE IF NOT EXISTS design_projects (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          owner_user_id TEXT NOT NULL,
          od_project_id TEXT NOT NULL UNIQUE,
          s3_prefix TEXT NOT NULL,
          title TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_design_projects_workspace
          ON design_projects (workspace_id, updated_at DESC);
        """,
    ]
    with psycopg.connect(settings.postgres_conninfo) as conn:
        for stmt in patches:
            conn.execute(stmt)
        conn.commit()
