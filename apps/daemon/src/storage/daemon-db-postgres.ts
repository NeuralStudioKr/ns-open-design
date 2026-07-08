import { Pool, type PoolConfig, type QueryResultRow } from 'pg';

import type { DaemonDbConfig } from './daemon-db.js';
import {
  DAEMON_DB_POSTGRES_MIGRATION_V1,
  DAEMON_DB_SCHEMA_VERSION,
} from './daemon-db-postgres-schema.js';

export type DaemonPostgresPool = Pool;

export function buildPostgresPoolConfig(
  config: NonNullable<DaemonDbConfig['postgres']>,
  password: string,
): PoolConfig {
  const ssl =
    config.sslMode === 'disable'
      ? false
      : { rejectUnauthorized: config.sslMode === 'verify-full' };
  return {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password,
    ssl,
    max: Number.parseInt(process.env.OD_PG_POOL_MAX ?? '10', 10) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

export function createPostgresPool(
  config: NonNullable<DaemonDbConfig['postgres']>,
  password: string,
): DaemonPostgresPool {
  return new Pool(buildPostgresPoolConfig(config, password));
}

export async function migratePostgresDaemonSchema(pool: DaemonPostgresPool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(DAEMON_DB_POSTGRES_MIGRATION_V1);
    await client.query(
      `INSERT INTO daemon_db_schema_migrations (version, applied_at)
       VALUES ($1, $2)
       ON CONFLICT (version) DO NOTHING`,
      [DAEMON_DB_SCHEMA_VERSION, Date.now()],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function probePostgresPool(pool: DaemonPostgresPool): Promise<void> {
  await pool.query('SELECT 1');
}

export async function inspectPostgresDaemonDb(pool: DaemonPostgresPool, location: string) {
  const tables: Array<{ name: string; rowCount: number }> = [];
  const tableRows = await pool.query<{ tablename: string }>(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
      ORDER BY tablename`,
  );
  for (const { tablename } of tableRows.rows) {
    if (!/^[a-z_][a-z0-9_]*$/.test(tablename)) continue;
    const count = await pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM "${tablename}"`,
    );
    tables.push({ name: tablename, rowCount: Number(count.rows[0]?.c ?? 0) });
  }
  const versionRow = await pool.query<{ version: number }>(
    `SELECT version FROM daemon_db_schema_migrations ORDER BY version DESC LIMIT 1`,
  );
  return {
    kind: 'postgres' as const,
    location,
    sizeBytes: 0,
    schemaVersion: versionRow.rows[0]?.version ?? null,
    tables,
    generatedAt: Date.now(),
  };
}

export async function queryPostgresRow<T extends QueryResultRow>(
  pool: DaemonPostgresPool,
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const result = await pool.query<T>(sql, params);
  return result.rows[0] ?? null;
}

export async function queryPostgresRows<T extends QueryResultRow>(
  pool: DaemonPostgresPool,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows;
}
