import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { closeDatabase, encodeProjectListCursor, insertProject, listProjectsPage, openDatabase, parseProjectListCursor } from '../src/db.js';

describe('listProjectsPage', () => {
  let dbDir: string;

  beforeEach(() => {
    dbDir = mkdtempSync(path.join(tmpdir(), 'od-project-list-page-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('returns projects in updated_at desc order with stable cursor pagination', () => {
    const db = openDatabase(dbDir, { dataDir: path.join(dbDir, '.od') });
    const now = Date.now();
    insertProject(db, {
      id: 'p-old',
      name: 'Old',
      skillId: null,
      designSystemId: null,
      createdAt: now - 3_000,
      updatedAt: now - 3_000,
    });
    insertProject(db, {
      id: 'p-mid',
      name: 'Mid',
      skillId: null,
      designSystemId: null,
      createdAt: now - 2_000,
      updatedAt: now - 2_000,
    });
    insertProject(db, {
      id: 'p-new',
      name: 'New',
      skillId: null,
      designSystemId: null,
      createdAt: now - 1_000,
      updatedAt: now - 1_000,
    });

    const first = listProjectsPage(db, { limit: 2 });
    expect(first.projects.map((project) => project.id)).toEqual(['p-new', 'p-mid']);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = listProjectsPage(db, {
      limit: 2,
      cursor: {
        updatedAt: first.projects[1]!.updatedAt,
        id: first.projects[1]!.id,
      },
    });
    expect(second.projects.map((project) => project.id)).toEqual(['p-old']);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  it('parseProjectListCursor round-trips encoded project ids', () => {
    const db = openDatabase(dbDir, { dataDir: path.join(dbDir, '.od') });
    const cursor = encodeProjectListCursor({
      updatedAt: 1_710_000_000_000,
      id: 'proj:with:colons',
    });
    expect(parseProjectListCursor(cursor)).toEqual({
      updatedAt: 1_710_000_000_000,
      id: 'proj:with:colons',
    });
    const page = listProjectsPage(db, {
      limit: 1,
      cursor: parseProjectListCursor(cursor),
    });
    expect(page.projects).toEqual([]);
  });
});
