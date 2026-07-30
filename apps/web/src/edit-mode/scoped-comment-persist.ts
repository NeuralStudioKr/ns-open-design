const EXACT_MERGE_RETRY_REASONS = new Set([
  'No matching targets found to merge.',
  'Selected targets were unchanged.',
  'No valid element targets in attached comment scope.',
  'comment target slide could not be resolved from attachment or deck HTML',
  'full-deck rewrite produced no narrowed scoped match',
  'current deck file unreadable',
  'Could not parse source.',
]);

/**
 * True when a scoped preview-comment persist failure should route through
 * `skipped-incomplete` (auto-continue) instead of a hard scope-rejected banner.
 */
export function shouldRouteScopedCommentEditToAutoContinue(
  code: string | null | undefined,
  reason: string,
): boolean {
  if (!code) return false;
  const normalized = String(reason || '').trim();

  if (code === 'comment_edit_intent_violated') return true;

  if (code === 'deck_patch_parse_failed') {
    return (
      normalized.startsWith('element-patch <patch> missing slide-index') ||
      normalized.startsWith('element-patch <patch> missing target-id') ||
      normalized.startsWith('element-patch could not parse ') ||
      normalized.startsWith('deck-patch section missing data-slide-index')
    );
  }

  if (
    code === 'full_deck_diff_failed' ||
    code === 'full_deck_outside_slide_scope' ||
    code === 'full_deck_outside_element_scope' ||
    code === 'full_deck_comment_target_unresolved'
  ) {
    return true;
  }

  if (code === 'deck_patch_current_unreadable') {
    return normalized === 'current deck file unreadable';
  }

  if (code !== 'deck_patch_merge_failed') return false;

  if (EXACT_MERGE_RETRY_REASONS.has(normalized)) return true;
  if (normalized.startsWith('Target not found:')) return true;
  if (normalized.startsWith('element-patch could not parse ')) return true;
  if (normalized.startsWith('failed to apply ')) return true;
  if (normalized.startsWith('element-patch targets ') && normalized.endsWith(' outside attached comment scope')) {
    return true;
  }
  if (normalized.includes('nested markup')) return true;
  if (normalized.includes('Replacement HTML must contain exactly one root element')) return true;
  if (normalized.includes('outside attached comment scope')) return true;
  if (normalized.includes('outside comment scope')) return true;
  if (normalized.includes('targets slideIndex ')) return true;
  if (normalized.includes('is not allowed for scoped comment edits')) return true;
  return false;
}
