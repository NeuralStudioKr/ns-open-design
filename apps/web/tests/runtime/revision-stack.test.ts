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
  stackWithPushedRevision,
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

  it('optimistically truncates redo branch when applying a pushed tip', () => {
    const stack = createRevisionStackSnapshot(
      [revision('rev-1', 1), revision('rev-2', 2), revision('rev-3', 3)],
      'rev-3',
      'rev-1',
    );
    const next = stackWithPushedRevision(stack, revision('rev-4', 4), 1);
    expect(next.revisions.map((entry) => entry.id)).toEqual(['rev-1', 'rev-4']);
    expect(next.headRevisionId).toBe('rev-4');
    expect(next.cursorRevisionId).toBe('rev-4');
    expect(truncateAfterSequenceForStack(next)).toBe(4);
  });

  it('treats active sequence as SSOT for hydrate, tip advance, and toast demote', () => {
    const revisions = [revision('rev-1', 1), revision('rev-2', 2), revision('rev-3', 3)];
    // Remount hydrate when React cursor was lost.
    expect(resolveRevisionCursorId(revisions, 'rev-3', {
      currentCursorRevisionId: null,
      activeSequence: 2,
    })).toBe('rev-2');
    // Undo → agent persist: jump to tip even if preserved undo cursor remains.
    expect(resolveRevisionCursorId(
      [revision('rev-1', 1), revision('rev-4', 4)],
      'rev-4',
      { currentCursorRevisionId: 'rev-1', activeSequence: 4 },
    )).toBe('rev-4');
    // Toast Undo demotes activeSequence — must not keep the tip cursor.
    expect(resolveRevisionCursorId(revisions, 'rev-3', {
      currentCursorRevisionId: 'rev-3',
      activeSequence: 2,
    })).toBe('rev-2');
    // Active matches preserved undo cursor.
    expect(resolveRevisionCursorId(revisions, 'rev-3', {
      currentCursorRevisionId: 'rev-1',
      activeSequence: 1,
    })).toBe('rev-1');
    // Missing active → keep preserved, else head.
    expect(resolveRevisionCursorId(revisions, 'rev-3', {
      currentCursorRevisionId: 'rev-1',
      activeSequence: undefined,
    })).toBe('rev-1');
    expect(resolveRevisionCursorId(revisions, 'rev-3', {
      currentCursorRevisionId: 'missing',
      activeSequence: undefined,
    })).toBe('rev-3');
  });
});
