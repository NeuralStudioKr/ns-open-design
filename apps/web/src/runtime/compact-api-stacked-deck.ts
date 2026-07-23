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

/** Same repaired + wrapped HTML buildSrcdoc and the host preview use for detection. */
export function prepareCompactStackedDeckPreviewHtml(html: string): string {
  return wrapPreviewHtmlShell(repairArtifactDocumentHead(html));
}

function extractCssBlocks(html: string): string {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n');
}

const SLIDE_VIEWPORT_RE = /100(?:vh|dvh|svh|lvh)/i;

/**
 * Horizontal swipe decks (simple-deck, scroll-snap) must keep their native
 * scroll/transform navigation instead of stacked letterbox.
 */
export function looksLikeAuthoredHorizontalSwipeDeck(html: string): boolean {
  if (!html) return false;
  if (/scroll-snap-type\s*:\s*x\b/i.test(html)) return true;
  if (/\bflex\s*:\s*0\s+0\s+100vw\b/i.test(html)) return true;

  const css = extractCssBlocks(html);
  if (css) {
    if (/scroll-snap-type\s*:\s*x\b/i.test(css)) return true;
    if (/\bflex\s*:\s*0\s+0\s+100vw\b/i.test(css)) return true;
    if (/\.slide\b[^{]*\{[^}]*min-width\s*:\s*100vw\b/i.test(css)) return true;
    const rowFlexWithHorizontalScroll =
      /(?:html\s*,\s*body|body|html)\s*\{[^}]*\bdisplay\s*:\s*flex\b[^}]*\boverflow-x\s*:\s*(?:auto|scroll|overlay)\b/i.test(css)
      || /(?:html\s*,\s*body|body|html)\s*\{[^}]*\boverflow-x\s*:\s*(?:auto|scroll|overlay)\b[^}]*\bdisplay\s*:\s*flex\b/i.test(css);
    if (rowFlexWithHorizontalScroll && !/(?:html\s*,\s*body|body)\s*\{[^}]*flex-direction\s*:\s*column(?:-reverse)?\b/i.test(css)) {
      return true;
    }
  }

  const bodyOpenTag = html.match(/<body\b([^>]*)>/i)?.[1] ?? '';
  if (
    /\bstyle\s*=\s*['"][^'"]*\bdisplay\s*:\s*flex\b[^'"]*\boverflow-x\s*:\s*(?:auto|scroll|overlay)\b/i.test(bodyOpenTag)
    && !/flex-direction\s*:\s*column(?:-reverse)?\b/i.test(bodyOpenTag)
  ) {
    return true;
  }
  return false;
}

function looksLikeSlideViewportSized(html: string): boolean {
  if (
    /<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b[^'"]*['"][^>]*\bstyle\s*=\s*['"][^'"]*(?:min-)?height\s*:[^'"]*100(?:vh|dvh|svh|lvh)/i.test(
      html,
    )
  ) {
    return true;
  }
  const css = extractCssBlocks(html);
  return /\.slide\b[^{]*\{[^}]*(?:min-)?height\s*:\s*100(?:vh|dvh|svh|lvh)/i.test(css);
}

function hasBodyFirstSlide(html: string): boolean {
  if (
    /<body\b[^>]*>(?:\s|<!--[\s\S]*?-->|<(?:header|nav)\b[^>]*>[\s\S]*?<\/(?:header|nav)>)*<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(
      html,
    )
  ) {
    return true;
  }
  return /<body\b[^>]*>[\s\S]*<(?:div|section|main)\b[^>]*>[\s\S]*<(?:section|div)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b[\s\S]*<(?:section|div)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(
    html,
  );
}

function looksLikeFrameworkDeckMarkup(html: string): boolean {
  if (/\bid\s*=\s*["']deck-stage["']/i.test(html)) return true;
  if (/<(?:div|section)[^>]*\bclass\s*=\s*['"][^'"]*\b(?:deck-shell|deck-stage)\b/i.test(html)) {
    return true;
  }
  if (/<div[^>]*\bid\s*=\s*['"](?:deck-stage|deck)['"]/i.test(html)) return true;
  return false;
}

/**
 * Detect API compact stacked decks: body-first slides the host letterboxes to
 * 1920×1080. Full framework decks and horizontal scroll-snap templates stay on
 * their native layout path. Styled vertical decks (Creative Mode, etc.) are
 * included when they still use stacked body > .slide markup.
 */
export function looksLikeCompactApiStackedDeck(html: string): boolean {
  if (!html) return false;
  if (looksLikeFrameworkDeckMarkup(html)) return false;
  if (looksLikeAuthoredHorizontalSwipeDeck(html)) return false;
  if (!looksLikeSlideViewportSized(html)) return false;
  if (
    /<body\b[^>]*>[\s\S]*<(?:div|section)\b[^>]*\bclass\s*=\s*['"][^'"]*(?:^|\s)deck(?:\s|["']|$)/i.test(
      html,
    )
  ) {
    return false;
  }
  return hasBodyFirstSlide(html);
}

/** Host-side detection that matches buildSrcdoc's wrapped preview HTML. */
export function looksLikeCompactApiStackedDeckForPreview(html: string): boolean {
  return looksLikeCompactApiStackedDeck(prepareCompactStackedDeckPreviewHtml(html));
}

/** Lock vw/vh math to the 1920×1080 letterbox canvas inside the iframe. */
export function injectStackedDeckViewport(html: string): string {
  const tag = '<meta name="viewport" content="width=1920, initial-scale=1, maximum-scale=1" />';
  if (/<meta[^>]+name=["']viewport["']/i.test(html)) {
    return html.replace(/<meta[^>]+name=["']viewport["'][^>]*>/i, tag);
  }
  if (/<head\b/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (head) => `${head}\n    ${tag}`);
  }
  return html;
}

/** @internal test helper */
export const compactStackedDeckTestHelpers = {
  SLIDE_VIEWPORT_RE,
  extractCssBlocks,
  looksLikeSlideViewportSized,
  hasBodyFirstSlide,
};
