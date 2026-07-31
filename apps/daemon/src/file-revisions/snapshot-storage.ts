import type Database from 'better-sqlite3';

export type FileRevisionSnapshotStorage = 'files' | 'sqlite';

export function resolveFileRevisionSnapshotStorage(
  env: NodeJS.ProcessEnv = process.env,
): FileRevisionSnapshotStorage {
  const raw = (env.OD_FILE_REVISION_SNAPSHOT_STORAGE ?? '').trim().toLowerCase();
  if (raw === 'sqlite') return 'sqlite';
  return 'files';
}

export const FILE_REVISION_SNAPSHOT_STORAGE = resolveFileRevisionSnapshotStorage();

export function migrateFileRevisionSnapshots(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_revision_snapshots (
      revision_id TEXT PRIMARY KEY,
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

export function deleteFileRevisionSnapshotsFromDb(
  db: Database.Database,
  revisionIds: string[],
): void {
  if (revisionIds.length === 0) return;
  const placeholders = revisionIds.map(() => '?').join(', ');
  db.prepare(`DELETE FROM file_revision_snapshots WHERE revision_id IN (${placeholders})`).run(...revisionIds);
}
