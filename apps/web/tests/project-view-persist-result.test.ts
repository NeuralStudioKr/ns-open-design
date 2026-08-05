import { describe, expect, it } from 'vitest';

import { shouldFailRunForArtifactPersistResult } from '../src/components/ProjectView';

describe('shouldFailRunForArtifactPersistResult', () => {
  it('treats skipped-duplicate as failure for scoped comment edits', () => {
    expect(
      shouldFailRunForArtifactPersistResult(
        { kind: 'skipped-duplicate', fileName: 'deck.html' },
        { scopedCommentEdit: true },
      ),
    ).toBe(true);
  });

  it('does not treat skipped-duplicate as failure for unscoped runs', () => {
    expect(
      shouldFailRunForArtifactPersistResult(
        { kind: 'skipped-duplicate', fileName: 'deck.html' },
        { scopedCommentEdit: false },
      ),
    ).toBe(false);
  });

  it('still fails skipped-incomplete without scoped flag', () => {
    expect(
      shouldFailRunForArtifactPersistResult({
        kind: 'skipped-incomplete',
        fileName: 'deck.html',
      }),
    ).toBe(true);
  });

  it('does not fail skipped-noop (avoids auto-continue churn)', () => {
    expect(
      shouldFailRunForArtifactPersistResult(
        {
          kind: 'skipped-noop',
          fileName: 'deck.html',
          reason: 'scoped comment edit did not change the deck on disk',
        },
        { scopedCommentEdit: true },
      ),
    ).toBe(false);
  });
});
