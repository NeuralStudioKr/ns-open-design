import { describe, expect, it } from 'vitest';
import { resolveFileRevisionSnapshotStorage } from '../src/file-revisions/snapshot-storage.js';

describe('resolveFileRevisionSnapshotStorage', () => {
  it('defaults to files', () => {
    expect(resolveFileRevisionSnapshotStorage({})).toBe('files');
  });

  it('selects sqlite when env is set', () => {
    expect(resolveFileRevisionSnapshotStorage({ OD_FILE_REVISION_SNAPSHOT_STORAGE: 'sqlite' })).toBe('sqlite');
  });
});
