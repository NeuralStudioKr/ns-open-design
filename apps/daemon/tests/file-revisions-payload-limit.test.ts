import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateFileRevisions } from '../src/file-revisions/persistence.js';

vi.mock('../src/file-revisions/limits.js', () => ({
  FILE_REVISION_MAX_SNAPSHOT_BYTES: 64,
  FILE_REVISION_MAX_TOTAL_BYTES: 0,
  resolveFileRevisionMaxSnapshotBytes: () => 64,
  resolveFileRevisionMaxTotalBytes: () => 0,
}));

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-payload-limit-test');

afterEach(async () => {
  vi.clearAllMocks();
});

describe('file revision payload size guard', () => {
  it('rejects oversized revision pushes before persisting the edit', async () => {
    const { FileRevisionPayloadTooLargeError } = await import('../src/file-revisions/errors.js');
    const { createFileRevisionService } = await import('../src/file-revisions/service.js');
    const { writeProjectFile, readProjectFile } = await import('../src/projects.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
    db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
    migrateFileRevisions(db);

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

    await expect(service.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: 'x'.repeat(128),
      source: 'manual_edit',
      label: 'Too large',
    })).rejects.toBeInstanceOf(FileRevisionPayloadTooLargeError);

    const rows = db.prepare(`SELECT count(*) AS c FROM file_revisions`).get() as { c: number };
    expect(rows.c).toBe(1);
  });
});
