import { getPostgresPool } from '../storage/daemon-db-runtime.js';
import { usesPostgresRevisionSnapshots } from './snapshot-storage.js';

const DEFAULT_LOCK_TIMEOUT_MS = 15_000;

export class FileRevisionLockError extends Error {
  readonly code = 'FILE_REVISION_LOCK_TIMEOUT' as const;

  constructor(projectId: string, fileName: string) {
    super(`Timed out waiting for file revision lock: ${projectId}/${fileName}`);
    this.name = 'FileRevisionLockError';
  }
}

function resolveFileRevisionLockTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OD_FILE_REVISION_LOCK_TIMEOUT_MS;
  if (raw == null || raw.trim() === '') return DEFAULT_LOCK_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_LOCK_TIMEOUT_MS;
  return parsed;
}

/**
 * Serializes revision mutations per (projectId, fileName) across daemon pods.
 * Uses Postgres session advisory locks keyed by hashtext(projectId/fileName).
 */
export async function withFileRevisionMutationLock<T>(
  projectId: string,
  fileName: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!usesPostgresRevisionSnapshots()) return fn();

  const timeoutMs = resolveFileRevisionLockTimeoutMs();
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    if (timeoutMs > 0) {
      await client.query(`SET lock_timeout = '${timeoutMs}ms'`);
    } else {
      await client.query('SET lock_timeout = 0');
    }
    try {
      await client.query(
        'SELECT pg_advisory_lock(hashtext($1), hashtext($2))',
        [projectId, fileName],
      );
    } catch (error) {
      if (isLockTimeoutError(error)) {
        throw new FileRevisionLockError(projectId, fileName);
      }
      throw error;
    }
    try {
      return await fn();
    } finally {
      await client.query(
        'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
        [projectId, fileName],
      );
    }
  } finally {
    client.release();
  }
}

function isLockTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '55P03';
}

export function isFileRevisionSequenceConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const pgError = error as { code?: string; constraint?: string };
  return pgError.code === '23505'
    && (pgError.constraint?.includes('file_revisions') ?? false);
}
