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
  /\b(?:deco-pill|pill-(?:coral|lime|lavender|sky|violet|yellow|peach|mint|white)|petals?|cover-blob|blob|xp-blob|hc-scanlines|hc-grid|post-it|pixel-(?:glitch|particles|corners|stack)|doodle|scribble|win-titlebar|cover-decoration|geo-decoration|zigzag-deco|sunglow|ts-stripe(?:-b)?|corner-bracket|deco-green-circle)\b/i;
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
 * pills and title blocks clip to the browser viewport. `flex-direction`
 * is unset (not `!important`) so inline column slides keep their axis and
 * split slides that only set `display:flex` stay `row`.
 */
export const LOOK_NEUTRALIZE_CSS = `
/* ${OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER}×1080 canvas (not presentation absolute 100%) */
html, body {
  overflow: visible !important;
  height: auto !important;
  min-height: 0 !important;
}
.presentation, .deck, .deck-shell, .deck-stage, #deck-stage, .stage, .slides-container {
  position: static !important;
  inset: auto !important;
  width: auto !important;
  height: auto !important;
  min-height: 0 !important;
  transform: none !important;
  overflow: visible !important;
}
/* Include .presentation > .slide so we beat catalog presentation specificity. */
.presentation > .slide, .presentation .slide,
.slide, .slide.active, .slide.is-active, .slide.current,
[data-slide], [data-screen-label], section.slide, .deck-slide, .ppt-slide {
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
  flex-direction: unset;
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
    && /flex-direction:\s*unset/.test(css)
    && /position\s*:\s*relative\s*!important/i.test(css)
    && /width\s*:\s*1920px\s*!important/i.test(css)
    && /height\s*:\s*1080px\s*!important/i.test(css)
    && !OFFICIAL_LOOK_MAX_VIEWPORT_MEDIA_RE.test(css)
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
    && /flex-direction:\s*unset/.test(dest)
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
 */
const MOTIF_PAINT_CLASS_RE =
  /\b(?:deco-[a-z0-9_-]+|deco-pill|[cf]-pill|petals?|(?:cover-)?blob(?:-[a-z0-9_-]+)?|stamp|tape|pin(?:-[a-z0-9_-]+)?|doodle(?:-[a-z0-9_-]+)?|scribble(?:-[a-z0-9_-]+)?|post-it(?:-[a-z0-9_-]+)?|xp-blob|gd-(?:orb|ambient)(?:-[a-z0-9_-]+)?|pixel-[a-z0-9_-]+|hc-scanlines?|win-(?:titlebar|window|btn)|corner-bracket|cover-decoration|geo-decoration|zigzag-deco|sunglow|ts-stripe(?:-b)?)\b/i;

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
    /^(?:deco-dots|deco-green-circle)$/i.test(className)
    || /deco-pill|petal|blob|pin-|doodle|post-it|gd-orb|xp-blob|corner-bracket|pixel-|win-titlebar|cover-blob|cover-decoration|geo-decoration|zigzag-deco|sunglow|ts-stripe/i.test(className)
  ) {
    return 1;
  }
  if (/deco-star|deco-rainbow|stamp|tape/i.test(className)) return 2;
  return 3;
}

function placementStyleForMotifClass(classAttr: string): string {
  if (/deco-daisy-tl/i.test(classAttr)) {
    return 'position:absolute;top:-20px;left:-20px;width:200px;height:200px;pointer-events:none;z-index:1';
  }
  if (/deco-daisy-tr/i.test(classAttr)) {
    return 'position:absolute;top:16px;right:-16px;width:170px;height:170px;pointer-events:none;z-index:1';
  }
  if (/deco-daisy-bl/i.test(classAttr)) {
    return 'position:absolute;bottom:-24px;left:16px;width:180px;height:180px;pointer-events:none;z-index:1';
  }
  if (/deco-daisy-br/i.test(classAttr) || /deco-daisy\b/i.test(classAttr)) {
    return 'position:absolute;bottom:-10px;right:-20px;width:180px;height:180px;pointer-events:none;z-index:1';
  }
  if (/deco-star/i.test(classAttr)) {
    return 'position:absolute;top:12%;right:7%;width:72px;height:72px;pointer-events:none;z-index:1';
  }
  if (isMotifClusterClass(classAttr)) {
    return 'position:absolute;inset:0;pointer-events:none;z-index:1';
  }
  if (/\bpetals?\b|\bblob\b|\bgd-orb|\bxp-blob/i.test(classAttr)) {
    return 'position:absolute;top:8%;left:6%;width:28%;height:28%;pointer-events:none;z-index:1';
  }
  if (/\bpin-/i.test(classAttr)) {
    return 'position:absolute;top:8%;right:8%;width:180px;height:56px;pointer-events:none;z-index:2;color:#1E1E1E';
  }
  if (/pixel-glitch/i.test(classAttr)) {
    return 'position:absolute;top:0;right:0;width:28%;height:100%;pointer-events:none;z-index:1';
  }
  if (/win-titlebar/i.test(classAttr)) {
    return 'position:absolute;top:8%;left:10%;width:72%;height:36px;pointer-events:none;z-index:2';
  }
  if (/ts-stripe/i.test(classAttr)) {
    return 'position:absolute;top:0;left:0;width:100%;height:12px;pointer-events:none;z-index:1';
  }
  if (/sunglow|cover-blob|cover-decoration|geo-decoration/i.test(classAttr)) {
    return 'position:absolute;top:-8%;right:-6%;width:42%;height:42%;pointer-events:none;z-index:0';
  }
  return 'position:absolute;top:10%;right:8%;width:140px;height:140px;pointer-events:none;z-index:1';
}

function ensureInlineStyle(attrs: string, style: string): string {
  if (/\bstyle\s*=/i.test(attrs)) {
    return attrs.replace(
      /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i,
      (_m, q: string, prev: string) => `style=${q}${prev}${/;?\s*$/.test(prev) ? '' : ';'}${style}${q}`,
    );
  }
  return `${attrs} style="${style}"`;
}

/** Compact fill often pastes real Daisy flowers at ~24–32px — too small to read as Motif. */
export const DAISY_MOTIF_MIN_PAINT_PX = 120;

/** Largest explicit width/height px from style attrs or SVG width/height attributes. */
export function motifDeclaredSizePx(markup: string): number {
  const text = String(markup ?? '');
  let max = 0;
  for (const match of text.matchAll(/(?:^|[;\s"'])(?:width|height)\s*:\s*([0-9]+(?:\.[0-9]+)?)px/gi)) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  for (const match of text.matchAll(/\b(?:width|height)\s*=\s*["']([0-9]+(?:\.[0-9]+)?)(?:px)?["']/gi)) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

function daisyHostHasAdequatePaint(dest: string): boolean {
  if (!svgBlocksContainDaisyIdentity(dest)) return false;
  const openRe =
    /<(div|span)\b([^>]*\bclass\s*=\s*(?:"[^"]*\bdeco-daisy[^"]*"|'[^']*\bdeco-daisy[^']*')[^>]*)>/gi;
  let match: RegExpExecArray | null;
  let found = false;
  while ((match = openRe.exec(dest)) !== null) {
    found = true;
    const block = extractBalancedElement(dest, match.index) ?? match[0];
    if (motifDeclaredSizePx(block) >= DAISY_MOTIF_MIN_PAINT_PX) return true;
  }
  // Flower SVG without deco-daisy wrapper — still require a readable size.
  if (!found) {
    SVG_BLOCK_RE.lastIndex = 0;
    let svgMatch: RegExpExecArray | null;
    while ((svgMatch = SVG_BLOCK_RE.exec(dest)) !== null) {
      const svg = svgMatch[0] ?? '';
      if (!/#fcdf6c/i.test(svg) || !/<path\b/i.test(svg)) continue;
      if (motifDeclaredSizePx(svg) >= DAISY_MOTIF_MIN_PAINT_PX) return true;
    }
  }
  return false;
}

/**
 * Upsize undersized Daisy Motif hosts so cream covers with tiny kit flowers
 * get official corner placement instead of skipping inject (§0.55).
 */
export function upsizeUndersizedDaisyMotifs(dest: string): string {
  if (!dest || !/deco-daisy/i.test(dest)) return dest;
  return dest.replace(
    /<(div|span)\b([^>]*\bclass\s*=\s*(?:"[^"]*\bdeco-daisy[^"]*"|'[^']*\bdeco-daisy[^']*')[^>]*)>/gi,
    (open, _tag: string, attrs: string) => {
      const size = motifDeclaredSizePx(open);
      if (size >= DAISY_MOTIF_MIN_PAINT_PX) return open;
      const cls = classAttrValue(attrs);
      const placement = placementStyleForMotifClass(cls);
      // Replace tiny width/height so placement wins; keep other style bits.
      let nextAttrs = attrs;
      if (/\bstyle\s*=/i.test(nextAttrs)) {
        nextAttrs = nextAttrs.replace(
          /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i,
          (_m, q: string, prev: string) => {
            const cleaned = String(prev)
              .replace(/(?:^|;)\s*(?:width|height|top|left|right|bottom|position|z-index|pointer-events)\s*:[^;]*/gi, '')
              .replace(/^;+|;+$/g, '')
              .trim();
            const merged = cleaned ? `${cleaned};${placement}` : placement;
            return `style=${q}${merged}${q}`;
          },
        );
      } else {
        nextAttrs = ensureInlineStyle(nextAttrs, placement);
      }
      return markOfficialMotifHtml(`<${_tag}${nextAttrs}>`);
    },
  );
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
    const style = placementStyleForMotifClass(className);
    const markedOpen = markOfficialMotifHtml(`<${openMatch[1]}${ensureInlineStyle(openMatch[2] ?? '', style)}>`);
    const block = `${markedOpen}${cleaned.slice(openMatch[0].length)}`;
    scored.push({
      score: motifInstanceScore(block, primary),
      block,
      key: primary,
    });
    if (scored.length >= 80) break;
  }
  scored.sort((a, b) => a.score - b.score || a.block.length - b.block.length);
  const preferredCluster = preferredMotifClusterKey(scored.map((row) => row.key));
  const out: string[] = [];
  const seenKeys = new Set<string>();
  let daisyCount = 0;
  let starCount = 0;
  let svgCount = 0;
  let cssCount = 0;
  for (const row of scored) {
    if (preferredCluster && isMotifClusterClass(row.key) && row.key !== preferredCluster) continue;
    if (seenKeys.has(row.key) || out.includes(row.block)) continue;
    const hasSvg = /<svg\b/i.test(row.block);
    const isDaisy = /deco-daisy/i.test(row.key);
    const isStar = /deco-star/i.test(row.key);
    if (isDaisy && daisyCount >= 2) continue;
    if (isStar && starCount >= 2) continue;
    if (hasSvg && !isDaisy && !isStar && svgCount >= 3) continue;
    if (!hasSvg && cssCount >= 3) continue;
    seenKeys.add(row.key);
    out.push(row.block);
    if (isDaisy) daisyCount += 1;
    if (isStar) starCount += 1;
    if (hasSvg) svgCount += 1;
    else cssCount += 1;
    if (out.length >= 6) break;
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
    /^(?:gd-orb|xp-blob|cover-blob|sunglow|ts-stripe|pixel-particles|pixel-corners|hc-scanlines|win-titlebar|zigzag-deco|corner-bracket|deco-green-circle|cover-decoration|geo-decoration|deco-dots|post-it|doodle)/i.test(
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

function destHasInstancePaint(dest: string, block: string): boolean {
  const primary = motifPrimaryClass(classAttrValue(/^<[^>]+>/.exec(block)?.[0] ?? block));
  if (!primary) return false;
  if (primary.includes('daisy')) {
    return (
      /deco-daisy[\s\S]{0,240}<svg\b/i.test(dest)
      && daisyHostHasAdequatePaint(dest)
    );
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

function slideHasOfficialMotifPaint(slideHtml: string, instances: string[]): boolean {
  return destHasVisibleMotifIdentity(slideHtml, instances);
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
      const placement = placementStyleForMotifClass(cls);
      const withPlacement = ensureInlineStyle(attrs, placement);
      const marked = markOfficialMotifHtml(`<${tag}${withPlacement}>`);
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
  const re =
    /<(section|div|main|article)\b[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*')[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const markup = extractBalancedElement(html, match.index);
    if (!markup) continue;
    blocks.push({
      start: match.index,
      end: match.index + markup.length,
      html: markup,
    });
    if (blocks.length >= 12) break;
  }
  return blocks;
}

function motifPackForSlide(instances: string[], index: number): string {
  const clusters = instances.filter((block) => isMotifClusterClass(classAttrValue(block)));
  if (clusters.length > 0) {
    const preferred = preferredMotifClusterKey(clusters.map((block) => classAttrValue(block)));
    const cover = preferred
      ? clusters.find((block) => hasExactClassToken(classAttrValue(block), preferred))
      : undefined;
    return cover ?? clusters[index % clusters.length] ?? clusters[0]!;
  }
  const daisies = instances.filter((block) => /deco-daisy/i.test(block));
  const stars = instances.filter((block) => /deco-star/i.test(block));
  if (daisies.length > 0 && stars.length > 0) {
    return `${daisies[index % daisies.length]}\n${stars[index % stars.length]}`;
  }
  const dots = instances.filter((block) => hasExactClassToken(classAttrValue(block), 'deco-dots'));
  const circles = instances.filter((block) => /deco-(?:green-)?circle/i.test(classAttrValue(block)));
  if (dots.length > 0 && circles.length > 0) {
    return `${dots[0]}\n${circles[0]}`;
  }
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
      const body = (match[2] ?? '').trim();
      if (!trailing || !body) continue;
      const rule = `.slide ${trailing}{${body}}`;
      if (!rules.includes(rule)) rules.push(rule);
      kept += 1;
    }
    if (rules.length >= 32) break;
  }
  return rules.join('\n');
}

function mergeMotifFallbackCss(dest: string, officialCss: string, instances: string[]): string {
  if (!dest || dest.includes(OFFICIAL_DECK_MOTIF_DECO_CSS_ATTR)) return dest;
  const css = motifFallbackCss(officialCss, instances);
  if (!css.trim()) return dest;
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
  // Tiny kit flowers still count as identity without a size floor — upsize first
  // so slideHasOfficialMotifPaint can accept them, else inject large Motifs (§0.55).
  out = upsizeUndersizedDaisyMotifs(out);

  const slides = listSlideBlocks(out);
  if (slides.length === 0) {
    if (destHasVisibleMotifIdentity(out, instances)) return out;
    return insertAfterOpenBody(out, motifPackForSlide(instances, 0));
  }

  const nextSlides = slides.map((slide, index) => {
    if (slideHasOfficialMotifPaint(slide.html, instances)) return slide.html;
    return insertMotifIntoSlide(slide.html, motifPackForSlide(instances, index));
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
  const needsPixelAtmosphere = seeds.some((seed) =>
    /\bpixel-(?:glitch|particles|corners)\b/i.test(seed),
  );

  if (needsSakuraCover) {
    const first = listSlideBlocks(out)[0];
    if (first && !/\bs-cover\b/i.test(first.html)) {
      const nextFirst = first.html.replace(
        /^(<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*)(["'])([^"']*)\2/i,
        (_m, prefix: string, q: string, prev: string) =>
          `${prefix}${q}${prev}${prev ? ' ' : ''}s-cover${q}`,
      );
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
  if (destHasMotifIdentityProof(out, seeds)) {
    return ensureSlideMotifRoleClass(out, seeds);
  }

  const pack = seeds.slice(0, 2).join('\n');
  const slides = listSlideBlocks(out);
  if (slides.length === 0) {
    out = insertAfterOpenBody(out, pack);
    return ensureSlideMotifRoleClass(out, seeds);
  }

  const nextSlides = slides.map((slide, index) => {
    if (index > 1) return slide.html;
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
    const style = assets.css
      ? `<style ${OFFICIAL_DECK_LOOK_STYLE_ATTR}>\n${stripOfficialLookViewportMediaQueries(assets.css)}\n${LOOK_NEUTRALIZE_CSS}\n</style>`
      : '';
    const snippet = `${missingFonts.join('\n')}${missingFonts.length && style ? '\n' : ''}${style}`;
    out = insertBeforeCloseHeadOrOpenBody(out, snippet);
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
    && /flex-direction:\s*unset/.test(html)
  );
}

function hasOfficialLookStyleAttr(html: string): boolean {
  return new RegExp(`<style\\b[^>]*\\b${OFFICIAL_DECK_LOOK_STYLE_ATTR}\\b`, 'i').test(html);
}

function hasOfficialPresenterShell(html: string): boolean {
  return (
    /\bclass\s*=\s*(["'])[^"'<>]*\bpresentation\b/i.test(html)
    || /\bclass\s*=\s*(["'])[^"'<>]*\b(?:deck|slides-container|stage)\b/i.test(html)
    || (/\bnav-dots\b/i.test(html) && /\bnav-dot\b/i.test(html))
    || /\bclass\s*=\s*(["'])[^"'<>]*\bslide-counter\b/i.test(html)
    || /\bclass\s*=\s*(["'])[^"'<>]*\bslide-number\b/i.test(html)
    // Opacity-stack presenters (one slide visible) even without a named shell.
    || (
      /\.slide\b[^{]*\{[^}]*opacity\s*:\s*0\b/i.test(html)
      && /\.slide\.(?:active|is-active|current)\b[^{]*\{[^}]*opacity\s*:\s*1\b/i.test(html)
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
  return /<body\b[^>]*>(?:\s|<!--[\s\S]*?-->|<(?:header|nav)\b[^>]*>[\s\S]*?<\/(?:header|nav)>|<style\b[^>]*>[\s\S]*?<\/style>|<script\b[^>]*>[\s\S]*?<\/script>)*<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b/i.test(
    html,
  );
}

function looksLikeAuthoredMultiSlideCss(html: string): boolean {
  const slideOpens = html.match(
    /<(?:section|div|main|article)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide\b/gi,
  );
  if (!slideOpens || slideOpens.length < 2) return false;
  return /\.slide\b[^{]*\{/i.test(html);
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
      const prepared = stripOfficialLookViewportMediaQueries(
        String(css).replace(LOOK_NEUTRALIZE_TAIL_RE, ''),
      ).trimEnd();
      return `${open}${prepared}\n${LOOK_NEUTRALIZE_CSS}\n${close}`;
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
    return dest;
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
  // Body-first compact fills omit <head> — still pin 1920 so vw typography
  // matches the letterbox canvas (§0.55).
  if (/<body\b/i.test(dest)) {
    return dest.replace(/<body\b/i, `<head>\n  ${tag}\n</head>\n<body`);
  }
  return `<head>\n  ${tag}\n</head>\n${dest}`;
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
