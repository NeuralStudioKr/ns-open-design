import type { FileRevision } from '@open-design/contracts';
import { repairArtifactDocumentHeadIfNeeded } from './artifact-document-head';
import { revisionSnapshotContentMatches } from './revision-content-match';
import type { RevisionStackSnapshot } from './revision-stack';

/** Disk content matches the snapshot stored for the active cursor revision. */
export function revisionCursorMatchesDisk(
  stack: RevisionStackSnapshot,
  diskContent: string,
  cursorSnapshotContent: string,
): boolean {
  if (!stack.cursorRevisionId) return true;
  return revisionSnapshotContentMatches(diskContent, cursorSnapshotContent);
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
  const diskByteSize = utf8ByteLength(diskContent);
  // One intact-gated repair for byte-size probe + content match.
  const repairedDisk = repairArtifactDocumentHeadIfNeeded(diskContent);
  const repairedDiskByteSize = utf8ByteLength(repairedDisk);
  for (let index = revisions.length - 1; index >= 0; index -= 1) {
    const revision = revisions[index]!;
    if (skipRevisionIds.has(revision.id)) continue;
    if (
      revision.byteSize > 0
      && revision.byteSize !== diskByteSize
      && revision.byteSize !== repairedDiskByteSize
    ) {
      continue;
    }
    const snapshot = await resolveSnapshot(revision.id);
    if (revisionSnapshotContentMatches(snapshot, repairedDisk)) return revision;
  }
  return null;
}

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}
