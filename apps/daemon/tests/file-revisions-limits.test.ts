import { describe, expect, it } from 'vitest';
import {
  FILE_REVISION_MAX_SNAPSHOT_BYTES_DEFAULT,
  FILE_REVISION_MAX_TOTAL_BYTES_DEFAULT,
} from '@open-design/contracts';
import {
  resolveFileRevisionMaxSnapshotBytes,
  resolveFileRevisionMaxTotalBytes,
  resolveFileRevisionPushPruneMax,
} from '../src/file-revisions/limits.js';

describe('file revision byte limits', () => {
  it('defaults snapshot cap to the contracts constant', () => {
    expect(resolveFileRevisionMaxSnapshotBytes({})).toBe(FILE_REVISION_MAX_SNAPSHOT_BYTES_DEFAULT);
    expect(resolveFileRevisionMaxTotalBytes({})).toBe(FILE_REVISION_MAX_TOTAL_BYTES_DEFAULT);
  });

  it('reads OD_FILE_REVISION_MAX_SNAPSHOT_BYTES when valid', () => {
    expect(resolveFileRevisionMaxSnapshotBytes({ OD_FILE_REVISION_MAX_SNAPSHOT_BYTES: '1048576' })).toBe(1048576);
  });

  it('rejects snapshot caps below 64 KiB and above 64 MiB', () => {
    expect(resolveFileRevisionMaxSnapshotBytes({ OD_FILE_REVISION_MAX_SNAPSHOT_BYTES: '1024' }))
      .toBe(FILE_REVISION_MAX_SNAPSHOT_BYTES_DEFAULT);
    expect(resolveFileRevisionMaxSnapshotBytes({ OD_FILE_REVISION_MAX_SNAPSHOT_BYTES: '999999999' }))
      .toBe(64 * 1024 * 1024);
  });

  it('reads OD_FILE_REVISION_MAX_TOTAL_BYTES when valid (0 disables budget)', () => {
    expect(resolveFileRevisionMaxTotalBytes({ OD_FILE_REVISION_MAX_TOTAL_BYTES: '0' })).toBe(0);
    expect(resolveFileRevisionMaxTotalBytes({ OD_FILE_REVISION_MAX_TOTAL_BYTES: '50000000' })).toBe(50_000_000);
  });

  it('falls back for invalid total budget values', () => {
    expect(resolveFileRevisionMaxTotalBytes({ OD_FILE_REVISION_MAX_TOTAL_BYTES: '-1' }))
      .toBe(FILE_REVISION_MAX_TOTAL_BYTES_DEFAULT);
    expect(resolveFileRevisionMaxTotalBytes({ OD_FILE_REVISION_MAX_TOTAL_BYTES: 'abc' }))
      .toBe(FILE_REVISION_MAX_TOTAL_BYTES_DEFAULT);
  });

  it('reads OD_FILE_REVISION_PUSH_PRUNE_MAX when valid', () => {
    expect(resolveFileRevisionPushPruneMax({})).toBe(8);
    expect(resolveFileRevisionPushPruneMax({ OD_FILE_REVISION_PUSH_PRUNE_MAX: '3' })).toBe(3);
  });
});
