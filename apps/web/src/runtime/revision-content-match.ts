import { repairArtifactDocumentHeadIfNeeded } from './artifact-document-head';

/** True when two revision snapshots are the same bytes or equivalent after head repair. */
export function revisionSnapshotContentMatches(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (left == null || right == null) return false;
  if (left === right) return true;
  return repairArtifactDocumentHeadIfNeeded(left)
    === repairArtifactDocumentHeadIfNeeded(right);
}
