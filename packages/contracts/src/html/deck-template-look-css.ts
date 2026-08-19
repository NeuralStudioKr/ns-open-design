/**
 * Compact BYOK fill is forbidden from dumping the official example.html
 * stylesheet (token budget / Motif-SVG hang). Standalone HTML/PDF then
 * ship cream typography without that template's Motif/Layout CSS — users
 * read that as "template CSS not applied".
 *
 * Merge the official look CSS (tokens + Motif/Layout rules + font links)
 * and reusable Motif HTML (hidden SVG symbol sheets, grain/crt hosts,
 * and visible svg-sprite Motif instances like Daisy flower wrappers)
 * into the artifact when those pieces are missing. Page look CSS must
 * not ingest `<style>` blocks nested inside Motif SVGs — those leak
 * `#FCDF6C` into the stylesheet and make generic circle SVGs look like
 * Daisy paint already landed. Presentation chrome
 * (`.slide { opacity:0; position:absolute; width/height:100% }`) is
 * neutralized on compact fills so stacked preview/export keeps a fixed
 * 1920×1080 canvas. Official catalog presenters keep iframe-relative 100% fill.
 *
 * Catalog-wide: proof that look CSS is already present must be unique
 * Motif/Layout class *rules*, not generic `.slide-1` / `.slide-title`
 * chrome that compact fill often copies from the kit. Motif HTML is a
 * separate proof — CSS already merged must not skip `#pin` symbols.
 */

export const OFFICIAL_DECK_LOOK_STYLE_ATTR = 'data-od-official-look-css';
export const OFFICIAL_DECK_MOTIF_HTML_ATTR = 'data-od-official-motif-html';

/** Marker comment inside official look CSS — heal upgrades older weak neutralize. */
export const OFFICIAL_LOOK_STACKED_NEUTRALIZE_MARKER =
  'stacked preview/export: Motif paint + fixed 1920';

export type OfficialDeckLookAssets = {
  css: string;
  fontLinks: string[];
  motifHtml: string[];
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
const MOTIF_HOST_CLASS_RE = /\b(?:grain-overlay|crt-overlay)\b/i;

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

function firstSlideMarkupIndex(html: string): number {
  const re = /<(?:div|section)\b[^>]*>/gi;
  let next: RegExpExecArray | null;
  while ((next = re.exec(html)) !== null) {
    if (/(?:^|\s)slide(?:-\d+)?(?:\s|$)/i.test(classAttrValue(next[0] ?? ''))) {
      return next.index;
    }
  }
  return html.length;
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

/** Daisy-style Motif wrappers that need a child `<svg>` to paint (CSS sizes `.deco svg`). */
const VISIBLE_MOTIF_WRAPPER_RE =
  /<(div|span)\b([^>]*\bclass\s*=\s*(?:"[^"]*\bdeco-(?:daisy|star|rainbow|sun|cloud|flower)[^"]*"|'[^']*\bdeco-(?:daisy|star|rainbow|sun|cloud|flower)[^']*')[^>]*)>([\s\S]*?)<\/\1>/gi;

function motifSvgIdentityScore(svg: string): number {
  if (/#fcdf6c/i.test(svg) && /<path\b/i.test(svg)) return 0; // Daisy butter center
  if (/deco-daisy|#fcdf6c/i.test(svg)) return 1;
  if (/viewbox="0 0 100 98|#fbb0c7|#fde366/i.test(svg)) return 3; // star accents
  if (/rainbow|#f8635f|#8de3b7/i.test(svg)) return 4;
  return 5;
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
  return 'position:absolute;top:24px;left:24px;width:160px;height:160px;pointer-events:none;z-index:1';
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

/**
 * Visible Motif instances (wrapper + SVG) for svg-sprite kits like Daisy.
 * Compact fill often ships empty `.deco` shells or tiny CSS dots; look CSS
 * alone cannot paint flowers without the child SVG.
 */
function extractVisibleMotifInstances(html: string): string[] {
  const scored: Array<{ score: number; block: string; key: string }> = [];
  VISIBLE_MOTIF_WRAPPER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = VISIBLE_MOTIF_WRAPPER_RE.exec(html)) !== null) {
    const tag = match[1] ?? 'div';
    const attrs = match[2] ?? '';
    const inner = (match[3] ?? '').trim();
    const svgMatch = /<svg\b[\s\S]*?<\/svg>/i.exec(inner);
    if (!svgMatch) continue;
    const svg = svgMatch[0];
    if (svg.length < 80 || svg.length > 8_000) continue;
    if (/<symbol\b/i.test(svg)) continue;
    const className = classAttrValue(attrs);
    const key = /deco-daisy/i.test(className)
      ? 'daisy'
      : /deco-star/i.test(className)
      ? 'star'
      : /deco-rainbow/i.test(className)
      ? 'rainbow'
      : className.slice(0, 48);
    const style = placementStyleForMotifClass(className);
    const open = markOfficialMotifHtml(`<${tag}${ensureInlineStyle(attrs, style)}>`);
    const block = `${open}${svg}</${tag}>`;
    scored.push({ score: motifSvgIdentityScore(svg) + (/deco-daisy/i.test(className) ? 0 : 2), block, key });
  }
  scored.sort((a, b) => a.score - b.score || a.block.length - b.block.length);
  const out: string[] = [];
  const seenKeys = new Set<string>();
  let daisyCount = 0;
  let starCount = 0;
  let extraCount = 0;
  for (const row of scored) {
    const placementKey = /deco-daisy-tl/i.test(row.block)
      ? 'daisy-tl'
      : /deco-daisy-tr/i.test(row.block)
      ? 'daisy-tr'
      : /deco-daisy-bl/i.test(row.block)
      ? 'daisy-bl'
      : /deco-daisy-br|deco-daisy\b/i.test(row.block)
      ? 'daisy-br'
      : /deco-star-2/i.test(row.block)
      ? 'star-2'
      : /deco-star/i.test(row.block)
      ? 'star-1'
      : row.key;
    if (seenKeys.has(placementKey) || out.includes(row.block)) continue;
    const isDaisy = placementKey.startsWith('daisy');
    const isStar = placementKey.startsWith('star');
    // Keep a mixed pack: flowers + stars. Four daisy corners crowd out shapes.
    if (isDaisy && daisyCount >= 2) continue;
    if (isStar && starCount >= 2) continue;
    if (!isDaisy && !isStar && extraCount >= 1) continue;
    seenKeys.add(placementKey);
    out.push(row.block);
    if (isDaisy) daisyCount += 1;
    else if (isStar) starCount += 1;
    else extraCount += 1;
    if (out.length >= 4) break;
  }
  return out;
}

function isVisibleMotifInstanceBlock(block: string): boolean {
  return (
    /^<(?:div|span)\b/i.test(block)
    && /<svg\b/i.test(block)
    && !/<symbol\b/i.test(block)
    && (new RegExp(`\\b${OFFICIAL_DECK_MOTIF_HTML_ATTR}\\b`, 'i').test(block) || /\bdeco-/i.test(block))
  );
}

function svgBlocksContainDaisyIdentity(html: string): boolean {
  SVG_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SVG_BLOCK_RE.exec(html)) !== null) {
    const svg = match[0] ?? '';
    if (svg.length < 80 || /<symbol\b/i.test(svg)) continue;
    if (/#fcdf6c/i.test(svg) && /<path\b/i.test(svg)) return true;
  }
  return false;
}

function destHasVisibleMotifIdentity(dest: string, instances: string[]): boolean {
  if (!dest || instances.length === 0) return instances.length === 0;
  // Official wrapper that actually nests Motif SVG paint (empty deco is not enough).
  if (/deco-daisy[\s\S]{0,240}<svg\b/i.test(dest) && svgBlocksContainDaisyIdentity(dest)) return true;
  // Model pasted the official flower SVG itself.
  if (svgBlocksContainDaisyIdentity(dest)) return true;
  return false;
}

function slideHasOfficialMotifPaint(slideHtml: string): boolean {
  return /deco-daisy[\s\S]{0,240}<svg\b/i.test(slideHtml) || svgBlocksContainDaisyIdentity(slideHtml);
}

function fillEmptyMotifShells(dest: string, svg: string): string {
  if (!dest || !svg) return dest;
  return dest.replace(
    /<(div|span)\b([^>]*\bclass\s*=\s*(?:"[^"]*\bdeco-(?:daisy|star|rainbow|sun|cloud|flower)[^"]*"|'[^']*\bdeco-(?:daisy|star|rainbow|sun|cloud|flower)[^']*')[^>]*)>\s*<\/\1>/gi,
    (_m, tag: string, attrs: string) => {
      const marked = markOfficialMotifHtml(`<${tag}${attrs}>`);
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
  const daisies = instances.filter((block) => /deco-daisy/i.test(block));
  const stars = instances.filter((block) => /deco-star/i.test(block));
  const extras = instances.filter((block) => !/deco-daisy|deco-star/i.test(block));
  const daisy = daisies.length > 0
    ? daisies[index % daisies.length]
    : instances[index % instances.length];
  const star = stars.length > 0 ? stars[index % stars.length] : '';
  const extra = index === 0 ? (extras[0] ?? '') : '';
  return [daisy, star, extra].filter(Boolean).join('\n');
}

function mergeVisibleMotifInstances(dest: string, instances: string[]): string {
  if (!dest || instances.length === 0) return dest;

  let out = dest;
  const primarySvg = /<svg\b[\s\S]*?<\/svg>/i.exec(instances[0] ?? '')?.[0] ?? '';
  if (primarySvg) out = fillEmptyMotifShells(out, primarySvg);

  const slides = listSlideBlocks(out);
  if (slides.length === 0) {
    if (destHasVisibleMotifIdentity(out, instances)) return out;
    return insertAfterOpenBody(out, motifPackForSlide(instances, 0));
  }

  const nextSlides = slides.map((slide, index) => {
    if (slideHasOfficialMotifPaint(slide.html)) return slide.html;
    return insertMotifIntoSlide(slide.html, motifPackForSlide(instances, index));
  });

  for (let i = slides.length - 1; i >= 0; i -= 1) {
    const slide = slides[i]!;
    out = `${out.slice(0, slide.start)}${nextSlides[i]}${out.slice(slide.end)}`;
  }
  return out;
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
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\bclass\\s*=\\s*(?:"[^"]*\\b${escaped}\\b[^"]*"|'[^']*\\b${escaped}\\b[^']*')`, 'i').test(dest);
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

  const prefix = html.slice(0, firstSlideMarkupIndex(html));
  MOTIF_HOST_RE.lastIndex = 0;
  let hostMatch: RegExpExecArray | null;
  while ((hostMatch = MOTIF_HOST_RE.exec(prefix)) !== null) {
    const tag = hostMatch[0] ?? '';
    const className = hostClassName(tag);
    if (!className) continue;
    const marked = markOfficialMotifHtml(tag);
    if (!marked || seen.has(marked)) continue;
    seen.add(marked);
    out.push(marked);
  }

  // Daisy / svg-sprite kits: visible Motif wrappers+SVG (not symbol sheets).
  for (const instance of extractVisibleMotifInstances(html)) {
    if (seen.has(instance)) continue;
    seen.add(instance);
    out.push(instance);
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
  if (!css && fontLinks.length === 0 && motifHtml.length === 0) return null;
  return { css, fontLinks, motifHtml };
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
  // Our merge writes this marker with the official sheet. Compact mid-sheet
  // windows do not survive pretty-printed sibling CSS (Pin assets/styles.css),
  // so a second pass would duplicate the sheet if we still required window hits.
  if (dest.includes(OFFICIAL_DECK_LOOK_STYLE_ATTR)) return true;

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
  const sheetsAndHosts = assets.motifHtml.filter((block) => !isVisibleMotifInstanceBlock(block));

  if (visible.length > 0 && !destHasVisibleMotifIdentity(dest, visible)) return false;

  if (sheetsAndHosts.length === 0) return true;

  // Marker alone is not enough when visible Motif instances are still missing
  // (handled above). For symbol/host kits, marker or concrete ids/hosts prove.
  if (dest.includes(OFFICIAL_DECK_MOTIF_HTML_ATTR) && visible.length === 0) return true;

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
  const sheetsAndHosts = assets.motifHtml.filter((block) => !isVisibleMotifInstanceBlock(block));

  let out = dest;
  if (visible.length > 0) {
    out = mergeVisibleMotifInstances(out, visible);
  }

  if (sheetsAndHosts.length === 0) return out;
  if (deckHtmlHasOfficialMotifHtml(out, { ...assets, motifHtml: sheetsAndHosts })) return out;

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
  // Inject after <body> — HTML parsers relocate <svg> out of <head> on persist sanitize.
  if (sprites.length > 0) out = insertAfterOpenBody(out, sprites.join('\n'));
  if (hosts.length > 0) out = insertAfterOpenBody(out, hosts.join('\n'));
  return out;
}

export function mergeOfficialDeckLookCss(
  html: string,
  assets: OfficialDeckLookAssets | null | undefined,
): string {
  const dest = String(html ?? '');
  if (!dest || !assets) return dest;
  if (!assets.css && assets.fontLinks.length === 0 && !(assets.motifHtml?.length)) return dest;

  let out = dest;
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
  return dest;
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
