/**
 * Plan how preview-comment slide indexes move after a deck structure edit.
 * Pure — no I/O. `null` next index means the comment should be deleted
 * (its slide was removed).
 */

export type DeckStructureCommentRemapChange =
  | { id: string; action: 'delete' }
  | { id: string; action: 'set'; slideIndex: number };

export type DeckStructureCommentRemapPlan = {
  changes: DeckStructureCommentRemapChange[];
};

export type RemappablePreviewComment = {
  id: string;
  filePath: string;
  slideIndex?: number;
};

/** After deleting the slide at `deletedIndex` (0-based). */
export function planCommentRemapAfterSlideDelete(
  comments: readonly RemappablePreviewComment[],
  filePath: string,
  deletedIndex: number,
): DeckStructureCommentRemapPlan {
  const changes: DeckStructureCommentRemapChange[] = [];
  if (!Number.isInteger(deletedIndex) || deletedIndex < 0) {
    return { changes };
  }
  for (const comment of comments) {
    if (comment.filePath !== filePath) continue;
    if (typeof comment.slideIndex !== 'number' || !Number.isInteger(comment.slideIndex)) {
      continue;
    }
    const index = Math.floor(comment.slideIndex);
    if (index === deletedIndex) {
      changes.push({ id: comment.id, action: 'delete' });
    } else if (index > deletedIndex) {
      changes.push({ id: comment.id, action: 'set', slideIndex: index - 1 });
    }
  }
  return { changes };
}

/**
 * After moving the slide at `fromIndex` to `toIndex` (adjacent ±1 today).
 * Comments on those two slides swap; indexes between them shift.
 */
export function planCommentRemapAfterSlideMove(
  comments: readonly RemappablePreviewComment[],
  filePath: string,
  fromIndex: number,
  toIndex: number,
): DeckStructureCommentRemapPlan {
  const changes: DeckStructureCommentRemapChange[] = [];
  if (
    !Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex < 0
    || toIndex < 0
    || fromIndex === toIndex
  ) {
    return { changes };
  }
  for (const comment of comments) {
    if (comment.filePath !== filePath) continue;
    if (typeof comment.slideIndex !== 'number' || !Number.isInteger(comment.slideIndex)) {
      continue;
    }
    const index = Math.floor(comment.slideIndex);
    let next = index;
    if (index === fromIndex) {
      next = toIndex;
    } else if (fromIndex < toIndex) {
      // Moved later: (from, to] shift left by 1.
      if (index > fromIndex && index <= toIndex) next = index - 1;
    } else {
      // Moved earlier: [to, from) shift right by 1.
      if (index >= toIndex && index < fromIndex) next = index + 1;
    }
    if (next !== index) {
      changes.push({ id: comment.id, action: 'set', slideIndex: next });
    }
  }
  return { changes };
}
