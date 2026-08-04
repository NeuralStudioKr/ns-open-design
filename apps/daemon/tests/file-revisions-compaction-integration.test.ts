import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrateFileRevisions } from '../src/file-revisions/persistence.js';

vi.mock('../src/file-revisions/limits.js', () => ({
  FILE_REVISION_MAX_SNAPSHOT_BYTES: 1_000,
  FILE_REVISION_MAX_TOTAL_BYTES: 3_000,
  FILE_REVISION_PUSH_PRUNE_MAX: 2,
  FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES: 64 * 1024 * 1024,
  resolveFileRevisionMaxSnapshotBytes: () => 1_000,
  resolveFileRevisionMaxTotalBytes: () => 3_000,
  resolveFileRevisionPushPruneMax: () => 2,
}));

vi.mock('../src/file-revisions/coalesce.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/file-revisions/coalesce.js')>();
  return {
    ...actual,
    resolveFileRevisionCoalesceWindowMs: () => 0,
  };
});

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-compaction-integration-test');

afterEach(async () => {
  vi.clearAllMocks();
});

function revisionCount(db: Database.Database, projectId = 'proj-1'): number {
  const row = db.prepare(
    `SELECT count(*) AS c FROM file_revisions WHERE project_id = ?`,
  ).get(projectId) as { c: number };
  return row.c;
}

describe('file revision compaction integration', () => {
  it('schedules capped compaction passes after pushRevision until the byte budget is met', async () => {
    const { createFileRevisionService } = await import('../src/file-revisions/service.js');
    const { writeProjectFile, readProjectFile } = await import('../src/projects.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
    db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
    migrateFileRevisions(db);

    const projectsRoot = path.join(ROOT, 'push-compaction');
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

    const labels: string[] = [];
    for (let index = 1; index <= 6; index += 1) {
      const result = await service.pushRevision({
        projectId: 'proj-1',
        fileName: 'deck.html',
        content: 'x'.repeat(1_000),
        source: 'manual_edit',
        label: `v${index}`,
      });
      labels.push(result.revision.label);
      expect(result.revision.label).toBe(`v${index}`);
    }

    expect(labels).toHaveLength(6);

    await expect.poll(() => revisionCount(db), { timeout: 5_000 }).toBeLessThanOrEqual(3);

    const head = db.prepare(
      `SELECT label FROM file_revisions
       WHERE project_id = 'proj-1' AND file_name = 'deck.html'
       ORDER BY sequence DESC
       LIMIT 1`,
    ).get() as { label: string };
    expect(head.label).toBe('v6');
  });

  it('does not block pushRevision while compaction drains overflow across passes', async () => {
    const { createFileRevisionService } = await import('../src/file-revisions/service.js');
    const { writeProjectFile, readProjectFile } = await import('../src/projects.js');

    const db = new Database(':memory:');
    db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
    db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
    migrateFileRevisions(db);

    const projectsRoot = path.join(ROOT, 'push-nonblocking');
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

    const beforeCompaction = revisionCount(db);
    const pushed = await service.pushRevision({
      projectId: 'proj-1',
      fileName: 'deck.html',
      content: 'y'.repeat(1_000),
      source: 'manual_edit',
      label: 'first-push',
    });

    expect(pushed.revision.label).toBe('first-push');
    expect(revisionCount(db)).toBe(beforeCompaction + 2);

    for (let index = 2; index <= 6; index += 1) {
      await service.pushRevision({
        projectId: 'proj-1',
        fileName: 'deck.html',
        content: `${String.fromCharCode(96 + index)}`.repeat(1_000),
        source: 'manual_edit',
        label: `push-${index}`,
      });
    }

    await expect.poll(() => revisionCount(db), { timeout: 5_000 }).toBeLessThanOrEqual(3);
  });
});
