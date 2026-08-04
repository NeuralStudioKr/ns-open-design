import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.OD_FILE_REVISION_RETENTION_LIMIT = '2';
});

import { migrateFileRevisions, insertFileRevision } from '../src/file-revisions/persistence.js';
import { upsertFileRevisionSnapshot } from '../src/file-revisions/snapshot-storage.js';
import { runDeferredRevisionRetentionForTarget } from '../src/file-revisions/retention-sweep.js';
import { registerRevisionDeferredSweep, scheduleRevisionRetentionSweep } from '../src/file-revisions/deferred-sweep.js';

vi.mock('../src/file-revisions/limits.js', () => ({
  FILE_REVISION_MAX_SNAPSHOT_BYTES: 8 * 1024 * 1024,
  FILE_REVISION_MAX_TOTAL_BYTES: 0,
  FILE_REVISION_PUSH_PRUNE_MAX: 2,
  FILE_REVISION_ABSOLUTE_MAX_SNAPSHOT_BYTES: 64 * 1024 * 1024,
  resolveFileRevisionMaxSnapshotBytes: () => 8 * 1024 * 1024,
  resolveFileRevisionMaxTotalBytes: () => 0,
  resolveFileRevisionPushPruneMax: () => 2,
}));

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-retention-sweep-test');

function openDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL)`);
  db.prepare(`INSERT INTO projects (id, name) VALUES ('proj-1', 'Demo')`).run();
  migrateFileRevisions(db);
  return db;
}

async function seedLinearRevisions(
  db: Database.Database,
  projectsRoot: string,
  count: number,
): Promise<void> {
  const projectDir = path.join(projectsRoot, 'proj-1');
  const revisionsDir = path.join(projectDir, '.od', 'revisions', 'deck.html');
  await mkdir(revisionsDir, { recursive: true });
  for (let sequence = 1; sequence <= count; sequence += 1) {
    const id = `rev-${sequence}`;
    insertFileRevision(db, {
      id,
      projectId: 'proj-1',
      fileName: 'deck.html',
      parentRevisionId: sequence > 1 ? `rev-${sequence - 1}` : null,
      sequence,
      createdAt: Date.now(),
      byteSize: 10,
      source: 'manual_edit',
      label: `v${sequence}`,
    });
    upsertFileRevisionSnapshot(db, id, Buffer.from(`blob-${sequence}`));
    await writeFile(path.join(revisionsDir, `${id}.snap.gz`), Buffer.from(`blob-${sequence}`));
  }
}

describe('file revision deferred retention sweep', () => {
  it('prunes oldest chain-safe revisions in capped batches', async () => {
    const db = openDb();
    const projectsRoot = path.join(ROOT, 'batched');
    await seedLinearRevisions(db, projectsRoot, 10);

    const context = {
      db,
      projectsRoot,
      resolveProjectDir: (_root: string, projectId: string) => path.join(projectsRoot, projectId),
      snapshotContext: { db },
      postgresAuthority: false,
    };

    const first = await runDeferredRevisionRetentionForTarget(
      context,
      'proj-1',
      'deck.html',
      undefined,
      { retentionLimit: 2, maxDeletes: 2 },
    );
    expect(first.pruned).toBe(2);
    expect(first.deferredExcess).toBe(6);
    expect(
      (db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-1'`).get() as { c: number }).c,
    ).toBe(8);

    const second = await runDeferredRevisionRetentionForTarget(
      context,
      'proj-1',
      'deck.html',
      undefined,
      { retentionLimit: 2, maxDeletes: 2 },
    );
    expect(second.pruned).toBe(2);
    expect(second.deferredExcess).toBe(4);
    expect(
      (db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-1'`).get() as { c: number }).c,
    ).toBe(6);
  });

  it('schedules deferred retention without blocking when chain checkpoints stall pruning', async () => {
    const db = openDb();
    const projectsRoot = path.join(ROOT, 'scheduled');
    registerRevisionDeferredSweep({
      db,
      projectsRoot,
      resolveProjectDir: (_root: string, projectId: string) => path.join(projectsRoot, projectId),
      snapshotContext: { db },
      postgresAuthority: false,
    });

    await seedLinearRevisions(db, projectsRoot, 4);

    scheduleRevisionRetentionSweep('proj-1', 'deck.html');
    await expect.poll(
      () => (db.prepare(`SELECT count(*) AS c FROM file_revisions WHERE project_id = 'proj-1'`).get() as { c: number }).c,
      { timeout: 3_000 },
    ).toBe(4);
  });
});
