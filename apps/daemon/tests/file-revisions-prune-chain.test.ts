// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { FileRevision } from '@open-design/contracts';
import {
  collectRequiredRevisionIdsForSurvivors,
  selectChainAwarePruneIds,
} from '../src/file-revisions/prune-chain.js';

function revision(id: string, sequence: number, parentRevisionId: string | null = null): FileRevision {
  return {
    id,
    projectId: 'p',
    fileName: 'deck.html',
    parentRevisionId,
    sequence,
    createdAt: sequence,
    byteSize: 10,
    source: 'manual_edit',
    label: id,
  };
}

describe('prune-chain', () => {
  it('does not delete checkpoints required by kept diffs', () => {
    const revisions = [
      revision('r1', 1, null),
      revision('r2', 2, 'r1'),
      revision('r3', 3, 'r2'),
      revision('r4', 4, 'r3'),
    ];

    const selection = selectChainAwarePruneIds(revisions, 2, 10, 5);
    expect(selection.revisionIds).toEqual([]);
    expect(selection.remainingExcess).toBe(2);
  });

  it('deletes oldest revisions once a newer full checkpoint covers survivors', () => {
    const revisions = [
      revision('r1', 1, null),
      revision('r2', 2, 'r1'),
      revision('r3', 3, 'r2'),
      revision('r4', 4, 'r3'),
      revision('r5', 5, 'r4'),
      revision('r6', 6, 'r5'),
      revision('r7', 7, 'r6'),
      revision('r8', 8, 'r7'),
      revision('r9', 9, 'r8'),
      revision('r10', 10, 'r9'),
    ];

    const selection = selectChainAwarePruneIds(revisions, 2, 10, 5);
    expect(selection.revisionIds).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
    expect(selection.remainingExcess).toBe(3);
  });

  it('collects checkpoint ancestry for survivors', () => {
    const revisions = [
      revision('r1', 1, null),
      revision('r2', 2, 'r1'),
      revision('r3', 3, 'r2'),
      revision('r4', 4, 'r3'),
      revision('r5', 5, 'r4'),
    ];
    const required = collectRequiredRevisionIdsForSurvivors(
      revisions,
      new Set(['r4', 'r5']),
      5,
    );
    expect([...required].sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });
});
