import type { Pool } from 'pg';

import {
  DaemonDbConfigError,
  resolveDaemonDbConfig,
  type DaemonDbConfig,
} from './daemon-db.js';
import { clearDaemonDbEntityCache } from './daemon-db-entity-cache.js';
import {
  createPostgresPool,
  migratePostgresDaemonSchema,
  probePostgresPool,
  type DaemonPostgresPool,
} from './daemon-db-postgres.js';

export type DaemonDbRuntime =
  | { kind: 'sqlite' }
  | { kind: 'postgres'; pool: DaemonPostgresPool; location: string };

let runtime: DaemonDbRuntime = { kind: 'sqlite' };
let writeChain: Promise<void> = Promise.resolve();

export function resolveDaemonDbPassword(env: Record<string, string | undefined> = process.env): string {
  const direct = (env.OD_PG_PASSWORD ?? env.OD_PG_PASSWD ?? '').trim();
  if (direct) return direct;
  throw new DaemonDbConfigError(
    'OD_DAEMON_DB=postgres requires OD_PG_PASSWORD (or OD_PG_PASSWD).',
  );
}

export function isDaemonDbPostgres(): boolean {
  return runtime.kind === 'postgres';
}

export function getDaemonDbRuntime(): DaemonDbRuntime {
  return runtime;
}

export function getPostgresPool(): DaemonPostgresPool {
  if (runtime.kind !== 'postgres') {
    throw new DaemonDbConfigError('Postgres DaemonDb is not initialized.');
  }
  return runtime.pool;
}

export function postgresDaemonDbLocation(config: DaemonDbConfig): string {
  const pg = config.postgres;
  if (!pg) return 'postgres:unknown';
  return `${pg.host}:${pg.port}/${pg.database}`;
}

export async function initDaemonDbFromEnv(
  env: Record<string, string | undefined> = process.env,
): Promise<DaemonDbRuntime> {
  const config = resolveDaemonDbConfig(env);
  if (config.kind === 'sqlite') {
    runtime = { kind: 'sqlite' };
    return runtime;
  }
  const password = resolveDaemonDbPassword(env);
  const pool = createPostgresPool(config.postgres!, password);
  await migratePostgresDaemonSchema(pool);
  await probePostgresPool(pool);
  runtime = { kind: 'postgres', pool, location: postgresDaemonDbLocation(config) };
  console.info(
    JSON.stringify({
      metric: 'daemon_db_postgres_ready',
      location: runtime.location,
    }),
  );
  return runtime;
}

export function schedulePostgresWrite(task: () => Promise<void>): void {
  writeChain = writeChain
    .then(task)
    .catch((err) => {
      console.error(
        JSON.stringify({
          metric: 'daemon_db_postgres_write_failed',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    });
}

export async function flushPostgresWrites(): Promise<void> {
  await writeChain;
}

export async function closeDaemonDbRuntime(): Promise<void> {
  await flushPostgresWrites();
  if (runtime.kind === 'postgres') {
    await runtime.pool.end();
  }
  clearDaemonDbEntityCache();
  runtime = { kind: 'sqlite' };
}

// Test helper
export function resetDaemonDbRuntimeForTests(): void {
  runtime = { kind: 'sqlite' };
  writeChain = Promise.resolve();
  clearDaemonDbEntityCache();
}

export function setDaemonDbRuntimeForTests(next: DaemonDbRuntime): void {
  runtime = next;
}
