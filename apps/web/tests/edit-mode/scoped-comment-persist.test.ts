import { describe, expect, it } from 'vitest';
import { shouldRouteScopedCommentEditToAutoContinue } from '../../src/edit-mode/scoped-comment-persist';

describe('shouldRouteScopedCommentEditToAutoContinue', () => {
  it('routes common merge failures to auto-continue', () => {
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'deck_patch_merge_failed',
        'No matching targets found to merge.',
      ),
    ).toBe(true);
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'deck_patch_merge_failed',
        'Selected targets were unchanged.',
      ),
    ).toBe(true);
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'deck_patch_merge_failed',
        'This element contains nested markup. Use the HTML tab instead.',
      ),
    ).toBe(true);
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'deck_patch_merge_failed',
        'Replacement HTML must contain exactly one root element.',
      ),
    ).toBe(true);
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'deck_patch_merge_failed',
        'comment target slide could not be resolved from attachment or deck HTML',
      ),
    ).toBe(true);
  });

  it('routes full-deck scope failures to auto-continue', () => {
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'full_deck_outside_slide_scope',
        'changed slides outside comment scope: 1, 2',
      ),
    ).toBe(true);
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'full_deck_diff_failed',
        'deck diff slide count changed from 8 to 9',
      ),
    ).toBe(true);
  });

  it('routes unreadable deck reads to auto-continue for scoped retries', () => {
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'deck_patch_current_unreadable',
        'current deck file unreadable',
      ),
    ).toBe(true);
  });

  it('routes empty deck-patch parse failures to auto-continue', () => {
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'deck_patch_parse_failed',
        'no <section class="slide"> blocks in deck-patch body',
      ),
    ).toBe(true);
  });

  it('does not route non-recoverable failures', () => {
    expect(
      shouldRouteScopedCommentEditToAutoContinue(
        'deck_patch_merge_failed',
        'unexpected relaxed apply state',
      ),
    ).toBe(false);
  });
});
