import { describe, expect, it, vi } from 'vitest';
import { createRevisionStackSnapshot } from '../../src/runtime/revision-stack';
import {
  cursorRevisionFromStack,
  findRevisionMatchingDiskContent,
  revisionCursorMatchesDisk,
} from '../../src/runtime/revision-conflict';
import type { FileRevision } from '@open-design/contracts';

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

describe('revision-conflict', () => {
  it('detects when disk content diverges from the cursor revision snapshot', () => {
    const stack = createRevisionStackSnapshot(
      [revision('rev-1', 1)],
      'rev-1',
      'rev-1',
    );
    expect(revisionCursorMatchesDisk(stack, '<html>disk</html>', '<html>snap</html>')).toBe(false);
    expect(revisionCursorMatchesDisk(stack, '<html>same</html>', '<html>same</html>')).toBe(true);
    expect(cursorRevisionFromStack(stack)?.id).toBe('rev-1');
  });

  it('finds the newest revision whose snapshot matches disk content', async () => {
    const revisions = [revision('rev-1', 1), revision('rev-2', 2)];
    const snapshots = new Map([
      ['rev-1', '<html>older</html>'],
      ['rev-2', '<html>newer</html>'],
    ]);
    const match = await findRevisionMatchingDiskContent(
      revisions,
      '<html>older</html>',
      async (revisionId) => snapshots.get(revisionId) ?? null,
    );
    expect(match?.id).toBe('rev-1');
  });

  it('skips revisions in the provided skip set', async () => {
    const revisions = [revision('rev-1', 1), revision('rev-2', 2)];
    const snapshots = new Map([
      ['rev-1', '<html>older</html>'],
      ['rev-2', '<html>newer</html>'],
    ]);
    const match = await findRevisionMatchingDiskContent(
      revisions,
      '<html>older</html>',
      async (revisionId) => snapshots.get(revisionId) ?? null,
      new Set(['rev-1']),
    );
    expect(match).toBeNull();
  });
});
