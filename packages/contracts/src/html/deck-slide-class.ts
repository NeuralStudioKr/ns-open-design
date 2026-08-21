/**
 * Class-token helpers for deck slide hosts vs chrome.
 *
 * `\bslide\b` matches the prefix of `slide-counter` / `slide-number` because
 * `-` is a word boundary. Catalog PreviewModal then treats that chrome as a
 * body-first slide, flips official presenters onto the compact letterbox
 * path, and host `display:none` blanks page 2+.
 */

const DECK_SLIDE_CHROME_CLASS = new Set([
  'slide-counter',
  'slide-number',
  'slide-num',
  'slide-nav',
  'slides-container',
  'slide-progress',
  'slide-hint',
]);

export function isDeckSlideClassToken(token: string): boolean {
  const normalized = String(token ?? '').trim().toLowerCase();
  if (!normalized || DECK_SLIDE_CHROME_CLASS.has(normalized)) return false;
  if (normalized === 'slide' || normalized === 'ppt-slide' || normalized === 'deck-slide') {
    return true;
  }
  return normalized.startsWith('slide-');
}

export function classAttrHasDeckSlideToken(classAttr: string): boolean {
  return String(classAttr ?? '').split(/\s+/).some(isDeckSlideClassToken);
}

/** Author CSS hides inactive pages; host display:none traps native next. */
export function looksLikeAuthorClassToggleDeck(html: string): boolean {
  const dest = String(html ?? '');
  if (!dest) return false;
  if (
    /\.slide\b[^{]*\{[^}]*opacity\s*:\s*0/i.test(dest)
    && /\.slide\.(?:active|is-active|current)\b[^{]*\{[^}]*opacity\s*:\s*1/i.test(dest)
  ) {
    return true;
  }
  return (
    /\.slide\b[^{]*\{[^}]*display\s*:\s*none/i.test(dest)
    && /\.slide\.(?:active|is-active|current)\b[^{]*\{[^}]*display\s*:\s*(?:flex|block|grid)/i.test(dest)
  );
}
