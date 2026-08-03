import type Database from 'better-sqlite3';
import {
  getPostgresPool,
  isDaemonDbPostgres,
} from '../storage/daemon-db-runtime.js';
import {
  pgDeleteFileRevisionSnapshots,
  pgDeleteFileRevisionSnapshotsForProject,
  pgGetFileRevisionSnapshot,
  pgGetFileRevisionSnapshotStorageStats,
  pgPruneOrphanFileRevisionSnapshots,
  pgUpsertFileRevisionSnapshot,
} from './postgres-persistence.js';

export type FileRevisionSnapshotStorage = 'files' | 'sqlite' | 'postgres';

/**
 * Resolves where revision snapshot bytes are stored.
 * Teamver (`OD_DAEMON_DB=postgres`) defaults to `postgres` — not local sqlite BLOB.
 */
export function resolveFileRevisionSnapshotStorage(
  env: NodeJS.ProcessEnv = process.env,
): FileRevisionSnapshotStorage {
  const raw = (env.OD_FILE_REVISION_SNAPSHOT_STORAGE ?? '').trim().toLowerCase();
  if (raw === 'files') return 'files';
  if (raw === 'sqlite') return 'sqlite';
  if (raw === 'postgres') return 'postgres';
  if ((env.OD_DAEMON_DB ?? '').trim().toLowerCase() === 'postgres') return 'postgres';
  return 'files';
}

export function usesPostgresRevisionSnapshots(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveFileRevisionSnapshotStorage(env) === 'postgres' && isDaemonDbPostgres();
}

export function migrateFileRevisionSnapshots(db: Database.Database): void {
  const tableSql = db.prepare(`
    SELECT sql FROM sqlite_master
    WHERE type = 'table' AND name = 'file_revision_snapshots'
  `).get() as { sql?: string } | undefined;
  const hasFk = typeof tableSql?.sql === 'string'
    && tableSql.sql.includes('REFERENCES file_revisions');
  if (!hasFk) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_revision_snapshots (
        revision_id TEXT PRIMARY KEY,
        compressed BLOB NOT NULL,
        storage_bytes INTEGER NOT NULL
      );
    `);
    const row = db.prepare(`SELECT count(*) AS c FROM file_revision_snapshots`).get() as { c: number };
    if ((row?.c ?? 0) > 0) {
      db.exec(`
        DELETE FROM file_revision_snapshots
        WHERE revision_id NOT IN (SELECT id FROM file_revisions);
        CREATE TABLE file_revision_snapshots_fk (
          revision_id TEXT PRIMARY KEY
            REFERENCES file_revisions(id) ON DELETE CASCADE,
          compressed BLOB NOT NULL,
          storage_bytes INTEGER NOT NULL
        );
        INSERT INTO file_revision_snapshots_fk (revision_id, compressed, storage_bytes)
        SELECT revision_id, compressed, storage_bytes FROM file_revision_snapshots;
        DROP TABLE file_revision_snapshots;
        ALTER TABLE file_revision_snapshots_fk RENAME TO file_revision_snapshots;
      `);
    } else {
      db.exec(`DROP TABLE IF EXISTS file_revision_snapshots`);
      db.exec(`
        CREATE TABLE file_revision_snapshots (
          revision_id TEXT PRIMARY KEY
            REFERENCES file_revisions(id) ON DELETE CASCADE,
          compressed BLOB NOT NULL,
          storage_bytes INTEGER NOT NULL
        );
      `);
    }
    return;
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_revision_snapshots (
      revision_id TEXT PRIMARY KEY
        REFERENCES file_revisions(id) ON DELETE CASCADE,
      compressed BLOB NOT NULL,
      storage_bytes INTEGER NOT NULL
    );
  `);
}

export function upsertFileRevisionSnapshot(
  db: Database.Database,
  revisionId: string,
  compressed: Buffer,
): void {
  db.prepare(`
    INSERT INTO file_revision_snapshots (revision_id, compressed, storage_bytes)
    VALUES (?, ?, ?)
    ON CONFLICT(revision_id) DO UPDATE SET
      compressed = excluded.compressed,
      storage_bytes = excluded.storage_bytes
  `).run(revisionId, compressed, compressed.length);
}

export async function upsertFileRevisionSnapshotDurable(
  revisionId: string,
  compressed: Buffer,
  db?: Database.Database,
): Promise<void> {
  if (usesPostgresRevisionSnapshots()) {
    await pgUpsertFileRevisionSnapshot(getPostgresPool(), revisionId, compressed);
    return;
  }
  if (!db) {
    throw new Error('SQLite revision snapshot write requires db handle');
  }
  upsertFileRevisionSnapshot(db, revisionId, compressed);
}

export function getFileRevisionSnapshot(
  db: Database.Database,
  revisionId: string,
): Buffer | null {
  const row = db.prepare(`
    SELECT compressed
    FROM file_revision_snapshots
    WHERE revision_id = ?
  `).get(revisionId) as { compressed: Buffer } | undefined;
  return row?.compressed ?? null;
}

export async function getFileRevisionSnapshotDurable(
  revisionId: string,
  db?: Database.Database,
): Promise<Buffer | null> {
  if (usesPostgresRevisionSnapshots()) {
    return await pgGetFileRevisionSnapshot(getPostgresPool(), revisionId);
  }
  if (!db) return null;
  return getFileRevisionSnapshot(db, revisionId);
}

export function deleteFileRevisionSnapshotsFromDb(
  db: Database.Database,
  revisionIds: string[],
): void {
  if (revisionIds.length === 0) return;
  const placeholders = revisionIds.map(() => '?').join(', ');
  db.prepare(`DELETE FROM file_revision_snapshots WHERE revision_id IN (${placeholders})`).run(...revisionIds);
}

export async function deleteFileRevisionSnapshotsDurable(
  revisionIds: string[],
  db?: Database.Database,
): Promise<void> {
  if (revisionIds.length === 0) return;
  if (usesPostgresRevisionSnapshots()) {
    await pgDeleteFileRevisionSnapshots(getPostgresPool(), revisionIds);
    return;
  }
  if (db) {
    deleteFileRevisionSnapshotsFromDb(db, revisionIds);
  }
}

export async function deleteFileRevisionSnapshotsForProjectDurable(
  projectId: string,
  db?: Database.Database,
): Promise<void> {
  if (usesPostgresRevisionSnapshots()) {
    await pgDeleteFileRevisionSnapshotsForProject(getPostgresPool(), projectId);
    return;
  }
  if (!db) return;
  const rows = db.prepare(`
    SELECT id FROM file_revisions WHERE project_id = ?
  `).all(projectId) as Array<{ id: string }>;
  deleteFileRevisionSnapshotsFromDb(db, rows.map((row) => row.id));
}

export function getFileRevisionSnapshotStorageStats(db: Database.Database): {
  snapshotRowCount: number;
  orphanSnapshotRowCount: number;
  totalSnapshotBytes: number;
} {
  const snapshotRowCount = (
    db.prepare(`SELECT count(*) AS c FROM file_revision_snapshots`).get() as { c: number }
  ).c;
  const orphanSnapshotRowCount = (
    db.prepare(`
      SELECT count(*) AS c
      FROM file_revision_snapshots s
      LEFT JOIN file_revisions r ON r.id = s.revision_id
      WHERE r.id IS NULL
    `).get() as { c: number }
  ).c;
  const totalSnapshotBytes = (
    db.prepare(`SELECT coalesce(sum(storage_bytes), 0) AS total FROM file_revision_snapshots`).get() as { total: number }
  ).total;
  return { snapshotRowCount, orphanSnapshotRowCount, totalSnapshotBytes };
}

export async function getFileRevisionSnapshotStorageStatsDurable(
  db: Database.Database,
): Promise<{
  snapshotRowCount: number;
  orphanSnapshotRowCount: number;
  totalSnapshotBytes: number;
}> {
  if (usesPostgresRevisionSnapshots()) {
    return await pgGetFileRevisionSnapshotStorageStats(getPostgresPool());
  }
  return getFileRevisionSnapshotStorageStats(db);
}

export async function pruneOrphanFileRevisionSnapshotsDurable(
  db: Database.Database,
): Promise<{ removed: number; reclaimedBytes: number }> {
  if (usesPostgresRevisionSnapshots()) {
    return await pgPruneOrphanFileRevisionSnapshots(getPostgresPool());
  }
  const rows = db.prepare(`
    SELECT s.revision_id AS id, s.storage_bytes AS storageBytes
    FROM file_revision_snapshots s
    LEFT JOIN file_revisions r ON r.id = s.revision_id
    WHERE r.id IS NULL
  `).all() as Array<{ id: string; storageBytes: number }>;
  if (rows.length === 0) return { removed: 0, reclaimedBytes: 0 };
  const reclaimedBytes = rows.reduce((sum, row) => sum + (row.storageBytes ?? 0), 0);
  deleteFileRevisionSnapshotsFromDb(db, rows.map((row) => row.id));
  return { removed: rows.length, reclaimedBytes };
}
