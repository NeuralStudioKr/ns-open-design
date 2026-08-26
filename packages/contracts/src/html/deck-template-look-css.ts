import {
  classAttrHasDeckSlideToken,
  countDeckSlideHostOpens,
  DECK_SLIDE_HOST_CSS_CLASS,
} from './deck-slide-class.js';

/**
 * Compact BYOK fill is forbidden from dumping the official example.html
 * stylesheet (token budget / Motif-SVG hang). Standalone HTML/PDF then
 * ship cream typography without that template's Motif/Layout CSS — users
 * read that as "template CSS not applied".
 *
 * Merge the official look CSS (tokens + Motif/Layout rules + font links)
 * and reusable Motif HTML (hidden SVG symbol sheets, grain/crt hosts,
 * visible Motif instances — Daisy SVG, Capsule pills, Sakura petals,
 * Pin `<use>`, Playful doodles, Graphify orbs — and CSS Motif identity
 * seeds for Hermes scanlines / Pastel blobs) into the artifact when those
 * pieces are missing. Page look CSS must not ingest `<style>` blocks nested
 * inside Motif SVGs — those leak `#FCDF6C` into the stylesheet and make
 * generic circle SVGs look like Daisy paint already landed. Presentation chrome
 * (`.slide { opacity:0; position:absolute; width/height:100% }`) is
 * neutralized on compact fills so stacked preview/export keeps a fixed
 * 1920×1080 canvas. Official catalog presenters keep iframe-relative 100% fill.
 *
 * Catalog-wide: proof that look CSS is already present must be unique
 * Motif/Layout class *rules*, not generic `.slide-1` / `.slide-title`
 * chrome that compact fill often copies from the kit. Motif HTML is a
 * separate proof — CSS already merged must not skip `#pin` symbols or
 * CSS Motif identity seeds.
 */

export const OFFICIAL_DECK_LOOK_STYLE_ATTR = 'data-od-official-look-css';
export const OFFICIAL_DECK_MOTIF_HTML_ATTR = 'data-od-official-motif-html';
/** Unscoped Motif placement rules so compact slides without `.s-cover` still paint. */
export const OFFICIAL_DECK_MOTIF_DECO_CSS_ATTR = 'data-od-official-motif-deco-css';

/** Marker comment inside official look CSS — heal upgrades older weak neutralize. */
export const OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER =
  'stacked preview/export: Motif paint + fixed 1920';

export type OfficialDeckLookAssets = {
  css: string;
  fontLinks: string[];
  motifHtml: string[];
  /** Body/html host class (`tpl-*` / `theme-*`) required for scoped Motif CSS. */
  identityHostClass?: string | null;
};

const FONT_LINK_RE = /<link\b[^>]*>/gi;
const STYLE_BODY_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const FONT_IMPORT_URL_RE =
  /@import\s+(?:url\(\s*)?['"]?(https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|db\.onlinewebfonts\.com)[^'")\s]+)['"]?\s*\)?[^;]*;/gi;
const CLASS_SELECTOR_RE = /\.([a-zA-Z_][\w-]*)/g;
const SVG_BLOCK_RE = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;
const SYMBOL_ID_RE = /<symbol\b[^>]*\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
const MOTIF_HOST_RE =
  /<(div|span)\b[^>]*\bclass\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>\s*<\/\1>/gi;
const MOTIF_HOST_CLASS_RE = /\b(?:grain-overlay|crt-overlay|hc-scanlines)\b/i;
/** Capsule/Sakura/Hermes/Pastel CSS Motif identity seeds (not grain/crt alone). */
const CAPSULE_PILL_COLOR_RE =
  /\bpill-(?:coral|lime|lavender|sky|violet|yellow|peach|mint|white)\b/i;
const CSS_MOTIF_SEED_CLASS_RE =
  /\b(?:deco-pill|pill-(?:coral|lime|lavender|sky|violet|yellow|peach|mint|white)|petals?|cover-blob|blob|xp-blob|hc-scanlines|hc-grid|post-it|pixel-(?:glitch|particles|corners|stack)|doodle|scribble|win-titlebar|cover-decoration|geo-decoration|zigzag-deco|sunglow|ts-stripe(?:-b)?|corner-bracket|deco-green-circle|deco-pink-rect|deco-yellow-bar|deco-dots|hero-shot|ribbons?|rib)\b/i;
/** Content chrome that must never count as Motif paint / seeds. */
const MOTIF_CONTENT_CHROME_RE =
  /\b(?:stat-bar|pill-accent|pill-academic|pill-divider|pixel-label|pixel-hero-text|pixel-chart|pixel-btn|pixel-face|pixel-avatar|quote-container|diagram-canvas|title-pill|header-pill|orbit-pill)\b/i;

/** Layout/chrome classes compact fill routinely emits — not proof of official look. */
const GENERIC_LOOK_PROOF_CLASS_RE =
  /^(?:slide(?:-inner|-title|-hero|-weekly|-red|-\d+)?|active|is-active|is-prev|deck(?:-shell|-stage|-slide)?|stage|ppt-slide|nav(?:-hint|-dots?|-dot)?|slide-counter|progress)$/i;

/**
 * Official Capsule/etc. CSS is authored for one-slide presentation mode
 * (`.slide { position:absolute; inset:0; width/height:100%; flex-direction:column }`).
 * Stacked preview/PDF/HTML need a fixed 1920×1080 flow canvas or Motif
 * pills and title blocks clip to the browser viewport. Stacked fills use
 * column + vertical center so a short title/lead sits in the 16:9 frame
 * instead of clustering at the top. Split slides (`:has(.split-*)`) keep
 * `flex-direction: unset` so inline row children stay side-by-side.
 */
export const LOOK_NEUTRALIZE_CSS = `
/* ${OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER}×1080 canvas (not presentation absolute 100%) */
html, body {
  overflow: visible !important;
  height: auto !important;
  min-height: 0 !important;
}
.presentation, .deck, #deck, #deck-track, .slide-deck, .deck-shell, .deck-stage, #deck-stage, .stage, .slides-container {
  position: static !important;
  inset: auto !important;
  width: auto !important;
  max-width: none !important;
  height: auto !important;
  min-height: 0 !important;
  /* Horizontal #deck strips (Studio/Grove/Signal) must stack for letterbox. */
  display: flex !important;
  flex-direction: column !important;
  flex-wrap: nowrap !important;
  align-items: center !important;
  transform: none !important;
  overflow: visible !important;
}
/* Include .presentation > .slide so we beat catalog presentation specificity.
 * Size/overflow only — do not force display:flex (Cobalt/Neo-grid need display:grid).
 * Never size bare [data-slide] / [data-screen-label] (nav dots / eyebrow labels). */
.presentation > .slide, .presentation .slide,
.slide, .slide.active, .slide.is-active, .slide.current,
section.slide, .deck-slide, .ppt-slide,
section[data-screen-label], main[data-screen-label], article[data-screen-label] {
  opacity: 1 !important;
  pointer-events: auto !important;
  position: relative !important;
  inset: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  width: 1920px !important;
  height: 1080px !important;
  min-width: 1920px !important;
  min-height: 1080px !important;
  max-width: 1920px !important;
  max-height: 1080px !important;
  transform: none !important;
  margin-left: auto !important;
  margin-right: auto !important;
  box-sizing: border-box !important;
  overflow: visible !important;
}
/* Split/row fills keep their inline axis — do not force a column. */
.slide:has(.split-left), .slide:has(.split-right),
.slide:has([class*="split-"]) {
  flex-direction: unset;
  justify-content: unset;
  align-items: stretch;
}
.slide .deco svg,
[data-od-official-motif-html] svg {
  width: 100% !important;
  height: 100% !important;
  display: block !important;
}
/* Compact fills often omit .title-box; keep copy above Motif corners/pills. */
.slide > :is(h1, h2, h3, p, ul, ol, blockquote, figure, table),
.slide > .title-box, .slide > .main-title, .slide > .title-pill,
.slide > .content, .slide > .slide-inner, .slide > .slide-body,
.slide > .copy, .slide > .text, .slide > .lead, .slide > .welcome-frame,
.slide > .card, .slide > .badge, .slide > span {
  position: relative !important;
  z-index: 2 !important;
}
.slide > div:not([data-od-official-motif-html]):not(.deco):not([class*="deco-"]):not(.floating-pills):not(.petals):not(.gd-ambient):not(.pixel-glitch):not(.scanlines):not(.grain):not(.hc-scanlines):not(.hc-grid):not(.sunglow):not(.cover-blob):not([class*="cover-blob"]):not(.geo-decoration):not([class*="gd-orb"]):not(.xp-blob):not([class*="xp-blob"]):not([class*="post-it"]):not(.pin):not([class^="pin-"]):not([class*=" pin-"]):not([class*="doodle"]):not([class*="petal"]):not([class*="stamp"]):not([class*="tape"]):not([class*="pill"]):not([class*="corner-bracket"]):not([class*="ts-stripe"]):not([class*="zigzag"]):not(.ribbon):not(.ribbons):not(.rib):not([class*="ribbon"]):not([class^="win-"]):not([class*=" win-"]):not(.shape):not([class*="pixel-"]):not([class^="hc-"]):not([class*=" hc-"]):not([class*="title-accent"]):not([class*="closing-accent"]):not(.mini-note):not(.hero-shot):not([class*="card-deco"]) {
  position: relative !important;
  z-index: 2 !important;
}
/* In-deck 01/10 chrome (ib-pitch-book .chrome) fights host 3/9 nav. */
.deck > .chrome, .presentation > .chrome, #deck > .chrome {
  display: none !important;
}
`;

const LOOK_NEUTRALIZE_TAIL_RE =
  /\n?\/\*\s*stacked preview\/export:[\s\S]*$/i;

const OFFICIAL_LOOK_MAX_VIEWPORT_MEDIA_RE = /@media\b[^{]*\bmax-(?:width|height)\s*:/i;

/**
 * Official example `@media (max-width: …)` is for a full-window presenter.
 * Stacked preview/export scale a 1920×1080 canvas inside a smaller iframe,
 * so those queries match and collapse 16:9 grids/timelines into a column
 * that `overflow:hidden` then clips. Drop only max-width/max-height blocks
 * from official look CSS — author styles outside that sheet stay intact.
 */
export function stripOfficialLookViewportMediaQueries(css: string): string {
  const source = String(css ?? '');
  if (!OFFICIAL_LOOK_MAX_VIEWPORT_MEDIA_RE.test(source)) return source;
  let out = '';
  let i = 0;
  const lower = source.toLowerCase();
  while (i < source.length) {
    const at = lower.indexOf('@media', i);
    if (at < 0) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, at);
    const brace = source.indexOf('{', at);
    if (brace < 0) {
      out += source.slice(at);
      break;
    }
    const query = source.slice(at + 6, brace);
    const end = matchingCssBraceEnd(source, brace);
    if (end < 0) {
      out += source.slice(at);
      break;
    }
    if (!/\bmax-(?:width|height)\s*:/i.test(query)) {
      out += source.slice(at, end);
    }
    i = end;
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

/**
 * True when a selector paints the slide/deck host itself (not a descendant
 * panel). Used to strip presenter clip/viewport sizing from look CSS (§0.89).
 */
function isOfficialLookSlideHostSelector(part: string): boolean {
  const cleaned = String(part ?? '')
    .trim()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/::?[a-z0-9_-]+(?:\([^)]*\))?/gi, '')
    .trim();
  if (!cleaned) return false;
  // Keep in sync with LOOK_NEUTRALIZE deck/shell hosts (§0.93).
  if (
    /^(?:\.slides-container|\.slides|\.presentation|\.deck|\.deck-shell|\.deck-stage|\.stage|#deck|#deck-track|#deck-stage)(?:\.[\w-]+)*$/i.test(
      cleaned,
    )
  ) {
    return true;
  }
  const last = cleaned.split(/\s+/).pop() ?? '';
  return /^(?:[a-z][\w-]*|\*)?(?:\.slide|\.deck-slide|\.ppt-slide|\.slide-deck)(?:\.[\w-]+)*$/i.test(last)
    || /^section\.slide(?:\.[\w-]+)*$/i.test(last);
}

/**
 * Official catalogs ship `.slide{overflow:hidden;height:100vh}` for fullscreen
 * presenters. LOOK_NEUTRALIZE overrides with !important, but prepare still
 * strips host clip/viewport sizing so Motif cannot clip if neutralize is
 * missing or specificity races (§0.89 · cache v47).
 */
export function stripOfficialLookSlideHostCanvasClips(css: string): string {
  return String(css ?? '').replace(
    /([^{}]+)\{([^}]*)\}/g,
    (full, sel: string, body: string) => {
      const parts = String(sel)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
      if (!parts.length || !parts.every(isOfficialLookSlideHostSelector)) return full;
      const next = String(body)
        .replace(
          /(?:^|;)\s*overflow(?:-x|-y)?\s*:\s*(?:hidden|clip)\s*(?:!important)?\s*(?=;|$)/gi,
          ';',
        )
        .replace(
          /(?:^|;)\s*(?:min-|max-)?(?:width|height)\s*:\s*[^;]*\b100\s*v(?:w|h|min|max|i|b)\b[^;]*(?=;|$)/gi,
          ';',
        )
        // Studio/Grove horizontal strip: flex-basis 100vw keeps N×viewport width.
        .replace(
          /(?:^|;)\s*flex\s*:\s*[^;]*\b100\s*v(?:w|h|min|max)\b[^;]*(?=;|$)/gi,
          ';',
        )
        .replace(
          /(?:^|;)\s*flex-basis\s*:\s*[^;]*\b100\s*v(?:w|h|min|max)\b[^;]*(?=;|$)/gi,
          ';',
        )
        .replace(/;;+/g, ';')
        .replace(/^\s*;\s*|\s*;\s*$/g, '')
        .trim();
      if (!next) return `${sel}{/* od-slide-host-canvas-clip-stripped */}`;
      return `${sel}{${next}}`;
    },
  );
}

function matchingCssBraceEnd(source: string, openBrace: number): number {
  let depth = 0;
  for (let j = openBrace; j < source.length; j += 1) {
    const ch = source[j];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
  }
  return -1;
}

function officialLookCssBodies(html: string): string[] {
  const out: string[] = [];
  const re = /<style\b[^>]*\bdata-od-official-look-css\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) out.push(match[1] ?? '');
  return out;
}

function officialLookCssLooksCurrent(css: string): boolean {
  return (
    css.includes(OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER)
    && /position\s*:\s*relative\s*!important/i.test(css)
    && /width\s*:\s*1920px\s*!important/i.test(css)
    && /height\s*:\s*1080px\s*!important/i.test(css)
    // §0.62+ content-above-Motif stacking (v33 sheets lack this).
    && /\.slide\s*>\s*:is\(h1/i.test(css)
    && /z-index\s*:\s*2\s*!important/i.test(css)
    && !OFFICIAL_LOOK_MAX_VIEWPORT_MEDIA_RE.test(css)
    // §0.83 — hang gate tracks full Motif lexicon (sanitize SSOT), not Daisy-only.
    && sanitizeMotifOutsideCanvasOffsets(css) === css
    // §0.83 neutralize: size labeled section hosts; never bare [data-slide] nav dots.
    && /section\[data-screen-label\]/i.test(css)
    && !/\[data-slide\],\s*\[data-screen-label\]/i.test(css)
  );
}

/** Strip Motif outside-canvas offsets from already-injected look style bodies. */
function sanitizeOfficialLookStyleBodies(html: string): string {
  return html.replace(
    /(<style\b[^>]*\bdata-od-official-look-css\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, css: string, close: string) => {
      const next = sanitizeMotifOutsideCanvasOffsets(css);
      return `${open}${next}${close}`;
    },
  );
}

/** Strip Motif hang offsets from deco fallback sheets too (§0.73). */
function sanitizeOfficialMotifDecoStyleBodies(html: string): string {
  return html.replace(
    /(<style\b[^>]*\bdata-od-official-motif-deco-css\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, css: string, close: string) => {
      const next = sanitizeMotifOutsideCanvasOffsets(css);
      return `${open}${next}${close}`;
    },
  );
}

/**
 * True when stacked-canvas neutralize is fully present — not merely a marker
 * comment substring (truncated/poisoned comments must not skip upgrade).
 */
export function hasOfficialLookStackedCanvasNeutralizeProof(html: string): boolean {
  const dest = String(html ?? '');
  if (!dest.includes(OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER)) return false;
  return (
    /position\s*:\s*relative\s*!important/i.test(dest)
    && /width\s*:\s*1920px\s*!important/i.test(dest)
    && /height\s*:\s*1080px\s*!important/i.test(dest)
    && /\.slide\s*>\s*:is\(h1/i.test(dest)
    && /z-index\s*:\s*2\s*!important/i.test(dest)
  );
}

function hrefFromLinkTag(tag: string): string {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function isFontStylesheetHref(href: string): boolean {
  return /fonts\.googleapis\.com|fonts\.gstatic\.com|db\.onlinewebfonts\.com/i.test(href);
}

function isFontStylesheetLink(tag: string): boolean {
  const href = hrefFromLinkTag(tag);
  return href ? isFontStylesheetHref(href) : /fonts\.googleapis\.com|fonts\.gstatic\.com|db\.onlinewebfonts\.com/i.test(tag);
}

function fontLinkTag(href: string): string {
  return `<link href="${href}" rel="stylesheet">`;
}

function pushUniqueFontLink(out: string[], seenHref: Set<string>, href: string, tag?: string): void {
  const clean = href.trim();
  if (!clean || seenHref.has(clean)) return;
  seenHref.add(clean);
  out.push(tag && hrefFromLinkTag(tag) === clean ? tag : fontLinkTag(clean));
}

export function looksLikeOfficialDeckTemplateId(id: string | null | undefined): boolean {
  const trimmed = String(id ?? '').trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('example-')
    || trimmed.startsWith('html-ppt-')
    || /(?:^|-)ppt(?:-|$)/i.test(trimmed)
  );
}

export function firstOfficialDeckTemplateId(
  ...candidates: Array<string | null | undefined | readonly unknown[]>
): string | null {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        if (typeof item !== 'string') continue;
        if (looksLikeOfficialDeckTemplateId(item)) return item.trim();
      }
      continue;
    }
    if (typeof candidate === 'string' && looksLikeOfficialDeckTemplateId(candidate)) {
      return candidate.trim();
    }
  }
  return null;
}

function isStyleTagInsideSvg(html: string, styleIndex: number): boolean {
  const before = html.slice(0, Math.max(0, styleIndex));
  const lastOpen = before.toLowerCase().lastIndexOf('<svg');
  if (lastOpen === -1) return false;
  const close = html.toLowerCase().indexOf('</svg>', lastOpen);
  return close === -1 || close > styleIndex;
}

function classAttrValue(tag: string): string {
  return /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)?.[1]
    ?? /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)?.[2]
    ?? '';
}

export function listOfficialMotifSymbolIds(html: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  SYMBOL_ID_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SYMBOL_ID_RE.exec(html)) !== null) {
    const id = (match[1] ?? match[2] ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function destHasSymbolId(dest: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<symbol\\b[^>]*\\bid\\s*=\\s*(?:"${escaped}"|'${escaped}')`, 'i').test(dest);
}

function isHiddenSpriteOpenTag(open: string): boolean {
  return (
    /width\s*=\s*(?:"0"|'0'|0)/i.test(open)
    || /height\s*=\s*(?:"0"|'0'|0)/i.test(open)
    || /aria-hidden/i.test(open)
    || /hidden/i.test(open)
    || /position\s*:\s*absolute/i.test(open)
  );
}

function isReusableSpriteSheet(svg: string): boolean {
  if (!/<symbol\b/i.test(svg)) return false;
  const open = /^<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
  if (isHiddenSpriteOpenTag(open)) return true;
  const withoutDefs = svg
    .replace(/<defs\b[\s\S]*?<\/defs>/gi, '')
    .replace(/<symbol\b[\s\S]*?<\/symbol>/gi, '')
    .replace(/<title\b[\s\S]*?<\/title>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return !/<(path|g|circle|ellipse|rect|polygon|polyline|use|text|image)\b/i.test(withoutDefs);
}

/**
 * Catalog Motif paint classes — keep aligned with
 * `MOTIF_CLASS_TOKEN_RE` in template-visual-kit.ts. Persist injects these
 * nodes; Daisy `deco-daisy-*` is only one family.
 * §0.80/§0.83: bare `.pin`, Sakura ribbon/rib, Block-frame deco-*, Scatterbrain accents.
 */
const MOTIF_PAINT_CLASS_RE =
  /\b(?:deco-[a-z0-9_-]+|deco-pill|[cf]-pill|petals?|(?:cover-)?blob(?:-[a-z0-9_-]+)?|(?:rsvp-)?stamp|tape|pin(?:-[a-z0-9_-]+)?|doodle(?:-[a-z0-9_-]+)?|scribble(?:-[a-z0-9_-]+)?|post-it(?:-[a-z0-9_-]+)?|xp-blob|gd-(?:orb|ambient)(?:-[a-z0-9_-]+)?|pixel-[a-z0-9_-]+|hc-scanlines?|win-(?:titlebar|window|btn)|corner-bracket|cover-decoration|geo-decoration|zigzag-deco|sunglow|ts-stripe(?:-b)?|ribbons?|rib|shape|title-accent(?:-[a-z0-9_-]+)?|closing-accent(?:-[a-z0-9_-]+)?|mini-note|hero-shot|card-deco|photo-frame|marker|arrows?|arr)\b/i;

/**
 * Selectors that often carry official outside-canvas Motif hangs.
 * Must stay in lockstep with MOTIF_PAINT_CLASS_RE (+ kit Motif CSS selectors).
 */
const MOTIF_HANG_SANITIZE_SELECTOR_RE =
  /\.(?:deco-[a-z0-9_-]+|deco-pill|[cf]-pill|petals?|(?:cover-)?blob(?:-[a-z0-9_-]+)?|[a-z0-9_-]*stamp\b|tape|pin(?:-[a-z0-9_-]+)?|doodle(?:-[a-z0-9_-]+)?|scribble(?:-[a-z0-9_-]+)?|post-it(?:-[a-z0-9_-]+)?|xp-blob|gd-(?:orb|ambient)(?:-[a-z0-9_-]+)?|pixel-[a-z0-9_-]+|hc-[a-z0-9_-]+|win-[a-z0-9_-]+|corner-bracket|cover-decoration|geo-decoration|zigzag-deco|sunglow|ts-stripe(?:-b)?|ribbons?|rib|shape|title-accent(?:-[a-z0-9_-]+)?|closing-accent(?:-[a-z0-9_-]+)?|mini-note|hero-shot|card-deco|photo-frame|marker|arrows?|arr)\b/i;

function classTokens(classAttr: string): string[] {
  return String(classAttr ?? '').trim().split(/\s+/).filter(Boolean);
}

function hasExactClassToken(classAttr: string, name: string): boolean {
  const needle = String(name ?? '').toLowerCase();
  return classTokens(classAttr).some((token) => token.toLowerCase() === needle);
}

/**
 * Word-boundary class checks are unsafe (`\bdeco-pills\b` matches
 * `deco-pills-closing`). Identity must use exact tokens.
 */
function destHasExactClassToken(html: string, name: string): boolean {
  const re = /<(?:div|span|svg)\b[^>]*\bclass\s*=\s*(?:"[^"]+"|'[^']+')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (hasExactClassToken(classAttrValue(match[0] ?? ''), name)) return true;
  }
  return false;
}

function visiblePaintTokensFromBlock(block: string): string[] {
  const tokens = new Set<string>();
  const re = /\bclass\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    for (const token of classTokens(match[1] ?? match[2] ?? '')) {
      if (
        MOTIF_PAINT_CLASS_RE.test(token)
        && !isMotifClusterClass(token)
        && !/^(grain|crt)-overlay$/i.test(token)
        && token.toLowerCase() !== 'deco'
      ) {
        tokens.add(token.toLowerCase());
      }
    }
  }
  return [...tokens];
}

function isMotifClusterClass(className: string): boolean {
  return classTokens(className).some((token) => (
    /^(?:petals|deco-pills|deco-pills-closing|gd-ambient|floating-pills|pixel-glitch)$/i.test(token)
  ));
}

/** Cover-language first. `floating-pills` is a body variant — not Capsule identity. */
const CLUSTER_PACK_PRIORITY = [
  'deco-pills',
  'petals',
  'gd-ambient',
  'pixel-glitch',
  'floating-pills',
  'deco-pills-closing',
] as const;

function preferredMotifClusterKey(keys: string[]): string {
  const tokens = keys.flatMap((key) => classTokens(key).map((token) => token.toLowerCase()));
  return CLUSTER_PACK_PRIORITY.find((name) => tokens.includes(name)) ?? '';
}

const MOTIF_SKIP_CLASS_RE =
  /\b(?:grain-overlay|crt-overlay|slide|nav-dot|slide-counter|presentation|deck|stage)\b/i;

const MOTIF_OPEN_RE =
  /<(div|span|svg)\b[^>]*\bclass\s*=\s*(?:"[^"]+"|'[^']+')[^>]*>/gi;

function motifPrimaryClass(classAttr: string): string {
  const tokens = String(classAttr ?? '').trim().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (MOTIF_SKIP_CLASS_RE.test(token)) continue;
    if (isMotifClusterClass(token)) return token.toLowerCase();
  }
  for (const token of tokens) {
    if (MOTIF_SKIP_CLASS_RE.test(token)) continue;
    if (token.toLowerCase() === 'deco') continue;
    if (MOTIF_PAINT_CLASS_RE.test(token)) return token.toLowerCase();
  }
  return '';
}

function motifInstanceScore(block: string, className: string): number {
  if (isMotifClusterClass(className)) return 0;
  if (/deco-daisy|#fcdf6c/i.test(block) && /<svg\b/i.test(block)) return 0;
  if (/<svg\b/i.test(block) && /<path\b|<use\b/i.test(block)) return 1;
  if (
    /^(?:deco-dots|deco-green-circle|deco-pink-rect|deco-yellow-bar|deco-square)$/i.test(className)
    || /deco-pill|petal|blob|pin-|doodle|post-it|gd-orb|xp-blob|corner-bracket|pixel-|win-titlebar|cover-blob|cover-decoration|geo-decoration|zigzag-deco|sunglow|ts-stripe|ribbon|rib\b|shape|hero-shot|title-accent|card-deco/i.test(className)
  ) {
    return 1;
  }
  if (/deco-star|deco-rainbow|stamp|tape/i.test(className)) return 2;
  return 3;
}

function placementStyleForMotifClass(classAttr: string): string {
  // % of the 1920×1080 canvas ≈ official Daisy px recipes (220/1920≈11.5%,
  // 220/1080≈20%). Keep Motif fully inside the slide — negative top/left/right
  // hangs get clipped by stacked/pin `overflow:hidden` (§0.70 regression).
  if (/deco-daisy-tl/i.test(classAttr)) {
    return 'position:absolute;top:0;left:0;width:12%;height:20%;pointer-events:none;z-index:1';
  }
  if (/deco-daisy-tr/i.test(classAttr)) {
    return 'position:absolute;top:0;right:0;width:10%;height:17%;pointer-events:none;z-index:1';
  }
  if (/deco-daisy-bl/i.test(classAttr)) {
    return 'position:absolute;bottom:0;left:0;width:11%;height:19%;pointer-events:none;z-index:1';
  }
  if (/deco-daisy-br/i.test(classAttr) || /deco-daisy\b/i.test(classAttr)) {
    return 'position:absolute;bottom:0;right:0;width:11%;height:19%;pointer-events:none;z-index:1';
  }
  if (/deco-star/i.test(classAttr)) {
    return 'position:absolute;top:12%;right:7%;width:5%;height:8%;pointer-events:none;z-index:1';
  }
  if (isMotifClusterClass(classAttr)) {
    return 'position:absolute;inset:0;pointer-events:none;z-index:1';
  }
  // Capsule pills already carry oblong geometry in style — never stamp a
  // 140×140 default that overrides width/height via later declarations.
  // Keep Motif at z-index:1 so compact titles (z-index:2) stay readable.
  if (/\bdeco-pill\b/i.test(classAttr) || /\bpill-(?:coral|lime|lavender|sky|violet|yellow|peach|mint|white)\b/i.test(classAttr)) {
    return 'position:absolute;pointer-events:none;z-index:1';
  }
  if (/\bpetals?\b|\bblob\b|\bgd-orb|\bxp-blob/i.test(classAttr)) {
    return 'position:absolute;top:4%;left:3%;width:12%;height:18%;pointer-events:none;z-index:1';
  }
  if (/\bpin(?:-|\b)/i.test(classAttr)) {
    return 'position:absolute;top:8%;right:8%;width:180px;height:56px;pointer-events:none;z-index:1;color:#1E1E1E';
  }
  if (/\bribbons?\b|\brib\b/i.test(classAttr)) {
    return 'position:absolute;pointer-events:none;z-index:1';
  }
  if (/pixel-glitch/i.test(classAttr)) {
    return 'position:absolute;top:0;right:0;width:22%;height:100%;pointer-events:none;z-index:1';
  }
  if (/win-titlebar/i.test(classAttr)) {
    return 'position:absolute;top:8%;left:10%;width:72%;height:36px;pointer-events:none;z-index:1';
  }
  if (/ts-stripe/i.test(classAttr)) {
    return 'position:absolute;top:0;left:0;width:100%;height:12px;pointer-events:none;z-index:1';
  }
  if (/sunglow|cover-blob|cover-decoration|geo-decoration/i.test(classAttr)) {
    return 'position:absolute;top:0;right:0;width:32%;height:32%;pointer-events:none;z-index:0';
  }
  return 'position:absolute;top:8%;right:6%;width:9%;height:14%;pointer-events:none;z-index:1';
}

/**
 * Daisy corners get official in-canvas recipes. Other Motifs that already
 * carry width/height/corner keep authored geometry — only neutralize hangs
 * (§0.80/§0.83: do not restamp Graphify orbs / Block-frame rects onto Daisy TL discs).
 * CSS Motif shells and unknown Motif classes stamp chrome only (never Daisy fallthrough).
 */
function stampOrPreserveMotifPlacement(className: string, attrs: string): string {
  if (/deco-daisy/i.test(className)) {
    return applyMotifPlacementStyle(attrs, placementStyleForMotifClass(className));
  }
  if (/\bstyle\s*=/i.test(attrs) && /(?:width|height|top|left|right|bottom|inset)\s*:/i.test(attrs)) {
    return attrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, style: string) => {
        let next = sanitizeMotifOffsetDeclarations(String(style));
        next = sanitizeMotifViewportSizeDeclarations(next);
        if (!/position\s*:/i.test(next)) {
          next = `position:absolute;${next}`;
        }
        if (!/pointer-events\s*:/i.test(next)) {
          next = `${next.replace(/;?\s*$/, '')};pointer-events:none`;
        }
        if (!/z-index\s*:/i.test(next)) {
          next = `${next.replace(/;?\s*$/, '')};z-index:1`;
        }
        return `style=${q}${next}${q}`;
      },
    );
  }
  // Non-Daisy default: geometry lives in official look/deco sheets — chrome only.
  const chrome = isMotifClusterClass(className)
    ? 'position:absolute;inset:0;pointer-events:none;z-index:1'
    : 'position:absolute;pointer-events:none;z-index:1';
  // Family-specific recipes only when the Motif needs a known footprint and has no style.
  if (/pixel-glitch/i.test(className)) {
    return applyMotifPlacementStyle(attrs, placementStyleForMotifClass(className));
  }
  if (/win-titlebar|ts-stripe/i.test(className)) {
    return applyMotifPlacementStyle(attrs, placementStyleForMotifClass(className));
  }
  if (/\bdeco-pill\b/i.test(className) || /\bpill-(?:coral|lime|lavender|sky|violet|yellow|peach|mint|white)\b/i.test(className)) {
    return applyMotifPlacementStyle(attrs, placementStyleForMotifClass(className));
  }
  return applyMotifPlacementStyle(attrs, chrome);
}

/** Apply Motif placement by replacing conflicting props (not blind append). */
function applyMotifPlacementStyle(attrs: string, placement: string): string {
  const props = [
    ...placement.matchAll(/(?:^|;)\s*([a-z-]+)\s*:/gi),
  ].map((m) => String(m[1] ?? '').toLowerCase()).filter(Boolean);
  if (/\bstyle\s*=/i.test(attrs)) {
    return attrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, prev: string) => {
        let next = String(prev);
        for (const prop of props) {
          next = next.replace(new RegExp(`(?:^|;)\\s*${prop}\\s*:[^;]*`, 'gi'), '');
        }
        next = next.replace(/(?:^|;)\s*inset\s*:[^;]*/gi, '');
        next = next.replace(/;;+/g, ';').replace(/^;|;$/g, '').trim();
        const sep = next && !/;\s*$/.test(next) ? ';' : '';
        return `style=${q}${next}${sep}${placement}${q}`;
      },
    );
  }
  return `${attrs} style="${placement}"`;
}

function ensureInlineStyle(attrs: string, style: string): string {
  if (/\bstyle\s*=/i.test(attrs)) {
    return attrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, prev: string) => {
        const trimmed = String(prev).trimEnd();
        const sep = !trimmed || /;\s*$/.test(trimmed) ? '' : ';';
        return `style=${q}${trimmed}${sep}${style}${q}`;
      },
    );
  }
  return `${attrs} style="${style}"`;
}

function stripMotifSampleText(html: string): string {
  if (/<svg\b/i.test(html)) return html;
  return html.replace(/>([^<]{3,80})</g, (all, text: string) => {
    const trimmed = String(text).trim();
    if (!trimmed || /[&{}]/.test(trimmed)) return all;
    return '><';
  });
}

/** 8-bit orbit particles are JS-filled in the example — seed static dots for Motif floor. */
function enrichEmptyPixelParticles(block: string): string {
  if (!/\bpixel-particles\b/i.test(block)) return block;
  if (/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bp\b/i.test(block)) return block;
  const dots = [
    '<div class="p" style="left:12%;top:18%;background:#5EDCF4"></div>',
    '<div class="p" style="left:68%;top:26%;background:#FF6EC7"></div>',
    '<div class="p" style="left:42%;top:62%;background:#FFE66D"></div>',
    '<div class="p" style="left:78%;top:70%;background:#5EDCF4"></div>',
    '<div class="p" style="left:22%;top:78%;background:#FF6EC7"></div>',
  ].join('');
  if (/<\/div>\s*$/i.test(block)) {
    return block.replace(/<\/div>\s*$/i, `${dots}</div>`);
  }
  return block.replace(/\/>\s*$/, `>${dots}</div>`);
}

function isChartLikeSvg(svg: string): boolean {
  if (/deco-|doodle|pin-|pixel-|zigzag|<pattern\b/i.test(svg)) return false;
  const rects = (svg.match(/<rect\b/gi) ?? []).length;
  return rects >= 4 && /<polyline\b|<line\b/i.test(svg);
}

/**
 * Official Motif paint nodes — SVG wrappers, CSS discs/pills/petals, pin
 * `<use>` instances. Compact fill routinely omits these; look CSS selectors
 * alone do not paint.
 */
function extractVisibleMotifInstances(html: string): string[] {
  const scored: Array<{ score: number; block: string; key: string }> = [];
  MOTIF_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MOTIF_OPEN_RE.exec(html)) !== null) {
    const open = match[0] ?? '';
    const className = classAttrValue(open);
    const primary = motifPrimaryClass(className);
    if (!primary) continue;
    if (MOTIF_CONTENT_CHROME_RE.test(className)) continue;
    if (/^pixel-(?:btn|label|hero-text|chart|bar|hbar|avatar|landscape|face)/i.test(primary)) continue;
    if (/^win-(?:body|btn|buttons|icon|title-left)$/i.test(primary)) continue;
    if (/\bpill\b/i.test(className) && !/\bdeco-pill\b/i.test(className) && !CAPSULE_PILL_COLOR_RE.test(className)) {
      if (!/\bpin-|petal|blob|doodle|post-it|deco-/i.test(className)) continue;
    }
    const start = match.index;
    let raw: string | null = null;
    if (/^<svg\b/i.test(open)) {
      const svg = html.slice(start).match(/^<svg\b[\s\S]*?<\/svg>/i)?.[0] ?? '';
      raw = svg.length >= 40 ? svg : null;
    } else {
      raw = extractBalancedElement(html, start);
    }
    if (!raw || raw.length > 8_000) continue;
    if (/<symbol\b/i.test(raw) && /width\s*=\s*(?:"0"|'0'|0)/i.test(raw)) continue;
    const svgMatch = /<svg\b[\s\S]*?<\/svg>/i.exec(raw);
    if (svgMatch && svgMatch[0].length < 40) continue;
    if (
      svgMatch
      && isChartLikeSvg(svgMatch[0])
      && !/pixel-|zigzag|deco-|doodle|pin-/i.test(className)
    ) {
      continue;
    }
    if (primary === 'win-window' && raw.length > 800) continue;
    if (!svgMatch && !isMotifClusterClass(primary) && raw.length > 1_200) continue;
    let cleaned = stripMotifSampleText(raw);
    if (/\bpixel-particles\b/i.test(className)) cleaned = enrichEmptyPixelParticles(cleaned);
    const openMatch = /^<([a-zA-Z][\w-]*)\b([^>]*)>/.exec(cleaned);
    if (!openMatch) continue;
    const styleAttrs = stampOrPreserveMotifPlacement(className, openMatch[2] ?? '');
    const markedOpen = markOfficialMotifHtml(`<${openMatch[1]}${styleAttrs}>`);
    const block = `${markedOpen}${cleaned.slice(openMatch[0].length)}`;
    scored.push({
      score: motifInstanceScore(block, primary),
      block,
      key: primary,
    });
    if (scored.length >= 80) break;
  }
  scored.sort((a, b) => a.score - b.score || a.block.length - b.block.length);
  const out: string[] = [];
  const seenKeys = new Set<string>();
  let daisyCount = 0;
  let starCount = 0;
  let svgCount = 0;
  let cssCount = 0;
  let clusterCount = 0;
  for (const row of scored) {
    if (seenKeys.has(row.key) || out.includes(row.block)) continue;
    if (isMotifClusterClass(row.key)) {
      if (clusterCount >= 3) continue;
      seenKeys.add(row.key);
      out.push(row.block);
      clusterCount += 1;
      if (out.length >= 8) break;
      continue;
    }
    const hasSvg = /<svg\b/i.test(row.block);
    const isDaisy = /deco-daisy/i.test(row.key);
    const isStar = /deco-star/i.test(row.key);
    if (isDaisy && daisyCount >= 4) continue;
    if (isStar && starCount >= 3) continue;
    if (hasSvg && !isDaisy && !isStar && svgCount >= 3) continue;
    // Block-frame / Product Launch need >3 CSS Motif hosts (pink+yellow+dots+…).
    if (!hasSvg && cssCount >= 6) continue;
    seenKeys.add(row.key);
    out.push(row.block);
    if (isDaisy) daisyCount += 1;
    if (isStar) starCount += 1;
    if (hasSvg) svgCount += 1;
    else cssCount += 1;
    if (out.length >= 12) break;
  }
  return out;
}

function isVisibleMotifInstanceBlock(block: string): boolean {
  if (!/^<(?:div|span|svg)\b/i.test(block)) return false;
  if (isReusableSpriteSheet(block)) return false;
  const className = classAttrValue(block);
  if (MOTIF_HOST_CLASS_RE.test(className) && !/<svg\b/i.test(block)) return false;
  return Boolean(motifPrimaryClass(className));
}

function svgBlocksContainDaisyIdentity(html: string): boolean {
  // Official Daisy paint = flower wrapper + substantial SVG with butter center.
  // A lone `#fcdf6c` stroke/rect chart must NOT count (false-positive skip).
  if (/deco-daisy[\s\S]{0,240}<svg\b[\s\S]{80,}?#fcdf6c/i.test(html)) return true;
  SVG_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SVG_BLOCK_RE.exec(html)) !== null) {
    const svg = match[0] ?? '';
    if (svg.length < 200 || /<symbol\b/i.test(svg)) continue;
    if (!/#fcdf6c/i.test(svg) || !/<path\b/i.test(svg)) continue;
    const paths = (svg.match(/<path\b/gi) ?? []).length;
    // Daisy flower uses multiple petal paths; a single chart stroke is not enough.
    if (paths >= 3) return true;
  }
  return false;
}

function cssMotifElementHasPaint(dest: string, primary: string): boolean {
  const escaped = primary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = new RegExp(
    `<(div|span)\\b([^>]*\\bclass\\s*=\\s*(?:"[^"]*\\b${escaped}\\b[^"]*"|'[^']*\\b${escaped}\\b[^']*')[^>]*)>`,
    'gi',
  );
  // Empty host is real Motif for CSS-disc / overlay families (look CSS paints them).
  // Capsule `.deco-pill` still needs geometry style — bare shell is not paint.
  const cssDiscHost =
    /^(?:gd-orb|xp-blob|cover-blob|sunglow|ts-stripe|pixel-particles|pixel-corners|hc-scanlines|win-titlebar|zigzag-deco|corner-bracket|deco-green-circle|cover-decoration|geo-decoration|deco-dots|post-it|doodle|petals?)/i.test(
      primary,
    );
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(dest)) !== null) {
    const tag = match[1] ?? 'div';
    const attrs = match[2] ?? '';
    const block = extractBalancedElement(dest, match.index) ?? match[0];
    if (!block) continue;
    if (/\bstyle\s*=\s*(["'])[^"']*(?:width|height)\s*:/i.test(attrs)) return true;
    if (/<svg\b/i.test(block)) return true;
    const inner = block.replace(new RegExp(`^<${tag}\\b[^>]*>|</${tag}\\s*>$`, 'gi'), '').trim();
    if (inner.length > 0 && !/^<!--/.test(inner)) return true;
    if (cssDiscHost) return true;
  }
  return false;
}

function daisyOpenTags(html: string): string[] {
  return html.match(
    /<(?:div|span)[^>]*\bclass\s*=\s*(?:"[^"]*\bdeco-daisy[^"]*"|'[^']*\bdeco-daisy[^']*')[^>]*>/gi,
  ) ?? [];
}

function daisyOpenIsOfficialScale(open: string): boolean {
  // Outside-canvas hangs clip under overflow:hidden letterbox (§0.71/§0.72).
  if (/(?:top|left|right|bottom)\s*:\s*-\d/i.test(open)) return false;
  // Mark alone is not scale-proof — pre-v34 stamped Motif can be 22%/39%.
  const width = /width\s*:\s*([\d.]+)\s*(px|%)/i.exec(open);
  if (!width) return false;
  const n = Number(width[1]);
  if (!Number.isFinite(n)) return false;
  // Official Daisy corners ≈ 180–220px (~9.5–12% of 1920). Reject invented
  // 12–48px icons AND pre-§0.62 overscale stamps (22%+).
  if (width[2] === '%') return n >= 9.5 && n <= 14;
  return n >= 100 && n <= 240;
}

/**
 * Rewrite Motif inline hangs (top:-3% etc.) without stripping the host.
 * Daisy corners get official in-canvas placement recipes. Other Motifs
 * (gd-orb / xp-blob / geo) only neutralize negative offsets — keep authored
 * width/height/corner so Graphify ambient orbs are not collapsed to a TL disc (§0.76).
 */
function healMotifOutsideCanvasOffsets(slideHtml: string): string {
  let out = slideHtml;
  const opens = out.match(
    /<(?:div|span)[^>]*\bclass\s*=\s*(?:"[^"]+"|'[^']+')[^>]*>/gi,
  ) ?? [];
  for (let i = opens.length - 1; i >= 0; i -= 1) {
    const open = opens[i]!;
    const cls = classAttrValue(open);
    if (!MOTIF_PAINT_CLASS_RE.test(cls) && !isMotifClusterClass(cls)) continue;
    const needsOffsetHeal = /(?:top|left|right|bottom)\s*:\s*-\d/i.test(open);
    const needsViewportHeal = /(?:width|height)\s*:\s*[\d.]+\s*(?:vw|vh|vmin|vmax)\b/i.test(open);
    if (!needsOffsetHeal && !needsViewportHeal) continue;
    const index = out.lastIndexOf(open);
    if (index < 0) continue;
    const tagMatch = /^<(div|span)\b/i.exec(open);
    if (!tagMatch) continue;
    const tag = tagMatch[1] ?? 'div';
    const attrs = open.replace(new RegExp(`^<${tag}\\b`, 'i'), '').replace(/>$/, '');
    let nextOpen: string;
    if (/deco-daisy/i.test(cls) && needsOffsetHeal) {
      const placement = placementStyleForMotifClass(cls);
      nextOpen = `<${tag}${applyMotifPlacementStyle(attrs, placement)}>`;
    } else if (/\bstyle\s*=/i.test(attrs)) {
      const nextAttrs = attrs.replace(
        /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
        (_m, q: string, style: string) => (
          `style=${q}${sanitizeMotifViewportSizeDeclarations(sanitizeMotifOffsetDeclarations(String(style)))}${q}`
        ),
      );
      nextOpen = `<${tag}${nextAttrs}>`;
    } else {
      continue;
    }
    out = `${out.slice(0, index)}${nextOpen}${out.slice(index + open.length)}`;
  }
  return out;
}

function daisyPaintIsOfficialScale(html: string): boolean {
  const opens = daisyOpenTags(html);
  if (opens.length === 0) return false;
  // Every daisy host must be in-band — one good sibling must not hide a hang.
  return opens.every((open) => daisyOpenIsOfficialScale(open));
}

function daisyCornerTokens(html: string): string[] {
  const tokens = new Set<string>();
  for (const open of daisyOpenTags(html)) {
    for (const token of classTokens(classAttrValue(open))) {
      if (/^deco-daisy(?:-[a-z]+)?$/i.test(token)) tokens.add(token.toLowerCase());
    }
  }
  return [...tokens];
}

/** Official Daisy paint = flower SVG at cover scale, not a 40px invented icon. */
function destHasDaisyOfficialPaint(dest: string, pack: string): boolean {
  if (!/deco-daisy[\s\S]{0,240}<svg\b/i.test(dest)) return false;
  if (!svgBlocksContainDaisyIdentity(dest)) return false;
  if (!daisyPaintIsOfficialScale(dest)) return false;
  const packCorners = daisyCornerTokens(pack);
  const destCorners = daisyCornerTokens(dest);
  if (packCorners.length === 0) return true;
  // Exact pack match is ideal. Otherwise accept an equal-or-greater count of
  // official-scale corners so body [tl,br] is not remmerged into the
  // index-rotated [tr,bl] pair after a hang heal (§0.72).
  if (packCorners.every((c) => destCorners.includes(c))) return true;
  const needed = Math.min(packCorners.length, 4);
  if (destCorners.length < needed) return false;
  // Cover packs need full corner coverage (or 4+); body pairs need ≥2.
  return needed <= 2 ? destCorners.length >= 2 : destCorners.length >= needed;
}

/** Strip invented tiny icons, pre-§0.62 overscale (22%/39%), and outside-canvas hangs. */
function stripMisScaledDaisyInstances(slideHtml: string): string {
  let out = slideHtml;
  const opens = daisyOpenTags(out);
  for (let i = opens.length - 1; i >= 0; i -= 1) {
    const open = opens[i]!;
    if (daisyOpenIsOfficialScale(open)) continue;
    const index = out.lastIndexOf(open);
    if (index < 0) continue;
    const block = extractBalancedElement(out, index);
    if (!block) continue;
    out = `${out.slice(0, index)}${out.slice(index + block.length)}`;
  }
  return out;
}

function destHasInstancePaint(dest: string, block: string): boolean {
  const primary = motifPrimaryClass(classAttrValue(/^<[^>]+>/.exec(block)?.[0] ?? block));
  if (!primary) return false;
  if (primary.includes('daisy')) {
    return destHasDaisyOfficialPaint(dest, block);
  }
  if (primary.includes('pixel-glitch')) {
    return /pixel-glitch[\s\S]{0,240}<svg\b/i.test(dest);
  }
  if (!destHasExactClassToken(dest, primary)) return false;
  if (isMotifClusterClass(primary)) {
    const children = visiblePaintTokensFromBlock(block);
    if (children.length === 0) return cssMotifElementHasPaint(dest, primary);
    return children.some((cls) => {
      if (/deco-pill|petal|xp-blob|gd-orb|(?:cover-)?blob|post-it|doodle/i.test(cls)) {
        return cssMotifElementHasPaint(dest, cls);
      }
      return destHasExactClassToken(dest, cls);
    });
  }
  if (/<svg\b/i.test(block)) {
    return destHasExactClassToken(dest, primary) && /<svg\b/i.test(dest);
  }
  // Empty CSS Motif shells (bare `.deco-pill`) are not paint.
  if (/deco-pill|xp-blob|cover-blob|gd-orb|post-it|pixel-particles|pixel-corners|sunglow|zigzag|corner-bracket|deco-green|ts-stripe|win-titlebar/i.test(primary)) {
    return cssMotifElementHasPaint(dest, primary);
  }
  return true;
}

function destHasVisibleMotifIdentity(dest: string, instances: string[]): boolean {
  if (!dest || instances.length === 0) return instances.length === 0;
  return instances.some((block) => destHasInstancePaint(dest, block));
}

function slideHasOfficialMotifPaint(
  slideHtml: string,
  instances: string[],
  index = 0,
  total = 0,
): boolean {
  const pack = motifPackForSlide(instances, index, total);
  if (!pack) return destHasVisibleMotifIdentity(slideHtml, instances);
  return destHasInstancePaint(slideHtml, pack);
}

function stripOfficialMotifInstances(slideHtml: string): string {
  let out = slideHtml;
  for (let guard = 0; guard < 12; guard += 1) {
    const match = /<(div|span|svg)\b[^>]*\bdata-od-official-motif-html\b[^>]*>/i.exec(out);
    if (!match || match.index == null) break;
    const block = extractBalancedElement(out, match.index);
    if (!block) break;
    out = `${out.slice(0, match.index)}${out.slice(match.index + block.length)}`;
  }
  return out;
}

function fillEmptyMotifShells(dest: string, instances: string[]): string {
  if (!dest || instances.length === 0) return dest;
  const daisySvg =
    instances
      .map((block) => /deco-daisy/i.test(block) ? /<svg\b[\s\S]*?<\/svg>/i.exec(block)?.[0] : null)
      .find(Boolean) ?? '';
  const starSvg =
    instances
      .map((block) => /deco-star/i.test(block) ? /<svg\b[\s\S]*?<\/svg>/i.exec(block)?.[0] : null)
      .find(Boolean) ?? '';
  const rainbowSvg =
    instances
      .map((block) => /deco-rainbow/i.test(block) ? /<svg\b[\s\S]*?<\/svg>/i.exec(block)?.[0] : null)
      .find(Boolean) ?? '';
  const glitchSvg =
    instances
      .map((block) => /pixel-glitch/i.test(block) ? /<svg\b[\s\S]*?<\/svg>/i.exec(block)?.[0] : null)
      .find(Boolean) ?? '';

  return dest.replace(
    /<(div|span)\b([^>]*\bclass\s*=\s*(?:"[^"]*\b(?:deco-[a-z0-9_-]+|petal|blob|pixel-glitch)[^"]*"|'[^']*\b(?:deco-[a-z0-9_-]+|petal|blob|pixel-glitch)[^']*')[^>]*)>\s*<\/\1>/gi,
    (_m, tag: string, attrs: string) => {
      const cls = classAttrValue(attrs);
      let svg = '';
      if (/deco-daisy/i.test(cls)) svg = daisySvg;
      else if (/deco-star/i.test(cls)) svg = starSvg;
      else if (/deco-rainbow/i.test(cls)) svg = rainbowSvg;
      else if (/pixel-glitch/i.test(cls)) svg = glitchSvg;
      // Never fill a star/petal shell with an unrelated Motif SVG.
      if (!svg) return _m;
      const stampedAttrs = stampOrPreserveMotifPlacement(cls, attrs);
      const marked = markOfficialMotifHtml(`<${tag}${stampedAttrs}>`);
      return `${marked}${svg}</${tag}>`;
    },
  );
}

function insertMotifIntoSlide(slideHtml: string, motif: string): string {
  // Prefer after opening slide tag so Motif sits behind title (z-index) but paints.
  return slideHtml.replace(
    /^(<(?:section|div|main|article)\b[^>]*>)/i,
    `$1\n${motif}\n`,
  );
}

/**
 * Compact Motif-deferred fills often omit slide padding. Corner Motifs then
 * sit on the title band. Inject Daisy/Capsule-like insets when no padding is
 * declared. Split slides keep row layout but still need a Motif-safe gutter
 * unless they already declare padding.
 */
function ensureMotifSafeSlideInsets(slideHtml: string): string {
  if (!slideHtml) return slideHtml;
  const isSplit = /split-(?:left|right)|class\s*=\s*["'][^"']*\bsplit-/i.test(slideHtml);
  const open = /^(<(?:section|div|main|article)\b)([^>]*)(>)/i.exec(slideHtml);
  if (!open) return slideHtml;
  const [, tag, attrs, close] = open;
  const styleMatch = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs ?? '');
  const inset = isSplit ? 'padding:40px 56px' : 'padding:56px 72px';
  if (styleMatch) {
    const style = styleMatch[2] ?? '';
    // Explicit positive padding — leave alone. Replace only missing or padding:0.
    if (/padding(?:-(?:top|right|bottom|left))?\s*:\s*(?!0(?:px|em|rem|%)?\b)/i.test(style)) {
      return slideHtml;
    }
    const q = styleMatch[1];
    let nextStyle = style.replace(/padding(?:-(?:top|right|bottom|left))?\s*:\s*[^;]+;?/gi, '').trimEnd();
    const sep = !nextStyle || /;\s*$/.test(nextStyle) ? '' : ';';
    nextStyle = `${nextStyle}${sep}${inset}`;
    const nextAttrs = (attrs ?? '').replace(
      /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i,
      `style=${q}${nextStyle}${q}`,
    );
    return `${tag}${nextAttrs}${close}${slideHtml.slice(open[0].length)}`;
  }
  const nextAttrs = `${attrs ?? ''} style="${inset}"`;
  return `${tag}${nextAttrs}${close}${slideHtml.slice(open[0].length)}`;
}

function extractBalancedElement(html: string, start: number): string | null {
  const openMatch = /^<([a-zA-Z][\w-]*)\b[^>]*>/.exec(html.slice(start));
  if (!openMatch) return null;
  const tag = openMatch[1];
  if (/\/\s*>$/.test(openMatch[0])) return openMatch[0];
  let i = start + openMatch[0].length;
  let depth = 1;
  const openPat = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const closePat = new RegExp(`</${tag}\\s*>`, 'gi');
  while (depth > 0 && i < html.length) {
    openPat.lastIndex = i;
    closePat.lastIndex = i;
    const om = openPat.exec(html);
    const cm = closePat.exec(html);
    if (!cm) return null;
    if (om && om.index < cm.index) {
      if (!/\/\s*>$/.test(om[0])) depth += 1;
      i = om.index + om[0].length;
    } else {
      depth -= 1;
      i = cm.index + cm[0].length;
      if (depth === 0) return html.slice(start, i);
    }
  }
  return null;
}

function listSlideBlocks(html: string): Array<{ start: number; end: number; html: string }> {
  const blocks: Array<{ start: number; end: number; html: string }> = [];
  const re = /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    if (!classAttrHasDeckSlideToken(classAttrValue(match[0] ?? ''))) continue;
    const markup = extractBalancedElement(html, match.index);
    if (!markup) continue;
    blocks.push({
      start: match.index,
      end: match.index + markup.length,
      html: markup,
    });
    if (blocks.length >= 16) break;
  }
  return blocks;
}

type SlideMotifRole = 'cover' | 'body' | 'closing';

function slideMotifRole(index: number, total: number): SlideMotifRole {
  if (index <= 0) return 'cover';
  if (total >= 3 && index === total - 1) return 'closing';
  return 'body';
}

function findClusterByName(clusters: string[], name: string): string | undefined {
  return clusters.find((block) => hasExactClassToken(classAttrValue(block), name));
}

function daisyCornerKey(block: string): string {
  const cls = classAttrValue(block);
  if (hasExactClassToken(cls, 'deco-daisy-tl')) return 'tl';
  if (hasExactClassToken(cls, 'deco-daisy-tr')) return 'tr';
  if (hasExactClassToken(cls, 'deco-daisy-bl')) return 'bl';
  if (hasExactClassToken(cls, 'deco-daisy-br')) return 'br';
  if (hasExactClassToken(cls, 'deco-daisy')) return 'br';
  return '';
}

function pickDaisy(daisies: string[], corner: string): string | undefined {
  return daisies.find((block) => daisyCornerKey(block) === corner);
}

function daisyPackForRole(
  daisies: string[],
  stars: string[],
  role: SlideMotifRole,
  index: number,
): string {
  const tl = pickDaisy(daisies, 'tl');
  const tr = pickDaisy(daisies, 'tr');
  const bl = pickDaisy(daisies, 'bl');
  const br = pickDaisy(daisies, 'br');
  const starA = stars[0];
  const starB = stars[1];
  if (role === 'cover') {
    return [tl, tr, bl, br, starA, starB].filter(Boolean).join('\n');
  }
  if (role === 'closing') {
    return [tl ?? bl, br ?? tr, starA].filter(Boolean).join('\n');
  }
  const pairs: Array<Array<string | undefined>> = [
    [tl, br],
    [tr, bl],
    [tl, tr],
    [bl, br],
  ];
  const pair = pairs[index % pairs.length] ?? [tl, br];
  return [...pair, starA].filter(Boolean).join('\n');
}

function motifPackForSlide(instances: string[], index: number, total = 0): string {
  const role = slideMotifRole(index, total > 0 ? total : index + 1);
  const clusters = instances.filter((block) => isMotifClusterClass(classAttrValue(block)));
  const cover = findClusterByName(clusters, 'deco-pills')
    ?? findClusterByName(clusters, 'petals')
    ?? findClusterByName(clusters, 'gd-ambient')
    ?? findClusterByName(clusters, 'pixel-glitch');
  const bodyCluster = findClusterByName(clusters, 'floating-pills')
    ?? findClusterByName(clusters, 'gd-ambient')
    ?? findClusterByName(clusters, 'pixel-glitch');
  const bodyLoose = instances.find((block) => (
    /\b(?:xp-blob|(?:cover-)?blob|doodle-)/i.test(classAttrValue(block))
    && block !== cover
  ));
  const body = bodyCluster ?? (cover ? bodyLoose : undefined);
  const closing = findClusterByName(clusters, 'deco-pills-closing')
    ?? findClusterByName(clusters, 'floating-pills')
    ?? cover;
  if (cover || bodyCluster || findClusterByName(clusters, 'deco-pills-closing')) {
    if (role === 'cover' && cover) return cover;
    if (role === 'closing' && closing) return closing;
    if (role === 'body' && body) return body;
    if (cover) return cover;
  }
  const daisies = instances.filter((block) => /deco-daisy/i.test(block));
  const stars = instances.filter((block) => /deco-star/i.test(block));
  if (daisies.length > 0) {
    return daisyPackForRole(daisies, stars, role, index);
  }
  const dots = instances.filter((block) => hasExactClassToken(classAttrValue(block), 'deco-dots'));
  const circles = instances.filter((block) => /deco-(?:green-)?circle/i.test(classAttrValue(block)));
  const pinkRects = instances.filter((block) => hasExactClassToken(classAttrValue(block), 'deco-pink-rect'));
  const yellowBars = instances.filter((block) => hasExactClassToken(classAttrValue(block), 'deco-yellow-bar'));
  // Block-frame cover identity = pink rect + yellow bar (not dots-only).
  if (role === 'cover' && (pinkRects.length > 0 || yellowBars.length > 0)) {
    const parts = [pinkRects[0], yellowBars[0], dots[0]].filter(Boolean) as string[];
    const unique = [...new Set(parts)].slice(0, 3);
    if (unique.length > 0) return unique.join('\n');
  }
  if (dots.length > 0 && circles.length > 0) {
    return `${dots[0]}\n${circles[0]}`;
  }
  if (pinkRects.length > 0 || yellowBars.length > 0) {
    const parts = [pinkRects[0], yellowBars[0], circles[0]].filter(Boolean) as string[];
    const unique = [...new Set(parts)].slice(0, 2);
    if (unique.length > 0) return unique.join('\n');
  }
  const heroShot = instances.find((block) => hasExactClassToken(classAttrValue(block), 'hero-shot'));
  if (heroShot) return heroShot;
  const titlebar = instances.find((block) => hasExactClassToken(classAttrValue(block), 'win-titlebar'));
  if (titlebar) return titlebar;
  if (instances.length === 1) return instances[0]!;
  const first = instances[index % instances.length]!;
  const second = instances[(index + 1) % instances.length]!;
  return first === second ? first : `${first}\n${second}`;
}

function trailingMotifSelector(selector: string): string | null {
  const parts = String(selector ?? '').trim().split(/\s+/).filter(Boolean);
  const start = parts.findIndex((part) => (
    MOTIF_PAINT_CLASS_RE.test(part) || isMotifClusterClass(part)
  ));
  if (start === -1) return null;
  return parts.slice(start).join(' ');
}

function motifFallbackCss(officialCss: string, instances: string[]): string {
  const names = new Set<string>();
  for (const block of instances) {
    const open = /^<[^>]+>/.exec(block)?.[0] ?? '';
    for (const token of classAttrValue(open).split(/\s+/)) {
      if (MOTIF_PAINT_CLASS_RE.test(token) || isMotifClusterClass(token)) {
        names.add(token.toLowerCase());
      }
    }
  }
  const rules: string[] = [];
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`([^{}]*\\.${escaped}\\b[^{]*)\\{([^}]+)\\}`, 'gi');
    let match: RegExpExecArray | null;
    let kept = 0;
    while ((match = re.exec(officialCss)) !== null && kept < 4) {
      const trailing = trailingMotifSelector(match[1] ?? '');
      let body = (match[2] ?? '').trim();
      if (!trailing || !body) continue;
      // Motif fallback copies official rule bodies — neutralize hangs here too.
      // Must sanitize declarations directly: wrapping as `.x{…}` skips the
      // Motif-selector gate inside sanitizeMotifOutsideCanvasOffsets (§0.72).
      body = sanitizeMotifOffsetDeclarations(body);
      const rule = `.slide ${trailing}{${body}}`;
      if (!rules.includes(rule)) rules.push(rule);
      kept += 1;
    }
    if (rules.length >= 32) break;
  }
  const stacking = [
    '/* Content above Motif — compact fills lack .title-box z-index */',
    '.slide > :is(h1,h2,h3,p,ul,ol,blockquote,figure,table),',
    '.slide > .title-box,.slide > .main-title,.slide > .title-pill,',
    '.slide > .content,.slide > .slide-inner,.slide > .slide-body,',
    '.slide > .copy,.slide > .text,.slide > .lead,.slide > .welcome-frame,.slide > .card,.slide > .badge,.slide > span{',
    'position:relative !important;z-index:2 !important;',
    '}',
  ].join('');
  rules.push(stacking);
  return sanitizeMotifOutsideCanvasOffsets(rules.join('\n'));
}

function motifDecoCssHasContentStacking(css: string): boolean {
  return /\.slide\s*>\s*:is\(h1/i.test(css) && /z-index\s*:\s*2\s*!important/i.test(css);
}

function mergeMotifFallbackCss(dest: string, officialCss: string, instances: string[]): string {
  if (!dest || instances.length === 0) return dest;
  const css = motifFallbackCss(officialCss, instances);
  if (!css.trim()) return dest;
  const existing = /<style\b([^>]*\bdata-od-official-motif-deco-css\b[^>]*)>([\s\S]*?)<\/style>/i.exec(dest);
  if (existing) {
    const body = existing[2] ?? '';
    const hasHang =
      /(?:top|left|right|bottom)\s*:\s*-\d/i.test(body);
    if (motifDecoCssHasContentStacking(body) && !hasHang) return dest;
    // Upgrade pre-§0.62 deco sheets (missing stacking) or hang offsets (§0.72).
    return dest.replace(
      /<style\b[^>]*\bdata-od-official-motif-deco-css\b[^>]*>[\s\S]*?<\/style>/i,
      `<style ${OFFICIAL_DECK_MOTIF_DECO_CSS_ATTR}>\n${css}\n</style>`,
    );
  }
  return insertBeforeCloseHeadOrOpenBody(
    dest,
    `<style ${OFFICIAL_DECK_MOTIF_DECO_CSS_ATTR}>\n${css}\n</style>`,
  );
}

function mergeVisibleMotifInstances(
  dest: string,
  instances: string[],
  officialCss = '',
): string {
  if (!dest || instances.length === 0) return dest;

  let out = mergeMotifFallbackCss(dest, officialCss, instances);
  out = fillEmptyMotifShells(out, instances);

  const slides = listSlideBlocks(out);
  if (slides.length === 0) {
    if (destHasVisibleMotifIdentity(out, instances)) return out;
    return insertAfterOpenBody(out, motifPackForSlide(instances, 0, 1));
  }

  const nextSlides = slides.map((slide, index) => {
    const pack = motifPackForSlide(instances, index, slides.length);
    let html = slide.html;
    // Heal Motif hangs in place first — preserve packs (§0.72/§0.73).
    html = healMotifOutsideCanvasOffsets(html);
    if (/deco-daisy/i.test(html) || /deco-daisy/i.test(pack)) {
      html = stripMisScaledDaisyInstances(html);
    }
    if (slideHasOfficialMotifPaint(html, instances, index, slides.length)) {
      return ensureMotifSafeSlideInsets(html);
    }
    if (/data-od-official-motif-html/i.test(html)) {
      html = stripOfficialMotifInstances(html);
    }
    return ensureMotifSafeSlideInsets(insertMotifIntoSlide(html, pack));
  });

  for (let i = slides.length - 1; i >= 0; i -= 1) {
    const slide = slides[i]!;
    out = `${out.slice(0, slide.start)}${nextSlides[i]}${out.slice(slide.end)}`;
  }
  return out;
}

function isCssMotifSeedBlock(block: string): boolean {
  if (!block || isVisibleMotifInstanceBlock(block)) return false;
  return CSS_MOTIF_SEED_CLASS_RE.test(block);
}

/** Visible SVG Motif instance OR marked CSS Motif identity seed. */
function isMotifIdentitySeedBlock(block: string): boolean {
  if (isVisibleMotifInstanceBlock(block)) return true;
  return isCssMotifSeedBlock(block);
}

function motifSeedFamily(block: string): string {
  if (isVisibleMotifInstanceBlock(block) || /deco-daisy|#fcdf6c/i.test(block)) return 'daisy';
  if (/\bpetals?\b/i.test(block)) return 'sakura';
  if (/\bdeco-pill\b|\bpill-(?:coral|lime|lavender|sky|violet|yellow|peach|mint|white)\b/i.test(block)) {
    return 'capsule';
  }
  if (/\bhc-scanlines\b|\bhc-grid\b/i.test(block)) return 'hermes';
  if (/\bxp-blob\b|\bblob\b/i.test(block)) return 'pastel';
  if (/\bpost-it\b/i.test(block)) return 'post-it';
  if (/\bpixel-/i.test(block)) return 'pixel';
  if (/\bdoodle|\bscribble\b/i.test(block)) return 'doodle';
  return 'css-motif';
}

function cssMotifSeedProofClass(block: string): string | null {
  const hit = classTokens(classAttrValue(block)).find((token) => (
    CSS_MOTIF_SEED_CLASS_RE.test(token) && !isMotifClusterClass(token)
  ));
  return hit?.toLowerCase() ?? null;
}

/**
 * True when dest already shows Motif identity for the given seeds.
 * Daisy uses flower-SVG proof; Capsule/Sakura/Hermes/Pastel use HTML class
 * presence (not Motif class names that only appear inside look CSS rules).
 */
function destHasMotifIdentityProof(dest: string, seeds: string[]): boolean {
  if (!dest || seeds.length === 0) return seeds.length === 0;
  const visible = seeds.filter(isVisibleMotifInstanceBlock);
  const cssSeeds = seeds.filter(isCssMotifSeedBlock);
  if (visible.length > 0 && !destHasVisibleMotifIdentity(dest, visible)) return false;
  for (const seed of cssSeeds) {
    const proofClass = cssMotifSeedProofClass(seed);
    if (!proofClass) continue;
    if (!destHasMotifHost(dest, proofClass)) return false;
  }
  return true;
}

function pillOblongScore(tag: string): number {
  const widthPx = /width\s*:\s*([\d.]+)px/i.exec(tag)?.[1];
  const heightPx = /height\s*:\s*([\d.]+)px/i.exec(tag)?.[1];
  const w = widthPx ? Number(widthPx) : NaN;
  const h = heightPx ? Number(heightPx) : NaN;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 5;
  if (/border-radius\s*:\s*50%/i.test(tag) || Math.abs(w - h) <= Math.max(4, w * 0.08)) return 8;
  if (w / h >= 1.45 || h / w >= 1.45) return 0;
  return 3;
}

/**
 * Extract up to 2 CSS Motif identity seeds from official example.html.
 * Prefer Sakura petals group, Capsule oblong deco-pill, Hermes scanlines, Pastel xp-blob.
 */
function extractCssMotifSeeds(html: string): string[] {
  const source = String(html ?? '');
  if (!source.trim()) return [];
  const scored: Array<{ score: number; block: string; key: string }> = [];

  const petalsOpenRe =
    /<(div|span)\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpetals\b[^"]*"|'[^']*\bpetals\b[^']*')[^>]*>/gi;
  let petalsMatch: RegExpExecArray | null;
  while ((petalsMatch = petalsOpenRe.exec(source)) !== null) {
    const block = extractBalancedElement(source, petalsMatch.index);
    if (!block || block.length < 24 || block.length > 2_400) continue;
    const marked = markOfficialMotifHtml(block);
    if (!marked) continue;
    scored.push({ score: 0, block: marked, key: 'sakura-petals' });
  }

  const pillOpenRe =
    /<(div|span)\b[^>]*\bclass\s*=\s*(?:"[^"]*\bdeco-pill\b[^"]*"|'[^']*\bdeco-pill\b[^']*')[^>]*>/gi;
  let pillMatch: RegExpExecArray | null;
  while ((pillMatch = pillOpenRe.exec(source)) !== null) {
    const open = pillMatch[0] ?? '';
    if (!/\bstyle\s*=/i.test(open)) continue;
    const block = extractBalancedElement(source, pillMatch.index) ?? open.replace(/>$/, '/>');
    if (!block || block.length > 800) continue;
    const marked = markOfficialMotifHtml(block);
    if (!marked) continue;
    scored.push({
      score: 1 + pillOblongScore(open),
      block: marked,
      key: `capsule-${classAttrValue(open).slice(0, 40)}`,
    });
  }

  const scanOpenRe =
    /<(div|span)\b[^>]*\bclass\s*=\s*(?:"[^"]*\bhc-scanlines\b[^"]*"|'[^']*\bhc-scanlines\b[^']*')[^>]*>/gi;
  let scanMatch: RegExpExecArray | null;
  while ((scanMatch = scanOpenRe.exec(source)) !== null) {
    const block = extractBalancedElement(source, scanMatch.index) ?? scanMatch[0];
    if (!block) continue;
    const marked = markOfficialMotifHtml(block);
    if (!marked) continue;
    scored.push({ score: 0, block: marked, key: 'hermes-scanlines' });
  }

  const blobOpenRe =
    /<(div|span)\b[^>]*\bclass\s*=\s*(?:"[^"]*\bxp-blob\b[^"]*"|'[^']*\bxp-blob\b[^']*')[^>]*>/gi;
  let blobMatch: RegExpExecArray | null;
  while ((blobMatch = blobOpenRe.exec(source)) !== null) {
    const block = extractBalancedElement(source, blobMatch.index) ?? blobMatch[0];
    if (!block || block.length > 600) continue;
    const marked = markOfficialMotifHtml(block);
    if (!marked) continue;
    scored.push({ score: 1, block: marked, key: `pastel-${classAttrValue(block).slice(0, 40)}` });
  }

  // Generic CSS Motif seeds (post-it / pixel / doodle / hc-grid) when family-specific misses.
  const genericOpenRe =
    /<(div|span)\b[^>]*\bclass\s*=\s*(?:"[^"]*"|'[^']*')[^>]*>/gi;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericOpenRe.exec(source)) !== null) {
    const open = genericMatch[0] ?? '';
    const cls = classAttrValue(open);
    if (!CSS_MOTIF_SEED_CLASS_RE.test(cls)) continue;
    if (/\b(?:petals?|deco-pill|hc-scanlines|xp-blob|cover-blob|pixel-glitch|pixel-particles|pixel-corners)\b/i.test(cls)) continue;
    if (MOTIF_CONTENT_CHROME_RE.test(cls)) continue;
    const block = extractBalancedElement(source, genericMatch.index) ?? open;
    if (!block || block.length < 12 || block.length > 800) continue;
    const innerText = block.replace(/<[^>]+>/g, '').trim();
    if (innerText.length > 24) continue;
    const marked = markOfficialMotifHtml(block);
    if (!marked) continue;
    const proof = cssMotifSeedProofClass(marked) ?? cls.slice(0, 32);
    scored.push({ score: 4, block: marked, key: `generic-${proof}` });
    if (scored.length > 48) break;
  }

  scored.sort((a, b) => a.score - b.score || a.block.length - b.block.length);
  const out: string[] = [];
  const seenKeys = new Set<string>();
  const seenFamilies = new Set<string>();
  for (const row of scored) {
    const family = motifSeedFamily(row.block);
    if (seenKeys.has(row.key) || out.includes(row.block)) continue;
    if (seenFamilies.has(family) && out.length >= 1) continue;
    seenKeys.add(row.key);
    seenFamilies.add(family);
    out.push(row.block);
    if (out.length >= 2) break;
  }
  return out;
}

function extractIdentityHostClass(html: string, css: string): string | null {
  const open =
    /<(?:body|html)\b[^>]*\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(html);
  const fromHost = (open?.[1] ?? open?.[2] ?? '')
    .split(/\s+/)
    .map((c) => c.trim())
    .find((c) => /^(?:tpl|theme)-[a-z0-9_-]+$/i.test(c));
  if (fromHost) return fromHost.toLowerCase();

  const counts = new Map<string, number>();
  const re = /\.(tpl-[a-z0-9_-]+|theme-[a-z0-9_-]+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

function ensureIdentityHostClass(dest: string, hostClass: string | null | undefined): string {
  const cls = String(hostClass ?? '').trim();
  if (!dest || !cls) return dest;
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hostHasClass = new RegExp(
    `<(?:body|html)\\b[^>]*\\bclass\\s*=\\s*(?:"[^"]*\\b${escaped}\\b[^"]*"|'[^']*\\b${escaped}\\b[^']*')`,
    'i',
  ).test(dest);
  if (hostHasClass) return dest;

  if (/<body\b/i.test(dest)) {
    return dest.replace(/<body\b([^>]*)>/i, (_m, attrs: string) => {
      if (/\bclass\s*=/i.test(attrs)) {
        return `<body${attrs.replace(
          /\bclass\s*=\s*(["'])([^"']*)\1/i,
          (_cm, q: string, prev: string) => `class=${q}${prev}${prev ? ' ' : ''}${cls}${q}`,
        )}>`;
      }
      return `<body class="${cls}"${attrs}>`;
    });
  }
  if (/<html\b/i.test(dest)) {
    return dest.replace(/<html\b([^>]*)>/i, (_m, attrs: string) => {
      if (/\bclass\s*=/i.test(attrs)) {
        return `<html${attrs.replace(
          /\bclass\s*=\s*(["'])([^"']*)\1/i,
          (_cm, q: string, prev: string) => `class=${q}${prev}${prev ? ' ' : ''}${cls}${q}`,
        )}>`;
      }
      return `<html class="${cls}"${attrs}>`;
    });
  }
  return dest;
}

function ensureSlideMotifRoleClass(dest: string, seeds: string[]): string {
  if (!dest || seeds.length === 0) return dest;
  const slides = listSlideBlocks(dest);
  if (slides.length === 0) return dest;

  let out = dest;
  const needsSakuraCover = seeds.some(
    (seed) => motifSeedFamily(seed) === 'sakura' || /\bpetals?\b/i.test(seed),
  );
  const needsDaisyTitle = seeds.some(
    (seed) => /deco-daisy|#fcdf6c/i.test(seed) || motifSeedFamily(seed) === 'daisy',
  );
  const needsPixelAtmosphere = seeds.some((seed) =>
    /\bpixel-(?:glitch|particles|corners)\b/i.test(seed),
  );

  const addClassToSlide = (slideHtml: string, className: string): string => {
    if (new RegExp(`\\b${className}\\b`, 'i').test(slideHtml)) return slideHtml;
    return slideHtml.replace(
      /^(<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*)(["'])([^"']*)\2/i,
      (_m, prefix: string, q: string, prev: string) =>
        `${prefix}${q}${prev}${prev ? ' ' : ''}${className}${q}`,
    );
  };

  if (needsSakuraCover || needsDaisyTitle) {
    const first = listSlideBlocks(out)[0];
    if (first) {
      let nextFirst = first.html;
      if (needsSakuraCover) nextFirst = addClassToSlide(nextFirst, 's-cover');
      // Official Daisy Motif CSS is scoped under `.slide-title .deco-daisy-*`.
      if (needsDaisyTitle) nextFirst = addClassToSlide(nextFirst, 'slide-title');
      if (nextFirst !== first.html) {
        out = `${out.slice(0, first.start)}${nextFirst}${out.slice(first.end)}`;
      }
    }
  }

  if (needsPixelAtmosphere) {
    const refreshed = listSlideBlocks(out);
    for (let i = refreshed.length - 1; i >= 0; i -= 1) {
      if (i > 1) continue;
      const slide = refreshed[i]!;
      if (/\bscanlines\b/i.test(slide.html) && /\bgrain\b/i.test(slide.html)) continue;
      const nextHtml = slide.html.replace(
        /^(<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*)(["'])([^"']*)\2/i,
        (_m, prefix: string, q: string, prev: string) => {
          const parts = prev.split(/\s+/).filter(Boolean);
          if (!parts.some((c) => /^scanlines$/i.test(c))) parts.push('scanlines');
          if (!parts.some((c) => /^grain$/i.test(c))) parts.push('grain');
          return `${prefix}${q}${parts.join(' ')}${q}`;
        },
      );
      if (nextHtml !== slide.html) {
        out = `${out.slice(0, slide.start)}${nextHtml}${out.slice(slide.end)}`;
      }
    }
  }

  return out;
}

function mergeCssMotifSeeds(dest: string, seeds: string[]): string {
  if (!dest || seeds.length === 0) return dest;
  let out = dest;
  const pack = seeds.slice(0, 2).join('\n');
  const slides = listSlideBlocks(out);
  if (slides.length === 0) {
    if (!destHasMotifIdentityProof(out, seeds)) {
      out = insertAfterOpenBody(out, pack);
    }
    return ensureSlideMotifRoleClass(out, seeds);
  }

  const nextSlides = slides.map((slide) => {
    if (destHasMotifIdentityProof(slide.html, seeds)) return slide.html;
    return insertMotifIntoSlide(slide.html, pack);
  });

  for (let i = slides.length - 1; i >= 0; i -= 1) {
    const slide = slides[i]!;
    out = `${out.slice(0, slide.start)}${nextSlides[i]}${out.slice(slide.end)}`;
  }
  return ensureSlideMotifRoleClass(out, seeds);
}

function markOfficialMotifHtml(markup: string): string {
  const trimmed = markup.trim();
  if (!trimmed) return '';
  if (new RegExp(`\\b${OFFICIAL_DECK_MOTIF_HTML_ATTR}\\b`, 'i').test(trimmed)) return trimmed;
  return trimmed.replace(/^(<(?:svg|div|span)\b)/i, `$1 ${OFFICIAL_DECK_MOTIF_HTML_ATTR}`);
}

function hostClassName(tag: string): string {
  const match = MOTIF_HOST_CLASS_RE.exec(classAttrValue(tag));
  return (match?.[0] ?? '').toLowerCase();
}

function destHasMotifHost(dest: string, className: string): boolean {
  return destHasExactClassToken(dest, className);
}

export function extractOfficialDeckMotifHtml(exampleHtml: string): string[] {
  const html = String(exampleHtml ?? '');
  if (!html.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  SVG_BLOCK_RE.lastIndex = 0;
  let svgMatch: RegExpExecArray | null;
  while ((svgMatch = SVG_BLOCK_RE.exec(html)) !== null) {
    const svg = svgMatch[0] ?? '';
    if (!isReusableSpriteSheet(svg)) continue;
    const marked = markOfficialMotifHtml(svg);
    if (!marked || seen.has(marked)) continue;
    seen.add(marked);
    out.push(marked);
  }

  // Grain / CRT / Hermes scanlines hosts — whole document, cap 2.
  MOTIF_HOST_RE.lastIndex = 0;
  let hostMatch: RegExpExecArray | null;
  let hostCount = 0;
  while ((hostMatch = MOTIF_HOST_RE.exec(html)) !== null) {
    const tag = hostMatch[0] ?? '';
    const className = hostClassName(tag);
    if (!className) continue;
    const marked = markOfficialMotifHtml(tag);
    if (!marked || seen.has(marked)) continue;
    seen.add(marked);
    out.push(marked);
    hostCount += 1;
    if (hostCount >= 2) break;
  }

  // Daisy / svg-sprite kits: visible Motif wrappers+SVG (not symbol sheets).
  for (const instance of extractVisibleMotifInstances(html)) {
    if (seen.has(instance)) continue;
    seen.add(instance);
    out.push(instance);
  }

  // Capsule / Sakura / Hermes / Pastel CSS Motif identity seeds.
  for (const seed of extractCssMotifSeeds(html)) {
    if (seen.has(seed)) continue;
    seen.add(seed);
    out.push(seed);
  }

  return out;
}

export function listOfficialLookProofClasses(css: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(CLASS_SELECTOR_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    if (!name || GENERIC_LOOK_PROOF_CLASS_RE.test(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= 16) break;
  }
  return out;
}

/** @deprecated Use listOfficialLookProofClasses — kept for existing call sites. */
export function listDistinctiveOfficialLookClasses(css: string): string[] {
  return listOfficialLookProofClasses(css);
}

export function extractOfficialDeckLookAssets(
  exampleHtml: string,
  options?: { supplementalCss?: string },
): OfficialDeckLookAssets | null {
  const html = String(exampleHtml ?? '');
  if (!html.trim()) return null;

  const fontLinks: string[] = [];
  const seenHref = new Set<string>();
  FONT_LINK_RE.lastIndex = 0;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = FONT_LINK_RE.exec(html)) !== null) {
    const tag = linkMatch[0] ?? '';
    if (!isFontStylesheetLink(tag)) continue;
    pushUniqueFontLink(fontLinks, seenHref, hrefFromLinkTag(tag), tag);
  }

  const cssParts: string[] = [];
  STYLE_BODY_RE.lastIndex = 0;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = STYLE_BODY_RE.exec(html)) !== null) {
    if (isStyleTagInsideSvg(html, styleMatch.index)) continue;
    const body = (styleMatch[1] ?? '').trim();
    if (body.length >= 40) cssParts.push(body);
  }
  const supplemental = String(options?.supplementalCss ?? '').trim();
  if (supplemental.length >= 40) cssParts.push(supplemental);

  const css = cssParts.join('\n\n').trim();
  FONT_IMPORT_URL_RE.lastIndex = 0;
  let importMatch: RegExpExecArray | null;
  while ((importMatch = FONT_IMPORT_URL_RE.exec(css)) !== null) {
    pushUniqueFontLink(fontLinks, seenHref, importMatch[1] ?? '');
  }

  const motifHtml = extractOfficialDeckMotifHtml(html);
  const identityHostClass = extractIdentityHostClass(html, css);
  if (!css && fontLinks.length === 0 && motifHtml.length === 0) return null;
  return { css, fontLinks, motifHtml, identityHostClass };
}

function compactOfficialCss(css: string): string {
  return String(css ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sample mid-sheet windows so kit decoration snippets (usually the first
 * Motif rule) cannot count as "the official stylesheet is already here".
 */
export function officialLookCssWindows(css: string): string[] {
  const compact = compactOfficialCss(css);
  if (compact.length < 80) return compact.length >= 40 ? [compact.slice(0, 48)] : [];
  if (compact.length < 400) return [compact.slice(0, 48), compact.slice(-48)];
  return [0.24, 0.48, 0.68, 0.86]
    .map((ratio) => {
      const start = Math.min(
        Math.max(0, Math.floor(compact.length * ratio) - 24),
        Math.max(0, compact.length - 48),
      );
      return compact.slice(start, start + 48);
    })
    .filter((window, index, all) => window.length >= 40 && all.indexOf(window) === index);
}

function countOfficialLookWindows(dest: string, assets: OfficialDeckLookAssets): number {
  return officialLookCssWindows(assets.css).filter((window) => dest.includes(window)).length;
}

function countOfficialLookProofRules(dest: string, assets: OfficialDeckLookAssets): number {
  let hits = 0;
  for (const name of listOfficialLookProofClasses(assets.css)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\.${escaped}\\b[^{]*\\{`, 'i').test(dest)) hits += 1;
  }
  return hits;
}

/**
 * True when the artifact already contains the official Motif/look *stylesheet*
 * (not class names, `:root` tokens, generic `.slide-N` chrome, or a kit
 * decoration snippet of two Motif rules).
 */
export function deckHtmlHasOfficialLookCss(
  html: string,
  assets: OfficialDeckLookAssets,
): boolean {
  const dest = String(html ?? '');
  // Require a real <style data-od-official-look-css> — comments / text mentioning
  // the attr must not skip the official sheet (poisoned "already merged").
  if (new RegExp(`<style\\b[^>]*\\b${OFFICIAL_DECK_LOOK_STYLE_ATTR}\\b`, 'i').test(dest)) {
    return true;
  }

  const windows = officialLookCssWindows(assets.css);
  const windowHits = countOfficialLookWindows(dest, assets);

  if (windows.length >= 3) {
    return windowHits >= 3;
  }
  if (windows.length > 0) {
    return windowHits >= windows.length;
  }

  const classes = listOfficialLookProofClasses(assets.css);
  const ruleHits = countOfficialLookProofRules(dest, assets);
  if (classes.length === 0) return false;
  return ruleHits >= Math.min(4, classes.length);
}

function insertBeforeCloseHeadOrOpenBody(dest: string, snippet: string): string {
  if (!snippet.trim()) return dest;
  if (/<\/head\s*>/i.test(dest)) {
    return dest.replace(/<\/head\s*>/i, `${snippet}\n</head>`);
  }
  if (/<head\b/i.test(dest)) {
    return dest.replace(/<head\b[^>]*>/i, (open) => `${open}\n${snippet}`);
  }
  if (/<body\b/i.test(dest)) {
    return dest.replace(/<body\b[^>]*>/i, (open) => `${open}\n${snippet}`);
  }
  return `${snippet}\n${dest}`;
}

function insertBeforeCloseBody(dest: string, snippet: string): string {
  if (!snippet.trim()) return dest;
  if (/<\/body\s*>/i.test(dest)) {
    return dest.replace(/<\/body\s*>/i, `${snippet}\n</body>`);
  }
  return insertBeforeCloseHeadOrOpenBody(dest, snippet);
}

/**
 * Compact fills are body-first `.slide` nodes — official catalog CSS often
 * paints the canvas only on `deck-stage > section.slide`. Rewrite the host
 * so persist/preview match the template thumbnail.
 */
export function rewriteOfficialLookHostSlideSelectors(css: string): string {
  return String(css ?? '').replace(
    /(^|[,}\s])(?:deck-stage|#deck-stage|\.deck-stage|\.deck-shell|\.presentation|\.slides-container|\.deck)\s*>\s*(section\.slide|\.slide)\b/gi,
    '$1$2',
  );
}

const COMPACT_TYPE_LOCK_MARK = 'od-compact-type-lock';

/** Strip CSS block comments so naive rule selectors match :root / .display. */
function stripCssComments(text: string): string {
  return String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function splitLookSelectors(text: string): string[] {
  return stripCssComments(text)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function officialSlideRuleHasFontFamily(css: string): boolean {
  const rules = [...String(css ?? '').matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)];
  for (const rule of rules) {
    const slideSel = splitLookSelectors(rule[1] ?? '').some((part) =>
      /^(?:(?:[a-z][a-z0-9]*)?\.slide|section\.slide)$/i.test(part),
    );
    if (!slideSel) continue;
    if (/(?:^|;)\s*font-family\s*:/i.test(rule[2] ?? '')) return true;
  }
  return false;
}

/** Collect Studio-family font custom properties (--f-* / --font-*) from look CSS. */
function extractOfficialFontCustomProperties(css: string): Map<string, string> {
  const out = new Map<string, string>();
  const rules = [...String(css ?? '').matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)];
  for (const rule of rules) {
    const selParts = splitLookSelectors(rule[1] ?? '');
    // :root / html / body — Studio ZONE box comments prefix `:root` in the
    // naive selector capture, so comment-strip before matching (§1.18).
    const isDocTokens = selParts.some(
      (part) => /^(?::root|html|body|html\s+body)$/i.test(part) || /^:root\b/i.test(part),
    );
    if (!isDocTokens) continue;
    const body = String(rule[2] ?? '');
    for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+)/gi)) {
      const name = match[1]?.trim().toLowerCase();
      const value = match[2]?.trim();
      if (!name || !value) continue;
      if (!/^(?:f-|font-)/i.test(name)) continue;
      out.set(name, value.length > 180 ? value.slice(0, 180) : value);
    }
  }
  // Fallback: token scan when :root was missed (nested braces / atypical hosts).
  if (out.size === 0) {
    for (const match of String(css ?? '').matchAll(/--((?:f|font)-[a-z0-9-]+)\s*:\s*([^;]+)/gi)) {
      const name = match[1]?.trim().toLowerCase();
      const value = match[2]?.trim();
      if (!name || !value) continue;
      out.set(name, value.length > 180 ? value.slice(0, 180) : value);
    }
  }
  return out;
}

function resolveOfficialFontFamilyValue(
  raw: string | null | undefined,
  customProps: Map<string, string>,
): string | null {
  const trimmed = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  const varMatch = /^var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^)]+))?\)\s*$/i.exec(trimmed);
  if (!varMatch) return trimmed.length > 180 ? trimmed.slice(0, 180) : trimmed;
  const key = varMatch[1]?.trim().toLowerCase() ?? '';
  const resolved = customProps.get(key)?.trim();
  if (resolved) return resolved.length > 180 ? resolved.slice(0, 180) : resolved;
  const fallback = varMatch[2]?.trim();
  return fallback ? (fallback.length > 180 ? fallback.slice(0, 180) : fallback) : null;
}

/**
 * Official Studio/Broadside/Signal put faces on utility classes (`.display`,
 * `.h1`) + `--f-*` tokens — not bare `html,body` / `h1`. Compact fills emit
 * semantic `<h1>`/`<h2>`, so Pink Script–style type-lock must resolve those
 * utilities/vars onto `.slide` headings (§1.18).
 */
function extractOfficialTypeFaces(css: string): { body: string | null; display: string | null } {
  const source = String(css ?? '');
  const customProps = extractOfficialFontCustomProperties(source);
  const rules = [...source.matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)];
  const read = (test: (part: string) => boolean): string | null => {
    for (const rule of rules) {
      if (!splitLookSelectors(rule[1] ?? '').some(test)) continue;
      const ff = /(?:^|;)\s*font-family\s*:\s*([^;]+)/i.exec(rule[2] ?? '')?.[1]?.trim();
      const resolved = resolveOfficialFontFamilyValue(ff, customProps);
      if (resolved) return resolved;
    }
    return null;
  };
  const body =
    read((part) => /^(?:html|body)$/i.test(part) || /^html\s+body$/i.test(part))
    ?? read((part) => /^\.body$/i.test(part))
    ?? read((part) => /^\.lead$/i.test(part))
    ?? read((part) => /^\.text$/i.test(part))
    ?? resolveOfficialFontFamilyValue(
      customProps.has('f-body')
        ? `var(--f-body)`
        : customProps.has('font-body')
          ? `var(--font-body)`
          : null,
      customProps,
    );
  const display =
    read((part) => /^\.script$/i.test(part))
    ?? read((part) => /^\.display$/i.test(part))
    ?? read((part) => /^\.h1$/i.test(part))
    ?? read((part) => /^\.h2$/i.test(part))
    ?? read((part) => /^h1$/i.test(part))
    ?? read((part) => /^\.title$/i.test(part))
    ?? resolveOfficialFontFamilyValue(
      customProps.has('f-display')
        ? `var(--f-display)`
        : customProps.has('f-heading')
          ? `var(--f-heading)`
          : customProps.has('font-display')
            ? `var(--font-display)`
            : null,
      customProps,
    );
  const norm = (value: string | null) => value?.replace(/\s+/g, ' ').trim() ?? '';
  return {
    body,
    // Prefer an explicit display face even when it matches body (Barlow both) —
    // still emit heading lock so weight/cascade targets stay clear when we
    // later attach size rules. Duplicate family is fine.
    display: display && norm(display) ? display : null,
  };
}

/**
 * Compact fills set `.slide { font-family: Quicksand }` (or similar) which
 * beats official `html,body` fonts. Official display faces stay on `.script`
 * / `.s-cover .title` / Studio `.display`/`.h1`. Copy body + display faces
 * onto compact `.slide` and semantic headings.
 */
export function appendCompactOfficialTypeLock(css: string): string {
  const src = String(css ?? '');
  if (src.includes(COMPACT_TYPE_LOCK_MARK)) return src;
  const faces = extractOfficialTypeFaces(src);
  if (!faces.body && !faces.display) return src;
  const hasSlideFont = officialSlideRuleHasFontFamily(src);
  const rules: string[] = [`/* ${COMPACT_TYPE_LOCK_MARK} */`];
  // A body/slide font already in look CSS must not skip heading lock —
  // MiniMax compact fills use semantic <h1> and inherit Neutral faces.
  if (faces.body && !hasSlideFont) {
    rules.push(`html, body, section.slide, .slide { font-family: ${faces.body}; }`);
  }
  if (faces.display) {
    rules.push(`.slide :is(h1, h2, h3, .title, .display, .h1, .h2) { font-family: ${faces.display}; }`);
  }
  if (rules.length === 1) return src;
  return `${src.trimEnd()}\n${rules.join('\n')}\n`;
}

/** Neutralize negative Motif position declarations inside a CSS rule body. */
function sanitizeMotifOffsetDeclarations(body: string): string {
  return String(body ?? '')
    // Consume full unit so `left:-10vw` becomes `left:0` (not orphan `0vw`).
    .replace(
      /(^|[;\s])(top|left|right|bottom)\s*:\s*-\d+(?:\.\d+)?(?:px|%|em|rem|vw|vh|vmin|vmax)?/gi,
      '$1$2:0',
    )
    // Positive Motif offsets in viewport units → canvas % under letterbox.
    .replace(
      /(^|[;\s])(top|left|right|bottom)\s*:\s*(\d+(?:\.\d+)?)\s*(?:vw|vh|vmin|vmax)\b/gi,
      '$1$2:$3%',
    );
}

/**
 * Motif width/height in vw/vh break aspect under letterbox (Cartesian viewport
 * units). Map to the same numeric % of the 1920×1080 canvas (§0.80/§0.83).
 */
function sanitizeMotifViewportSizeDeclarations(body: string): string {
  return String(body ?? '')
    .replace(
      /(^|[;\s])(width)\s*:\s*(\d+(?:\.\d+)?)\s*(?:vw|vmin|vmax)\b/gi,
      '$1$2:$3%',
    )
    .replace(
      /(^|[;\s])(height)\s*:\s*(\d+(?:\.\d+)?)\s*(?:vh|vmin|vmax)\b/gi,
      '$1$2:$3%',
    )
    .replace(
      /(^|[;\s])(width)\s*:\s*(\d+(?:\.\d+)?)\s*vh\b/gi,
      '$1$2:$3%',
    )
    .replace(
      /(^|[;\s])(height)\s*:\s*(\d+(?:\.\d+)?)\s*vw\b/gi,
      '$1$2:$3%',
    );
}

/**
 * Official Motif example CSS often uses negative top/left so decorations bleed
 * past the slide in the fullscreen presenter. Stacked letterbox clips those
 * hangs. Rewrite Motif position offsets to 0 while keeping width/height.
 * Also rewrite Motif vw/vh sizes to canvas % (§0.80/§0.83 cross-template).
 */
export function sanitizeMotifOutsideCanvasOffsets(css: string): string {
  const source = String(css ?? '');
  if (!source.trim()) return source;
  return source.replace(
    /([^{}]+)\{([^}]*)\}/g,
    (full, sel: string, body: string) => {
      // Motif lexicon OR absolute :before/:after ambient hangs (Mat/Coral/Creative).
      const motifSel = MOTIF_HANG_SANITIZE_SELECTOR_RE.test(sel);
      const ambientPseudo =
        /:{1,2}(?:before|after)\b/i.test(sel)
        && /position\s*:\s*absolute/i.test(body)
        && /(?:top|left|right|bottom)\s*:\s*-\d/i.test(body);
      if (!motifSel && !ambientPseudo) return full;
      const next = sanitizeMotifViewportSizeDeclarations(
        sanitizeMotifOffsetDeclarations(body),
      );
      return `${sel}{${next}}`;
    },
  );
}

/**
 * True when HTML/CSS still carries Motif outside-canvas hangs that sanitize
 * or remmerge must heal. Shared by persist + preview remmerge gates (§0.83).
 */
export function deckHtmlHasMotifOutsideCanvasHang(html: string): boolean {
  const dest = String(html ?? '');
  if (!dest.trim()) return false;
  let sawStyle = false;
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(dest)) !== null) {
    sawStyle = true;
    const css = match[1] ?? '';
    if (sanitizeMotifOutsideCanvasOffsets(css) !== css) return true;
  }
  // Pure CSS string (no HTML).
  if (!sawStyle && /\{[^}]+\}/.test(dest) && !/<\/?[a-z]/i.test(dest)) {
    return sanitizeMotifOutsideCanvasOffsets(dest) !== dest;
  }
  const opens = dest.match(
    /<(?:div|span)[^>]*\bclass\s*=\s*(?:"[^"]+"|'[^']+')[^>]*>/gi,
  ) ?? [];
  for (const open of opens) {
    if (!/(?:top|left|right|bottom)\s*:\s*-\d/i.test(open)) continue;
    const cls = classAttrValue(open);
    if (
      MOTIF_PAINT_CLASS_RE.test(cls)
      || isMotifClusterClass(cls)
      || /\b(?:accent|hero-shot|card-deco|mini-note|marker|photo-frame)\b/i.test(cls)
    ) {
      return true;
    }
  }
  return false;
}

function prepareOfficialLookCss(css: string): string {
  return appendCompactOfficialTypeLock(
    rewriteOfficialLookHostSlideSelectors(
      rewriteOfficialLookViewportLengthsToCanvasPx(
        sanitizeMotifOutsideCanvasOffsets(
          stripOfficialLookSlideHostCanvasClips(
            stripOfficialLookViewportMediaQueries(css),
          ),
        ),
      ),
    ),
  );
}

/**
 * Official Studio/Grove tokens use `12vw` / `5vh` for type+padding. Under the
 * stacked 1920×1080 letterbox those resolve against the iframe viewport and
 * look tiny/huge. Map leftover viewport lengths to design-canvas px (§0.92).
 * Runs after Motif hang sanitize (Motif vw→% already applied).
 */
export function rewriteOfficialLookViewportLengthsToCanvasPx(css: string): string {
  const src = String(css ?? '');
  if (!src.trim()) return src;
  const fmt = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };
  return src
    .replace(/(\d+(?:\.\d+)?)\s*vw\b/gi, (_m, raw: string) => `${fmt(parseFloat(raw) * 19.2)}px`)
    .replace(/(\d+(?:\.\d+)?)\s*vh\b/gi, (_m, raw: string) => `${fmt(parseFloat(raw) * 10.8)}px`)
    .replace(/(\d+(?:\.\d+)?)\s*vmin\b/gi, (_m, raw: string) => `${fmt(parseFloat(raw) * 10.8)}px`)
    .replace(/(\d+(?:\.\d+)?)\s*vmax\b/gi, (_m, raw: string) => `${fmt(parseFloat(raw) * 19.2)}px`);
}

function insertAfterOpenBody(dest: string, snippet: string): string {
  if (!snippet.trim()) return dest;
  if (/<body\b/i.test(dest)) {
    return dest.replace(/<body\b[^>]*>/i, (open) => `${open}\n${snippet}`);
  }
  if (/<\/head\s*>/i.test(dest)) {
    return dest.replace(/<\/head\s*>/i, `</head>\n<body>\n${snippet}\n`);
  }
  return `${snippet}\n${dest}`;
}

export function deckHtmlHasOfficialMotifHtml(
  html: string,
  assets: OfficialDeckLookAssets,
): boolean {
  const dest = String(html ?? '');
  if (!dest || !(assets.motifHtml?.length)) return !(assets.motifHtml?.length);

  const visible = assets.motifHtml.filter(isVisibleMotifInstanceBlock);
  const cssSeeds = assets.motifHtml.filter(isCssMotifSeedBlock);
  const sheetsAndHosts = assets.motifHtml.filter((block) => !isMotifIdentitySeedBlock(block));

  if (visible.length > 0 && !destHasVisibleMotifIdentity(dest, visible)) return false;
  if (cssSeeds.length > 0 && !destHasMotifIdentityProof(dest, cssSeeds)) return false;

  if (sheetsAndHosts.length === 0) return true;

  const symbolIds = listOfficialMotifSymbolIds(sheetsAndHosts.join('\n'));
  const missingSymbols = symbolIds.filter((id) => !destHasSymbolId(dest, id));
  const missingHosts = sheetsAndHosts.filter((block) => {
    if (/^<svg\b/i.test(block)) return false;
    const className = hostClassName(block);
    return Boolean(className) && !destHasMotifHost(dest, className);
  });
  return missingSymbols.length === 0 && missingHosts.length === 0;
}

export function mergeOfficialDeckMotifHtml(
  html: string,
  assets: OfficialDeckLookAssets | null | undefined,
): string {
  const dest = String(html ?? '');
  if (!dest || !(assets?.motifHtml?.length)) return dest;

  const visible = assets.motifHtml.filter(isVisibleMotifInstanceBlock);
  const cssSeeds = assets.motifHtml.filter(isCssMotifSeedBlock);
  const sheetsAndHosts = assets.motifHtml.filter((block) => !isMotifIdentitySeedBlock(block));

  let out = dest;
  if (sheetsAndHosts.length > 0 && !deckHtmlHasOfficialMotifHtml(out, { ...assets, motifHtml: sheetsAndHosts })) {
    const sprites: string[] = [];
    const hosts: string[] = [];
    for (const block of sheetsAndHosts) {
      if (/^<svg\b/i.test(block)) {
        const ids = listOfficialMotifSymbolIds(block);
        if (ids.length > 0 && ids.every((id) => destHasSymbolId(out, id))) continue;
        sprites.push(block);
        continue;
      }
      const className = hostClassName(block);
      if (className && destHasMotifHost(out, className)) continue;
      hosts.push(block);
    }
    // Sprites first so `<use href="#pin">` instances resolve.
    if (sprites.length > 0) out = insertAfterOpenBody(out, sprites.join('\n'));
    if (hosts.length > 0) out = insertAfterOpenBody(out, hosts.join('\n'));
  }

  if (visible.length > 0) {
    out = mergeVisibleMotifInstances(out, visible, assets.css);
  }
  if (cssSeeds.length > 0) {
    out = mergeCssMotifSeeds(out, cssSeeds);
  } else {
    out = ensureSlideMotifRoleClass(out, visible);
  }
  return out;
}

export function mergeOfficialDeckLookCss(
  html: string,
  assets: OfficialDeckLookAssets | null | undefined,
): string {
  const dest = String(html ?? '');
  if (!dest || !assets) return dest;
  if (!assets.css && assets.fontLinks.length === 0 && !(assets.motifHtml?.length)) return dest;

  let out = ensureIdentityHostClass(dest, assets.identityHostClass);
  if (!deckHtmlHasOfficialLookCss(out, assets) && (assets.css || assets.fontLinks.length > 0)) {
    const missingFonts = assets.fontLinks.filter((tag) => {
      const href = hrefFromLinkTag(tag);
      return href ? !out.includes(href) : !out.includes(tag);
    });
    const rewritten = prepareOfficialLookCss(assets.css).trim();
    const style = rewritten
      ? `<style ${OFFICIAL_DECK_LOOK_STYLE_ATTR}>\n${rewritten}\n${LOOK_NEUTRALIZE_CSS}\n</style>`
      : '';
    if (missingFonts.length) {
      out = insertBeforeCloseHeadOrOpenBody(out, missingFonts.join('\n'));
    }
    if (style) {
      out = looksLikeBodyFirstSlideDeck(out)
        ? insertBeforeCloseBody(out, style)
        : insertBeforeCloseHeadOrOpenBody(out, style);
    }
  } else if (hasOfficialLookStyleAttr(out)) {
    // Rewrite official selectors only — never the neutralize tail
    // (`.presentation > .slide` must keep its specificity).
    out = replaceOfficialLookNeutralizeBlock(out);
  }

  return lockDeckDesignViewportMeta(
    ensureOfficialLookStackedCanvasNeutralize(mergeOfficialDeckMotifHtml(out, assets)),
  );
}

function officialLookHasCurrentNeutralize(html: string): boolean {
  const bodies = officialLookCssBodies(html);
  if (bodies.length > 0) return bodies.every((css) => officialLookCssLooksCurrent(css));
  return (
    html.includes(OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER)
    && /flex-direction:\s*column/.test(html)
    && /flex-direction:\s*unset/.test(html)
  );
}

function hasOfficialLookStyleAttr(html: string): boolean {
  return new RegExp(`<style\\b[^>]*\\b${OFFICIAL_DECK_LOOK_STYLE_ATTR}\\b`, 'i').test(html);
}

function hasOfficialPresenterShell(html: string): boolean {
  return (
    /<deck-stage\b/i.test(html)
    || /\bid\s*=\s*["']deck(?:-track)?["']/i.test(html)
    || /\bclass\s*=\s*(["'])[^"'<>]*\bpresentation\b/i.test(html)
    || /\bclass\s*=\s*(["'])[^"'<>]*\b(?:deck|slides-container|stage|slide-deck)\b/i.test(html)
    || (/\bnav-dots\b/i.test(html) && /\bnav-dot\b/i.test(html))
    || /\bclass\s*=\s*(["'])[^"'<>]*\bslide-counter\b/i.test(html)
    || /\bid\s*=\s*["']slide-counter["']/i.test(html)
    || /\bclass\s*=\s*(["'])[^"'<>]*\bslide-number\b/i.test(html)
    // Opacity-stack presenters (one slide visible) even without a named shell.
    || (
      new RegExp(`${DECK_SLIDE_HOST_CSS_CLASS}[^{]*\\{[^}]*opacity\\s*:\\s*0\\b`, 'i').test(html)
      && /\.slide\.(?:active|is-active|current)(?![\w-])[^{]*\{[^}]*opacity\s*:\s*1\b/i.test(html)
    )
  );
}

/** Absolute fullscreen slide fill — % / vw·vh / inset:0 dialects. */
function hasAuthorAbsoluteFullscreenSlide(html: string): boolean {
  const css = String(html ?? '');
  if (!/\.slide\s*\{[^}]*position\s*:\s*(?:absolute|fixed)/i.test(css)) return false;
  if (/\.slide\s*\{[^}]*(?:width|height)\s*:\s*100%/i.test(css)) return true;
  if (/\.slide\s*\{[^}]*(?:width|height)\s*:\s*100(?:vw|vh|dvh|svh|lvh)\b/i.test(css)) return true;
  if (/\.slide\s*\{[^}]*inset\s*:\s*0\b/i.test(css)) return true;
  return false;
}

/**
 * Official catalog `example.html` is a fullscreen presenter filling its
 * iframe. Require a real presenter shell (or opacity-stack chrome) — do NOT
 * treat bare `.slide { position:absolute; width/height:100% }` as catalog.
 * Body-first Motif fills copy that geometry without `data-od-official-look-css`
 * and must stay on the compact 1920×1080 letterbox path; otherwise content
 * lays out at iframe device-width inside a host that assumes 1920 and looks
 * top-left / differently centered per slide.
 */
export function looksLikeOfficialFullscreenPresenterDeck(html: string): boolean {
  const dest = String(html ?? '');
  if (!dest) return false;
  if (hasOfficialLookStyleAttr(dest)) return false;
  if (/\bid\s*=\s*["']od-stacked-deck-stage["']/i.test(dest)) return false;
  // Body-first compact fills are never catalog presenters.
  if (looksLikeBodyFirstSlideDeck(dest)) return false;
  const shell = hasOfficialPresenterShell(dest);
  if (!shell) return false;
  if (hasAuthorAbsoluteFullscreenSlide(dest)) return true;
  // Relative snap / opacity-stack shells with authored multi-slide CSS.
  return looksLikeAuthoredMultiSlideCss(dest);
}

/** Body > .slide markup used by compact API fills (not `.presentation` hosts). */
function looksLikeBodyFirstSlideDeck(html: string): boolean {
  const dest = String(html ?? '');
  if (!dest) return false;
  // Horizontal #deck / slide-deck strips are catalog presenters, never body-first.
  if (
    /<div\b[^>]*\bid\s*=\s*["']deck(?:-track)?["'][^>]*>/i.test(dest)
    || /<(?:div|section)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide-deck\b/i.test(dest)
  ) {
    return false;
  }
  const bodyMatch = /<body\b[^>]*>/i.exec(dest);
  if (!bodyMatch) return false;
  let rest = dest.slice((bodyMatch.index ?? 0) + bodyMatch[0].length);
  // Comment matcher must not span `-->` via backtracking (Studio/Grove).
  rest = rest.replace(
    /^(?:\s|<!--(?:(?!-->)[\s\S])*-->|<(?:header|nav)\b[^>]*>[\s\S]*?<\/(?:header|nav)>|<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>)*/i,
    '',
  );
  const open = /^<(?:section|div|main|article)\b([^>]*)>/i.exec(rest);
  if (!open) return false;
  const classAttr = /\bclass\s*=\s*(['"])([\s\S]*?)\1/i.exec(open[1] ?? '')?.[2] ?? '';
  return classAttrHasDeckSlideToken(classAttr);
}

function looksLikeAuthoredMultiSlideCss(html: string): boolean {
  if (countDeckSlideHostOpens(html) < 2) return false;
  // Require presenter-like rules. A lone `.slide { background… }` from surface
  // bleed / canvas pin must not flip compact `.presentation` fills into the
  // catalog-native path (§0.70).
  const host = DECK_SLIDE_HOST_CSS_CLASS;
  if (
    new RegExp(
      `${host}[^{]*\\{[^}]*(?:opacity\\s*:|scroll-snap-|position\\s*:\\s*(?:absolute|fixed))`,
      'i',
    ).test(html)
  ) {
    return true;
  }
  if (/\.slide\.(?:active|is-active|current)(?![\w-])[^{]*\{/i.test(html)) return true;
  // Horizontal #deck strips (Studio/Vellum) translateX between 100vw slides —
  // often without a `.slide.is-active {…}` rule (§0.92).
  if (
    /\bid\s*=\s*["']deck(?:-track)?["']/i.test(html)
    && /#deck\b[^{]*\{[^}]*display\s*:\s*flex/i.test(html)
    && new RegExp(
      `${host}[^{]*\\{[^}]*(?:flex\\s*:\\s*[^;]*100vw|width\\s*:\\s*100vw|height\\s*:\\s*100vh)`,
      'i',
    ).test(html)
  ) {
    return true;
  }
  return false;
}

/**
 * True when preview/export should pin vw/% math to the 1920 design canvas.
 * Opt-in: look sheets, stacked stage, neutralize proof, or body-first compact
 * fills — never bare catalog presenters.
 */
export function needsStackedDesignViewportLock(html: string): boolean {
  const dest = String(html ?? '');
  if (!dest) return false;
  if (looksLikeOfficialFullscreenPresenterDeck(dest)) return false;
  if (hasOfficialLookStyleAttr(dest)) return true;
  if (/\bid\s*=\s*["']od-stacked-deck-stage["']/i.test(dest)) return true;
  if (hasOfficialLookStackedCanvasNeutralizeProof(dest)) return true;
  if (/data-od-stacked-canvas-neutralize/i.test(dest)) return true;
  // Classic compact fills (body > .slide) even before look CSS is merged.
  if (looksLikeBodyFirstSlideDeck(dest)) return true;
  return false;
}

function stripOfficialPresenterStackedCanvasLock(html: string): string {
  let out = String(html ?? '').replace(
    /<style\b[^>]*\bdata-od-stacked-canvas-neutralize\b[^>]*>[\s\S]*?<\/style>/gi,
    '',
  );
  if (/<meta[^>]+name=["']viewport["'][^>]*width\s*=\s*1920/i.test(out)) {
    out = out.replace(
      /<meta[^>]+name=["']viewport["'][^>]*>/i,
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    );
  }
  return out;
}

function replaceOfficialLookNeutralizeBlock(html: string): string {
  return html.replace(
    /(<style\b[^>]*\bdata-od-official-look-css\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_m, open: string, css: string, close: string) => {
      const prepared = prepareOfficialLookCss(
        String(css).replace(LOOK_NEUTRALIZE_TAIL_RE, ''),
      ).trim();
      return `${open}\n${prepared}\n${LOOK_NEUTRALIZE_CSS}\n${close}`;
    },
  );
}

/**
 * Upgrade legacy opacity-only neutralize (or inject missing stacked-canvas
 * rules) so persisted Capsule look CSS no longer clips Motif at device-width
 * or forces split slides into a column.
 * Early-return only when the fixed 1920×1080 proof is present — a marker
 * comment alone must not skip upgrade (poison/truncated neutralize).
 */
export function ensureOfficialLookStackedCanvasNeutralize(html: string): string {
  const dest = String(html ?? '');
  if (!dest) return dest;
  if (looksLikeOfficialFullscreenPresenterDeck(dest)) {
    return stripOfficialPresenterStackedCanvasLock(dest);
  }
  if (
    officialLookHasCurrentNeutralize(dest)
    && hasOfficialLookStackedCanvasNeutralizeProof(dest)
  ) {
    // Even "current" neutralize sheets may still carry official Motif hangs
    // from pre-§0.72/§0.73 merges — strip look + deco without a full rewrite.
    return sanitizeOfficialMotifDecoStyleBodies(sanitizeOfficialLookStyleBodies(dest));
  }

  if (hasOfficialLookStyleAttr(dest)) {
    return replaceOfficialLookNeutralizeBlock(dest);
  }

  // Persist-stripped compact fills may still host slides in the stacked
  // stage. A poisoned marker without proof also needs the lock. Official
  // catalog presenters are handled above and must not receive a 1920 lock
  // just because they use presentation-absolute 100%.
  const needsStandaloneNeutralize =
    (/\bid\s*=\s*["']od-stacked-deck-stage["']/i.test(dest) && hasAuthorAbsoluteFullscreenSlide(dest))
    || (
      dest.includes(OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER)
      && !hasOfficialLookStackedCanvasNeutralizeProof(dest)
    );
  if (needsStandaloneNeutralize) {
    const tag = `<style data-od-stacked-canvas-neutralize>\n${LOOK_NEUTRALIZE_CSS}\n</style>`;
    if (/<\/head\s*>/i.test(dest)) return dest.replace(/<\/head\s*>/i, `${tag}</head>`);
    if (/<body\b/i.test(dest)) return dest.replace(/<body\b[^>]*>/i, (open) => `${open}\n${tag}`);
    return `${tag}\n${dest}`;
  }
  return dest;
}

/** Lock deck vw/% math to the 1920 design canvas (not browser device-width). */
export function lockDeckDesignViewportMeta(html: string): string {
  const dest = String(html ?? '');
  if (!dest) return dest;
  const tag = '<meta name="viewport" content="width=1920, initial-scale=1, maximum-scale=1" />';
  if (/<meta[^>]+name=["']viewport["']/i.test(dest)) {
    return dest.replace(/<meta[^>]+name=["']viewport["'][^>]*>/i, tag);
  }
  if (/<head\b/i.test(dest)) {
    return dest.replace(/<head\b[^>]*>/i, (open) => `${open}\n  ${tag}`);
  }
  // Compact fills often omit `<head>`; still pin 1920 so vw/% Motif math matches.
  if (/<html\b[^>]*>/i.test(dest)) {
    return dest.replace(/<html\b[^>]*>/i, (open) => `${open}\n<head>\n  ${tag}\n</head>`);
  }
  return dest;
}

/**
 * Inject LOOK_NEUTRALIZE for compact letterbox of dual-classified catalogs
 * (Studio/Grove `#deck` strips that are still official presenters).
 * `ensureOfficialLookStackedCanvasNeutralize` strips neutralize on presenters;
 * the web compact path calls this *after* that helper so letterbox heals.
 */
export function injectStackedCanvasNeutralizeForLetterbox(html: string): string {
  const dest = String(html ?? '');
  if (!dest.trim()) return dest;
  if (
    /data-od-stacked-canvas-neutralize/i.test(dest)
    && hasOfficialLookStackedCanvasNeutralizeProof(dest)
  ) {
    return dest;
  }
  if (
    hasOfficialLookStyleAttr(dest)
    && officialLookHasCurrentNeutralize(dest)
    && hasOfficialLookStackedCanvasNeutralizeProof(dest)
  ) {
    return dest;
  }
  // Drop a stale/poisoned standalone sheet before re-injecting current rules.
  let out = dest.replace(
    /<style\b[^>]*\bdata-od-stacked-canvas-neutralize\b[^>]*>[\s\S]*?<\/style>/gi,
    '',
  );
  const tag = `<style data-od-stacked-canvas-neutralize>\n${LOOK_NEUTRALIZE_CSS}\n</style>`;
  if (/<\/head\s*>/i.test(out)) return out.replace(/<\/head\s*>/i, `${tag}</head>`);
  if (/<body\b/i.test(out)) return out.replace(/<body\b[^>]*>/i, (open) => `${open}\n${tag}`);
  return `${tag}\n${out}`;
}

/**
 * Compact-fill preview/export lock. Official catalog presenters keep
 * device-width + iframe-relative 100% fill.
 */
/**
 * Preview/export helper: upgrade stacked neutralize when needed, but only
 * pin viewport to 1920 for compact fills / look sheets / stacked hosts.
 * Catalog presenters keep device-width iframe fill.
 */
export function lockStackedDeckCanvasForPreview(html: string): string {
  const neutralized = ensureOfficialLookStackedCanvasNeutralize(String(html ?? ''));
  if (!needsStackedDesignViewportLock(neutralized)) return neutralized;
  return lockDeckDesignViewportMeta(neutralized);
}
