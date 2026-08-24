import type { Pool } from 'pg';
import type { FileRevision, FileRevisionSource } from '@open-design/contracts';
import {
  queryPostgresRow,
  queryPostgresRows,
} from '../storage/daemon-db-postgres.js';

export interface PgFileRevisionRow {
  id: string;
  projectId: string;
  fileName: string;
  parentRevisionId: string | null;
  sequence: number;
  createdAt: number;
  byteSize: number;
  source: FileRevisionSource;
  label: string;
  conversationId: string | null;
  assistantMessageId: string | null;
}

const REVISION_COLS = `
  id,
  project_id AS "projectId",
  file_name AS "fileName",
  parent_revision_id AS "parentRevisionId",
  sequence,
  created_at AS "createdAt",
  byte_size AS "byteSize",
  source,
  label,
  conversation_id AS "conversationId",
  assistant_message_id AS "assistantMessageId"
`;

function rowToRevision(row: PgFileRevisionRow): FileRevision {
  return {
    id: row.id,
    projectId: row.projectId,
    fileName: row.fileName,
    parentRevisionId: row.parentRevisionId,
    sequence: row.sequence,
    createdAt: row.createdAt,
    byteSize: row.byteSize,
    source: row.source,
    label: row.label,
    ...(row.conversationId ? { conversationId: row.conversationId } : {}),
    ...(row.assistantMessageId ? { assistantMessageId: row.assistantMessageId } : {}),
  };
}

export async function pgListFileRevisions(
  pool: Pool,
  projectId: string,
  fileName: string,
): Promise<PgFileRevisionRow[]> {
  return queryPostgresRows<PgFileRevisionRow>(
    pool,
    `SELECT ${REVISION_COLS}
     FROM file_revisions
     WHERE project_id = $1 AND file_name = $2
     ORDER BY sequence ASC`,
    [projectId, fileName],
  );
}

export async function pgGetLatestFileRevision(
  pool: Pool,
  projectId: string,
  fileName: string,
): Promise<FileRevision | null> {
  const row = await queryPostgresRow<PgFileRevisionRow>(
    pool,
    `SELECT ${REVISION_COLS}
     FROM file_revisions
     WHERE project_id = $1 AND file_name = $2
     ORDER BY sequence DESC
     LIMIT 1`,
    [projectId, fileName],
  );
  return row ? rowToRevision(row) : null;
}

export async function pgInsertFileRevision(
  pool: Pool,
  input: PgFileRevisionRow,
): Promise<void> {
  await pool.query(
    `INSERT INTO file_revisions (
      id, project_id, file_name, parent_revision_id, sequence, created_at,
      byte_size, source, label, conversation_id, assistant_message_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (id) DO NOTHING`,
    [
      input.id,
      input.projectId,
      input.fileName,
      input.parentRevisionId,
      input.sequence,
      input.createdAt,
      input.byteSize,
      input.source,
      input.label,
      input.conversationId,
      input.assistantMessageId,
    ],
  );
}

export async function pgDeleteFileRevisionsByIdsWithSnapshots(
  pool: Pool,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM file_revision_snapshots WHERE revision_id = ANY($1::text[])`,
      [ids],
    );
    await client.query(
      `DELETE FROM file_revisions WHERE id = ANY($1::text[])`,
      [ids],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function pgDeleteFileRevisionsByIds(pool: Pool, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await pgDeleteFileRevisionsByIdsWithSnapshots(pool, ids);
}

export async function pgDeleteFileRevisionsAfterSequence(
  pool: Pool,
  projectId: string,
  fileName: string,
  sequence: number,
): Promise<string[]> {
  const rows = await queryPostgresRows<{ id: string }>(
    pool,
    `SELECT id FROM file_revisions
     WHERE project_id = $1 AND file_name = $2 AND sequence > $3
     ORDER BY sequence ASC`,
    [projectId, fileName, sequence],
  );
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  await pgDeleteFileRevisionsByIdsWithSnapshots(pool, ids);
  return ids;
}

export async function pgPruneOldestFileRevisions(
  pool: Pool,
  projectId: string,
  fileName: string,
  keep: number,
): Promise<string[]> {
  const rows = await queryPostgresRows<{ id: string }>(
    pool,
    `SELECT id FROM file_revisions
     WHERE project_id = $1 AND file_name = $2
     ORDER BY sequence DESC
     OFFSET $3`,
    [projectId, fileName, keep],
  );
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  await pgDeleteFileRevisionsByIdsWithSnapshots(pool, ids);
  return ids;
}

export async function pgPruneOldestFileRevisionsWithSnapshots(
  pool: Pool,
  projectId: string,
  fileName: string,
  keep: number,
): Promise<string[]> {
  return pgPruneOldestFileRevisions(pool, projectId, fileName, keep);
}

export async function pgPruneOldestFileRevisionsCapped(
  pool: Pool,
  projectId: string,
  fileName: string,
  keep: number,
  maxDeletes: number,
): Promise<{ ids: string[]; remainingExcess: number }> {
  const countRow = await queryPostgresRow<{ c: string }>(
    pool,
    `SELECT count(*)::text AS c FROM file_revisions WHERE project_id = $1 AND file_name = $2`,
    [projectId, fileName],
  );
  const excess = Math.max(0, Number(countRow?.c ?? 0) - keep);
  if (excess === 0 || maxDeletes <= 0) {
    return { ids: [], remainingExcess: excess };
  }

  const deleteCount = Math.min(excess, maxDeletes);
  const rows = await queryPostgresRows<{ id: string }>(
    pool,
    `SELECT id FROM file_revisions
     WHERE project_id = $1 AND file_name = $2
     ORDER BY sequence ASC
     LIMIT $3`,
    [projectId, fileName, deleteCount],
  );
  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    await pgDeleteFileRevisionsByIdsWithSnapshots(pool, ids);
  }
  return { ids, remainingExcess: Math.max(0, excess - ids.length) };
}

export async function pgCommitRevisionWithSnapshot(
  pool: Pool,
  input: PgFileRevisionRow,
  compressed: Buffer,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO file_revisions (
        id, project_id, file_name, parent_revision_id, sequence, created_at,
        byte_size, source, label, conversation_id, assistant_message_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        file_name = EXCLUDED.file_name,
        parent_revision_id = EXCLUDED.parent_revision_id,
        sequence = EXCLUDED.sequence,
        created_at = EXCLUDED.created_at,
        byte_size = EXCLUDED.byte_size,
        source = EXCLUDED.source,
        label = EXCLUDED.label,
        conversation_id = EXCLUDED.conversation_id,
        assistant_message_id = EXCLUDED.assistant_message_id`,
      [
        input.id,
        input.projectId,
        input.fileName,
        input.parentRevisionId,
        input.sequence,
        input.createdAt,
        input.byteSize,
        input.source,
        input.label,
        input.conversationId,
        input.assistantMessageId,
      ],
    );
    await client.query(
      `INSERT INTO file_revision_snapshots (revision_id, compressed, storage_bytes)
       VALUES ($1, $2, $3)
       ON CONFLICT (revision_id) DO UPDATE SET
         compressed = EXCLUDED.compressed,
         storage_bytes = EXCLUDED.storage_bytes`,
      [input.id, compressed, compressed.length],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function pgUpdateFileRevisionHead(
  pool: Pool,
  input: {
    id: string;
    label: string;
    byteSize: number;
    createdAt: number;
    conversationId?: string | null;
    assistantMessageId?: string | null;
  },
  compressed: Buffer,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE file_revisions
       SET label = $2,
           byte_size = $3,
           created_at = $4,
           conversation_id = COALESCE($5, conversation_id),
           assistant_message_id = COALESCE($6, assistant_message_id)
       WHERE id = $1`,
      [
        input.id,
        input.label,
        input.byteSize,
        input.createdAt,
        input.conversationId ?? null,
        input.assistantMessageId ?? null,
      ],
    );
    await client.query(
      `INSERT INTO file_revision_snapshots (revision_id, compressed, storage_bytes)
       VALUES ($1, $2, $3)
       ON CONFLICT (revision_id) DO UPDATE SET
         compressed = EXCLUDED.compressed,
         storage_bytes = EXCLUDED.storage_bytes`,
      [input.id, compressed, compressed.length],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function pgUpsertFileRevisionSnapshot(
  pool: Pool,
  revisionId: string,
  compressed: Buffer,
): Promise<void> {
  await pool.query(
    `INSERT INTO file_revision_snapshots (revision_id, compressed, storage_bytes)
     VALUES ($1, $2, $3)
     ON CONFLICT (revision_id) DO UPDATE SET
       compressed = EXCLUDED.compressed,
       storage_bytes = EXCLUDED.storage_bytes`,
    [revisionId, compressed, compressed.length],
  );
}

export async function pgGetFileRevisionSnapshot(
  pool: Pool,
  revisionId: string,
): Promise<Buffer | null> {
  const row = await queryPostgresRow<{ compressed: Buffer }>(
    pool,
    `SELECT compressed FROM file_revision_snapshots WHERE revision_id = $1`,
    [revisionId],
  );
  return row?.compressed ?? null;
}

export async function pgDeleteFileRevisionSnapshots(
  pool: Pool,
  revisionIds: string[],
): Promise<void> {
  if (revisionIds.length === 0) return;
  await pool.query(
    `DELETE FROM file_revision_snapshots WHERE revision_id = ANY($1::text[])`,
    [revisionIds],
  );
}

export async function pgDeleteFileRevisionSnapshotsForProject(
  pool: Pool,
  projectId: string,
): Promise<number> {
  const result = await pool.query(
    `DELETE FROM file_revision_snapshots s
     USING file_revisions r
     WHERE s.revision_id = r.id AND r.project_id = $1`,
    [projectId],
  );
  return result.rowCount ?? 0;
}

export async function pgPruneOrphanFileRevisionSnapshots(pool: Pool): Promise<{
  removed: number;
  reclaimedBytes: number;
}> {
  const rows = await queryPostgresRows<{ id: string; storageBytes: number }>(
    pool,
    `SELECT s.revision_id AS id, s.storage_bytes AS "storageBytes"
     FROM file_revision_snapshots s
     LEFT JOIN file_revisions r ON r.id = s.revision_id
     WHERE r.id IS NULL`,
  );
  if (rows.length === 0) return { removed: 0, reclaimedBytes: 0 };
  const reclaimedBytes = rows.reduce((sum, row) => sum + (row.storageBytes ?? 0), 0);
  await pgDeleteFileRevisionSnapshots(pool, rows.map((row) => row.id));
  return { removed: rows.length, reclaimedBytes };
}

export async function pgListOldestRevisionsForPrune(
  pool: Pool,
  excludeRevisionIds: ReadonlySet<string>,
  limit: number,
): Promise<Array<{ id: string; projectId: string; fileName: string; storageBytes: number }>> {
  if (limit <= 0) return [];
  const exclude = [...excludeRevisionIds];
  if (exclude.length === 0) {
    return await queryPostgresRows<{ id: string; projectId: string; fileName: string; storageBytes: number }>(
      pool,
      `SELECT r.id AS id, r.project_id AS "projectId", r.file_name AS "fileName",
              coalesce(s.storage_bytes, 0)::bigint AS "storageBytes"
       FROM file_revisions r
       LEFT JOIN file_revision_snapshots s ON s.revision_id = r.id
       ORDER BY r.created_at ASC, r.sequence ASC
       LIMIT $1`,
      [limit],
    );
  }
  return await queryPostgresRows<{ id: string; projectId: string; fileName: string; storageBytes: number }>(
    pool,
    `SELECT r.id AS id, r.project_id AS "projectId", r.file_name AS "fileName",
            coalesce(s.storage_bytes, 0)::bigint AS "storageBytes"
     FROM file_revisions r
     LEFT JOIN file_revision_snapshots s ON s.revision_id = r.id
     WHERE NOT (r.id = ANY($1::text[]))
     ORDER BY r.created_at ASC, r.sequence ASC
     LIMIT $2`,
    [exclude, limit],
  );
}

export async function pgGetFileRevisionSnapshotStorageStats(pool: Pool): Promise<{
  snapshotRowCount: number;
  orphanSnapshotRowCount: number;
  totalSnapshotBytes: number;
}> {
  const snapshotRowCount = Number((
    await queryPostgresRow<{ c: string }>(
      pool,
      `SELECT count(*)::text AS c FROM file_revision_snapshots`,
    )
  )?.c ?? 0);
  const orphanSnapshotRowCount = Number((
    await queryPostgresRow<{ c: string }>(
      pool,
      `SELECT count(*)::text AS c
       FROM file_revision_snapshots s
       LEFT JOIN file_revisions r ON r.id = s.revision_id
       WHERE r.id IS NULL`,
    )
  )?.c ?? 0);
  const totalSnapshotBytes = Number((
    await queryPostgresRow<{ total: string }>(
      pool,
      `SELECT coalesce(sum(storage_bytes), 0)::text AS total FROM file_revision_snapshots`,
    )
  )?.total ?? 0);
  return { snapshotRowCount, orphanSnapshotRowCount, totalSnapshotBytes };
}

export async function pgGetFileRevisionCount(
  pool: Pool,
  projectId: string,
  fileName: string,
): Promise<number> {
  const row = await queryPostgresRow<{ c: string }>(
    pool,
    `SELECT count(*)::text AS c
     FROM file_revisions
     WHERE project_id = $1 AND file_name = $2`,
    [projectId, fileName],
  );
  return Number(row?.c ?? 0);
}

export async function pgListAllFileRevisionIds(pool: Pool): Promise<string[]> {
  const rows = await queryPostgresRows<{ id: string }>(
    pool,
    `SELECT id FROM file_revisions`,
  );
  return rows.map((row) => row.id);
}

export async function pgListDistinctFileRevisionTargets(
  pool: Pool,
  projectId?: string,
): Promise<Array<{ projectId: string; fileName: string }>> {
  if (projectId) {
    return queryPostgresRows<{ projectId: string; fileName: string }>(
      pool,
      `SELECT DISTINCT project_id AS "projectId", file_name AS "fileName"
       FROM file_revisions
       WHERE project_id = $1
       ORDER BY file_name ASC`,
      [projectId],
    );
  }
  return queryPostgresRows<{ projectId: string; fileName: string }>(
    pool,
    `SELECT DISTINCT project_id AS "projectId", file_name AS "fileName"
     FROM file_revisions
     ORDER BY project_id ASC, file_name ASC`,
  );
}

export async function pgGetFileRevision(
  pool: Pool,
  projectId: string,
  fileName: string,
  revisionId: string,
): Promise<FileRevision | null> {
  const row = await queryPostgresRow<PgFileRevisionRow>(
    pool,
    `SELECT ${REVISION_COLS}
     FROM file_revisions
     WHERE project_id = $1 AND file_name = $2 AND id = $3`,
    [projectId, fileName, revisionId],
  );
  return row ? rowToRevision(row) : null;
}
