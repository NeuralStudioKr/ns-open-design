import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  ArtifactManifest,
  FileRevision,
  FileRevisionPushRequest,
  FileRevisionSource,
} from '@open-design/contracts';
import type { ProjectFile } from '@open-design/contracts';
import {
  commitRevisionWithSnapshotDurable,
  deleteFileRevisionsAfterSequenceDurable,
  ensureFileRevisionsHydrated,
  pruneOldestFileRevisionsDurable,
} from './durable-store.js';
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
  removeRevisionSnapshotFiles,
  writeRevisionSnapshot,
  type RevisionSnapshotStoreContext,
} from './store.js';
import { usesPostgresRevisionSnapshots } from './snapshot-storage.js';
import { withFileRevisionMutationLock } from './postgres-lock.js';

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
  const snapshotContext: RevisionSnapshotStoreContext = { db };
  const postgresAuthority = usesPostgresRevisionSnapshots();

  async function ensureHydrated(projectId: string, fileName: string): Promise<void> {
    if (!postgresAuthority) return;
    await ensureFileRevisionsHydrated(db, projectId, fileName);
  }

  function revisionMetadataLookup(projectId: string, fileName: string) {
    return (id: string) => {
      const revision = getFileRevision(db, projectId, fileName, id);
      if (!revision) return null;
      return {
        id: revision.id,
        sequence: revision.sequence,
        parentRevisionId: revision.parentRevisionId,
      };
    };
  }

  async function pruneSnapshots(
    projectDir: string,
    fileName: string,
    revisions: FileRevision[],
  ): Promise<void> {
    if (revisions.length === 0) return;
    if (postgresAuthority) {
      await Promise.all(
        revisions.map((revision) => removeRevisionSnapshotFiles(projectDir, fileName, revision.id)),
      );
      return;
    }
    await deleteRevisionSnapshots(projectDir, fileName, revisions.map((revision) => revision.id), snapshotContext);
  }

  async function enforceRetention(projectId: string, fileName: string, projectDir: string): Promise<void> {
    const pruned = postgresAuthority
      ? await pruneOldestFileRevisionsDurable(db, projectId, fileName, FILE_REVISION_RETENTION_LIMIT)
      : pruneOldestFileRevisions(db, projectId, fileName, FILE_REVISION_RETENTION_LIMIT);
    await pruneSnapshots(projectDir, fileName, pruned);
  }

  async function persistRevisionSnapshot(
    projectDir: string,
    fileName: string,
    revisionInput: Parameters<typeof insertFileRevision>[1],
    content: string,
    options: { parentContent: string | null; sequence: number },
  ): Promise<FileRevision> {
    if (postgresAuthority) {
      const revision = await commitRevisionWithSnapshotDurable(db, revisionInput, content, options);
      await removeRevisionSnapshotFiles(projectDir, fileName, revisionInput.id);
      return revision;
    }
    await writeRevisionSnapshot(projectDir, fileName, revisionInput.id, content, options, snapshotContext);
    return insertFileRevision(db, revisionInput);
  }

  async function readRevisionSnapshotContent(
    projectDir: string,
    projectId: string,
    fileName: string,
    revisionId: string,
  ): Promise<string> {
    return readRevisionSnapshot(
      projectDir,
      fileName,
      revisionId,
      (id) => getFileRevision(db, projectId, fileName, id)?.parentRevisionId ?? null,
      revisionMetadataLookup(projectId, fileName),
      snapshotContext,
    );
  }

  /**
   * Push needs on-disk bytes before overwrite for diff encoding. Teamver scratch
   * can be idle-evicted while revision snapshots remain in DaemonDb — fall back
   * to the latest revision snapshot instead of failing with ENOENT.
   */
  async function readCurrentFileContentForRevision(
    projectId: string,
    fileName: string,
    projectDir: string,
    metadata: unknown,
    latestRevision: FileRevision | null,
  ): Promise<string> {
    try {
      const beforeFile = await deps.readProjectFile(projectsRoot, projectId, fileName, metadata);
      return beforeFile.buffer.toString('utf8');
    } catch (err) {
      if (!err || (err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      if (latestRevision) {
        return readRevisionSnapshotContent(projectDir, projectId, fileName, latestRevision.id);
      }
      return '';
    }
  }

  return {
    async listRevisions(projectId: string, fileName: string) {
      await ensureHydrated(projectId, fileName);
      const revisions = listFileRevisions(db, projectId, fileName);
      const head = revisions.length > 0 ? revisions[revisions.length - 1]! : null;
      return {
        revisions,
        headRevisionId: head?.id ?? null,
        retentionLimit: FILE_REVISION_RETENTION_LIMIT,
      };
    },

    async getRevisionContent(
      projectId: string,
      fileName: string,
      revisionId: string,
      metadata?: unknown,
    ) {
      await ensureHydrated(projectId, fileName);
      const revision = getFileRevision(db, projectId, fileName, revisionId);
      if (!revision) return null;
      const projectDir = resolveProjectDir(projectsRoot, projectId, metadata);
      const content = await readRevisionSnapshot(
        projectDir,
        fileName,
        revisionId,
        (id) => getFileRevision(db, projectId, fileName, id)?.parentRevisionId ?? null,
        revisionMetadataLookup(projectId, fileName),
        snapshotContext,
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
      return withFileRevisionMutationLock(projectId, fileName, async () => {
        const projectDir = resolveProjectDir(projectsRoot, projectId, metadata);
        await ensureHydrated(projectId, fileName);

        if (typeof truncateAfterSequence === 'number' && Number.isFinite(truncateAfterSequence)) {
          const truncated = postgresAuthority
            ? await deleteFileRevisionsAfterSequenceDurable(db, projectId, fileName, truncateAfterSequence)
            : deleteFileRevisionsAfterSequence(db, projectId, fileName, truncateAfterSequence);
          await pruneSnapshots(projectDir, fileName, truncated);
        }

        let parent = getLatestFileRevision(db, projectId, fileName);
        if (!parent) {
          const beforeContent = await readCurrentFileContentForRevision(
            projectId,
            fileName,
            projectDir,
            metadata,
            null,
          );
          const baselineId = randomUUID();
          const createdAt = Date.now();
          parent = await persistRevisionSnapshot(
            projectDir,
            fileName,
            {
              id: baselineId,
              projectId,
              fileName,
              parentRevisionId: null,
              sequence: 1,
              createdAt,
              byteSize: Buffer.byteLength(beforeContent, 'utf8'),
              source: 'import',
              label: 'Baseline',
            },
            beforeContent,
            { parentContent: null, sequence: 1 },
          );
        }

        const sequence = parent.sequence + 1;
        const revisionId = randomUUID();
        const createdAt = Date.now();

        const parentContent = await readCurrentFileContentForRevision(
          projectId,
          fileName,
          projectDir,
          metadata,
          parent,
        );

        const file = await writeProjectFile(
          projectsRoot,
          projectId,
          fileName,
          content,
          { overwrite: true, artifactManifest },
          metadata,
        );

        const revision = await persistRevisionSnapshot(
          projectDir,
          fileName,
          {
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
          },
          content,
          { parentContent, sequence },
        );
        await enforceRetention(projectId, fileName, projectDir);
        return { revision, file };
      });
    },

    async restoreRevision(input: RestoreFileRevisionInput) {
      const { projectId, fileName, revisionId, metadata } = input;
      return withFileRevisionMutationLock(projectId, fileName, async () => {
        await ensureHydrated(projectId, fileName);
        const revision = getFileRevision(db, projectId, fileName, revisionId);
        if (!revision) return null;
        const projectDir = resolveProjectDir(projectsRoot, projectId, metadata);
        const content = await readRevisionSnapshot(
          projectDir,
          fileName,
          revisionId,
          (id) => getFileRevision(db, projectId, fileName, id)?.parentRevisionId ?? null,
          revisionMetadataLookup(projectId, fileName),
          snapshotContext,
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
      });
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
