import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  ArtifactManifest,
  FileRevision,
  FileRevisionPushRequest,
  FileRevisionSource,
} from '@open-design/contracts';
import type { ProjectFile } from '../projects.js';
import {
  deleteFileRevisionsAfterSequence,
  FILE_REVISION_RETENTION_LIMIT,
  getFileRevision,
  getLatestFileRevision,
  insertFileRevision,
  listFileRevisions,
  pruneOldestFileRevisions,
} from './persistence.js';
import {
  deleteRevisionSnapshots,
  readRevisionSnapshot,
  writeRevisionSnapshot,
} from './store.js';

type WriteProjectFile = (
  projectsRoot: string,
  projectId: string,
  name: string,
  body: string | Buffer,
  options?: { overwrite?: boolean; artifactManifest?: ArtifactManifest | null },
  metadata?: unknown,
) => Promise<ProjectFile>;

type ReadProjectFile = (
  projectsRoot: string,
  projectId: string,
  name: string,
  metadata?: unknown,
) => Promise<{ buffer: Buffer }>;

type ResolveProjectDir = (
  projectsRoot: string,
  projectId: string,
  metadata?: unknown,
) => string;

export interface FileRevisionServiceDeps {
  db: Database.Database;
  projectsRoot: string;
  writeProjectFile: WriteProjectFile;
  readProjectFile: ReadProjectFile;
  resolveProjectDir: ResolveProjectDir;
}

export interface PushFileRevisionInput extends FileRevisionPushRequest {
  projectId: string;
  fileName: string;
  metadata?: unknown;
}

export interface RestoreFileRevisionInput {
  projectId: string;
  fileName: string;
  revisionId: string;
  metadata?: unknown;
}

export function createFileRevisionService(deps: FileRevisionServiceDeps) {
  const { db, projectsRoot, writeProjectFile, resolveProjectDir } = deps;

  async function pruneSnapshots(
    projectDir: string,
    fileName: string,
    revisions: FileRevision[],
  ): Promise<void> {
    if (revisions.length === 0) return;
    await deleteRevisionSnapshots(projectDir, fileName, revisions.map((revision) => revision.id));
  }

  async function enforceRetention(projectId: string, fileName: string, projectDir: string): Promise<void> {
    const pruned = pruneOldestFileRevisions(
      db,
      projectId,
      fileName,
      FILE_REVISION_RETENTION_LIMIT,
    );
    await pruneSnapshots(projectDir, fileName, pruned);
  }

  return {
    listRevisions(projectId: string, fileName: string) {
      const revisions = listFileRevisions(db, projectId, fileName);
      const head = revisions.length > 0 ? revisions[revisions.length - 1]! : null;
      return {
        revisions,
        headRevisionId: head?.id ?? null,
      };
    },

    async getRevisionContent(
      projectId: string,
      fileName: string,
      revisionId: string,
      metadata?: unknown,
    ) {
      const revision = getFileRevision(db, projectId, fileName, revisionId);
      if (!revision) return null;
      const projectDir = resolveProjectDir(projectsRoot, projectId, metadata);
      const content = await readRevisionSnapshot(
        projectDir,
        fileName,
        revisionId,
        (id) => getFileRevision(db, projectId, fileName, id)?.parentRevisionId ?? null,
      );
      return { revision, content };
    },

    async pushRevision(input: PushFileRevisionInput) {
      const {
        projectId,
        fileName,
        content,
        source,
        label,
        artifactManifest = null,
        conversationId,
        assistantMessageId,
        truncateAfterSequence,
        metadata,
      } = input;
      const projectDir = resolveProjectDir(projectsRoot, projectId, metadata);
      const getParentRevisionId = (id: string) =>
        getFileRevision(db, projectId, fileName, id)?.parentRevisionId ?? null;

      if (typeof truncateAfterSequence === 'number' && Number.isFinite(truncateAfterSequence)) {
        const truncated = deleteFileRevisionsAfterSequence(
          db,
          projectId,
          fileName,
          truncateAfterSequence,
        );
        await pruneSnapshots(projectDir, fileName, truncated);
      }

      let parent = getLatestFileRevision(db, projectId, fileName);
      if (!parent) {
        const beforeFile = await deps.readProjectFile(projectsRoot, projectId, fileName, metadata);
        const beforeContent = beforeFile.buffer.toString('utf8');
        const baselineId = randomUUID();
        const createdAt = Date.now();
        await writeRevisionSnapshot(projectDir, fileName, baselineId, beforeContent, {
          parentContent: null,
          sequence: 1,
        });
        parent = insertFileRevision(db, {
          id: baselineId,
          projectId,
          fileName,
          parentRevisionId: null,
          sequence: 1,
          createdAt,
          byteSize: Buffer.byteLength(beforeContent, 'utf8'),
          source: 'import',
          label: 'Baseline',
        });
      }

      const sequence = parent.sequence + 1;
      const revisionId = randomUUID();
      const createdAt = Date.now();

      const parentContent = await readRevisionSnapshot(
        projectDir,
        fileName,
        parent.id,
        getParentRevisionId,
      );

      const file = await writeProjectFile(
        projectsRoot,
        projectId,
        fileName,
        content,
        { overwrite: true, artifactManifest },
        metadata,
      );

      await writeRevisionSnapshot(projectDir, fileName, revisionId, content, {
        parentContent,
        sequence,
      });
      const revision = insertFileRevision(db, {
        id: revisionId,
        projectId,
        fileName,
        parentRevisionId: parent.id,
        sequence,
        createdAt,
        byteSize: Buffer.byteLength(content, 'utf8'),
        source,
        label,
        conversationId: conversationId ?? null,
        assistantMessageId: assistantMessageId ?? null,
      });
      await enforceRetention(projectId, fileName, projectDir);
      return { revision, file };
    },

    async restoreRevision(input: RestoreFileRevisionInput) {
      const { projectId, fileName, revisionId, metadata } = input;
      const revision = getFileRevision(db, projectId, fileName, revisionId);
      if (!revision) return null;
      const projectDir = resolveProjectDir(projectsRoot, projectId, metadata);
      const content = await readRevisionSnapshot(
        projectDir,
        fileName,
        revisionId,
        (id) => getFileRevision(db, projectId, fileName, id)?.parentRevisionId ?? null,
      );
      const file = await writeProjectFile(
        projectsRoot,
        projectId,
        fileName,
        content,
        { overwrite: true },
        metadata,
      );
      return { revision, file };
    },
  };
}

export function isFileRevisionSource(value: unknown): value is FileRevisionSource {
  return value === 'manual_edit'
    || value === 'inspect'
    || value === 'agent_element_patch'
    || value === 'agent_deck_patch'
    || value === 'agent_full_deck'
    || value === 'import'
    || value === 'restore';
}
