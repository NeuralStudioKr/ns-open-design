// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  canRedoRevisionStack,
  canUndoRevisionStack,
  createRevisionStackSnapshot,
  revisionAfterCursor,
  revisionBeforeCursor,
  resolveRevisionCursorId,
  revisionCursorIndex,
  stackWithCursor,
  truncateAfterSequenceForStack,
} from '../../src/runtime/revision-stack';
import type { FileRevision } from '@open-design/contracts';

function revision(id: string, sequence: number): FileRevision {
  return {
    id,
    projectId: 'p1',
    fileName: 'deck.html',
    parentRevisionId: sequence > 1 ? `rev-${sequence - 1}` : null,
    sequence,
    createdAt: sequence,
    byteSize: 10,
    source: 'manual_edit',
    label: `Rev ${sequence}`,
  };
}

describe('revision-stack', () => {
  it('tracks undo/redo availability from cursor position', () => {
    const stack = createRevisionStackSnapshot(
      [revision('rev-1', 1), revision('rev-2', 2), revision('rev-3', 3)],
      'rev-3',
      'rev-3',
    );
    expect(canUndoRevisionStack(stack)).toBe(true);
    expect(canRedoRevisionStack(stack)).toBe(false);
    expect(revisionBeforeCursor(stack)?.id).toBe('rev-2');
    expect(revisionAfterCursor(stack)).toBeNull();
    expect(truncateAfterSequenceForStack(stack)).toBe(3);
    expect(revisionCursorIndex(stack)).toBe(2);
  });

  it('supports redo after undo', () => {
    const stack = stackWithCursor(
      createRevisionStackSnapshot(
        [revision('rev-1', 1), revision('rev-2', 2)],
        'rev-2',
        'rev-2',
      ),
      'rev-1',
    );
    expect(canUndoRevisionStack(stack)).toBe(false);
    expect(canRedoRevisionStack(stack)).toBe(true);
    expect(revisionAfterCursor(stack)?.id).toBe('rev-2');
  });

  it('hydrates cursor from active sequence when in-memory cursor is missing', () => {
    const revisions = [revision('rev-1', 1), revision('rev-2', 2), revision('rev-3', 3)];
    expect(resolveRevisionCursorId(revisions, 'rev-3', {
      currentCursorRevisionId: null,
      activeSequence: 2,
    })).toBe('rev-2');
    expect(resolveRevisionCursorId(revisions, 'rev-3', {
      currentCursorRevisionId: 'missing',
      activeSequence: undefined,
    })).toBe('rev-3');
  });

  it('advances past an undo/restore cursor when active sequence moves to a newer tip', () => {
    // Undo left the viewer on rev-1; agent persist truncated + pushed rev-4 and
    // set activeSequence to the tip. Refresh must jump to the tip, not stick.
    const revisions = [
      revision('rev-1', 1),
      revision('rev-4', 4),
    ];
    expect(resolveRevisionCursorId(revisions, 'rev-4', {
      currentCursorRevisionId: 'rev-1',
      activeSequence: 4,
    })).toBe('rev-4');
  });

  it('keeps the undo cursor when active sequence still matches it', () => {
    const revisions = [revision('rev-1', 1), revision('rev-2', 2), revision('rev-3', 3)];
    expect(resolveRevisionCursorId(revisions, 'rev-3', {
      currentCursorRevisionId: 'rev-1',
      activeSequence: 1,
    })).toBe('rev-1');
  });
});
