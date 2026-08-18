/**
 * Compact BYOK fill is forbidden from dumping the official example.html
 * stylesheet (token budget / Motif-SVG hang). Standalone HTML/PDF then
 * ship cream typography without Capsule `.pill-*` / Daisy motif / sibling
 * Layout CSS — users read that as "template CSS not applied".
 *
 * Merge the official look CSS (tokens + Motif/Layout rules + font links)
 * into the artifact when those rules are missing. Presentation chrome
 * (`.slide { opacity:0 }`, `overflow:hidden`) is neutralized so stacked
 * preview/export still shows every slide.
 */

export const OFFICIAL_DECK_LOOK_STYLE_ATTR = 'data-od-official-look-css';

export type OfficialDeckLookAssets = {
  css: string;
  fontLinks: string[];
};

const FONT_LINK_RE = /<link\b[^>]*>/gi;
const STYLE_BODY_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const DISTINCTIVE_LOOK_CLASS_RE =
  /\.((?:deco-)?pill(?:-[a-z0-9_-]+)?|slide-\d+|slide-(?:title|weekly|red|hero|inner)|grain-overlay|petal(?:-[a-z0-9_-]+)?|blob(?:-[a-z0-9_-]+)?|pin-[a-z0-9_-]+|hc-[a-z0-9_-]+|tpl-[a-z0-9_-]+|s-cover|deco-[a-z0-9_-]+)/gi;

const LOOK_NEUTRALIZE_CSS = `
/* stacked preview/export: keep Motif paint, do not hide non-active slides */
html, body { overflow: visible !important; height: auto !important; }
.slide, .slide.active {
  opacity: 1 !important;
  pointer-events: auto !important;
}
`;

function hrefFromLinkTag(tag: string): string {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

function isFontStylesheetLink(tag: string): boolean {
  return /fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(tag);
}

export function listDistinctiveOfficialLookClasses(css: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(DISTINCTIVE_LOOK_CLASS_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= 12) break;
  }
  return out;
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
    const href = hrefFromLinkTag(tag);
    if (href && seenHref.has(href)) continue;
    if (href) seenHref.add(href);
    fontLinks.push(tag);
  }

  const cssParts: string[] = [];
  STYLE_BODY_RE.lastIndex = 0;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = STYLE_BODY_RE.exec(html)) !== null) {
    const body = (styleMatch[1] ?? '').trim();
    if (body.length >= 40) cssParts.push(body);
  }
  const supplemental = String(options?.supplementalCss ?? '').trim();
  if (supplemental.length >= 40) cssParts.push(supplemental);

  const css = cssParts.join('\n\n').trim();
  if (!css && fontLinks.length === 0) return null;
  return { css, fontLinks };
}

/**
 * True when the artifact already contains official Motif/look *rules*
 * (not just class names on elements or `:root` tokens).
 */
export function deckHtmlHasOfficialLookCss(
  html: string,
  assets: OfficialDeckLookAssets,
): boolean {
  const dest = String(html ?? '');
  const classes = listDistinctiveOfficialLookClasses(assets.css);
  if (classes.length === 0) {
    return assets.css.length > 0 && dest.includes(assets.css.slice(0, 80));
  }
  const needed = Math.min(3, classes.length);
  let hits = 0;
  for (const name of classes) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\.${escaped}\\b[^{]*\\{`, 'i').test(dest)) hits += 1;
    if (hits >= needed) return true;
  }
  return false;
}

export function mergeOfficialDeckLookCss(
  html: string,
  assets: OfficialDeckLookAssets | null | undefined,
): string {
  const dest = String(html ?? '');
  if (!dest || !assets) return dest;
  if (!assets.css && assets.fontLinks.length === 0) return dest;
  if (deckHtmlHasOfficialLookCss(dest, assets)) return dest;

  const missingFonts = assets.fontLinks.filter((tag) => {
    const href = hrefFromLinkTag(tag);
    return href ? !dest.includes(href) : !dest.includes(tag);
  });
  const style = assets.css
    ? `<style ${OFFICIAL_DECK_LOOK_STYLE_ATTR}>\n${assets.css}\n${LOOK_NEUTRALIZE_CSS}\n</style>`
    : '';
  const snippet = `${missingFonts.join('\n')}${missingFonts.length && style ? '\n' : ''}${style}`;
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
