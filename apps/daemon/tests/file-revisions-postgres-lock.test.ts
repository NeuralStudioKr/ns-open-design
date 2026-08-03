import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FileRevisionLockError,
  isFileRevisionSequenceConflict,
  withFileRevisionMutationLock,
} from '../src/file-revisions/postgres-lock.js';
import {
  resetDaemonDbRuntimeForTests,
  setDaemonDbRuntimeForTests,
} from '../src/storage/daemon-db-runtime.js';

describe('file-revisions postgres lock', () => {
  afterEach(() => {
    resetDaemonDbRuntimeForTests();
    vi.restoreAllMocks();
  });

  it('runs without locking when postgres revision snapshots are disabled', async () => {
    const fn = vi.fn(async () => 'ok');
    await expect(withFileRevisionMutationLock('proj-1', 'deck.html', fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('acquires and releases advisory lock around mutation', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('SET lock_timeout')) return { rows: [] };
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    const connect = vi.fn(async () => client);
    setDaemonDbRuntimeForTests({
      kind: 'postgres',
      pool: { connect } as never,
      location: 'test:5432/test',
    });
    vi.stubEnv('OD_DAEMON_DB', 'postgres');

    const fn = vi.fn(async () => 'done');
    await expect(withFileRevisionMutationLock('proj-1', 'deck.html', fn)).resolves.toBe('done');

    expect(connect).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      'SELECT pg_advisory_lock(hashtext($1), hashtext($2))',
      ['proj-1', 'deck.html'],
    );
    expect(query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1), hashtext($2))',
      ['proj-1', 'deck.html'],
    );
    expect(client.release).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('maps lock timeout to FileRevisionLockError', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('SET lock_timeout')) return { rows: [] };
      const err = Object.assign(new Error('lock timeout'), { code: '55P03' });
      throw err;
    });
    const client = { query, release: vi.fn() };
    setDaemonDbRuntimeForTests({
      kind: 'postgres',
      pool: { connect: vi.fn(async () => client) } as never,
      location: 'test:5432/test',
    });
    vi.stubEnv('OD_DAEMON_DB', 'postgres');

    await expect(
      withFileRevisionMutationLock('proj-1', 'deck.html', async () => 'noop'),
    ).rejects.toBeInstanceOf(FileRevisionLockError);
  });

  it('detects file revision sequence unique violations', () => {
    expect(isFileRevisionSequenceConflict({
      code: '23505',
      constraint: 'file_revisions_project_id_file_name_sequence_key',
    })).toBe(true);
    expect(isFileRevisionSequenceConflict({
      code: '23505',
      constraint: 'projects_pkey',
    })).toBe(false);
  });
});
