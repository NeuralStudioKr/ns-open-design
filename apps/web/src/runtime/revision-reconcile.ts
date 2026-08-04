import type { FileRevision } from '@open-design/contracts';

/** User intentionally navigated to a revision older than head. */
export function isUserViewingOlderRevision(
  activeSequence: number | undefined,
  headRevision: FileRevision | null | undefined,
): boolean {
  if (headRevision == null) return false;
  if (activeSequence != null) return activeSequence < headRevision.sequence;
  return false;
}

/**
 * Disk still shows head bytes while the cursor points at an older revision.
 * This is background-restore / scratch lag — not an external conflict.
 */
export function isHeadDiskSyncLag(
  cursor: FileRevision,
  headRevision: FileRevision | null | undefined,
  activeSequence: number | undefined,
  diskContent: string,
  cursorSnapshotContent: string,
  matchingRevision: FileRevision | null,
): boolean {
  if (!headRevision || !matchingRevision) return false;
  if (matchingRevision.id !== headRevision.id) return false;
  if (cursor.id === headRevision.id) return false;
  if (diskContent === cursorSnapshotContent) return false;
  if (activeSequence != null && activeSequence < headRevision.sequence) return true;
  return cursor.sequence < headRevision.sequence;
}

/** Keep the cursor revision when preview already reflects it and disk is only stale. */
export function shouldPreserveCursorDuringDiskLag(
  cursor: FileRevision,
  headRevision: FileRevision | null | undefined,
  activeSequence: number | undefined,
  previewSource: string | null,
  cursorSnapshotContent: string,
): boolean {
  if (previewSource !== cursorSnapshotContent) return false;
  if (!headRevision) return false;
  if (activeSequence != null) return activeSequence < headRevision.sequence;
  return cursor.sequence < headRevision.sequence;
}
