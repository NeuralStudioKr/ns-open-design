import { describe, expect, it } from 'vitest';
import {
  planCommentRemapAfterSlideDelete,
  planCommentRemapAfterSlideInsert,
  planCommentRemapAfterSlideMove,
} from '../../src/artifacts/deck-structure-comment-remap';

const comments = [
  { id: 'a', filePath: 'deck.html', slideIndex: 0 },
  { id: 'b', filePath: 'deck.html', slideIndex: 1 },
  { id: 'c', filePath: 'deck.html', slideIndex: 2 },
  { id: 'other', filePath: 'other.html', slideIndex: 1 },
  { id: 'unscoped', filePath: 'deck.html' },
];

describe('0901-N01 comment slideIndex remap', () => {
  it('deletes comments on the removed slide and shifts later ones', () => {
    const plan = planCommentRemapAfterSlideDelete(comments, 'deck.html', 1);
    expect(plan.changes).toEqual([
      { id: 'b', action: 'delete' },
      { id: 'c', action: 'set', slideIndex: 1 },
    ]);
  });

  it('swaps adjacent indexes when moving a slide later', () => {
    const plan = planCommentRemapAfterSlideMove(comments, 'deck.html', 0, 1);
    expect(plan.changes).toEqual([
      { id: 'a', action: 'set', slideIndex: 1 },
      { id: 'b', action: 'set', slideIndex: 0 },
    ]);
  });

  it('swaps adjacent indexes when moving a slide earlier', () => {
    const plan = planCommentRemapAfterSlideMove(comments, 'deck.html', 2, 1);
    expect(plan.changes).toEqual([
      { id: 'b', action: 'set', slideIndex: 2 },
      { id: 'c', action: 'set', slideIndex: 1 },
    ]);
  });

  it('ignores other files and unscoped comments', () => {
    const plan = planCommentRemapAfterSlideDelete(comments, 'deck.html', 0);
    expect(plan.changes.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(plan.changes.find((c) => c.id === 'other')).toBeUndefined();
    expect(plan.changes.find((c) => c.id === 'unscoped')).toBeUndefined();
  });

  it('shifts comments at or after the insert index when adding a slide', () => {
    const plan = planCommentRemapAfterSlideInsert(comments, 'deck.html', 1);
    expect(plan.changes).toEqual([
      { id: 'b', action: 'set', slideIndex: 2 },
      { id: 'c', action: 'set', slideIndex: 3 },
    ]);
  });
});
