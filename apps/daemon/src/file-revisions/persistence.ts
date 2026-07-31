import type Database from 'better-sqlite3';
import type { FileRevision, FileRevisionSource } from '@open-design/contracts';
import { FILE_REVISION_RETENTION_LIMIT_DEFAULT } from '@open-design/contracts';

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

export function getFileRevision(
  db: Database.Database,
  projectId: string,
  fileName: string,
  revisionId: string,
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
    WHERE project_id = ? AND file_name = ? AND id = ?
  `).get(projectId, fileName, revisionId) as FileRevisionRow | undefined;
  return row ? rowToRevision(row) : null;
}

export function listFileRevisions(
  db: Database.Database,
  projectId: string,
  fileName: string,
): FileRevision[] {
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
  `).all(projectId, fileName) as FileRevisionRow[];
  return rows.map(rowToRevision);
}

export function getLatestFileRevision(
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

export function deleteFileRevisionsAfterSequence(
  db: Database.Database,
  projectId: string,
  fileName: string,
  sequence: number,
): FileRevision[] {
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
  if (rows.length === 0) return [];
  db.prepare(`
    DELETE FROM file_revisions
    WHERE project_id = ? AND file_name = ? AND sequence > ?
  `).run(projectId, fileName, sequence);
  return rows.map(rowToRevision);
}

export function pruneOldestFileRevisions(
  db: Database.Database,
  projectId: string,
  fileName: string,
  keep: number,
): FileRevision[] {
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
    ORDER BY sequence DESC
    LIMIT -1 OFFSET ?
  `).all(projectId, fileName, keep) as FileRevisionRow[];
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');
  db.prepare(`DELETE FROM file_revisions WHERE id IN (${placeholders})`).run(...ids);
  return rows.map(rowToRevision);
}
