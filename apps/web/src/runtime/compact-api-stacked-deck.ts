import { repairArtifactDocumentHead } from '@open-design/contracts';

/** Mirror buildSrcdoc's fragment wrap so preview detection matches iframe input. */
export function wrapPreviewHtmlShell(html: string): string {
  const repaired = repairArtifactDocumentHead(html);
  const head = repaired.trimStart().slice(0, 64).toLowerCase();
  const isFullDoc = head.startsWith('<!doctype') || head.startsWith('<html');
  if (isFullDoc) return repaired;
  const wrapped = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>${repaired}</body>
</html>`;
  return repairArtifactDocumentHead(wrapped);
}

/**
 * Horizontal swipe decks (simple-deck, scroll-snap) must keep their native
 * scroll/transform navigation instead of stacked letterbox.
 */
export function looksLikeAuthoredHorizontalSwipeDeck(html: string): boolean {
  if (!html) return false;
  if (/scroll-snap-type\s*:\s*x\b/i.test(html)) return true;
  if (/\bflex\s*:\s*0\s+0\s+100vw\b/i.test(html) && /overflow-x\s*:\s*auto/i.test(html)) {
    return true;
  }
  const bodyRule = html.match(/body\s*\{[^}]*\}/i)?.[0] ?? '';
  if (!bodyRule) return false;
  const hasFlex = /\bdisplay\s*:\s*flex\b/i.test(bodyRule);
  const hasRow =
    !/flex-direction\s*:\s*column(?:-reverse)?\b/i.test(bodyRule);
  const hasHorizontalScroll = /overflow-x\s*:\s*(?:auto|scroll|overlay)\b/i.test(bodyRule);
  return hasFlex && hasRow && hasHorizontalScroll;
}

/**
 * Detect API compact stacked decks: body-first slides the host letterboxes to
 * 1920×1080. Full framework decks and horizontal scroll-snap templates stay on
 * their native layout path. Styled vertical decks (Creative Mode, etc.) are
 * included when they still use stacked body > .slide markup.
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
  if (looksLikeAuthoredHorizontalSwipeDeck(html)) return false;
  if (!/min-height\s*:\s*100(?:vh|dvh|svh|lvh)/i.test(html)) return false;
  if (
    /<body\b[^>]*>[\s\S]*<(?:div|section)\b[^>]*\bclass\s*=\s*['"][^'"]*\bdeck\b/i.test(html)
  ) {
    return false;
  }
  return /<body\b[^>]*>(?:\s|<!--[\s\S]*?-->)*<(?:section|div)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(
    html,
  );
}

/** Host-side detection that matches buildSrcdoc's wrapped preview HTML. */
export function looksLikeCompactApiStackedDeckForPreview(html: string): boolean {
  return looksLikeCompactApiStackedDeck(wrapPreviewHtmlShell(html));
}

/** Lock vw/vh math to the 1920×1080 letterbox canvas inside the iframe. */
export function injectStackedDeckViewport(html: string): string {
  const tag = '<meta name="viewport" content="width=1920, initial-scale=1" />';
  if (/<meta[^>]+name=["']viewport["']/i.test(html)) {
    return html.replace(/<meta[^>]+name=["']viewport["'][^>]*>/i, tag);
  }
  if (/<head\b/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}\n    ${tag}`);
  }
  return html;
}
