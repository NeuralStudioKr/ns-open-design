import type { FileRevision } from '@open-design/contracts';

export type RevisionStackSnapshot = {
  revisions: FileRevision[];
  headRevisionId: string | null;
  cursorRevisionId: string | null;
};

export function createRevisionStackSnapshot(
  revisions: FileRevision[],
  headRevisionId: string | null,
  cursorRevisionId: string | null = headRevisionId,
): RevisionStackSnapshot {
  return { revisions, headRevisionId, cursorRevisionId };
}

export function revisionCursorIndex(stack: RevisionStackSnapshot): number {
  if (!stack.cursorRevisionId) return -1;
  return stack.revisions.findIndex((revision) => revision.id === stack.cursorRevisionId);
}

export function canUndoRevisionStack(stack: RevisionStackSnapshot): boolean {
  return revisionCursorIndex(stack) > 0;
}

export function canRedoRevisionStack(stack: RevisionStackSnapshot): boolean {
  const index = revisionCursorIndex(stack);
  return index >= 0 && index < stack.revisions.length - 1;
}

export function revisionBeforeCursor(stack: RevisionStackSnapshot): FileRevision | null {
  const index = revisionCursorIndex(stack);
  if (index <= 0) return null;
  return stack.revisions[index - 1] ?? null;
}

export function revisionAfterCursor(stack: RevisionStackSnapshot): FileRevision | null {
  const index = revisionCursorIndex(stack);
  if (index < 0 || index >= stack.revisions.length - 1) return null;
  return stack.revisions[index + 1] ?? null;
}

export function truncateAfterSequenceForStack(stack: RevisionStackSnapshot): number | undefined {
  const index = revisionCursorIndex(stack);
  if (index < 0) return undefined;
  return stack.revisions[index]?.sequence;
}

export function stackWithCursor(
  stack: RevisionStackSnapshot,
  cursorRevisionId: string | null,
): RevisionStackSnapshot {
  return { ...stack, cursorRevisionId };
}

/**
 * Optimistically apply a successful push before list refresh returns.
 * Truncates the local redo branch the same way the daemon does, then
 * appends the new tip so a rapid second save still has a valid cursor
 * for `truncateAfterSequenceForStack`.
 */
export function stackWithPushedRevision(
  stack: RevisionStackSnapshot,
  pushed: FileRevision,
  truncateAfterSequence: number | undefined = truncateAfterSequenceForStack(stack),
): RevisionStackSnapshot {
  const kept = typeof truncateAfterSequence === 'number'
    ? stack.revisions.filter(
      (revision) => revision.sequence <= truncateAfterSequence && revision.id !== pushed.id,
    )
    : stack.revisions.filter((revision) => revision.id !== pushed.id);
  const revisions = [...kept, pushed].sort((a, b) => a.sequence - b.sequence);
  return {
    revisions,
    headRevisionId: pushed.id,
    cursorRevisionId: pushed.id,
  };
}

/**
 * Pick the revision cursor after list refresh / remount.
 *
 * `activeSequence` is the cross-surface SSOT (FileViewer undo/redo/history,
 * ProjectView agent persist + toast undo). When it resolves to a revision in
 * the list, always adopt it — both tip advance (undo → chat edit) and tip
 * demotion (toast Undo). Fall back to a still-valid in-memory cursor, then head.
 */
export function resolveRevisionCursorId(
  revisions: FileRevision[],
  headRevisionId: string | null,
  options: {
    currentCursorRevisionId?: string | null;
    activeSequence?: number;
  } = {},
): string | null {
  const { currentCursorRevisionId, activeSequence } = options;
  if (activeSequence != null) {
    const fromSequence = revisions.find((revision) => revision.sequence === activeSequence);
    if (fromSequence) return fromSequence.id;
  }
  if (
    currentCursorRevisionId
    && revisions.some((revision) => revision.id === currentCursorRevisionId)
  ) {
    return currentCursorRevisionId;
  }
  return headRevisionId;
}
