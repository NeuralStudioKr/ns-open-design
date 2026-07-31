import { describe, expect, it } from 'vitest';
import { createRevisionStackSnapshot } from '../../src/runtime/revision-stack';
import {
  cursorRevisionFromStack,
  revisionCursorMatchesDisk,
} from '../../src/runtime/revision-conflict';

describe('revision-conflict', () => {
  it('detects when disk content diverges from the cursor revision snapshot', () => {
    const stack = createRevisionStackSnapshot(
      [{
        id: 'rev-1',
        projectId: 'p',
        fileName: 'deck.html',
        parentRevisionId: null,
        sequence: 1,
        createdAt: 0,
        byteSize: 10,
        source: 'manual_edit',
        label: 'Edit',
      }],
      'rev-1',
      'rev-1',
    );
    expect(revisionCursorMatchesDisk(stack, '<html>disk</html>', '<html>snap</html>')).toBe(false);
    expect(revisionCursorMatchesDisk(stack, '<html>same</html>', '<html>same</html>')).toBe(true);
    expect(cursorRevisionFromStack(stack)?.id).toBe('rev-1');
  });
});
