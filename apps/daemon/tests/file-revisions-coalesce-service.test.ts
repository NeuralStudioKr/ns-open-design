import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateFileRevisions } from '../src/file-revisions/persistence.js';

vi.mock('../src/file-revisions/coalesce.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/file-revisions/coalesce.js')>();
  return {
    ...actual,
    resolveFileRevisionCoalesceWindowMs: () => 60_000,
  };
});

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-coalesce-service-test');

afterEach(async () => {
  vi.clearAllMocks();
});

describe('file revision push coalescing', () => {
  it('merges rapid manual_edit pushes into the current head revision', async () => {
    const { createFileRevisionService } = await import('../src/file-revisions/service.js');
    const { writeProjectFile, readProjectFile } = await import('../src/projects.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
    db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
    migrateFileRevisions(db);

    const projectsRoot = path.join(ROOT, 'projects');
    const projectDir = path.join(projectsRoot, 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'deck.html'), '<html>v0</html>', 'utf8');

    const service = createFileRevisionService({
      db,
      projectsRoot,
      writeProjectFile,
      readProjectFile,
      resolveProjectDir: (root, projectId) => path.join(root, projectId),
    });

    const first = await service.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: '<html>v1</html>',
      source: 'manual_edit',
      label: 'Edit 1',
    });
    const second = await service.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: '<html>v2</html>',
      source: 'manual_edit',
      label: 'Edit 2',
    });

    expect(second.revision.id).toBe(first.revision.id);
    expect(second.revision.sequence).toBe(first.revision.sequence);
    expect(second.revision.label).toBe('Edit 2');
    expect(db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-1'`).get())
      .toEqual({ c: 2 });
  });
});
