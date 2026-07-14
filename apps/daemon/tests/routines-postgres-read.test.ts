import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertRoutine,
  listRoutinesAsync,
  openDatabase,
} from '../src/db.js';

describe('listRoutinesAsync', () => {
  let dbDir: string;

  beforeEach(() => {
    dbDir = mkdtempSync(path.join(tmpdir(), 'od-routines-pg-read-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('delegates to sqlite when postgres is off', async () => {
    const db = openDatabase(dbDir, { dataDir: path.join(dbDir, '.od') });
    const now = Date.now();
    insertRoutine(db, {
      id: 'routine-a',
      name: 'Daily',
      prompt: 'go',
      scheduleKind: 'daily',
      scheduleValue: '09:00',
      scheduleJson: null,
      projectMode: 'create_each_run',
      projectId: null,
      skillId: null,
      agentId: null,
      contextJson: null,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    const routines = await listRoutinesAsync(db);
    expect(routines.map((row) => row.id)).toEqual(['routine-a']);
  });
});
