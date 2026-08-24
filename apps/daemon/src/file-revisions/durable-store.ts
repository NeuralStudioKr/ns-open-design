import type Database from 'better-sqlite3';
import type { FileRevision } from '@open-design/contracts';
import {
  getPostgresPool,
  isDaemonDbPostgres,
} from '../storage/daemon-db-runtime.js';
import type { FileRevisionInsert, FileRevisionRow } from './persistence.js';
import {
  pgCommitRevisionWithSnapshot,
  pgDeleteFileRevisionsAfterSequence,
  pgDeleteFileRevisionsByIdsWithSnapshots,
  pgGetFileRevisionCount,
  pgGetLatestFileRevision,
  pgListDistinctFileRevisionTargets,
  pgListFileRevisions,
  pgUpdateFileRevisionHead,
  type PgFileRevisionRow,
} from './postgres-persistence.js';
import {
  gzipRevisionSnapshot,
  resolveFullSnapshotInterval,
  shouldForceFullSnapshot,
} from './snapshot-codec.js';
import { usesPostgresRevisionSnapshots, upsertFileRevisionSnapshot } from './snapshot-storage.js';

function rowToRevision(row: FileRevisionRow): FileRevision {
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

function mirrorFileRevisionToSqlite(db: Database.Database, input: FileRevisionInsert): void {
  db.prepare(`
    INSERT INTO file_revisions (
      id, project_id, file_name, parent_revision_id, sequence, created_at,
      byte_size, source, label, conversation_id, assistant_message_id
    ) VALUES (
      @id, @projectId, @fileName, @parentRevisionId, @sequence, @createdAt,
      @byteSize, @source, @label, @conversationId, @assistantMessageId
    )
    ON CONFLICT(id) DO UPDATE SET
      project_id = excluded.project_id,
      file_name = excluded.file_name,
      parent_revision_id = excluded.parent_revision_id,
      sequence = excluded.sequence,
      created_at = excluded.created_at,
      byte_size = excluded.byte_size,
      source = excluded.source,
      label = excluded.label,
      conversation_id = excluded.conversation_id,
      assistant_message_id = excluded.assistant_message_id
  `).run({
    id: input.id,
    projectId: input.projectId,
    fileName: input.fileName,
    parentRevisionId: input.parentRevisionId ?? null,
    sequence: input.sequence,
    createdAt: input.createdAt,
    byteSize: input.byteSize,
    source: input.source,
    label: input.label,
    conversationId: input.conversationId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
  });
}

function pgRowToInsert(row: PgFileRevisionRow): FileRevisionInsert {
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
    conversationId: row.conversationId,
    assistantMessageId: row.assistantMessageId,
  };
}

function insertToPgRow(input: FileRevisionInsert): PgFileRevisionRow {
  return {
    id: input.id,
    projectId: input.projectId,
    fileName: input.fileName,
    parentRevisionId: input.parentRevisionId ?? null,
    sequence: input.sequence,
    createdAt: input.createdAt,
    byteSize: input.byteSize,
    source: input.source,
    label: input.label,
    conversationId: input.conversationId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
  };
}

export async function commitRevisionWithSnapshotDurable(
  db: Database.Database,
  input: FileRevisionInsert,
  content: string,
  options?: { parentContent?: string | null; sequence?: number },
): Promise<FileRevision> {
  const interval = resolveFullSnapshotInterval();
  const forceFull = options?.sequence != null
    ? shouldForceFullSnapshot(options.sequence, interval)
    : options?.parentContent == null;
  const encoded = gzipRevisionSnapshot(content, {
    parentContent: options?.parentContent ?? null,
    forceFull,
  });
  if (usesPostgresRevisionSnapshots()) {
    await pgCommitRevisionWithSnapshot(
      getPostgresPool(),
      insertToPgRow(input),
      encoded.compressed,
    );
  }
  return mirrorFileRevisionInsertToSqlite(db, input);
}

export async function hydrateFileRevisionsFromPostgres(
  db: Database.Database,
  projectId: string,
  fileName: string,
): Promise<void> {
  if (!usesPostgresRevisionSnapshots()) return;
  const pool = getPostgresPool();
  const rows = await pgListFileRevisions(pool, projectId, fileName);
  db.prepare(`
    DELETE FROM file_revisions
    WHERE project_id = ? AND file_name = ?
  `).run(projectId, fileName);
  for (const row of rows) {
    mirrorFileRevisionToSqlite(db, pgRowToInsert(row));
  }
}

export async function ensureFileRevisionsHydrated(
  db: Database.Database,
  projectId: string,
  fileName: string,
): Promise<void> {
  if (!usesPostgresRevisionSnapshots()) return;
  const pool = getPostgresPool();
  const [pgHead, sqliteHead, pgCount, sqliteCount] = await Promise.all([
    pgGetLatestFileRevision(pool, projectId, fileName),
    Promise.resolve(getLatestFileRevisionFromSqlite(db, projectId, fileName)),
    pgGetFileRevisionCount(pool, projectId, fileName),
    Promise.resolve(getFileRevisionCountFromSqlite(db, projectId, fileName)),
  ]);
  if (
    (pgHead?.id ?? null) === (sqliteHead?.id ?? null)
    && pgCount === sqliteCount
  ) {
    return;
  }
  await hydrateFileRevisionsFromPostgres(db, projectId, fileName);
}

export async function hydrateProjectFileRevisionsFromPostgres(
  db: Database.Database,
  projectId: string,
): Promise<number> {
  if (!isDaemonDbPostgres()) return 0;
  const pool = getPostgresPool();
  const targets = await pgListDistinctFileRevisionTargets(pool, projectId);
  let files = 0;
  for (const target of targets) {
    await hydrateFileRevisionsFromPostgres(db, projectId, target.fileName);
    files += 1;
  }
  return files;
}

function getFileRevisionCountFromSqlite(
  db: Database.Database,
  projectId: string,
  fileName: string,
): number {
  return (
    db.prepare(`
      SELECT count(*) AS c
      FROM file_revisions
      WHERE project_id = ? AND file_name = ?
    `).get(projectId, fileName) as { c: number }
  ).c;
}

function getLatestFileRevisionFromSqlite(
  db: Database.Database,
  projectId: string,
  fileName: string,
): FileRevision | null {
  const row = db.prepare(`
    SELECT
      id,
      project_id AS projectId,
      file_name AS fileName,
      parent_revision_id AS parentRevisionId,
      sequence,
      created_at AS createdAt,
      byte_size AS byteSize,
      source,
      label,
      conversation_id AS conversationId,
      assistant_message_id AS assistantMessageId
    FROM file_revisions
    WHERE project_id = ? AND file_name = ?
    ORDER BY sequence DESC
    LIMIT 1
  `).get(projectId, fileName) as FileRevisionRow | undefined;
  return row ? rowToRevision(row) : null;
}

export async function deleteFileRevisionsByIdsDurable(
  db: Database.Database,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  if (usesPostgresRevisionSnapshots()) {
    await pgDeleteFileRevisionsByIdsWithSnapshots(getPostgresPool(), ids);
  }
  const placeholders = ids.map(() => '?').join(', ');
  db.prepare(`DELETE FROM file_revisions WHERE id IN (${placeholders})`).run(...ids);
}

export async function deleteFileRevisionsAfterSequenceDurable(
  db: Database.Database,
  projectId: string,
  fileName: string,
  sequence: number,
): Promise<FileRevision[]> {
  if (usesPostgresRevisionSnapshots()) {
    await ensureFileRevisionsHydrated(db, projectId, fileName);
    const rows = db.prepare(`
      SELECT
        id,
        project_id AS projectId,
        file_name AS fileName,
        parent_revision_id AS parentRevisionId,
        sequence,
        created_at AS createdAt,
        byte_size AS byteSize,
        source,
        label,
        conversation_id AS conversationId,
        assistant_message_id AS assistantMessageId
      FROM file_revisions
      WHERE project_id = ? AND file_name = ? AND sequence > ?
      ORDER BY sequence ASC
    `).all(projectId, fileName, sequence) as FileRevisionRow[];
    const ids = await pgDeleteFileRevisionsAfterSequence(
      getPostgresPool(),
      projectId,
      fileName,
      sequence,
    );
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(', ');
      db.prepare(`DELETE FROM file_revisions WHERE id IN (${placeholders})`).run(...ids);
    }
    return rows.map(rowToRevision);
  }
  const { deleteFileRevisionsAfterSequence } = await import('./persistence.js');
  return deleteFileRevisionsAfterSequence(db, projectId, fileName, sequence);
}

export async function pruneOldestFileRevisionsDurable(
  db: Database.Database,
  projectId: string,
  fileName: string,
  keep: number,
): Promise<FileRevision[]> {
  const result = await pruneOldestFileRevisionsDurableLimited(
    db,
    projectId,
    fileName,
    keep,
    Number.POSITIVE_INFINITY,
  );
  return result.revisions;
}

export async function pruneOldestFileRevisionsDurableLimited(
  db: Database.Database,
  projectId: string,
  fileName: string,
  keep: number,
  maxDeletes: number,
): Promise<{ revisions: FileRevision[]; remainingExcess: number }> {
  if (usesPostgresRevisionSnapshots()) {
    await ensureFileRevisionsHydrated(db, projectId, fileName);
    const { listFileRevisions } = await import('./persistence.js');
    const { selectChainAwarePruneIds } = await import('./prune-chain.js');
    const revisions = listFileRevisions(db, projectId, fileName);
    const selection = selectChainAwarePruneIds(revisions, keep, maxDeletes);
    if (selection.revisionIds.length === 0) {
      return { revisions: [], remainingExcess: selection.remainingExcess };
    }
    await pgDeleteFileRevisionsByIdsWithSnapshots(getPostgresPool(), selection.revisionIds);
    const placeholders = selection.revisionIds.map(() => '?').join(', ');
    db.prepare(`DELETE FROM file_revisions WHERE id IN (${placeholders})`).run(...selection.revisionIds);
    return {
      revisions: selection.revisions,
      remainingExcess: selection.remainingExcess,
    };
  }
  const { pruneOldestFileRevisionsLimited } = await import('./persistence.js');
  return pruneOldestFileRevisionsLimited(db, projectId, fileName, keep, maxDeletes);
}

export function mirrorFileRevisionInsertToSqlite(
  db: Database.Database,
  input: FileRevisionInsert,
): FileRevision {
  mirrorFileRevisionToSqlite(db, input);
  return rowToRevision({
    id: input.id,
    projectId: input.projectId,
    fileName: input.fileName,
    parentRevisionId: input.parentRevisionId ?? null,
    sequence: input.sequence,
    createdAt: input.createdAt,
    byteSize: input.byteSize,
    source: input.source,
    label: input.label,
    conversationId: input.conversationId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
  });
}

export async function overwriteHeadRevisionSnapshotDurable(
  db: Database.Database,
  projectDir: string,
  fileName: string,
  head: FileRevision,
  input: {
    label: string;
    byteSize: number;
    createdAt: number;
    content: string;
    parentContent: string | null;
    conversationId?: string | null;
    assistantMessageId?: string | null;
  },
): Promise<FileRevision> {
  const interval = resolveFullSnapshotInterval();
  const forceFull = shouldForceFullSnapshot(head.sequence, interval) || input.parentContent == null;
  const encoded = gzipRevisionSnapshot(input.content, {
    parentContent: input.parentContent,
    forceFull,
  });
  if (usesPostgresRevisionSnapshots()) {
    await pgUpdateFileRevisionHead(
      getPostgresPool(),
      {
        id: head.id,
        label: input.label,
        byteSize: input.byteSize,
        createdAt: input.createdAt,
        conversationId: input.conversationId ?? null,
        assistantMessageId: input.assistantMessageId ?? null,
      },
      encoded.compressed,
    );
  }
  const { updateFileRevisionHeadMetadata } = await import('./persistence.js');
  const updated = updateFileRevisionHeadMetadata(db, head.id, {
    label: input.label,
    byteSize: input.byteSize,
    createdAt: input.createdAt,
    conversationId: input.conversationId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
  });
  if (!updated) {
    throw new Error(`revision not found: ${head.id}`);
  }
  if (!usesPostgresRevisionSnapshots()) {
    const { resolveFileRevisionSnapshotStorage } = await import('./snapshot-storage.js');
    const storage = resolveFileRevisionSnapshotStorage();
    if (storage === 'sqlite') {
      upsertFileRevisionSnapshot(db, head.id, encoded.compressed);
    } else {
      const { writeRevisionSnapshot } = await import('./store.js');
      await writeRevisionSnapshot(
        projectDir,
        fileName,
        head.id,
        input.content,
        { parentContent: input.parentContent, sequence: head.sequence },
        { db, storage: 'files' },
      );
    }
  }
  return updated;
}
