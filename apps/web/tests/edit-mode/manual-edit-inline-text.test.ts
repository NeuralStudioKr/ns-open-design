import { describe, expect, it } from 'vitest';
import {
  beginInlineTextEditGeneration,
  shouldAbortInlineTextEditOnHostAction,
  shouldPersistInlineTextCommit,
} from '../../src/edit-mode/manual-edit-inline-text';

describe('manual-edit inline text cancel', () => {
  it('starts a new generation for each inline session', () => {
    expect(beginInlineTextEditGeneration(0)).toBe(1);
    expect(beginInlineTextEditGeneration(4)).toBe(5);
  });

  it('aborts while the iframe is still editing or a blur-commit is in flight', () => {
    expect(shouldAbortInlineTextEditOnHostAction({
      inlineTextEditing: true,
      commitInFlightGeneration: null,
      pendingCommitGeneration: null,
      currentGeneration: 3,
    })).toBe(true);
    expect(shouldAbortInlineTextEditOnHostAction({
      inlineTextEditing: false,
      commitInFlightGeneration: 3,
      pendingCommitGeneration: null,
      currentGeneration: 3,
    })).toBe(true);
    expect(shouldAbortInlineTextEditOnHostAction({
      inlineTextEditing: false,
      commitInFlightGeneration: null,
      pendingCommitGeneration: 3,
      currentGeneration: 3,
    })).toBe(true);
  });

  it('does not abort idle inspector cancel after a finished persist', () => {
    expect(shouldAbortInlineTextEditOnHostAction({
      inlineTextEditing: false,
      commitInFlightGeneration: null,
      pendingCommitGeneration: null,
      currentGeneration: 3,
    })).toBe(false);
  });

  it('drops a cancelled generation so empty blur-commits are not persisted', () => {
    expect(shouldPersistInlineTextCommit({
      editGeneration: 3,
      cancelledGeneration: 3,
    })).toBe(false);
    expect(shouldPersistInlineTextCommit({
      editGeneration: 4,
      cancelledGeneration: 3,
    })).toBe(true);
    expect(shouldPersistInlineTextCommit({
      editGeneration: 0,
      cancelledGeneration: 0,
    })).toBe(false);
  });
});
