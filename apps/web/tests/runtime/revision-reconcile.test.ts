// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { FileRevision } from '@open-design/contracts';
import {
  isHeadDiskSyncLag,
  isUserViewingOlderRevision,
  shouldPreserveCursorDuringDiskLag,
} from '../../src/runtime/revision-reconcile';

function revision(id: string, sequence: number): FileRevision {
  return {
    id,
    projectId: 'p',
    fileName: 'deck.html',
    parentRevisionId: null,
    sequence,
    createdAt: 0,
    byteSize: 10,
    source: 'manual_edit',
    label: id,
  };
}

describe('revision-reconcile', () => {
  const head = revision('rev-3', 3);
  const cursor = revision('rev-1', 1);

  it('detects when the user is browsing older history', () => {
    expect(isUserViewingOlderRevision(1, head)).toBe(true);
    expect(isUserViewingOlderRevision(3, head)).toBe(false);
    expect(isUserViewingOlderRevision(undefined, head)).toBe(false);
  });

  it('treats head-matching disk as sync lag while cursor is older', () => {
    expect(isHeadDiskSyncLag(
      cursor,
      head,
      1,
      '<html>head</html>',
      '<html>older</html>',
      head,
    )).toBe(true);
    expect(isHeadDiskSyncLag(
      head,
      head,
      3,
      '<html>head</html>',
      '<html>head</html>',
      head,
    )).toBe(false);
  });

  it('preserves cursor preview when disk is stale during history browse', () => {
    expect(shouldPreserveCursorDuringDiskLag(
      cursor,
      head,
      1,
      '<html>older</html>',
      '<html>older</html>',
    )).toBe(true);
    expect(shouldPreserveCursorDuringDiskLag(
      cursor,
      head,
      1,
      '<html>head</html>',
      '<html>older</html>',
    )).toBe(false);
  });
});
