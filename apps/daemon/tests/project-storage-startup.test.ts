import { describe, expect, it } from 'vitest';
import {
  allowsS3ScratchFallback,
  describeStorageStartupError,
  s3StorageHealthNotReadyReason,
} from '../src/storage/project-storage-startup.js';

describe('project-storage-startup', () => {
  it('does not allow scratch fallback by default in S3 mode', () => {
    expect(allowsS3ScratchFallback({})).toBe(false);
    expect(allowsS3ScratchFallback({ OD_S3_ALLOW_SCRATCH_FALLBACK: '0' })).toBe(false);
    expect(allowsS3ScratchFallback({ OD_S3_ALLOW_SCRATCH_FALLBACK: 'true' })).toBe(false);
  });

  it('allows scratch fallback only with the explicit debug flag', () => {
    expect(allowsS3ScratchFallback({ OD_S3_ALLOW_SCRATCH_FALLBACK: '1' })).toBe(true);
  });

  it('surfaces scratch fallback vs cold init in health reason', () => {
    expect(s3StorageHealthNotReadyReason(false)).toBe('storage_not_initialized');
    expect(s3StorageHealthNotReadyReason(true)).toBe('scratch_fallback');
  });

  it('normalizes startup error descriptions for logs and thrown errors', () => {
    expect(describeStorageStartupError(new Error('missing bucket'))).toBe('missing bucket');
    expect(describeStorageStartupError('boom')).toBe('boom');
  });
});

