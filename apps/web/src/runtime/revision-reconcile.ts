import type { FileRevision } from '@open-design/contracts';
import { revisionSnapshotContentMatches } from './revision-content-match';

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
  if (revisionSnapshotContentMatches(diskContent, cursorSnapshotContent)) return false;
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
  if (!revisionSnapshotContentMatches(previewSource, cursorSnapshotContent)) return false;
  if (!headRevision) return false;
  if (activeSequence != null) return activeSequence < headRevision.sequence;
  return cursor.sequence < headRevision.sequence;
}

/**
 * Disk matches a revision newer than the cursor while the user is browsing
 * older history (undo). Do not fast-forward the stack to that newer revision.
 */
export function shouldSkipDiskFastForwardDuringHistoryBrowse(
  cursor: FileRevision,
  headRevision: FileRevision | null | undefined,
  matchingRevision: FileRevision,
): boolean {
  if (!headRevision) return false;
  if (cursor.id === headRevision.id) return false;
  if (cursor.sequence >= headRevision.sequence) return false;
  return matchingRevision.sequence > cursor.sequence;
}

export type RevisionDiskReconcileOutcome =
  | 'cursor_matches_disk'
  | 'sync_lag_head_disk'
  | 'preserve_history_cursor'
  | 'adopt_matching_disk'
  | 'external_conflict';

export interface RevisionDiskReconcileInput {
  cursor: FileRevision;
  headRevision: FileRevision | null | undefined;
  activeSequence: number | undefined;
  diskContent: string;
  cursorSnapshotContent: string;
  previewSource: string | null;
  matchingRevision: FileRevision | null;
}

/**
 * Classify how disk bytes relate to the active revision cursor.
 * Distinguishes background sync lag from a true external edit conflict.
 */
export function classifyRevisionDiskReconcile(input: RevisionDiskReconcileInput): RevisionDiskReconcileOutcome {
  const {
    cursor,
    headRevision,
    activeSequence,
    diskContent,
    cursorSnapshotContent,
    previewSource,
    matchingRevision,
  } = input;

  if (revisionSnapshotContentMatches(diskContent, cursorSnapshotContent)) {
    return 'cursor_matches_disk';
  }

  if (matchingRevision) {
    if (isHeadDiskSyncLag(
      cursor,
      headRevision,
      activeSequence,
      diskContent,
      cursorSnapshotContent,
      matchingRevision,
    )) {
      return 'sync_lag_head_disk';
    }
    if (shouldSkipDiskFastForwardDuringHistoryBrowse(cursor, headRevision, matchingRevision)) {
      return 'preserve_history_cursor';
    }
    return 'adopt_matching_disk';
  }

  if (shouldPreserveCursorDuringDiskLag(
    cursor,
    headRevision,
    activeSequence,
    previewSource,
    cursorSnapshotContent,
  )) {
    return 'preserve_history_cursor';
  }

  // Preview already shows the cursor revision while disk diverged — scratch/S3
  // lag or byte-normalization drift, not an external edit the user can see.
  if (isRevisionPreviewAlignedWithCursor(previewSource, cursorSnapshotContent)) {
    return 'preserve_history_cursor';
  }

  return 'external_conflict';
}

/** Preview HTML already matches the active cursor snapshot. */
export function isRevisionPreviewAlignedWithCursor(
  previewSource: string | null,
  cursorSnapshotContent: string,
  additionalAlignedSources: ReadonlyArray<string | null | undefined> = [],
): boolean {
  if (revisionSnapshotContentMatches(previewSource, cursorSnapshotContent)) return true;
  for (const candidate of additionalAlignedSources) {
    if (revisionSnapshotContentMatches(candidate, cursorSnapshotContent)) return true;
  }
  return false;
}

/** True when disk diverged from known revision history in a way that invalidates undo/redo. */
export function isExternalRevisionDiskConflict(input: RevisionDiskReconcileInput): boolean {
  return classifyRevisionDiskReconcile(input) === 'external_conflict';
}

/**
 * Head revision snapshot is authoritative when scratch / object storage lags postgres
 * but disk still reflects an older known revision — not when disk is unknown bytes.
 */
export function shouldApplyHeadRevisionSnapshotAuthority(
  cursor: FileRevision,
  headRevision: FileRevision | null | undefined,
  userAtHeadRevision: boolean,
  diskContent: string,
  cursorSnapshotContent: string,
  matchingRevision: FileRevision | null,
): boolean {
  if (!headRevision || !userAtHeadRevision) return false;
  if (cursor.id !== headRevision.id) return false;
  if (revisionSnapshotContentMatches(diskContent, cursorSnapshotContent)) return false;
  if (matchingRevision?.id === headRevision.id) return false;
  return matchingRevision != null && matchingRevision.sequence < headRevision.sequence;
}
