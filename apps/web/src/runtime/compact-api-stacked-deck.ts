/**
 * Detect API compact stacked decks: no-head body-first slides the host
 * letterboxes to 1920×1080. Full framework, scroll-snap, and authored decks
 * with <style>/<script> must stay on their native layout path.
 */
export function looksLikeCompactApiStackedDeck(html: string): boolean {
  if (!html) return false;
  if (/\bid\s*=\s*["']deck-stage["']/i.test(html)) return false;
  if (/<(?:div|section)[^>]*\bclass\s*=\s*['"][^'"]*\b(?:deck-shell|deck-stage)\b/i.test(html)) {
    return false;
  }
  if (/<div[^>]*\bid\s*=\s*['"](?:deck-stage|deck)['"]/i.test(html)) return false;
  if (
    /<(?:div|section)[^>]*\bclass\s*=\s*['"][^'"]*\bstage\b[^'"]*['"][^>]*>[\s\S]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(
      html,
    )
  ) {
    return false;
  }
  if (/<style\b/i.test(html) || /<script\b/i.test(html)) return false;
  if (!/min-height\s*:\s*100(?:vh|dvh|svh|lvh)/i.test(html)) return false;
  return /<body\b[^>]*>[\s\S]*<(?:section|div)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(html);
}
