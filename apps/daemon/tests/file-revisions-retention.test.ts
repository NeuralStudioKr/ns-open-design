import { describe, expect, it } from 'vitest';
import { FILE_REVISION_RETENTION_LIMIT_DEFAULT } from '@open-design/contracts';
import { resolveFileRevisionRetentionLimit } from '../src/file-revisions/persistence.js';

describe('file revision retention limit', () => {
  it('defaults to the contracts constant', () => {
    expect(resolveFileRevisionRetentionLimit({})).toBe(FILE_REVISION_RETENTION_LIMIT_DEFAULT);
  });

  it('reads OD_FILE_REVISION_RETENTION_LIMIT when valid', () => {
    expect(resolveFileRevisionRetentionLimit({ OD_FILE_REVISION_RETENTION_LIMIT: '15' })).toBe(15);
  });

  it('falls back for invalid values', () => {
    expect(resolveFileRevisionRetentionLimit({ OD_FILE_REVISION_RETENTION_LIMIT: '0' }))
      .toBe(FILE_REVISION_RETENTION_LIMIT_DEFAULT);
    expect(resolveFileRevisionRetentionLimit({ OD_FILE_REVISION_RETENTION_LIMIT: 'abc' }))
      .toBe(FILE_REVISION_RETENTION_LIMIT_DEFAULT);
  });

  it('caps extremely large values', () => {
    expect(resolveFileRevisionRetentionLimit({ OD_FILE_REVISION_RETENTION_LIMIT: '9999' })).toBe(200);
  });
});
