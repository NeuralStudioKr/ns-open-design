import { describe, expect, it } from 'vitest';
import { resolveFileRevisionSnapshotStorage } from '../src/file-revisions/snapshot-storage.js';

describe('resolveFileRevisionSnapshotStorage', () => {
  it('defaults to files for local daemon', () => {
    expect(resolveFileRevisionSnapshotStorage({})).toBe('files');
  });

  it('defaults to postgres when OD_DAEMON_DB=postgres', () => {
    expect(resolveFileRevisionSnapshotStorage({ OD_DAEMON_DB: 'postgres' })).toBe('postgres');
  });

  it('selects sqlite when env is set explicitly', () => {
    expect(resolveFileRevisionSnapshotStorage({ OD_FILE_REVISION_SNAPSHOT_STORAGE: 'sqlite' })).toBe('sqlite');
  });

  it('honors explicit files mode even with postgres daemon db', () => {
    expect(resolveFileRevisionSnapshotStorage({
      OD_DAEMON_DB: 'postgres',
      OD_FILE_REVISION_SNAPSHOT_STORAGE: 'files',
    })).toBe('files');
  });
});
