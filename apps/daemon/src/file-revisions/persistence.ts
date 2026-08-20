import type Database from 'better-sqlite3';
import type { FileRevision, FileRevisionSource } from '@open-design/contracts';
import { FILE_REVISION_RETENTION_LIMIT_DEFAULT } from '@open-design/contracts';
import {
  getPostgresPool,
  isDaemonDbPostgres,
  schedulePostgresWrite,
} from '../storage/daemon-db-runtime.js';
import { migrateFileRevisionSnapshots, usesPostgresRevisionSnapshots } from './snapshot-storage.js';
import { selectChainAwarePruneIds } from './prune-chain.js';
import {
  pgDeleteFileRevisionsAfterSequence as pgDeleteRevisionsAfterSequence,
  pgDeleteFileRevisionsByIds,
  pgInsertFileRevision,
} from './postgres-persistence.js';

export function resolveFileRevisionRetentionLimit(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.OD_FILE_REVISION_RETENTION_LIMIT;
  if (raw == null || raw.trim() === '') return FILE_REVISION_RETENTION_LIMIT_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 2) return FILE_REVISION_RETENTION_LIMIT_DEFAULT;
  return Math.min(parsed, 200);
}

export const FILE_REVISION_RETENTION_LIMIT = resolveFileRevisionRetentionLimit();

/**
 * Canonical NFC key for `file_revisions.file_name` — SQL comparisons are
 * byte-exact so we must persist and query in a single Unicode form. Hangul
 * filenames uploaded from macOS legacy (NFD) that later come back through
 * the FE (NFC) would otherwise land in a different row and orphan history.
 */
export function canonicalizeFileRevisionKey(fileName: string): string {
  const raw = String(fileName ?? '').trim().replace(/\\/g, '/');
  try {
    return raw.normalize('NFC');
  } catch {
    return raw;
  }
}

export interface FileRevisionRow {
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

export interface FileRevisionInsert {
  id: string;
  projectId: string;
  fileName: string;
  parentRevisionId?: string | null;
  sequence: number;
  createdAt: number;
  byteSize: number;
  source: FileRevisionSource;
  label: string;
  conversationId?: string | null;
  assistantMessageId?: string | null;
}


export function migrateFileRevisions(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_revisions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      parent_revision_id TEXT,
      sequence INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      byte_size INTEGER NOT NULL,
      source TEXT NOT NULL,
      label TEXT NOT NULL,
      conversation_id TEXT,
      assistant_message_id TEXT,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, file_name, sequence)
    );
    CREATE INDEX IF NOT EXISTS idx_file_revisions_project_file
      ON file_revisions(project_id, file_name, sequence DESC);
  `);
  migrateFileRevisionSnapshots(db);
}

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

export function insertFileRevision(db: Database.Database, input: FileRevisionInsert): FileRevision {
  const canonicalFileName = canonicalizeFileRevisionKey(input.fileName);
  db.prepare(`
    INSERT INTO file_revisions (
      id, project_id, file_name, parent_revision_id, sequence, created_at,
      byte_size, source, label, conversation_id, assistant_message_id
    ) VALUES (
      @id, @projectId, @fileName, @parentRevisionId, @sequence, @createdAt,
      @byteSize, @source, @label, @conversationId, @assistantMessageId
    )
  `).run({
    id: input.id,
    projectId: input.projectId,
    fileName: canonicalFileName,
    parentRevisionId: input.parentRevisionId ?? null,
    sequence: input.sequence,
    createdAt: input.createdAt,
    byteSize: input.byteSize,
    source: input.source,
    label: input.label,
    conversationId: input.conversationId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
  });
  const revision = rowToRevision({
    id: input.id,
    projectId: input.projectId,
    fileName: canonicalFileName,
    parentRevisionId: input.parentRevisionId ?? null,
    sequence: input.sequence,
    createdAt: input.createdAt,
    byteSize: input.byteSize,
    source: input.source,
    label: input.label,
    conversationId: input.conversationId ?? null,
    assistantMessageId: input.assistantMessageId ?? null,
  });
  if (isDaemonDbPostgres() && !usesPostgresRevisionSnapshots()) {
    schedulePostgresWrite(async () => {
      await pgInsertFileRevision(getPostgresPool(), {
        id: revision.id,
        projectId: revision.projectId,
        fileName: revision.fileName,
        parentRevisionId: revision.parentRevisionId,
        sequence: revision.sequence,
        createdAt: revision.createdAt,
        byteSize: revision.byteSize,
        source: revision.source,
        label: revision.label,
        conversationId: revision.conversationId ?? null,
        assistantMessageId: revision.assistantMessageId ?? null,
      });
    });
  }
  return revision;
}

export function updateFileRevisionHeadMetadata(
  db: Database.Database,
  revisionId: string,
  patch: {
    label: string;
    byteSize: number;
    createdAt: number;
    conversationId?: string | null;
    assistantMessageId?: string | null;
  },
): FileRevision | null {
  const existing = db.prepare(`
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
    WHERE id = ?
  `).get(revisionId) as FileRevisionRow | undefined;
  if (!existing) return null;
  db.prepare(`
    UPDATE file_revisions
    SET label = @label,
        byte_size = @byteSize,
        created_at = @createdAt,
        conversation_id = @conversationId,
        assistant_message_id = @assistantMessageId
    WHERE id = @id
  `).run({
    id: revisionId,
    label: patch.label,
    byteSize: patch.byteSize,
    createdAt: patch.createdAt,
    conversationId: patch.conversationId ?? existing.conversationId,
    assistantMessageId: patch.assistantMessageId ?? existing.assistantMessageId,
  });
  return rowToRevision({
    ...existing,
    label: patch.label,
    byteSize: patch.byteSize,
    createdAt: patch.createdAt,
    conversationId: patch.conversationId ?? existing.conversationId,
    assistantMessageId: patch.assistantMessageId ?? existing.assistantMessageId,
  });
}

function syncDeletedRevisionIdsToPostgres(ids: string[]): void {
  if (!isDaemonDbPostgres() || usesPostgresRevisionSnapshots() || ids.length === 0) return;
  schedulePostgresWrite(async () => {
    await pgDeleteFileRevisionsByIds(getPostgresPool(), ids);
  });
}

function syncDeleteAfterSequenceToPostgres(
  projectId: string,
  fileName: string,
  sequence: number,
): void {
  if (!isDaemonDbPostgres() || usesPostgresRevisionSnapshots()) return;
  schedulePostgresWrite(async () => {
    await pgDeleteRevisionsAfterSequence(getPostgresPool(), projectId, fileName, sequence);
  });
}

export function getFileRevision(
  db: Database.Database,
  projectId: string,
  fileName: string,
  revisionId: string,
): FileRevision | null {
  const canonical = canonicalizeFileRevisionKey(fileName);
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
    WHERE project_id = ? AND file_name = ? AND id = ?
  `).get(projectId, canonical, revisionId) as FileRevisionRow | undefined;
  return row ? rowToRevision(row) : null;
}

export function listFileRevisions(
  db: Database.Database,
  projectId: string,
  fileName: string,
): FileRevision[] {
  const canonical = canonicalizeFileRevisionKey(fileName);
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
    WHERE project_id = ? AND file_name = ?
    ORDER BY sequence ASC
  `).all(projectId, canonical) as FileRevisionRow[];
  return rows.map(rowToRevision);
}

export function getLatestFileRevision(
  db: Database.Database,
  projectId: string,
  fileName: string,
): FileRevision | null {
  const canonical = canonicalizeFileRevisionKey(fileName);
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
  `).get(projectId, canonical) as FileRevisionRow | undefined;
  return row ? rowToRevision(row) : null;
}

export function deleteFileRevisionsAfterSequence(
  db: Database.Database,
  projectId: string,
  fileName: string,
  sequence: number,
): FileRevision[] {
  const canonical = canonicalizeFileRevisionKey(fileName);
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
  `).all(projectId, canonical, sequence) as FileRevisionRow[];
  if (rows.length === 0) return [];
  db.prepare(`
    DELETE FROM file_revisions
    WHERE project_id = ? AND file_name = ? AND sequence > ?
  `).run(projectId, canonical, sequence);
  syncDeleteAfterSequenceToPostgres(projectId, canonical, sequence);
  return rows.map(rowToRevision);
}

export function getRevisionAncestry(
  db: Database.Database,
  projectId: string,
  fileName: string,
  revisionId: string,
): FileRevision[] {
  const ancestry: FileRevision[] = [];
  let currentId: string | null = revisionId;
  const seen = new Set<string>();
  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const revision = getFileRevision(db, projectId, fileName, currentId);
    if (!revision) break;
    ancestry.push(revision);
    currentId = revision.parentRevisionId;
  }
  return ancestry;
}

export function listDistinctFileRevisionTargets(
  db: Database.Database,
): Array<{ projectId: string; fileName: string }> {
  return db.prepare(`
    SELECT DISTINCT project_id AS projectId, file_name AS fileName
    FROM file_revisions
    ORDER BY project_id ASC, file_name ASC
  `).all() as Array<{ projectId: string; fileName: string }>;
}

export function pruneOldestFileRevisions(
  db: Database.Database,
  projectId: string,
  fileName: string,
  keep: number,
): FileRevision[] {
  return pruneOldestFileRevisionsLimited(db, projectId, fileName, keep, Number.POSITIVE_INFINITY).revisions;
}

export function pruneOldestFileRevisionsLimited(
  db: Database.Database,
  projectId: string,
  fileName: string,
  keep: number,
  maxDeletes: number,
): { revisions: FileRevision[]; remainingExcess: number } {
  const revisions = listFileRevisions(db, projectId, fileName);
  const selection = selectChainAwarePruneIds(revisions, keep, maxDeletes);
  if (selection.revisionIds.length === 0) {
    return { revisions: [], remainingExcess: selection.remainingExcess };
  }

  const placeholders = selection.revisionIds.map(() => '?').join(', ');
  db.prepare(`DELETE FROM file_revisions WHERE id IN (${placeholders})`).run(...selection.revisionIds);
  syncDeletedRevisionIdsToPostgres(selection.revisionIds);
  return {
    revisions: selection.revisions,
    remainingExcess: selection.remainingExcess,
  };
}
