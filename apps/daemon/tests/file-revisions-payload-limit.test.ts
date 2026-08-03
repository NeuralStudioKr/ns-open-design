import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { insertFileRevision, migrateFileRevisions } from '../src/file-revisions/persistence.js';
import { upsertFileRevisionSnapshot } from '../src/file-revisions/snapshot-storage.js';

vi.mock('../src/file-revisions/limits.js', () => ({
  FILE_REVISION_MAX_SNAPSHOT_BYTES: 64,
  FILE_REVISION_MAX_TOTAL_BYTES: 0,
  FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES: 256 * 1024,
  FILE_REVISION_PUSH_PRUNE_MAX: 8,
  resolveFileRevisionMaxSnapshotBytes: () => 64,
  resolveFileRevisionMaxTotalBytes: () => 0,
  resolveFileRevisionPushPruneMax: () => 8,
}));

vi.mock('../src/file-revisions/coalesce.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/file-revisions/coalesce.js')>();
  return {
    ...actual,
    resolveFileRevisionCoalesceWindowMs: () => 0,
  };
});

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-payload-limit-test');

afterEach(async () => {
  vi.clearAllMocks();
});

describe('file revision payload size guard', () => {
  it('accepts large revision pushes without synchronous pruning', async () => {
    const { createFileRevisionService } = await import('../src/file-revisions/service.js');
    const { writeProjectFile, readProjectFile } = await import('../src/projects.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
    db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
    db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-2', 'Other')`).run();
    migrateFileRevisions(db);

    insertFileRevision(db, {
      id: 'old-other',
      projectId: 'proj-2',
      fileName: 'deck.html',
      parentRevisionId: null,
      sequence: 1,
      createdAt: 1,
      byteSize: 200,
      source: 'import',
      label: 'Old',
    });
    upsertFileRevisionSnapshot(db, 'old-other', Buffer.alloc(200, 0x62));

    const projectsRoot = path.join(ROOT, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'deck.html'), '<html>baseline</html>', 'utf8');

    const service = createFileRevisionService({
      db,
      projectsRoot,
      writeProjectFile,
      readProjectFile,
      resolveProjectDir: (root, projectId) => path.join(root, projectId),
    });

    const result = await service.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: 'x'.repeat(128),
      source: 'manual_edit',
      label: 'Large but allowed',
    });

    expect(result.revision.label).toBe('Large but allowed');
    expect(db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-2'`).get())
      .toEqual({ c: 1 });
    expect(db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-1'`).get())
      .toEqual({ c: 2 });
  });

  it('still rejects payloads above the absolute safety ceiling', async () => {
    const { FileRevisionPayloadTooLargeError } = await import('../src/file-revisions/errors.js');
    const { createFileRevisionService } = await import('../src/file-revisions/service.js');
    const { writeProjectFile, readProjectFile } = await import('../src/projects.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
    db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
    migrateFileRevisions(db);

    const projectsRoot = path.join(ROOT, 'projects-abs');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'deck.html'), '<html>baseline</html>', 'utf8');

    const service = createFileRevisionService({
      db,
      projectsRoot,
      writeProjectFile,
      readProjectFile,
      resolveProjectDir: (root, projectId) => path.join(root, projectId),
    });

    await expect(service.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: 'x'.repeat(256 * 1024 + 1),
      source: 'manual_edit',
      label: 'Too large',
    })).rejects.toBeInstanceOf(FileRevisionPayloadTooLargeError);
  });
});
