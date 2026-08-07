import { repairArtifactDocumentHead } from '@open-design/contracts';
import { repairArtifactDocumentHeadIfNeeded } from './artifact-document-head';

export type WrapPreviewHtmlShellOptions = {
  /** Caller already ran repair (or verified intact head) — skip the first repair pass. */
  alreadyRepaired?: boolean;
};

/** Mirror buildSrcdoc's fragment wrap so preview detection matches iframe input. */
export function wrapPreviewHtmlShell(
  html: string,
  options?: WrapPreviewHtmlShellOptions,
): string {
  const repaired = options?.alreadyRepaired ? html : repairArtifactDocumentHeadIfNeeded(html);
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
  // Fragment wrap always needs a final repair pass for the new shell.
  return repairArtifactDocumentHead(wrapped);
}

/** Same repaired + wrapped HTML buildSrcdoc and the host preview use for detection. */
export function prepareCompactStackedDeckPreviewHtml(html: string): string {
  // Intact full docs skip the first repair (hot preview-detection path).
  const repaired = repairArtifactDocumentHeadIfNeeded(html);
  return wrapPreviewHtmlShell(repaired, { alreadyRepaired: true });
}

function extractCssBlocks(html: string): string {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n');
}

const SLIDE_VIEWPORT_RE = /100(?:vh|dvh|svh|lvh)/i;

function hasFixedCanvasSizing(style: string): boolean {
  if (!style) return false;
  const has1920Width = /(?:^|[;{\s])width\s*:\s*1920px\b/i.test(style);
  const has1080Height = /(?:^|[;{\s])(?:min-)?height\s*:\s*1080px\b/i.test(style);
  return has1920Width && has1080Height;
}

function extractHtmlAttr(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(['"])([\\s\\S]*?)\\1`, 'i'));
  return match?.[2] ?? '';
}

function extractSlideInlineStyles(html: string): string[] {
  const styles: string[] = [];
  for (const match of html.matchAll(/<(?:section|div|main|article)\b([^>]*)>/gi)) {
    const attrs = match[1] ?? '';
    const className = extractHtmlAttr(attrs, 'class');
    if (!/\bslide\b/i.test(className)) continue;
    const style = extractHtmlAttr(attrs, 'style');
    if (style) styles.push(style);
  }
  return styles;
}

function countSlideElements(html: string): number {
  return [...html.matchAll(/<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b[^'"]*['"]/gi)].length;
}

function looksLikeLegacyStyledBodyFirstDeck(html: string): boolean {
  if (countSlideElements(html) < 2) return false;
  if (extractSlideInlineStyles(html).length >= 2) return true;
  return /\.slide\b[^{]*\{/i.test(extractCssBlocks(html));
}

/**
 * Decks that ship their own scrollIntoView / touch-swipe drivers on `.slide`
 * nodes must keep native document scroll. Host letterbox hoist breaks
 * `slides[n].scrollIntoView(...)` and stacks every page on top of each other.
 */
export function looksLikeAuthoredScrollNavigateDeck(html: string): boolean {
  if (!html) return false;
  if (
    /querySelectorAll\s*\(\s*['"]\.slide['"]\s*\)[\s\S]{0,2000}?\.scrollIntoView\s*\(/i.test(html)
    || /querySelectorAll\s*\(\s*['"]\.slide['"]\s*\)[\s\S]{0,2000}?scrollIntoView\s*\(/i.test(html)
  ) {
    return true;
  }
  if (/\.slide[^;\n]{0,120}\.scrollIntoView\s*\(/i.test(html)) return true;
  if (
    /scrollIntoView\s*\(\s*\{[^}]*behavior\s*:\s*['"]smooth['"]/i.test(html)
    && /\.slide\b/i.test(html)
    && countSlideElements(html) >= 2
  ) {
    return true;
  }
  return false;
}

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
  for (const style of extractSlideInlineStyles(html)) {
    if (/(?:min-)?height\s*:[^;]*100(?:vh|dvh|svh|lvh)/i.test(style)) return true;
    if (hasFixedCanvasSizing(style)) return true;
  }
  const css = extractCssBlocks(html);
  if (/\.slide\b[^{]*\{[^}]*(?:min-)?height\s*:\s*100(?:vh|dvh|svh|lvh)/i.test(css)) return true;
  for (const match of css.matchAll(/\.slide\b[^{]*\{([^}]*)\}/gi)) {
    if (hasFixedCanvasSizing(match[1] ?? '')) return true;
  }
  return false;
}

function hasBodyFirstSlide(html: string): boolean {
  if (
    /<body\b[^>]*>(?:\s|<!--[\s\S]*?-->|<(?:header|nav)\b[^>]*>[\s\S]*?<\/(?:header|nav)>|<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>)*<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(
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
  // Only the real framework / transform-track markers — not decorative
  // `.deck-shell` / `.deck-stage` class names that API compact decks
  // sometimes copy without the framework script or visibility CSS.
  if (/\bid\s*=\s*["']deck-stage["']/i.test(html)) return true;
  if (/<div[^>]*\bid\s*=\s*['"](?:deck|deck-track)['"]/i.test(html)) return true;
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
  if (looksLikeAuthoredScrollNavigateDeck(html)) return false;
  if (
    /<body\b[^>]*>[\s\S]*<(?:div|section)\b[^>]*\bclass\s*=\s*['"][^'"]*(?:^|\s)deck(?:\s|["']|$)/i.test(
      html,
    )
  ) {
    return false;
  }
  if (!hasBodyFirstSlide(html)) return false;
  if (looksLikeSlideViewportSized(html)) return true;
  // Legacy Canvas/Drive → Slide decks can be body-first multi-slide HTML
  // without explicit 100vh or 1920×1080 sizing. Keep existing deliverables
  // recoverable in the host fixed-stage viewer instead of reflowing them as
  // generic HTML.
  return looksLikeLegacyStyledBodyFirstDeck(html);
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
  extractSlideInlineStyles,
  countSlideElements,
  looksLikeLegacyStyledBodyFirstDeck,
  hasFixedCanvasSizing,
  looksLikeSlideViewportSized,
  hasBodyFirstSlide,
};
