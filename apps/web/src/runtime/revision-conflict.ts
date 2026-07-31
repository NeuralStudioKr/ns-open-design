import type { RevisionStackSnapshot } from './revision-stack';

/** Disk content matches the snapshot stored for the active cursor revision. */
export function revisionCursorMatchesDisk(
  stack: RevisionStackSnapshot,
  diskContent: string,
  cursorSnapshotContent: string,
): boolean {
  if (!stack.cursorRevisionId) return true;
  return diskContent === cursorSnapshotContent;
}

export function cursorRevisionFromStack(stack: RevisionStackSnapshot) {
  if (!stack.cursorRevisionId) return null;
  return stack.revisions.find((revision) => revision.id === stack.cursorRevisionId) ?? null;
}
