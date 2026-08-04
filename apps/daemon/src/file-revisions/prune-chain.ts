import type { FileRevision } from '@open-design/contracts';
import { resolveFullSnapshotInterval, shouldForceFullSnapshot } from './snapshot-codec.js';
import { sliceRevisionChainFromCheckpoint } from './store.js';

export interface ChainAwarePruneSelection {
  revisionIds: string[];
  revisions: FileRevision[];
  remainingExcess: number;
}

/** Revision ids required to decode any survivor in the chain (checkpoints + diffs). */
export function collectRequiredRevisionIdsForSurvivors(
  revisions: FileRevision[],
  survivorIds: ReadonlySet<string>,
  interval: number = resolveFullSnapshotInterval(),
): Set<string> {
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));
  const required = new Set<string>(survivorIds);

  for (const survivorId of survivorIds) {
    const ancestryNewestFirst: Array<Pick<FileRevision, 'id' | 'sequence'>> = [];
    let cursor = byId.get(survivorId);
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      ancestryNewestFirst.push({ id: cursor.id, sequence: cursor.sequence });
      cursor = cursor.parentRevisionId ? byId.get(cursor.parentRevisionId) : undefined;
    }
    for (const link of sliceRevisionChainFromCheckpoint(ancestryNewestFirst, interval)) {
      required.add(link.id);
    }
  }

  return required;
}

/**
 * Select oldest revisions safe to delete while keeping `keep` newest rows.
 * Never removes checkpoints still needed to restore a surviving revision.
 */
export function selectChainAwarePruneIds(
  revisions: FileRevision[],
  keep: number,
  maxDeletes: number,
  interval: number = resolveFullSnapshotInterval(),
): ChainAwarePruneSelection {
  if (revisions.length <= keep || maxDeletes <= 0) {
    return {
      revisionIds: [],
      revisions: [],
      remainingExcess: Math.max(0, revisions.length - keep),
    };
  }

  const sorted = [...revisions].sort((left, right) => left.sequence - right.sequence);
  const survivors = sorted.slice(-keep);
  const survivorIds = new Set(survivors.map((revision) => revision.id));
  const required = collectRequiredRevisionIdsForSurvivors(sorted, survivorIds, interval);

  const deletable = sorted.filter((revision) => !required.has(revision.id));
  const excess = sorted.length - keep;
  const selected = deletable.slice(0, Math.min(maxDeletes, excess));

  return {
    revisionIds: selected.map((revision) => revision.id),
    revisions: selected,
    remainingExcess: Math.max(0, excess - selected.length),
  };
}

/** True when `candidateId` is not on any restore chain for revisions that would remain. */
export function isRevisionChainSafeToDelete(
  revisions: FileRevision[],
  candidateId: string,
  excludeIds: ReadonlySet<string> = new Set(),
  interval: number = resolveFullSnapshotInterval(),
): boolean {
  const remaining = revisions.filter((revision) => (
    revision.id !== candidateId && !excludeIds.has(revision.id)
  ));
  if (remaining.length === 0) return true;
  const required = collectRequiredRevisionIdsForSurvivors(
    revisions,
    new Set(remaining.map((revision) => revision.id)),
    interval,
  );
  return !required.has(candidateId);
}

export function isFullSnapshotSequence(
  sequence: number,
  interval: number = resolveFullSnapshotInterval(),
): boolean {
  return shouldForceFullSnapshot(sequence, interval);
}
