import {
  DECK_SLIDE_HOST_CSS_CLASS,
  OFFICIAL_DECK_LOOK_STYLE_ATTR,
  looksLikeDeckSlideHostAttrs,
  looksLikeOfficialFullscreenPresenterDeck,
} from '@open-design/contracts';
import { repairArtifactDocumentHeadIfNeeded } from './artifact-document-head';

function hasOfficialLookStyleAttr(html: string): boolean {
  return new RegExp(`<style\\b[^>]*\\b${OFFICIAL_DECK_LOOK_STYLE_ATTR}\\b`, 'i').test(html);
}

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
  // Fragment wrap builds a fresh shell — intact-gated (charset+viewport already set).
  return repairArtifactDocumentHeadIfNeeded(wrapped);
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

function attrsLookLikeDeckSlide(attrs: string): boolean {
  return looksLikeDeckSlideHostAttrs(attrs);
}

function extractSlideInlineStyles(html: string): string[] {
  const styles: string[] = [];
  for (const match of html.matchAll(/<(?:section|div|main|article)\b([^>]*)>/gi)) {
    const attrs = match[1] ?? '';
    if (!attrsLookLikeDeckSlide(attrs)) continue;
    const style = extractHtmlAttr(attrs, 'style');
    if (style) styles.push(style);
  }
  return styles;
}

function countSlideElements(html: string): number {
  let count = 0;
  for (const match of html.matchAll(/<(?:section|div|main|article)\b([^>]*)>/gi)) {
    if (attrsLookLikeDeckSlide(match[1] ?? '')) count += 1;
  }
  return count;
}

function looksLikeLegacyStyledBodyFirstDeck(html: string): boolean {
  if (countSlideElements(html) < 2) return false;
  if (extractSlideInlineStyles(html).length >= 2) return true;
  return new RegExp(`${DECK_SLIDE_HOST_CSS_CLASS}[^{]*\\{`, 'i').test(extractCssBlocks(html));
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
    && new RegExp(DECK_SLIDE_HOST_CSS_CLASS, 'i').test(html)
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

  const css = extractCssBlocks(html);
  if (css) {
    if (/scroll-snap-type\s*:\s*x\b/i.test(css)) return true;
    if (new RegExp(`${DECK_SLIDE_HOST_CSS_CLASS}[^{]*\\{[^}]*min-width\\s*:\\s*100vw\\b`, 'i').test(css)) {
      return true;
    }
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

function looksLikeNestedVerticalTranslateYDeck(html: string): boolean {
  // 8-Bit Orbit: `#deck` is chrome only; pages live in `#slidesContainer`
  // and the author script pages with translateY(-N00vh). That is not a
  // compact horizontal `#deck` strip and must not letterbox / sibling-hide.
  return (
    /<(?:div|section)\b[^>]*(?:\bid\s*=\s*['"]slidesContainer['"]|\bclass\s*=\s*['"][^'"]*\bslides-container\b)/i.test(html)
    && /translateY\s*\(\s*-?\$\{[^}]*\}\s*vh/i.test(html)
  );
}

function looksLikeBareDeckViewportTrack(html: string): boolean {
  if (!/<(?:div|section|main)\b[^>]*\bid\s*=\s*['"]deck['"]/i.test(html)) return false;
  if (countSlideElements(html) < 2) return false;
  if (looksLikeNestedVerticalTranslateYDeck(html)) return false;
  const css = extractCssBlocks(html);
  if (!css) return false;
  const deckRule = css.match(/#deck\b[^{]*\{([^}]*)\}/i)?.[1] ?? '';
  if (!/\bdisplay\s*:\s*flex\b/i.test(deckRule)) return false;
  const slideRules = [...css.matchAll(new RegExp(`${DECK_SLIDE_HOST_CSS_CLASS}[^{]*\\{([^}]*)\\}`, 'gi'))]
    .map((match) => match[1] ?? '')
    .join('\n');
  return (
    /\bflex\s*:\s*0\s+0\s+100vw\b/i.test(slideRules)
    || /\bwidth\s*:\s*100vw\b/i.test(slideRules)
    || /\bheight\s*:\s*100(?:vh|dvh|svh|lvh)\b/i.test(slideRules)
  );
}

function looksLikeSlideViewportSized(html: string): boolean {
  for (const style of extractSlideInlineStyles(html)) {
    if (/(?:min-)?height\s*:[^;]*100(?:vh|dvh|svh|lvh)/i.test(style)) return true;
    if (hasFixedCanvasSizing(style)) return true;
  }
  const css = extractCssBlocks(html);
  if (new RegExp(`${DECK_SLIDE_HOST_CSS_CLASS}[^{]*\\{[^}]*(?:min-)?height\\s*:\\s*100(?:vh|dvh|svh|lvh)`, 'i').test(css)) {
    return true;
  }
  for (const match of css.matchAll(new RegExp(`${DECK_SLIDE_HOST_CSS_CLASS}[^{]*\\{([^}]*)\\}`, 'gi'))) {
    if (hasFixedCanvasSizing(match[1] ?? '')) return true;
  }
  return false;
}

function hasBodyFirstSlide(html: string): boolean {
  const bodyMatch = /<body\b[^>]*>/i.exec(html);
  if (bodyMatch) {
    const body = html.slice((bodyMatch.index ?? 0) + bodyMatch[0].length);
    for (const match of body.matchAll(/<(?:section|div|main|article)\b([^>]*)>/gi)) {
      if (attrsLookLikeDeckSlide(match[1] ?? '')) return true;
    }
  }
  return false;
}

function looksLikeFrameworkDeckMarkup(html: string): boolean {
  // Only the real framework / transform-track markers — not decorative
  // `.deck-shell` / `.deck-stage` class names that API compact decks
  // sometimes copy without the framework script or visibility CSS.
  if (/\bid\s*=\s*["']deck-stage["']/i.test(html)) return true;
  if (/<deck-stage\b/i.test(html)) return true;
  if (/<(?:div|section|main|article)[^>]*\bid\s*=\s*['"]deck-track['"]/i.test(html)) return true;
  return false;
}

/**
 * Detect API compact stacked decks: body-first slides the host letterboxes to
 * 1920×1080. Full framework decks and horizontal scroll-snap templates stay on
 * their native layout path. Styled vertical decks (Creative Mode, etc.) are
 * included when they still use stacked body > .slide markup.
 */
/** Skip compact heuristics on pathological sizes — prefer native layout path. */
const COMPACT_DETECT_MAX_CHARS = 8_000_000;

export function looksLikeCompactApiStackedDeck(html: string): boolean {
  if (!html) return false;
  if (html.length > COMPACT_DETECT_MAX_CHARS) return false;
  try {
    return looksLikeCompactApiStackedDeckUnsafe(html);
  } catch {
    return false;
  }
}

function looksLikeCompactApiStackedDeckUnsafe(html: string): boolean {
  if (looksLikeNestedVerticalTranslateYDeck(html)) return false;
  const deckViewportTrack = looksLikeBareDeckViewportTrack(html);
  if (!deckViewportTrack && looksLikeOfficialFullscreenPresenterDeck(html)) return false;
  if (looksLikeFrameworkDeckMarkup(html)) return false;
  if (looksLikeAuthoredHorizontalSwipeDeck(html)) return false;
  // Official catalog presenters (no look-css marker) keep native 100% fill
  // via looksLikeOfficialFullscreenPresenterDeck above. Compact body-first
  // fills often copy a `.presentation` / `.deck` wrapper from templates —
  // those MUST still letterbox. Otherwise `min-height:100vh` slides fill the
  // tall preview panel as a portrait document with a vertical scrollbar.
  const officialLookFill = hasOfficialLookStyleAttr(html);
  const bodyFirst = hasBodyFirstSlide(html);
  const viewportSized = looksLikeSlideViewportSized(html);
  const legacyBodyFirst = looksLikeLegacyStyledBodyFirstDeck(html);
  const compactBodyFirst = (bodyFirst && (viewportSized || legacyBodyFirst)) || deckViewportTrack;
  if (looksLikeAuthoredScrollNavigateDeck(html) && !compactBodyFirst) return false;
  const hasPresentationShell =
    /<(?:div|section|main)\b[^>]*\bclass\s*=\s*['"][^'"]*\bpresentation\b/i.test(html);
  // Avoid `<body>[\s\S]*…deck` — catastrophic backtracking on large decks.
  const hasDeckShell =
    /<body\b/i.test(html)
    && /<(?:div|section)\b[^>]*\bclass\s*=\s*['"][^'"]*(?:^|\s)deck(?:\s|["']|$)/i.test(html);
  // Non-compact presentation/deck shells (catalog-like, not body-first
  // viewport pages) stay on native fill — but never block compactBodyFirst.
  if (!officialLookFill && !compactBodyFirst && (hasPresentationShell || hasDeckShell)) {
    return false;
  }
  if (!bodyFirst && !deckViewportTrack) return false;
  if (deckViewportTrack) return true;
  if (viewportSized) return true;
  // Legacy Canvas/Drive → Slide decks can be body-first multi-slide HTML
  // without explicit 100vh or 1920×1080 sizing. Keep existing deliverables
  // recoverable in the host fixed-stage viewer instead of reflowing them as
  // generic HTML.
  return legacyBodyFirst;
}

/** Host-side detection that matches buildSrcdoc's wrapped preview HTML. */
export function looksLikeCompactApiStackedDeckForPreview(html: string): boolean {
  try {
    return looksLikeCompactApiStackedDeck(prepareCompactStackedDeckPreviewHtml(html));
  } catch {
    // Classification must never take down FileViewer / PreviewModal render.
    return false;
  }
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

const COMPACT_STACKED_EXPORT_FIX_MARKER = 'data-od-compact-deck-export-fix';

function compactStackedDeckExportCss(): string {
  return `
  <style ${COMPACT_STACKED_EXPORT_FIX_MARKER}>
    /* PPT inches — never 1920px (@page px → ~20″ MediaBox at 96dpi). */
    @page { size: 13.333333in 7.5in; margin: 0; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 1920px !important;
      min-width: 1920px !important;
      /* Do not paint #0b0c10 — preview already learned that a forced dark
         letterbox reads as "template not applied". Keep the deck's own
         body/paper background (cream, dark terminal, or unset). */
    }
    body { overflow-x: hidden !important; }
    body > .slide,
    body > * > .slide,
    body > * > * > .slide {
      position: relative !important;
      inset: auto !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      bottom: auto !important;
      width: 1920px !important;
      height: 1080px !important;
      min-height: 1080px !important;
      max-height: 1080px !important;
      box-sizing: border-box !important;
      margin: 0 auto !important;
      overflow: visible !important;
      contain: layout size;
      page-break-after: always !important;
      break-after: page !important;
      flex: none !important;
      transform: none !important;
    }
    body > .slide:last-child,
    body > * > .slide:last-child,
    body > * > * > .slide:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    @media print {
      html, body {
        width: 1920px !important;
        min-width: 1920px !important;
      }
      body > .slide,
      body > * > .slide,
      body > * > * > .slide {
        width: 1920px !important;
        height: 1080px !important;
        min-height: 1080px !important;
        max-height: 1080px !important;
        overflow: visible !important;
      }
    }
  </style>`;
}

/**
 * Standalone downloads and daemon inline-render payloads do not go through
 * the live preview bridge. Normalize compact body-first decks there too so
 * `100vh`/document-flow fallback HTML exports as real 16:9 pages.
 */
export function normalizeCompactStackedDeckForExport(html: string, deck?: boolean): string {
  if (!deck || !html || html.includes(COMPACT_STACKED_EXPORT_FIX_MARKER)) return html;
  const prepared = prepareCompactStackedDeckPreviewHtml(html);
  if (!looksLikeCompactApiStackedDeck(prepared)) return html;
  const withViewport = injectStackedDeckViewport(html);
  const css = compactStackedDeckExportCss();
  if (/<\/head>/i.test(withViewport)) {
    return withViewport.replace(/<\/head>/i, `${css}\n</head>`);
  }
  if (/<html\b/i.test(withViewport)) {
    return withViewport.replace(/<body\b/i, `<head>${css}</head>\n<body`);
  }
  return `${css}\n${withViewport}`;
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
  compactStackedDeckExportCss,
};
