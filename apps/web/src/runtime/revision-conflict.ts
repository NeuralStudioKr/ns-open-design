import type { FileRevision } from '@open-design/contracts';
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

/** Newest revision whose snapshot equals disk, if any. */
export async function findRevisionMatchingDiskContent(
  revisions: FileRevision[],
  diskContent: string,
  resolveSnapshot: (revisionId: string) => Promise<string | null>,
  skipRevisionIds: ReadonlySet<string> = new Set(),
): Promise<FileRevision | null> {
  for (let index = revisions.length - 1; index >= 0; index -= 1) {
    const revision = revisions[index]!;
    if (skipRevisionIds.has(revision.id)) continue;
    const snapshot = await resolveSnapshot(revision.id);
    if (snapshot === diskContent) return revision;
  }
  return null;
}
