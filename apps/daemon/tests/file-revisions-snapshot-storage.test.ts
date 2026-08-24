import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrateFileRevisions, insertFileRevision } from '../src/file-revisions/persistence.js';
import {
  deleteRevisionSnapshot,
  readRevisionSnapshot,
  writeRevisionSnapshot,
} from '../src/file-revisions/store.js';
import { getFileRevisionSnapshot } from '../src/file-revisions/snapshot-storage.js';

const ROOT = path.join(process.cwd(), '.tmp', 'file-revisions-sqlite-test');

afterEach(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

function openTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY
    );
  `);
  db.prepare('INSERT INTO projects (id) VALUES (?)').run('proj-1');
  migrateFileRevisions(db);
  return db;
}

function seedRevision(db: Database.Database, id: string, sequence: number): void {
  insertFileRevision(db, {
    id,
    projectId: 'proj-1',
    fileName: 'deck.html',
    parentRevisionId: null,
    sequence,
    createdAt: sequence,
    byteSize: 10,
    source: 'import',
    label: `v${sequence}`,
  });
}

describe('file-revisions sqlite snapshot storage', () => {
  it('stores snapshots in daemon DB and removes .od/revisions files', async () => {
    const projectDir = path.join(ROOT, 'project');
    await mkdir(projectDir, { recursive: true });
    const db = openTestDb();
    const context = { db, storage: 'sqlite' as const };
    seedRevision(db, 'rev-1', 1);

    await writeRevisionSnapshot(projectDir, 'deck.html', 'rev-1', '<html>v1</html>', {
      parentContent: null,
      sequence: 1,
    }, context);

    const snapPath = path.join(projectDir, '.od', 'revisions', 'deck.html', 'rev-1.snap.gz');
    await expect(stat(snapPath)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(getFileRevisionSnapshot(db, 'rev-1')).not.toBeNull();

    const content = await readRevisionSnapshot(
      projectDir,
      'deck.html',
      'rev-1',
      () => null,
      undefined,
      context,
    );
    expect(content).toBe('<html>v1</html>');
  });

  it('falls back to legacy files when sqlite row is missing', async () => {
    const projectDir = path.join(ROOT, 'legacy');
    const db = openTestDb();
    const fileContext = { storage: 'files' as const };
    await writeRevisionSnapshot(projectDir, 'deck.html', 'rev-legacy', '<html>legacy</html>', {
      parentContent: null,
      sequence: 1,
    }, fileContext);

    const sqliteContext = { db, storage: 'sqlite' as const };
    const content = await readRevisionSnapshot(
      projectDir,
      'deck.html',
      'rev-legacy',
      () => null,
      undefined,
      sqliteContext,
    );
    expect(content).toBe('<html>legacy</html>');
  });

  it('deletes sqlite rows and files together', async () => {
    const projectDir = path.join(ROOT, 'delete');
    await mkdir(projectDir, { recursive: true });
    const db = openTestDb();
    const context = { db, storage: 'sqlite' as const };
    seedRevision(db, 'rev-del', 1);
    await writeRevisionSnapshot(projectDir, 'deck.html', 'rev-del', '<html>gone</html>', {
      parentContent: null,
      sequence: 1,
    }, context);
    await deleteRevisionSnapshot(projectDir, 'deck.html', 'rev-del', context);
    expect(getFileRevisionSnapshot(db, 'rev-del')).toBeNull();
    await expect(readRevisionSnapshot(
      projectDir,
      'deck.html',
      'rev-del',
      () => null,
      undefined,
      context,
    )).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
