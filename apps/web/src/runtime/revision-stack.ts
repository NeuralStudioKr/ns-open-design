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
 * Pick the revision cursor after list refresh / remount.
 *
 * - Prefer `activeSequence` when it points at a newer revision than the
 *   in-memory cursor. ProjectView sets activeSequence to the new tip after
 *   agent persist; keeping an undo/restore cursor would rewind history.
 * - Otherwise keep a still-valid in-memory cursor (undo/redo browsing).
 * - Else hydrate from activeSequence, then head.
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
  const preserved =
    currentCursorRevisionId
      && revisions.some((revision) => revision.id === currentCursorRevisionId)
      ? revisions.find((revision) => revision.id === currentCursorRevisionId) ?? null
      : null;
  const fromSequence =
    activeSequence != null
      ? revisions.find((revision) => revision.sequence === activeSequence) ?? null
      : null;

  if (fromSequence && (!preserved || fromSequence.sequence > preserved.sequence)) {
    return fromSequence.id;
  }
  if (preserved) return preserved.id;
  if (fromSequence) return fromSequence.id;
  return headRevisionId;
}
