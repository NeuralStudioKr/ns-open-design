/**
 * HTML card/thumb srcDoc builders — first-slide isolation SSOT.
 * Kept free of React so auth loaders can import without cycles.
 */

import {
  lockStackedDeckCanvasForPreview,
  relaxPersistedDeckSlideSurfaceBleed,
  repairArtifactStyleSheets,
  sanitizeMotifOutsideCanvasOffsets,
} from "@open-design/contracts";
import { repairDeckSlideSurfaceBleed } from "../artifacts/deck-slide-surface";
import {
  injectHtmlBaseHref,
  resolvePluginPreviewBaseHref,
} from "../runtime/authenticatedHtmlSrcDoc";

/** Heal already-persisted css2 debris + Motif hangs + flatten bleed before isolation. */
function healCoverHtml(html: string): string {
  const healedSheets = String(html ?? '').replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, css: string, close: string) =>
      `${open}${sanitizeMotifOutsideCanvasOffsets(css)}${close}`,
  );
  return lockStackedDeckCanvasForPreview(
    repairDeckSlideSurfaceBleed(
      relaxPersistedDeckSlideSurfaceBleed(repairArtifactStyleSheets(healedSheets)),
    ),
  );
}

export const HTML_COVER_CANVAS_WIDTH = 1920;
export const HTML_COVER_CANVAS_HEIGHT = 1080;

/** Opening-tag attrs that may contain `>` inside quotes (style/content). */
const TAG_OPEN_ATTRS_RE = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const COVER_SLIDE_OPEN_RE = new RegExp(
  String.raw`<(section|div|main|article)\b(${TAG_OPEN_ATTRS_RE})>`,
  "gi",
);

export type CoverSlideSection = {
  openTag: string;
  outerHtml: string;
  start: number;
  end: number;
};

/**
 * Catalog / picker thumbs. Multi-slide official presenters (`<deck-stage>`)
 * must isolate slide 1 and drop `deck-stage.js` — the live CE hides every
 * slide except `[data-deck-active]` and paints a white `.canvas` until
 * upgrade, which is the Pink Script white thumbnail.
 */
export function pluginCatalogPreviewSrcDoc(html: string, sourceUrl: string): string {
  const baseHref = resolvePluginPreviewBaseHref(sourceUrl);
  if (htmlLooksLikeMultiSlideDeck(html)) {
    return buildHtmlCoverSrcDoc(html, baseHref);
  }
  return injectHtmlBaseHref(html, baseHref);
}

/**
 * SSOT for any HTML thumb that must not paint later-slide absolute chrome.
 * Multi-slide content always uses deck isolation even when callers pass page mode
 * (Chat artifacts, mis-labeled prototype metadata, DesignFiles panel).
 */
export function buildHtmlCoverSrcDoc(
  html: string,
  sourceUrl: string,
  options?: { preferDeck?: boolean },
): string {
  const healed = healCoverHtml(html);
  const preferDeck = options?.preferDeck === true;
  if (preferDeck || htmlLooksLikeMultiSlideDeck(healed)) {
    return deckPreviewSrcDoc(healed, sourceUrl, { alreadyHealed: true });
  }
  return pagePreviewSrcDoc(healed, sourceUrl, { alreadyHealed: true });
}

/** True when HTML has 2+ top-level slide-like blocks (section/div.slide, data-slide, …). */
export function htmlLooksLikeMultiSlideDeck(html: string): boolean {
  return extractCoverSlideSections(html).length >= 2;
}

export function pagePreviewSrcDoc(
  html: string,
  sourceUrl: string,
  options?: { alreadyHealed?: boolean },
): string {
  const source = options?.alreadyHealed ? html : healCoverHtml(html);
  const withoutScripts = stripHtmlScripts(source);
  const style = `<style id="od-page-card-preview">
    html,
    body {
      margin: 0 !important;
      width: ${HTML_COVER_CANVAS_WIDTH}px !important;
      min-height: ${HTML_COVER_CANVAS_HEIGHT}px !important;
      overflow: hidden !important;
    }
  </style>`;
  return injectPreviewHead(withoutScripts, sourceUrl, style);
}

export function deckPreviewSrcDoc(
  html: string,
  sourceUrl: string,
  options?: { alreadyHealed?: boolean },
): string {
  // Prefer DOM isolation over CSS hide: agent rules like
  // `.slide.s-xxx { display:flex !important }` after </head> can re-show later
  // slides. Absolute-stacked + manually moved children then bleed into the
  // first-slide thumb (home/designs card covers).
  const source = options?.alreadyHealed ? html : healCoverHtml(html);
  const isolated = stampIsolatedCoverSlideVisible(isolateFirstDeckSlideHtml(source));
  const withoutScripts = stripHtmlScripts(isolated);
  const style = `<style id="od-deck-card-preview">
    html,
    body {
      margin: 0 !important;
      width: ${HTML_COVER_CANVAS_WIDTH}px !important;
      height: ${HTML_COVER_CANVAS_HEIGHT}px !important;
      overflow: hidden !important;
    }
    body {
      display: block !important;
      scroll-snap-type: none !important;
    }
    /* Undefined <deck-stage> is display:inline. Other hosts are 100vw/100vh
       scroll rows — both collapse or letterbox in a catalog iframe unless
       the cover host is a fixed 16:9 block. Do not include .stage: Pink
       Script uses that class for an inner title wrap. */
    deck-stage,
    .presentation,
    .deck,
    #deck,
    .deck-shell,
    .slides-container,
    .slide-deck {
      display: block !important;
      position: relative !important;
      width: ${HTML_COVER_CANVAS_WIDTH}px !important;
      height: ${HTML_COVER_CANVAS_HEIGHT}px !important;
      max-width: none !important;
      max-height: none !important;
      overflow: hidden !important;
    }
    .slide,
    .slide-frame,
    section.slide,
    div.slide,
    article.slide,
    main.slide,
    section[data-slide],
    section[data-slide-index],
    section[data-screen-label],
    section[data-label],
    [data-deck-active] {
      position: absolute !important;
      inset: 0 !important;
      width: ${HTML_COVER_CANVAS_WIDTH}px !important;
      height: ${HTML_COVER_CANVAS_HEIGHT}px !important;
      flex: none !important;
      scroll-snap-align: none !important;
      /* Presenter CSS hides inactive slides (opacity:0 / display:none).
         Isolation dropped later slides — the stamped cover must paint. */
      opacity: 1 !important;
      visibility: visible !important;
      pointer-events: none !important;
      transform: none !important;
    }
    /* Grove / Broadside / Mat keep [data-anim] at opacity:0 until JS
       adds .is-active. Catalog thumbs never run that script. */
    [data-deck-active] [data-anim],
    .slide.active [data-anim],
    .slide.is-active [data-anim] {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      animation: none !important;
    }
    /* Backup if isolation missed a dialect — sibling combinator: :first-of-type
       hides the real first .slide when a preceding <section> steals it. */
    .slide ~ .slide,
    .slide-frame ~ .slide-frame,
    section[data-slide] ~ section[data-slide],
    section[data-slide-index] ~ section[data-slide-index],
    section[data-screen-label] ~ section[data-screen-label],
    section[data-label] ~ section[data-label],
    .deck-counter,
    .deck-controls,
    .deck-hint,
    .deck-page-controls,
    .deck-pager,
    .deck-progress,
    .deck-nav,
    .deck-navigation,
    .page-controls,
    .page-flip-controls,
    .page-nav,
    .page-navigation,
    .pagination-control,
    .pagination-controls,
    #deck-prev,
    #deck-next,
    #deck-cur,
    #deck-total,
    [data-deck-controls],
    [data-page-controls],
    [data-pagination],
    [aria-label="Previous slide"],
    [aria-label="Next slide"],
    [aria-label="Deck navigation"],
    [aria-label="Page navigation"],
    [aria-label="Pagination"],
    nav[aria-label*="page" i],
    nav[aria-label*="pagination" i] {
      display: none !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }
  </style>`;
  // Trail the doc so late author <style> blocks cannot re-show removed slides'
  // leftovers (nav chrome, non-.slide sections).
  const trail = `<style id="od-deck-card-preview-trail">
    .slide ~ .slide,
    .slide-frame ~ .slide-frame,
    section[data-slide] ~ section[data-slide],
    section[data-slide-index] ~ section[data-slide-index],
    section[data-screen-label] ~ section[data-screen-label],
    section[data-label] ~ section[data-label] {
      display: none !important;
      visibility: hidden !important;
      content-visibility: hidden !important;
      pointer-events: none !important;
    }
    [data-deck-active],
    .slide.active,
    .slide.is-active {
      opacity: 1 !important;
      visibility: visible !important;
    }
    [data-deck-active] [data-anim],
    .slide.active [data-anim],
    .slide.is-active [data-anim] {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
      animation: none !important;
    }
  </style>`;
  return injectBefore(
    injectPreviewHead(withoutScripts, sourceUrl, style),
    "</body>",
    trail,
  );
}

/**
 * Drop every top-level slide-like block after the first so card thumbs cannot
 * paint later-slide absolute/manual-edit chrome over the cover.
 *
 * Dialects: `<section|div|main|article class="slide">`, `[data-slide]`,
 * `[data-slide-index]`, `[data-screen-label]`, `[data-label]`. Nested slides
 * inside the first slide are kept (not treated as later siblings).
 */
export function isolateFirstDeckSlideHtml(html: string): string {
  const slides = extractCoverSlideSections(html);
  if (slides.length <= 1) return html;
  let out = html;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const slide = slides[i];
    if (!slide) continue;
    out = `${out.slice(0, slide.start)}${out.slice(slide.end)}`;
  }
  return out;
}

/**
 * Catalog thumbs are static — presenter / deck-stage JS never runs.
 * Stamp the remaining cover so author CSS that paints only `.active`,
 * `.is-active`, or `[data-deck-active]` cannot blank the iframe.
 */
export function stampIsolatedCoverSlideVisible(html: string): string {
  const first = extractCoverSlideSections(html)[0];
  if (!first) return html;
  let next = first.openTag;
  if (!/\bclass\s*=/i.test(next)) {
    next = next.replace(/>$/, ' class="active is-active">');
  } else {
    if (!/(?:^|[\s"'])active(?:[\s"']|$)/i.test(next)) {
      next = next.replace(/\bclass\s*=\s*(["'])/i, "class=$1active ");
    }
    if (!/(?:^|[\s"'])is-active(?:[\s"']|$)/i.test(next)) {
      next = next.replace(/\bclass\s*=\s*(["'])/i, "class=$1is-active ");
    }
  }
  if (!/\bdata-deck-active\b/i.test(next)) {
    next = next.replace(/>$/, ' data-deck-active="1">');
  }
  if (next === first.openTag) return html;
  return `${html.slice(0, first.start)}${next}${html.slice(first.start + first.openTag.length)}`;
}

/**
 * Top-level slide-like blocks for cover isolation (outermost only).
 */
export function extractCoverSlideSections(html: string): CoverSlideSection[] {
  const raw: CoverSlideSection[] = [];
  const openRe = new RegExp(COVER_SLIDE_OPEN_RE.source, "gi");
  const closeByTag = {
    section: /<\/section\s*>/gi,
    div: /<\/div\s*>/gi,
    main: /<\/main\s*>/gi,
    article: /<\/article\s*>/gi,
  } as const;

  let searchFrom = 0;
  while (searchFrom < html.length) {
    openRe.lastIndex = searchFrom;
    const openMatch = openRe.exec(html);
    if (!openMatch) break;
    const tag = (openMatch[1] ?? "section").toLowerCase();
    const attrs = openMatch[2] ?? "";
    const openStart = openMatch.index;
    const openEnd = openStart + openMatch[0].length;
    if (!isCoverSlideOpen(tag, attrs)) {
      searchFrom = openEnd;
      continue;
    }
    const closeRe = new RegExp(closeByTag[tag as keyof typeof closeByTag].source, "gi");
    const nestedOpenRe = new RegExp(String.raw`<${tag}\b${TAG_OPEN_ATTRS_RE}>`, "gi");
    let depth = 1;
    let cursor = openEnd;
    let matchedCloseEnd = -1;
    while (cursor < html.length && depth > 0) {
      nestedOpenRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen = nestedOpenRe.exec(html);
      const nextClose = closeRe.exec(html);
      if (!nextClose) break;
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        const closeEnd = nextClose.index + nextClose[0].length;
        cursor = closeEnd;
        if (depth === 0) matchedCloseEnd = closeEnd;
      }
    }
    if (matchedCloseEnd === -1) {
      searchFrom = openEnd;
      continue;
    }
    raw.push({
      openTag: openMatch[0],
      outerHtml: html.slice(openStart, matchedCloseEnd),
      start: openStart,
      end: matchedCloseEnd,
    });
    searchFrom = matchedCloseEnd;
  }

  // Keep outermost only — nested .slide inside first slide must not count as
  // "later slides" to delete (would punch holes in the cover).
  return raw.filter(
    (slide, index) =>
      !raw.some(
        (other, otherIndex) =>
          otherIndex !== index && other.start < slide.start && other.end >= slide.end,
      ),
  );
}

function isCoverSlideOpen(tag: string, attrs: string): boolean {
  if (hasClassToken(attrs, "slide") || hasClassToken(attrs, "slide-frame")) return true;
  // Nav dots reuse data-slide on <div class="nav-dot"> — never treat those as slides.
  if (tag !== "section" && tag !== "main" && tag !== "article") return false;
  return (
    /\bdata-slide(?:-index)?\s*=/i.test(attrs)
    || /\bdata-screen-label\s*=/i.test(attrs)
    || /\bdata-label\s*=/i.test(attrs)
  );
}

function hasClassToken(attrs: string, token: string): boolean {
  const match = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(attrs);
  if (!match) return false;
  const value = match[1] ?? match[2] ?? match[3] ?? "";
  return new RegExp(`(^|\\s)${token}(\\s|$)`, "i").test(value);
}

function injectPreviewHead(source: string, sourceUrl: string, style: string): string {
  return injectBefore(injectHtmlBaseHref(source, sourceUrl), "</head>", style);
}

function injectBefore(source: string, marker: string, addition: string): string {
  const index = source.toLowerCase().lastIndexOf(marker);
  if (index === -1) return `${addition}${source}`;
  return `${source.slice(0, index)}${addition}${source.slice(index)}`;
}

function stripHtmlScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, "")
    .replace(/<script\b[^>]*\/>/giu, "");
}
