/**
 * Force Teamver slide hosts onto a fixed 1920×1080 (16:9) canvas.
 *
 * Freeform / BYOK fills often copy Neutral samples with `min-height:100vh` or
 * wrap slides in `.presentation` / `.deck`. Without this pin the tall preview
 * panel treats each slide as a full document viewport (portrait scroll).
 */

import {
  attrsLookLikeDeckOrTemplateSlideHost,
  classAttrHasDeckSlideToken,
} from './deck-slide-class.js';
import { looksLikeOfficialFullscreenPresenterDeck } from './deck-template-look-css.js';

export const DECK_FIXED_CANVAS_PIN_ATTR = 'data-od-deck-fixed-canvas-pin';
export const DECK_SLIDE_FLOW_ATTR = 'data-od-slide-flow';

const SLIDE_OPEN_RE =
  /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

const FIXED_CANVAS_STYLE =
  'width:1920px;height:1080px;box-sizing:border-box';

const FIXED_CANVAS_CSS = `
/* Teamver fixed 16:9 canvas pin (size only; Motif-safe — no overflow clip) */
html, body { margin: 0; }
.slide,
section.slide,
.deck-slide,
.ppt-slide,
section[data-screen-label],
main[data-screen-label],
article[data-screen-label] {
  width: 1920px !important;
  height: 1080px !important;
  min-width: 1920px !important;
  min-height: 1080px !important;
  max-width: 1920px !important;
  max-height: 1080px !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  contain: layout size;
}
/* Absolute bottom footers collide with centered lead under flex justify. */
.slide > :is(.slide-footer, .slide-meta, .kicker-footer, .footer):not([class*="deco"]):not([class*="motif"]) {
  position: relative !important;
  inset: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  margin-top: auto !important;
}
/* Clip MiniMax overflow inside the padded 16:9 box. Motif stays a sibling. */
.slide > [data-od-slide-flow] {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* Split panes stay on one axis inside the clip. Do not force a column. */
.slide > [data-od-slide-flow]:has(.split-left),
.slide > [data-od-slide-flow]:has(.split-right),
.slide > [data-od-slide-flow]:has(.split-pane),
.slide > [data-od-slide-flow]:has(.col-left):has(.col-right),
.slide > [data-od-slide-flow]:has(.left-col):has(.right-col) {
  flex-direction: row;
  align-items: stretch;
}
.slide > [data-od-slide-flow]:has(.split-top),
.slide > [data-od-slide-flow]:has(.split-bottom) {
  flex-direction: column;
  align-items: stretch;
}
.slide > [data-od-slide-flow] > :is(.slide-footer, .slide-meta, .kicker-footer, .footer):not([class*="deco"]):not([class*="motif"]) {
  position: relative !important;
  inset: auto !important;
  top: auto !important;
  right: auto !important;
  bottom: auto !important;
  left: auto !important;
  margin-top: auto !important;
}
`.trim();

function extractClassAttr(attrs: string): string {
  const match = attrs.match(/\bclass\s*=\s*(['"])([\s\S]*?)\1/i);
  return match?.[2] ?? '';
}

function extractStyleAttr(attrs: string): string {
  const match = attrs.match(/\bstyle\s*=\s*(['"])([\s\S]*?)\1/i);
  return match?.[2] ?? '';
}

/**
 * Compact fills sometimes omit `class="slide"` and keep only a Teamver page
 * label (`data-screen-label="01 Cover"`). Do not treat inner comment targets
 * (`data-screen-label="eyebrow"`) as slide hosts.
 */
export function looksLikeDeckSlideHostAttrs(attrs: string): boolean {
  const source = String(attrs ?? '');
  if (classAttrHasDeckSlideToken(extractClassAttr(source))) return true;
  if (!/\bdata-screen-label\s*=/i.test(source)) return false;
  if (/\bdata-screen-label\s*=\s*(['"])\d{2}(?:\s|\1)/i.test(source)) return true;
  const style = extractStyleAttr(source);
  return hasFixedCanvasSizing(style) || hasViewportSlideSizing(style);
}

/** Index of the first page host — not slide-counter / slide-chrome. */
export function indexOfFirstDeckSlideHost(html: string): number {
  SLIDE_OPEN_RE.lastIndex = 0;
  try {
    let match: RegExpExecArray | null;
    while ((match = SLIDE_OPEN_RE.exec(String(html ?? ''))) !== null) {
      const attrs = match[2] ?? '';
      if (looksLikeDeckSlideHostAttrs(attrs) || attrsLookLikeDeckOrTemplateSlideHost(attrs)) {
        return match.index;
      }
    }
    return -1;
  } finally {
    SLIDE_OPEN_RE.lastIndex = 0;
  }
}

/** True when HTML contains at least one page host — not slide-counter / slide-chrome. */
export function htmlHasDeckSlideHost(html: string): boolean {
  return indexOfFirstDeckSlideHost(html) >= 0;
}

/** Stream / emergency persist: real document or a page host, not chrome-only HTML. */
export function htmlLooksLikeSlideDeliverableStream(text: string): boolean {
  const source = String(text ?? '');
  if (!source.trim()) return false;
  if (/<!doctype\s+html|<html\b|<body\b|<artifact\b/i.test(source)) return true;
  return htmlHasDeckSlideHost(source);
}

/** FileViewer / memory-preview: enable deck nav without treating chrome as a page. */
export function htmlLooksLikeNavigableDeckPreview(html: string): boolean {
  const source = String(html ?? '');
  if (!source) return false;
  if (htmlHasDeckSlideHost(source)) return true;
  if (/<deck-stage\b/i.test(source)) return true;
  return /\bid\s*=\s*["']deck-stage["']/i.test(source);
}

function isSlideHost(attrs: string): boolean {
  return looksLikeDeckSlideHostAttrs(attrs);
}

function hasFixedCanvasSizing(style: string): boolean {
  return (
    /(?:^|[;{\s])width\s*:\s*1920px\b/i.test(style)
    && /(?:^|[;{\s])(?:min-)?height\s*:\s*1080px\b/i.test(style)
  );
}

function hasViewportSlideSizing(style: string): boolean {
  return (
    /(?:min-)?height\s*:\s*100(?:vh|dvh|svh|lvh)/i.test(style)
    || /(?:^|;)\s*width\s*:\s*100(?:vw|dvw|svw|lvw)/i.test(style)
  );
}

function stripSlideHostOverflowClip(style: string): string {
  return String(style ?? '')
    .replace(/(?:^|;)\s*overflow(?:-x|-y)?\s*:\s*(?:hidden|clip)\s*(?=;|$)/gi, ';');
}

function pinInlineSlideStyle(style: string): string {
  let next = stripSlideHostOverflowClip(style);
  // Already a fixed 16:9 canvas without viewport sizing — keep authored
  // flex/grid axis declarations intact for split layouts.
  if (hasFixedCanvasSizing(next) && !hasViewportSlideSizing(next)) {
    if (!/\bbox-sizing\s*:/i.test(next)) next = `${next};box-sizing:border-box`;
    // Never keep authored overflow:hidden — Motif corners / lead+footer
    // still clip after §0.71 when the model copies compact samples.
    return next.replace(/;;+/g, ';').replace(/^;|;$/g, '').trim();
  }
  // Drop viewport presenter sizing that expands into the host panel height.
  next = next
    .replace(/(?:^|;)\s*(?:min-)?height\s*:\s*100(?:vh|dvh|svh|lvh)\s*(?=;|$)/gi, ';')
    .replace(/(?:^|;)\s*width\s*:\s*100(?:vw|dvw|svw|lvw)\s*(?=;|$)/gi, ';')
    .replace(/;;+/g, ';')
    .replace(/^;|;$/g, '')
    .trim();

  if (/\bwidth\s*:/i.test(next)) {
    next = next.replace(/\bwidth\s*:[^;]*/i, 'width:1920px');
  } else {
    next = next ? `${next};width:1920px` : 'width:1920px';
  }
  if (/\bheight\s*:/i.test(next)) {
    next = next.replace(/\bheight\s*:[^;]*/i, 'height:1080px');
  } else {
    next = `${next};height:1080px`;
  }
  if (!/\bbox-sizing\s*:/i.test(next)) next = `${next};box-sizing:border-box`;
  next = next.replace(/\bmin-height\s*:\s*100(?:vh|dvh|svh|lvh)\b/gi, 'min-height:1080px');
  next = stripSlideHostOverflowClip(next);
  return next.replace(/;;+/g, ';').replace(/^;|;$/g, '').trim();
}

function pinSlideOpenTag(open: string, attrs: string): string {
  if (/\bstyle\s*=/i.test(attrs)) {
    const nextAttrs = attrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, style: string) => `style=${q}${pinInlineSlideStyle(style)}${q}`,
    );
    return open.replace(attrs, nextAttrs);
  }
  const trimmed = attrs.trimEnd();
  const spacer = trimmed.length > 0 && !/\s$/.test(attrs) ? ' ' : '';
  const nextAttrs = `${attrs}${spacer}style="${FIXED_CANVAS_STYLE}"`;
  return open.replace(attrs, nextAttrs);
}

function countSlideHosts(html: string): number {
  let count = 0;
  SLIDE_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLIDE_OPEN_RE.exec(html)) !== null) {
    if (isSlideHost(match[2] ?? '')) count += 1;
  }
  return count;
}

const FOOTER_HOST_RE =
  /<(p|div|span|footer|small)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

function isContentFooterHost(attrs: string): boolean {
  const cls = extractClassAttr(attrs);
  if (!/\b(?:slide-footer|slide-meta|kicker-footer|footer)\b/i.test(cls)) return false;
  return !/\b(?:deco|motif|floating-pills|petals)\b/i.test(cls);
}

function flowAbsoluteFooterStyle(style: string): string | null {
  const source = String(style ?? '');
  if (!/position\s*:\s*absolute/i.test(source)) return null;
  if (!/\bbottom\s*:/i.test(source)) return null;
  let next = source
    .replace(/position\s*:\s*absolute/gi, 'position:relative')
    .replace(/(?:^|;)\s*(?:top|right|bottom|left)\s*:[^;]*/gi, ';');
  if (!/margin-top\s*:/i.test(next)) next = `${next};margin-top:auto`;
  next = next.replace(/;;+/g, ';').replace(/^;|;$/g, '').trim();
  return next;
}

/** Absolute bottom footers collide with centered subtitle/lead on flex slides. */
function flowAbsoluteSlideFooters(html: string): string {
  return html.replace(FOOTER_HOST_RE, (open, _tag: string, attrs: string) => {
    if (!isContentFooterHost(attrs)) return open;
    if (!/\bstyle\s*=/i.test(attrs)) return open;
    const nextAttrs = attrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, style: string) => {
        const next = flowAbsoluteFooterStyle(style);
        return next == null ? `style=${q}${style}${q}` : `style=${q}${next}${q}`;
      },
    );
    return open.replace(attrs, nextAttrs);
  });
}

const MOTIF_OR_DECO_CLASS_RE =
  /deco|motif|petal|blob|pill|doodle|pin-|scanline|grain|sunglow|ribbon|pixel-|hc-|gd-orb|xp-blob|post-it|stamp|tape|corner-bracket|ts-stripe|zigzag|hero-shot|card-deco|title-accent|closing-accent|mini-note|floating-pills|cover-blob|geo-decoration|cover-decoration/i;

const ABS_FLOW_OPEN_RE =
  /<(div|span|p|h[1-6]|section|article|aside|header|footer|small|label)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

function isMotifOrDecoAttrs(attrs: string): boolean {
  if (/\bdata-od-official-motif-html\b/i.test(attrs)) return true;
  return MOTIF_OR_DECO_CLASS_RE.test(extractClassAttr(attrs));
}

function flowAbsoluteNonMotifStyle(style: string): string | null {
  const source = String(style ?? '');
  if (!/position\s*:\s*absolute/i.test(source)) return null;
  const next = source
    .replace(/position\s*:\s*absolute/gi, 'position:relative')
    .replace(/(?:^|;)\s*(?:top|right|bottom|left|inset)\s*:[^;]*/gi, ';')
    .replace(/;;+/g, ';')
    .replace(/^;|;$/g, '')
    .trim();
  return next;
}

type SlideInnerSpan = {
  start: number;
  end: number;
  hostAttrs: string;
};

function findMatchingCloseTagIndex(chunk: string, tag: string): number {
  const tokenRe = new RegExp(`<(/)?${tag}\\b[^>]*>`, 'gi');
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(chunk)) !== null) {
    if (match[1]) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else {
      depth += 1;
    }
  }
  return -1;
}

function listPinnedSlideInnerSpans(html: string): SlideInnerSpan[] {
  const opens: { start: number; openEnd: number; tag: string; hostAttrs: string }[] = [];
  SLIDE_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLIDE_OPEN_RE.exec(html)) !== null) {
    if (!isSlideHost(match[2] ?? '')) continue;
    opens.push({
      start: match.index,
      openEnd: match.index + match[0].length,
      tag: (match[1] ?? 'section').toLowerCase(),
      hostAttrs: match[2] ?? '',
    });
  }
  return opens.map((open, i) => {
    const limit = i + 1 < opens.length ? opens[i + 1]!.start : html.length;
    const chunk = html.slice(open.openEnd, limit);
    // Nested same-tag hosts (MiniMax `<section class="slide">…<section>…`) must
    // not truncate the slide inner at the first closer (루프345).
    const closeIdx = findMatchingCloseTagIndex(chunk, open.tag);
    return {
      start: open.openEnd,
      end: closeIdx >= 0 ? open.openEnd + closeIdx : limit,
      hostAttrs: open.hostAttrs,
    };
  });
}

function flowAbsoluteNonMotifInSpan(html: string): string {
  return html.replace(ABS_FLOW_OPEN_RE, (open, _tag: string, attrs: string) => {
    if (isMotifOrDecoAttrs(attrs)) return open;
    if (!/\bstyle\s*=/i.test(attrs)) return open;
    const nextAttrs = attrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, style: string) => {
        const next = flowAbsoluteNonMotifStyle(style);
        return next == null ? `style=${q}${style}${q}` : `style=${q}${next}${q}`;
      },
    );
    return open.replace(attrs, nextAttrs);
  });
}

/**
 * MiniMax compact fills park labels/cards with `position:absolute`, so
 * "05 / CHECKLIST" lands inside card 02 and the 16:9 canvas looks broken.
 * Motif/deco corners stay absolute. Everything else returns to document flow.
 */
export function flowAbsoluteNonMotifSlideContent(html: string): string {
  const source = String(html ?? '');
  const spans = listPinnedSlideInnerSpans(source);
  if (spans.length === 0) return source;
  let out = source;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    const inner = out.slice(span.start, span.end);
    const next = flowAbsoluteNonMotifInSpan(inner);
    if (next !== inner) {
      out = `${out.slice(0, span.start)}${next}${out.slice(span.end)}`;
    }
  }
  return out;
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'source', 'track', 'wbr',
]);

const INDEX_BADGE_TEXT_RE =
  /^\d{1,2}\s*[\/·•]\s*[A-Za-z가-힣][A-Za-z가-힣\s-]{1,20}$/;

const KIT_CARD_TOKEN_RE = /\b(?:info-card|stat-card|card)\b/i;
const KIT_SAFE_FRAME_COLOR_RE = /\b(?:var\s*\(|currentColor|inherit|transparent)\b/i;
const EXPLICIT_PAINT_COLOR_RE =
  /#(?:[0-9a-f]{3,8})\b|\b(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab|color-mix|color|light-dark|device-cmyk)\s*\(|\b(?:navy|royalblue|mediumblue|indigo|skyblue|teal|cyan|blue|darkblue|purple|violet|fuchsia|magenta|crimson|emerald|amber|lime|limegreen|rose|orange|pink|coral|tomato|chocolate|rebeccapurple|deepskyblue|mediumvioletred|slateblue|darkorchid|turquoise|gold|salmon|orchid|hotpink|dodgerblue|steelblue|seagreen|darkcyan|cadetblue|firebrick|indianred|lightcoral|darksalmon|lightsalmon|orangered|darkorange|peachpuff|khaki|moccasin|wheat|burlywood|tan|rosybrown|sienna|saddlebrown|peru|darkgoldenrod|goldenrod|lavender|thistle|plum|mediumorchid|blueviolet|darkviolet|mediumpurple|mediumslateblue|slategray|dimgray|aliceblue|antiquewhite|aquamarine|azure|beige|bisque|blanchedalmond|blueviolet|chartreuse|cornflowerblue|cornsilk|crimson|darkgray|darkgrey|darkgreen|darkkhaki|darkmagenta|darkolivegreen|darkred|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|deeppink|floralwhite|forestgreen|gainsboro|ghostwhite|greenyellow|honeydew|ivory|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcyan|lightgoldenrodyellow|lightgray|lightgrey|lightgreen|lightpink|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|linen|maroon|mediumaquamarine|mediumseagreen|mediumspringgreen|mediumturquoise|midnightblue|mintcream|mistyrose|navajowhite|oldlace|olive|olivedrab|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|powderblue|seashell|silver|springgreen|teal|whitesmoke|snow|brown|sandybrown|dimgrey|slategrey|yellow|yellowgreen|aqua|fuchsia|gray|grey|green|red|white|black)\b/i;
const FAKE_RING_SHADOW_RE = /(?:^|;)\s*box-shadow\s*:[^;]*\b0\s+0\s+0\s+(?:1px|2px)\b[^;]*/i;
const SPLIT_ROW_LAYOUT_RE = /\bsplit-(?:left|right|pane)\b/i;
const SPLIT_COL_LAYOUT_RE = /\bsplit-(?:top|bottom)\b/i;
const COL_LEFT_RE = /\b(?:col-left|left-col)\b/i;
const COL_RIGHT_RE = /\b(?:col-right|right-col)\b/i;

function looksLikeSiblingColumnRow(inner: string): boolean {
  return SPLIT_ROW_LAYOUT_RE.test(inner) || (COL_LEFT_RE.test(inner) && COL_RIGHT_RE.test(inner));
}

function findMatchingClose(html: string, from: number, tag: string): number {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(
    `<(?:(/)\\s*)?${safe}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`,
    'gi',
  );
  token.lastIndex = from;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html)) !== null) {
    const selfClose = /\/\s*$/.test(match[2] ?? '');
    if (match[1]) depth -= 1;
    else if (!selfClose) depth += 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return html.length;
}

function listTopLevelSegments(html: string): { start: number; end: number }[] {
  const segs: { start: number; end: number }[] = [];
  let i = 0;
  while (i < html.length) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i);
      const close = end < 0 ? html.length : end + 3;
      segs.push({ start: i, end: close });
      i = close;
      continue;
    }
    if (html.charAt(i) !== '<') {
      const next = html.indexOf('<', i);
      const end = next < 0 ? html.length : next;
      segs.push({ start: i, end });
      i = end;
      continue;
    }
    const open = /^<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)(\/)?>/.exec(html.slice(i));
    if (!open) {
      i += 1;
      continue;
    }
    const tag = (open[1] ?? 'div').toLowerCase();
    const selfClose = Boolean(open[3]) || VOID_TAGS.has(tag);
    if (selfClose) {
      segs.push({ start: i, end: i + open[0].length });
      i += open[0].length;
      continue;
    }
    const end = findMatchingClose(html, i + open[0].length, tag);
    segs.push({ start: i, end });
    i = end;
  }
  return segs;
}

function openTagOf(segment: string): { tag: string; attrs: string } | null {
  const open = /^<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)/.exec(segment);
  if (!open) return null;
  return { tag: open[1] ?? '', attrs: open[2] ?? '' };
}

function innerTextOf(segment: string): string {
  return segment.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function mapSlideInners(
  html: string,
  rewrite: (inner: string, span: SlideInnerSpan) => string,
): string {
  const source = String(html ?? '');
  const spans = listPinnedSlideInnerSpans(source);
  if (spans.length === 0) return source;
  let out = source;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    const inner = out.slice(span.start, span.end);
    const next = rewrite(inner, span);
    if (next !== inner) {
      out = `${out.slice(0, span.start)}${next}${out.slice(span.end)}`;
    }
  }
  return out;
}

function isFloatingIndexBadgeHost(tag: string, attrs: string): boolean {
  if (/\bslide-chrome\b/i.test(attrs)) return false;
  if (/^(span|small|label|em|strong|b|i)$/i.test(tag)) return true;
  // MiniMax parks "05 / CHECKLIST" on absolute/fixed chrome, then as
  // in-flow `div`/`p` after absolute→flow. Keep `.slide-chrome`.
  if (/^(div|p)$/i.test(tag)) return true;
  if (!/^(h[1-6]|header)$/i.test(tag)) return false;
  const style = extractStyleAttr(attrs);
  if (/position\s*:\s*(?:absolute|fixed)/i.test(style)) return true;
  return /\b(?:badge|index|overlay|page-label|slide-label|kicker)\b/i.test(attrs);
}

function rewriteElementInner(raw: string, nextInner: string): string | null {
  const openEnd = raw.indexOf(">");
  if (openEnd < 0) return null;
  const close = /<\/[a-zA-Z][\w-]*\s*>\s*$/.exec(raw);
  if (!close || close.index <= openEnd) return null;
  return `${raw.slice(0, openEnd + 1)}${nextInner}${raw.slice(close.index)}`;
}

function stripFloatingIndexBadgesInSpan(inner: string): string {
  const segs = listTopLevelSegments(inner);
  let next = inner;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const seg = segs[i]!;
    const raw = next.slice(seg.start, seg.end);
    const open = openTagOf(raw);
    if (!open) continue;
    if (isMotifOrDecoAttrs(open.attrs) || isContentFooterHost(open.attrs)) continue;
    if (/\bslide-chrome\b/i.test(open.attrs)) continue;
    if (
      isFloatingIndexBadgeHost(open.tag, open.attrs)
      && INDEX_BADGE_TEXT_RE.test(innerTextOf(raw))
    ) {
      next = `${next.slice(0, seg.start)}${next.slice(seg.end)}`;
      continue;
    }
    const openEnd = raw.indexOf(">");
    const close = /<\/[a-zA-Z][\w-]*\s*>\s*$/.exec(raw);
    if (openEnd < 0 || !close || close.index <= openEnd) continue;
    const child = raw.slice(openEnd + 1, close.index);
    const strippedChild = stripFloatingIndexBadgesInSpan(child);
    if (strippedChild === child) continue;
    const rebuilt = rewriteElementInner(raw, strippedChild);
    if (!rebuilt) continue;
    next = `${next.slice(0, seg.start)}${rebuilt}${next.slice(seg.end)}`;
  }
  return next;
}

/**
 * MiniMax parks "05 / CHECKLIST" as a sibling overlay. After absolute→flow
 * the badge sits between cards. Drop those chrome labels only.
 */
export function stripFloatingDeckIndexBadges(html: string): string {
  return mapSlideInners(html, (inner) => stripFloatingIndexBadgesInSpan(inner));
}

function shouldSkipSlideFlowWrap(inner: string): boolean {
  return new RegExp(`\\b${DECK_SLIDE_FLOW_ATTR}\\b`, 'i').test(inner);
}

const FLOW_COPIED_STYLE_PROPS = [  'display',
  'flex-direction',
  'flex-wrap',
  'flex-flow',
  'flex',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'order',
  'justify-content',
  'align-items',
  'align-content',
  'align-self',
  'justify-items',
  'justify-self',
  'place-content',
  'place-items',
  'place-self',
  '-webkit-flex',
  '-webkit-flex-direction',
  '-webkit-flex-wrap',
  '-webkit-flex-flow',
  '-webkit-flex-grow',
  '-webkit-flex-shrink',
  '-webkit-flex-basis',
  '-ms-flex',
  '-ms-flex-direction',
  '-ms-flex-wrap',
  '-ms-flex-flow',
  '-ms-flex-positive',
  '-ms-flex-negative',
  '-ms-flex-preferred-size',
  '-ms-flex-align',
  '-ms-flex-pack',
  '-ms-flex-item-align',
  '-ms-flex-line-pack',
  '-ms-flex-order',
  '-ms-order',
  '-webkit-justify-content',
  '-webkit-align-items',
  '-webkit-align-content',
  '-webkit-align-self',
  '-webkit-order',
  '-webkit-justify-items',
  '-webkit-justify-self',
  'gap',
  'row-gap',
  'column-gap',
  'grid',
  'grid-template',
  'grid-template-columns',
  'grid-template-rows',
  'grid-template-areas',
  '-ms-grid-columns',
  '-ms-grid-rows',
  '-ms-grid-column',
  '-ms-grid-row',
  '-ms-grid-column-span',
  '-ms-grid-row-span',
  '-ms-grid-column-align',
  '-ms-grid-row-align',
  'grid-auto-flow',
  'grid-auto-rows',
  'grid-auto-columns',
  'grid-area',
  'grid-column',
  'grid-column-start',
  'grid-column-end',
  'grid-row',
  'grid-row-start',
  'grid-row-end',
  'column-count',
  '-moz-column-count',
  '-moz-column-gap',
  '-moz-column-rule',
  '-moz-column-rule-color',
  '-moz-column-rule-style',
  '-moz-column-rule-width',
  '-moz-column-width',
  '-moz-columns',
  '-moz-column-fill',
  '-moz-column-span',
  'columns',
  'column-width',
  'column-fill',
  'column-span',
  'column-rule',
  'column-rule-color',
  'column-rule-width',
  'column-rule-style',
  '-webkit-columns',
  '-webkit-column-count',
  '-webkit-column-gap',
  '-webkit-column-rule',
  '-webkit-column-rule-color',
  '-webkit-column-rule-style',
  '-webkit-column-rule-width',
  '-webkit-column-span',
  '-webkit-column-width',
  '-webkit-column-fill',
  '-webkit-column-break-before',
  '-webkit-column-break-after',
  '-webkit-column-break-inside',
  '-webkit-column-axis',
  '-webkit-column-progression',
  'container',
  'container-type',
  'container-name',
  'isolation',
  'contain',
  'content-visibility',
  'will-change',
  'backface-visibility',
  '-webkit-backface-visibility',
  '-moz-backface-visibility',
  'perspective',
  '-webkit-perspective',
  '-moz-perspective',
  '-moz-perspective-origin',
  '-moz-transform-style',
  '-webkit-overflow-scrolling',
  'transform-style',
  'zoom',
  'scroll-snap-type',
  '-ms-scroll-snap-type',
  '-ms-scroll-snap-x',
  '-ms-scroll-snap-y',
  '-ms-scroll-chaining',
  '-ms-scroll-rails',
  '-ms-content-zooming',
  '-ms-content-zoom-chaining',
  '-ms-content-zoom-limit',
  '-ms-content-zoom-limit-max',
  '-ms-content-zoom-limit-min',
  '-ms-content-zoom-snap',
  '-ms-content-zoom-snap-points-x',
  '-ms-content-zoom-snap-points-y',
  '-ms-content-zoom-snap-points',
  '-ms-content-zoom-snap-type',
  '-ms-scroll-limit',
  '-ms-scroll-limit-x-max',
  '-ms-scroll-limit-x-min',
  '-ms-scroll-limit-y-max',
  '-ms-scroll-limit-y-min',
  '-ms-scroll-translation',
  '-ms-scroll-snap-points-x',
  '-ms-scroll-snap-points-y',
  '-ms-touch-select',
  '-ms-interpolation-mode',
  '-ms-wrap-flow',
  '-ms-wrap-margin',
  '-ms-wrap-through',
  '-ms-block-progression',
  'scroll-snap-align',
  'scroll-snap-stop',
  'scroll-behavior',
  'scroll-margin',
  'scroll-margin-block',
  'scroll-margin-inline',
  'scroll-margin-block-start',
  'scroll-margin-block-end',
  'scroll-margin-inline-start',
  'scroll-margin-inline-end',
  'scroll-margin-top',
  'scroll-margin-right',
  'scroll-margin-bottom',
  'scroll-margin-left',
  'scroll-padding',
  'scroll-padding-block',
  'scroll-padding-inline',
  'scroll-padding-block-start',
  'scroll-padding-block-end',
  'scroll-padding-inline-start',
  'scroll-padding-inline-end',
  'scroll-padding-top',
  'scroll-padding-right',
  'scroll-padding-bottom',
  'scroll-padding-left',
  'scrollbar-gutter',
  'scrollbar-width',
  'scrollbar-color',
  '-ms-scrollbar-base-color',
  '-ms-scrollbar-face-color',
  '-ms-scrollbar-3dlight-color',
  '-ms-scrollbar-shadow-color',
  '-ms-scrollbar-highlight-color',
  '-ms-scrollbar-darkshadow-color',
  '-ms-scrollbar-arrow-color',
  '-ms-scrollbar-track-color',
  'overscroll-behavior',
  'overscroll-behavior-x',
  'overscroll-behavior-y',
  'overscroll-behavior-block',
  'overscroll-behavior-inline',
  'overflow-anchor',
  'overflow-clip-margin',
  'overflow-block',
  'overflow-inline',
  'block-overflow',
  'contain-intrinsic-size',
  'contain-intrinsic-width',
  'contain-intrinsic-height',
  'contain-intrinsic-block-size',
  'contain-intrinsic-inline-size',
  'border-image',
  'border-image-source',
  'border-image-slice',
  'border-image-width',
  'border-image-outset',
  'border-image-repeat',
  '-webkit-border-image',
  '-webkit-border-image-source',
  '-webkit-border-image-slice',
  '-webkit-border-image-width',
  '-webkit-border-image-outset',
  '-webkit-border-image-repeat',
  '-moz-border-image',
  '-moz-border-image-source',
  '-moz-border-image-slice',
  '-moz-border-image-width',
  '-moz-border-image-outset',
  '-moz-border-image-repeat',
  'border-collapse',
  'counter-reset',
  'counter-increment',
  'counter-set',
  'mask',
  'mask-border-source',
  'mask-border-mode',
  'mask-border-slice',
  'mask-border-width',
  'mask-border-outset',
  'mask-border-repeat',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-width',
  'stroke',
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke-opacity',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'd',
  'points',
  'pathLength',
  'path-length',
  'clip-rule',
  'color-interpolation-filters',
  'lighting-color',
  'flood-color',
  'flood-opacity',
  'stop-color',
  'stop-opacity',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
  'text-anchor',
  'kerning',
  'glyph-orientation-vertical',
  'nav-up',
  'nav-down',
  'nav-left',
  'nav-right',
  'spatial-navigation-action',
  'spatial-navigation-contain',
  'input-security',
  'bookmark-level',
  'bookmark-label',
  'bookmark-state',
  'string-set',
  'running',
  'footnote-display',
  'footnote-policy',
  'user-select',
  '-webkit-user-select',
  '-moz-user-select',
  '-ms-user-select',
  '-webkit-user-drag',
  'user-drag',
  '-webkit-user-modify',
  '-moz-user-modify',
  '-moz-user-focus',
  '-moz-user-input',
  '-moz-print-color-adjust',
  '-webkit-touch-callout',
  '-webkit-nbsp-mode',
  '-webkit-text-security',
  '-webkit-box-reflect',
  '-webkit-locale',
  '-webkit-ruby-position',
  'touch-action',
  '-ms-touch-action',
  'pointer-events',
  'appearance',
  '-webkit-appearance',
  '-moz-appearance',
  'color-scheme',
  '-ms-color-scheme',
  'accent-color',
  'forced-color-adjust',
  'print-color-adjust',
  'color-adjust',
  '-webkit-print-color-adjust',
  'app-region',
  '-webkit-app-region',
  '-webkit-dashboard-region',
  '-apple-dashboard-region',
  '-webkit-border-fit',
  '-webkit-tap-highlight-color',
  'scale',
  'translate',
  'rotate',
  'resize',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'inset-block',
  'inset-block-start',
  'inset-block-end',
  'inset-inline',
  'inset-inline-start',
  'inset-inline-end',
  'z-index',
  'opacity',
  '-webkit-opacity',
  '-moz-opacity',
  '-moz-control-character-visibility',
  '-moz-context-properties',
  '-moz-inert',
  'filter',
  '-webkit-filter',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'mix-blend-mode',
  'aspect-ratio',
  '-webkit-aspect-ratio',
  'object-fit',
  'object-position',
  'background',
  'background-image',
  'background-size',
  'background-position',
  'background-position-x',
  'background-position-y',
  'background-repeat',
  'background-clip',
  '-webkit-background-clip',
  'background-origin',
  '-webkit-background-origin',
  'background-attachment',
  'background-blend-mode',
  '-webkit-background-size',
  '-webkit-background-composite',
  '-moz-background-inline-policy',
  '-moz-background-blend-mode',
  '-webkit-background-blend-mode',
  '-moz-background-clip',
  '-moz-background-origin',
  '-moz-background-size',
  'mask-image',
  'mask-size',
  'mask-position',
  'mask-repeat',
  'mask-mode',
  'mask-clip',
  'mask-origin',
  'mask-composite',
  'mask-type',
  'mask-border',
  '-webkit-mask',
  '-webkit-mask-image',
  '-webkit-mask-size',
  '-webkit-mask-position',
  '-webkit-mask-position-x',
  '-webkit-mask-position-y',
  '-webkit-mask-repeat',
  '-webkit-mask-repeat-x',
  '-webkit-mask-repeat-y',
  '-webkit-mask-attachment',
  '-webkit-mask-clip',
  '-webkit-mask-origin',
  '-webkit-mask-composite',
  '-webkit-mask-composite-source',
  '-webkit-mask-box-image',
  '-webkit-mask-box-image-source',
  '-webkit-mask-box-image-slice',
  '-webkit-mask-box-image-width',
  '-webkit-mask-box-image-outset',
  '-webkit-mask-box-image-repeat',
  '-webkit-mask-source-type',
  'clip-path',
  '-webkit-clip-path',
  'anchor-name',
  'position-anchor',
  'position-area',
  'position-try',
  'position-try-fallbacks',
  'position-try-options',
  'position-visibility',
  'overlay',
  'view-transition-name',
  'view-transition-class',
  'view-transition-group',
  'view-timeline',
  'view-timeline-name',
  'view-timeline-axis',
  'view-timeline-inset',
  'scroll-timeline',
  'scroll-timeline-name',
  'scroll-timeline-axis',
  'scroll-timeline-attachment',
  'animation-timeline',
  'animation-range',
  'animation-range-start',
  'animation-range-end',
  'animation',
  'animation-name',
  'animation-duration',
  'animation-delay',
  'animation-timing-function',
  'animation-iteration-count',
  'animation-direction',
  'animation-fill-mode',
  'animation-play-state',
  'animation-composition',
  '-webkit-animation',
  '-moz-animation',
  '-moz-animation-name',
  '-moz-animation-duration',
  '-moz-animation-delay',
  '-moz-animation-timing-function',
  '-moz-animation-iteration-count',
  '-moz-animation-direction',
  '-moz-animation-fill-mode',
  '-moz-animation-play-state',
  '-webkit-animation-name',
  '-webkit-animation-duration',
  '-webkit-animation-delay',
  '-webkit-animation-timing-function',
  '-webkit-animation-iteration-count',
  '-webkit-animation-direction',
  '-webkit-animation-fill-mode',
  '-webkit-animation-play-state',
  'transition',
  'transition-property',
  'transition-duration',
  'transition-delay',
  'transition-timing-function',
  'transition-behavior',
  '-webkit-transition',
  '-moz-transition',
  '-moz-transition-property',
  '-moz-transition-duration',
  '-moz-transition-delay',
  '-moz-transition-timing-function',
  '-webkit-transition-property',
  '-webkit-transition-duration',
  '-webkit-transition-delay',
  '-webkit-transition-timing-function',
  'transform',
  'transform-origin',
  'transform-box',
  '-webkit-transform',
  '-moz-transform',
  '-ms-transform',
  '-webkit-transform-origin',
  '-moz-transform-origin',
  '-ms-transform-origin',
  '-webkit-transform-style',
  'perspective-origin',
  '-webkit-perspective-origin',
  'timeline-scope',
  'anchor-scope',
  'offset',
  'offset-path',
  'offset-distance',
  'offset-rotate',
  'offset-anchor',
  'offset-position',
  'overflow',
  'overflow-x',
  'overflow-y',
  '-ms-overflow-style',
  'min-height',
  'max-height',
  'min-width',
  'max-width',
  'min-block-size',
  'max-block-size',
  'min-inline-size',
  'max-inline-size',
  'block-size',
  'inline-size',
  '-webkit-logical-width',
  '-webkit-logical-height',
  '-webkit-min-logical-width',
  '-webkit-min-logical-height',
  '-webkit-max-logical-width',
  '-webkit-max-logical-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-block',
  'margin-block-start',
  'margin-block-end',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  '-webkit-margin-before',
  '-webkit-margin-collapse',
  '-webkit-margin-top-collapse',
  '-webkit-margin-bottom-collapse',
  '-webkit-margin-before-collapse',
  '-webkit-margin-after-collapse',
  '-webkit-rtl-ordering',
  '-webkit-margin-after',
  '-webkit-margin-start',
  '-webkit-margin-end',
  'font',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'font-variant-ligatures',
  '-webkit-font-variant-ligatures',
  'font-variant-numeric',
  'font-variant-caps',
  'font-variant-east-asian',
  'font-variant-alternates',
  'font-variant-position',
  'font-variant-emoji',
  'font-language-override',
  'font-stretch',
  'font-optical-sizing',
  'font-variation-settings',
  'font-feature-settings',
  '-webkit-font-feature-settings',
  '-moz-font-feature-settings',
  '-ms-font-feature-settings',
  '-webkit-font-kerning',
  '-moz-font-language-override',
  '-webkit-font-language-override',
  '-moz-font-smoothing',
  'font-palette',
  'base-palette',
  'override-colors',
  'font-synthesis',
  'font-synthesis-weight',
  'font-synthesis-style',
  'font-synthesis-small-caps',
  'font-synthesis-position',
  'font-kerning',
  'font-size-adjust',
  '-webkit-font-size-adjust',
  'font-display',
  'font-smooth',
  '-webkit-font-smoothing',
  '-moz-osx-font-smoothing',
  'ascent-override',
  'descent-override',
  'line-gap-override',
  'size-adjust',
  'line-height',
  'line-height-step',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-align-last',
  'text-indent',
  'text-wrap',
  'text-wrap-mode',
  'text-wrap-style',
  'text-size-adjust',
  '-webkit-text-size-adjust',
  '-moz-text-size-adjust',
  '-ms-text-size-adjust',
  '-webkit-text-fill-color',
  '-webkit-text-stroke',
  '-webkit-text-stroke-width',
  '-webkit-text-stroke-color',
  'text-overflow',
  '-o-text-overflow',
  '-ms-text-overflow',
  '-ms-high-contrast-adjust',
  '-ms-ime-align',
  '-ms-ime-mode',
  'ime-mode',
  '-ms-flow-from',
  '-ms-flow-into',
  '-ms-accelerator',
  '-ms-text-autospace',
  '-ms-text-kashida-space',
  'word-wrap',
  'text-transform',
  'text-decoration',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-color',
  'text-decoration-thickness',
  'text-shadow',
  'text-justify',
  'text-box-trim',
  'text-box-edge',
  'text-edge',
  'text-spacing-trim',
  'text-combine-upright',
  '-webkit-text-combine',
  '-webkit-text-combine-horizontal',
  '-webkit-text-combine-upright',
  'text-orientation',
  '-webkit-text-orientation',
  '-moz-text-orientation',
  '-epub-text-orientation',
  '-epub-writing-mode',
  '-epub-text-combine',
  '-epub-caption-side',
  '-epub-text-transform',
  '-epub-word-break',
  '-epub-text-emphasis',
  '-epub-text-emphasis-color',
  '-epub-text-emphasis-style',
  'text-rendering',
  'leading-trim',
  'margin-trim',
  'initial-letter',
  'initial-letter-align',
  'initial-letter-wrap',
  'hyphenate-character',
  '-webkit-hyphenate-character',
  'hyphenate-limit-chars',
  'hyphenate-limit-last',
  'hyphenate-limit-lines',
  '-webkit-hyphenate-limit-lines',
  'hyphenate-limit-zone',
  'hyphenate-limit-before',
  '-webkit-hyphenate-limit-before',
  'hyphenate-limit-after',
  '-webkit-hyphenate-limit-after',
  '-webkit-hyphenate-limit-last',
  '-webkit-hyphenate-limit-zone',
  'line-break',
  '-webkit-line-break',
  'wrap-after',
  'wrap-before',
  'wrap-inside',
  'box-snap',
  'scroll-initial-target',
  'white-space',
  'white-space-collapse',
  'hyphens',
  '-moz-hyphens',
  '-moz-text-blink',
  '-moz-stack-sizing',
  '-moz-binding',
  '-moz-force-broken-image-icon',
  '-moz-border-top-colors',
  '-moz-border-right-colors',
  '-moz-border-bottom-colors',
  '-moz-border-left-colors',
  '-moz-text-align-last',
  '-moz-text-decoration-color',
  '-moz-text-decoration-line',
  '-moz-text-decoration-style',
  '-webkit-hyphens',
  'word-break',
  '-ms-word-break',
  '-ms-word-wrap',
  '-ms-writing-mode',
  '-ms-text-combine-horizontal',
  '-ms-text-combine-mode',
  '-webkit-word-break',
  '-webkit-text-decorations-in-effect',
  '-webkit-line-box-contain',
  '-webkit-line-align',
  '-webkit-line-grid',
  '-webkit-line-snap',
  '-webkit-cursor-visibility',
  '-webkit-trailing-word',
  '-apple-trailing-word',
  'overflow-wrap',
  'line-clamp',
  '-webkit-line-clamp',
  '-webkit-box-orient',
  '-webkit-box-direction',
  '-webkit-box-pack',
  '-webkit-box-align',
  '-moz-box-align',
  '-moz-box-direction',
  '-moz-box-flex',
  '-moz-box-ordinal-group',
  '-moz-box-orient',
  '-moz-box-pack',
  '-moz-box-sizing',
  '-moz-float-edge',
  '-moz-orient',
  '-moz-image-region',
  '-webkit-box-flex',
  '-moz-box-flex-group',
  '-webkit-box-flex-group',
  '-webkit-box-ordinal-group',
  '-webkit-box-lines',
  '-webkit-text-zoom',
  'text-zoom',
  '-webkit-marquee',
  '-webkit-marquee-dir',
  '-webkit-marquee-style',
  '-webkit-marquee-direction',
  '-webkit-marquee-increment',
  '-webkit-marquee-repetition',
  '-webkit-marquee-speed',
  'color',
  'caret-color',
  'vertical-align',
  'unicode-bidi',
  'tab-size',
  '-moz-tab-size',
  'hanging-punctuation',
  'writing-mode',
  '-webkit-writing-mode',
  'direction',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-block',
  'padding-inline',
  'padding-block-start',
  'padding-block-end',
  'padding-inline-start',
  'padding-inline-end',
  '-webkit-padding-before',
  '-webkit-padding-after',
  '-webkit-padding-start',
  '-webkit-padding-end',
  'border-block',
  'border-block-start',
  'border-block-end',
  'border-block-width',
  'border-block-style',
  'border-block-color',
  'border-inline',
  'border-inline-start',
  'border-inline-end',
  'border-inline-width',
  'border-inline-style',
  'border-inline-color',
  '-webkit-border-before',
  '-webkit-border-before-color',
  '-webkit-border-before-style',
  '-webkit-border-before-width',
  '-webkit-border-after',
  '-webkit-border-after-color',
  '-webkit-border-after-style',
  '-webkit-border-after-width',
  '-webkit-border-start',
  '-webkit-border-start-color',
  '-webkit-border-start-style',
  '-webkit-border-start-width',
  '-webkit-border-end',
  '-webkit-border-end-color',
  '-webkit-border-end-style',
  '-webkit-border-end-width',
  'outline',
  'outline-width',
  '-moz-outline',
  '-moz-outline-color',
  '-moz-outline-style',
  '-moz-outline-width',
  '-moz-outline-offset',
  'outline-style',
  'outline-color',
  'outline-offset',
  'border-spacing',
  '-webkit-border-horizontal-spacing',
  '-webkit-border-vertical-spacing',
  'table-layout',
  'caption-side',
  'empty-cells',
  'list-style',
  'list-style-type',
  'list-style-position',
  'list-style-image',
  'float',
  'clear',
  'break-before',
  'break-after',
  'break-inside',
  'page-break-before',
  'page-break-after',
  'page-break-inside',
  'orphans',
  'widows',
  'page',
  'marks',
  'box-decoration-break',
  '-webkit-box-decoration-break',
  'shape-outside',
  'shape-inside',
  '-webkit-shape-outside',
  '-webkit-shape-inside',
  '-webkit-shape-margin',
  '-webkit-shape-padding',
  '-webkit-shape-image-threshold',
  '-webkit-wrap-flow',
  '-webkit-wrap-margin',
  '-webkit-wrap-padding',
  '-webkit-wrap-through',
  '-webkit-flow-into',
  '-webkit-flow-from',
  '-webkit-region-fragment',
  '-webkit-region-break-after',
  '-webkit-region-break-before',
  '-webkit-region-break-inside',
  'shape-margin',
  'shape-image-threshold',
  'object-view-box',
  'image-rendering',
  '-webkit-image-rendering',
  'image-orientation',
  'content',
  'quotes',
  'speak',
  'speak-as',
  'voice-family',
  'all',
  'caret-shape',
  'cursor',
  'field-sizing',
  'interpolate-size',
  'calc-size',
  'user-modify',
  'reading-flow',
  'reading-order',
  'ruby-align',
  '-webkit-ruby-align',
  'ruby-position',
  'ruby-overhang',
  'text-emphasis',
  'text-emphasis-color',
  'text-emphasis-position',
  'text-emphasis-style',
  '-webkit-text-emphasis',
  '-webkit-text-emphasis-color',
  '-webkit-text-emphasis-position',
  '-webkit-text-emphasis-style',
  '-moz-text-emphasis',
  '-moz-text-emphasis-color',
  '-moz-text-emphasis-position',
  '-moz-text-emphasis-style',
  'text-underline-offset',
  'text-underline-position',
  'text-decoration-skip-ink',
  'text-decoration-skip',
  'math-style',
  'math-shift',
  'math-depth',
  'forced-colors-adjust',
  'masonry-auto-flow',
  'align-tracks',
  'justify-tracks',
  'max-lines',
  'continue',
  'baseline-source',
  'dominant-baseline',
  'alignment-baseline',
  'paint-order',
  'vector-effect',
  'scroll-marker-group',
  'interactivity',
  'interest-delay',
  'dynamic-range-limit',
  'contrast-color',
  'anchor-center',
  'position-try-order',
  'inset-area',
  'text-box',
  'white-space-trim',
  'text-group-align',
  'line-fit-edge',
  'corner-shape',
  'corner-top-left-shape',
  'corner-top-right-shape',
  'corner-bottom-left-shape',
  'corner-bottom-right-shape',
  'border-shape',
  'border-radius',
  '-webkit-border-radius',
  '-moz-border-radius',
  '-moz-border-radius-topleft',
  '-moz-border-radius-topright',
  '-moz-border-radius-bottomright',
  '-moz-border-radius-bottomleft',
  '-webkit-border-top-left-radius',
  '-webkit-border-top-right-radius',
  '-webkit-border-bottom-right-radius',
  '-webkit-border-bottom-left-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
  'border-start-start-radius',
  'border-start-end-radius',
  'border-end-start-radius',
  'border-end-end-radius',
  'box-sizing',
  '-webkit-box-sizing',
  'visibility',
  'shape-rendering',
  'caret-animation',
  'text-spacing',
  'text-autospace',
  'baseline-shift',
  'color-interpolation',
  'color-rendering',
  'image-resolution',
] as const;

function wrapFlowOpenTag(hostAttrs: string, inner = ''): string {
  const style = extractStyleAttr(hostAttrs);
  const parts: string[] = [];
  for (const prop of FLOW_COPIED_STYLE_PROPS) {
    const escaped = prop.replace(/-/g, '\\-');
    const value = new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`, 'i')
      .exec(style)?.[1]?.trim();
    if (value) parts.push(`${prop}:${value}`);
  }
  const hasDisplay = parts.some((part) => /^display:/i.test(part));
  const hasDirection = parts.some((part) => /^flex-direction:/i.test(part));
  const isGrid = parts.some((part) => /^display:\s*grid\b/i.test(part));
  if (looksLikeSiblingColumnRow(inner) && !hasDisplay) {
    parts.push('display:flex');
  }
  if (looksLikeSiblingColumnRow(inner) && !hasDirection && !isGrid) {
    parts.push('flex-direction:row');
  }
  if (SPLIT_COL_LAYOUT_RE.test(inner) && !SPLIT_ROW_LAYOUT_RE.test(inner) && !hasDirection && !isGrid) {
    parts.push('flex-direction:column');
  }
  const styleAttr = parts.length > 0 ? ` style="${parts.join(';')}"` : '';
  return `<div ${DECK_SLIDE_FLOW_ATTR}${styleAttr}>`;
}

function wrapNonMotifInSpan(inner: string, hostAttrs: string): string {
  if (shouldSkipSlideFlowWrap(inner)) return inner;
  const segs = listTopLevelSegments(inner);
  if (segs.length === 0) return inner;
  let out = '';
  let pending = '';
  const flushPending = () => {
    if (!pending.trim()) {
      out += pending;
      pending = '';
      return;
    }
    out += `${wrapFlowOpenTag(hostAttrs, inner)}${pending}</div>`;
    pending = '';
  };
  for (const seg of segs) {
    const raw = inner.slice(seg.start, seg.end);
    const open = openTagOf(raw);
    if (open && isMotifOrDecoAttrs(open.attrs)) {
      flushPending();
      out += raw;
      continue;
    }
    pending += raw;
  }
  flushPending();
  return out;
}

/**
 * Clip overflowing MiniMax copy inside the padded 16:9 box. Motif/deco
 * corners stay siblings so `overflow:hidden` never lands on `.slide`.
 */
export function wrapNonMotifSlideFlow(html: string): string {
  return mapSlideInners(html, (inner, span) => wrapNonMotifInSpan(inner, span.hostAttrs));
}

function collectFrameDeclarations(style: string): string {
  const source = String(style ?? "");
  const parts: string[] = [];
  const lineRe = /(?:^|;)\s*(?:border|outline)(?:-width|-color|-style)?\s*:[^;]*/gi;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(source)) !== null) parts.push(match[0]);
  FAKE_RING_SHADOW_RE.lastIndex = 0;
  const ring = FAKE_RING_SHADOW_RE.exec(source);
  if (ring) parts.push(ring[0]);
  return parts.join(";");
}

function looksLikeFakeOutlineStyle(style: string): boolean {
  const frames = collectFrameDeclarations(style);
  if (!frames || !/\b(?:1px|2px)\b/i.test(frames)) return false;
  if (KIT_SAFE_FRAME_COLOR_RE.test(frames) && !EXPLICIT_PAINT_COLOR_RE.test(frames)) {
    return false;
  }
  return EXPLICIT_PAINT_COLOR_RE.test(frames);
}

/**
 * Body `p`/`span`/`h2–h4` often carry 1–2px accent borders. Only treat them as
 * MiniMax "card" frames when padding looks card-like (≥12px, ≥0.75rem/em,
 * ≥4%, ≥2ch, ≥2vh/vw/vmin/vmax/dvh/lvh/svmin…, ≥2cqw/cqh/cqi/cqb, ≥1ic · ≥2lh/cap/ex/vb/vi,
 * or print-ish ≥8pt / ≥4mm / ≥0.4cm / ≥0.15in / ≥1pc).
 * Logical `padding-block` / `padding-inline` (+ start/end) count the same (루프74).
 */
function looksLikeCardLikePadding(style: string): boolean {
  const source = String(style ?? '');
  const padRe =
    /(?:^|;)\s*padding(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?\s*:\s*([^;]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = padRe.exec(source)) !== null) {
    const value = match[1] ?? '';
    if (/(?:^|[\s/(,])(?:1[2-9]|[2-9]\d|\d{3,})(?:\.\d+)?px\b/i.test(value)) {
      return true;
    }
    // 0.75rem / 1rem / 12em-scale card padding MiniMax sometimes emits.
    // Leading-dot `.75rem` / `.8em` (and `0.75rem`) — MiniMax/var fallbacks (루프405).
    if (/(?:^|[\s/(,])(?:0?\.(?:7[5-9]|[8-9]\d*)|[1-9]\d*(?:\.\d+)?)(?:rem|em)\b/i.test(value)) {
      return true;
    }
    // Percent / ch card padding (thin accents stay under 4% / 2ch).
    // No trailing `\b` after `%` — `%` is non-word so `\b` never matches EOS.
    if (/(?:^|[\s/(,])(?:[4-9]|[1-9]\d+)(?:\.\d+)?%(?:\s|$|[;/])/i.test(value)) {
      return true;
    }
    if (/(?:^|[\s/(,])(?:[2-9]|[1-9]\d+)(?:\.\d+)?ch\b/i.test(value)) {
      return true;
    }
    // Viewport units — ≥2vh/vw reads as card padding; 1vh/1.5vw stay accents.
    if (/(?:^|[\s/(,])(?:[2-9]|[1-9]\d+)(?:\.\d+)?(?:vh|vw|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw|lvmin|lvmax|svmin|svmax|dvmin|dvmax)\b/i.test(value)) {
      return true;
    }
    // Container query units — ≥2cqw/cqh/cqi/cqb; 1cqw stays accent.
    if (/(?:^|[\s/(,])(?:[2-9]|[1-9]\d+)(?:\.\d+)?(?:cqw|cqh|cqi|cqb|cqmin|cqmax)\b/i.test(value)) {
      return true;
    }
    // Font-relative / logical units — ≥2lh/rlh/cap/ex/vb/vi (루프23).
    // Thin 1lh / 1.5ex accents stay unbound. ≥1ic binds MiniMax ic cards (루프63).
    if (/(?:^|[\s/(,])(?:[1-9]\d*(?:\.\d+)?)(?:ic|ric)\b/i.test(value)) {
      return true;
    }
    if (/(?:^|[\s/(,])(?:[2-9]|[1-9]\d+)(?:\.\d+)?(?:lh|rlh|cap|rcap|ex|rex|vb|vi|svb|svi|lvb|lvi|dvb|dvi)\b/i.test(value)) {
      return true;
    }
    // Absolute print units — ~12px floor (루프24). Thin 2pt / 1mm stay accents.
    if (/(?:^|[\s/(,])(?:[8-9]|[1-9]\d+)(?:\.\d+)?pt\b/i.test(value)) {
      return true;
    }
    if (/(?:^|[\s/(,])(?:[4-9]|[1-9]\d+)(?:\.\d+)?mm\b/i.test(value)) {
      return true;
    }
    if (/(?:^|[\s/(,])(?:0?\.(?:[4-9]\d*|[1-9]\d+)|[1-9]\d*(?:\.\d+)?)cm\b/i.test(value)) {
      return true;
    }
    if (/(?:^|[\s/(,])(?:0?\.(?:1[5-9]\d*|[2-9]\d*)|[1-9]\d*(?:\.\d+)?)in\b/i.test(value)) {
      return true;
    }
    if (/(?:^|[\s/(,])(?:[1-9]\d*(?:\.\d+)?)pc\b/i.test(value)) {
      return true;
    }
    // CSS Q (quarter-mm) — ≥8Q ≈ 2mm card pad; thin 2Q stays accent (루프375).
    if (/(?:^|[\s/(,])(?:[8-9]|[1-9]\d+)(?:\.\d+)?Q\b/.test(value)) {
      return true;
    }
  }
  return false;
}

function stripFakeOutlineStyle(style: string): string {
  return String(style ?? "")
    .replace(/(?:^|;)\s*(?:border|outline)(?:-width|-color|-style)?\s*:[^;]*/gi, ";")
    .replace(FAKE_RING_SHADOW_RE, ";")
    .replace(/;;+/g, ";")
    .replace(/^;|;$/g, "")
    .trim();
}

function addClassToken(attrs: string, token: string): string {
  if (/\bclass\s*=/i.test(attrs)) {
    return attrs.replace(
      /\bclass\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, cls: string) => `class=${q}${String(cls).trim()} ${token}${q}`,
    );
  }
  const trimmed = attrs.trimEnd();
  const spacer = trimmed.length > 0 && !/\s$/.test(attrs) ? ' ' : '';
  return `${attrs}${spacer}class="${token}"`;
}

function pickOfficialKitCardClass(html: string): string | null {
  if (!/data-od-official-look-css/i.test(html)) return null;
  const bodies = [...String(html).matchAll(
    /<style\b[^>]*\bdata-od-official-look-css\b[^>]*>([\s\S]*?)<\/style>/gi,
  )].map((match) => match[1] ?? '').join('\n');
  if (/\.info-card\s*\{/.test(bodies)) return 'info-card';
  if (/\.card\s*\{/.test(bodies)) return 'card';
  return null;
}

const KIT_CARD_OPEN_RE =
  /<(div|aside|article|section|li|figure|main|header|footer|blockquote|nav|ul|ol|dl|dt|dd|p|span|h[1-6]|figcaption|caption|details|summary|label|output|fieldset|legend|dialog|menu|mark|time|cite|q|small|abbr|kbd|samp|dfn|table|thead|tbody|tfoot|tr|td|th|address|hgroup|search|s|u|wbr|colgroup|col|data|meter|progress|ruby|rtc|rt|rp|bdi|bdo|del|ins|sub|sup|var|code|pre|form|optgroup|option|datalist|math|mrow|semantics)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const SELECTIVE_KIT_CARD_TAGS_RE =
  /^(?:p|span|h[1-6]|figcaption|caption|details|summary|label|output|fieldset|legend|dialog|menu|mark|time|cite|q|small|abbr|kbd|samp|dfn|table|thead|tbody|tfoot|tr|td|th|data|meter|progress|ruby|rtc|rt|rp|bdi|bdo|del|ins|sub|sup|var|code|pre|optgroup|option|datalist|math|mrow|semantics|blockquote|address|hgroup|search|s|u|ul|ol|li|dl|dt|dd|figure|article|aside|header|footer|nav|main|section|form|wbr|colgroup|col)$/i;

function bindFakeOutlineCardsInSpan(html: string, cardClass: string): string {
  return html.replace(KIT_CARD_OPEN_RE, (open, tag: string, attrs: string) => {
    if (isSlideHost(attrs) || isMotifOrDecoAttrs(attrs) || isContentFooterHost(attrs)) {
      return open;
    }
    const style = extractStyleAttr(attrs);
    if (!looksLikeFakeOutlineStyle(style)) return open;
    if (SELECTIVE_KIT_CARD_TAGS_RE.test(tag) && !looksLikeCardLikePadding(style)) {
      return open;
    }
    let nextAttrs = KIT_CARD_TOKEN_RE.test(extractClassAttr(attrs))
      ? attrs
      : addClassToken(attrs, cardClass);
    nextAttrs = nextAttrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, current: string) => `style=${q}${stripFakeOutlineStyle(current)}${q}`,
    );
    return open.replace(attrs, nextAttrs);
  });
}

/**
 * Official look CSS already defines `.info-card` / `.card`. MiniMax inline
 * 1–2px navy/blue outlines win over those rules — strip the fake frame and
 * bind the kit class so persist can show the selected template.
 */
export function bindFakeOutlineCardsToOfficialKit(html: string): string {
  const cardClass = pickOfficialKitCardClass(html);
  if (!cardClass) return String(html ?? '');
  return mapSlideInners(html, (inner) => bindFakeOutlineCardsInSpan(inner, cardClass));
}

function injectFixedCanvasStyle(html: string): string {
  const pinRe = new RegExp(
    `(<style\\b[^>]*\\b${DECK_FIXED_CANVAS_PIN_ATTR}\\b[^>]*>)([\\s\\S]*?)(<\\/style>)`,
    'i',
  );
  const existing = pinRe.exec(html);
  if (existing) {
    const body = existing[2] ?? '';
    // Upgrade pre-§0.73 pin sheets that still force overflow:hidden (§0.76)
    // and pre-contain sheets that let overflowing MiniMax grids grow the stage.
    if (
      /\.slide\s*\{[^}]*overflow\s*:\s*(?:hidden|clip)/i.test(body)
      || !/overflow\s*:\s*visible/i.test(body)
      || !/contain\s*:\s*layout/i.test(body)
      || !/data-od-slide-flow/i.test(body)
      || !/:has\(\.split-left\)/i.test(body)
      || !/:has\(\.col-left\)/i.test(body)
    ) {
      return html.replace(pinRe, `$1\n${FIXED_CANVAS_CSS}\n$3`);
    }
    return html;
  }
  const tag = `<style ${DECK_FIXED_CANVAS_PIN_ATTR}>\n${FIXED_CANVAS_CSS}\n</style>`;
  if (/<\/head\s*>/i.test(html)) {
    return html.replace(/<\/head\s*>/i, `${tag}</head>`);
  }
  if (/<body\b/i.test(html)) {
    return html.replace(/<body\b[^>]*>/i, (open) => `${open}\n${tag}`);
  }
  return `${tag}\n${html}`;
}

const NEUTRAL_FALLBACK_PAINT_RE =
  /#(?:0f172a|1e293b|111827|0b1220|f8fafc|f1f5f9)(?![0-9a-f])/i;
const KIT_IDENTITY_SLIDE_CLASS_RE =
  /\b(?:tpl-|theme-|slide-red|s-cover|s-body|scanlines|hermes)\b/i;

function looksLikeCatalogPresenterShell(html: string): boolean {
  return (
    /<div\b[^>]*\bid\s*=\s*["']deck(?:-track)?["']/i.test(html)
    || /<(?:div|section)\b[^>]*\bclass\s*=\s*['"][^'"]*\bslide-deck\b/i.test(html)
    || /<(?:div|section)\b[^>]*\bclass\s*=\s*['"][^'"]*\bpresentation\b/i.test(html)
  );
}

function shouldApplyCompactCanvasHeals(html: string): boolean {
  if (looksLikeOfficialFullscreenPresenterDeck(html)) return false;
  if (looksLikeCatalogPresenterShell(html)) return false;
  return true;
}

function stripNeutralFallbackHostStyle(style: string): string | null {
  const source = String(style ?? '');
  if (!NEUTRAL_FALLBACK_PAINT_RE.test(source)) return null;
  const next = source
    .replace(/(?:^|;)\s*background(?:-color|-image)?\s*:[^;]*/gi, (decl) => (
      NEUTRAL_FALLBACK_PAINT_RE.test(decl) ? ';' : decl
    ))
    .replace(/(?:^|;)\s*color\s*:[^;]*/gi, (decl) => (
      NEUTRAL_FALLBACK_PAINT_RE.test(decl) ? ';' : decl
    ))
    .replace(/;;+/g, ';')
    .replace(/^;|;$/g, '')
    .trim();
  return next;
}

function looksLikeFullBleedSurface(style: string): boolean {
  const source = String(style ?? '');
  if (!source.trim()) return false;
  if (/position\s*:\s*absolute/i.test(source) && /\binset\s*:\s*0\b/i.test(source)) {
    return true;
  }
  const fullSize = /(?:^|;)\s*width\s*:\s*100(?:%|vw)\b/i.test(source)
    && /(?:^|;)\s*height\s*:\s*100(?:%|vh)\b/i.test(source);
  if (!fullSize) return false;
  return /position\s*:\s*absolute/i.test(source)
    || /(?:^|;)\s*top\s*:\s*0(?:px)?\b/i.test(source);
}

function stripNeutralFallbackInnerPaint(inner: string): string {
  const segs = listTopLevelSegments(inner);
  let next = inner;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const seg = segs[i]!;
    const raw = next.slice(seg.start, seg.end);
    const open = openTagOf(raw);
    if (!open) continue;
    if (isMotifOrDecoAttrs(open.attrs) || isContentFooterHost(open.attrs)) continue;
    if (KIT_IDENTITY_SLIDE_CLASS_RE.test(extractClassAttr(open.attrs))) continue;
    const style = extractStyleAttr(open.attrs);
    if (!looksLikeFullBleedSurface(style)) continue;
    const stripped = stripNeutralFallbackHostStyle(style);
    if (stripped == null) continue;
    const nextRaw = raw.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string) => `style=${q}${stripped}${q}`,
    );
    next = `${next.slice(0, seg.start)}${nextRaw}${next.slice(seg.end)}`;
  }
  return next;
}

/**
 * MiniMax compact samples paint `#0f172a` / cream gradients inline. Those
 * beat official look `.slide { background: var(--paper) }` after merge.
 * Full-bleed inner panels are stripped the same way — host-only strip
 * leaves an overlay that still hides official paper.
 */
export function stripNeutralFallbackSlidePaint(html: string): string {
  const source = String(html ?? '');
  if (!/\bdata-od-official-look-css\b/i.test(source)) return source;
  const hosts = source.replace(SLIDE_OPEN_RE, (open, _tag: string, attrs: string) => {
    if (!isSlideHost(attrs)) return open;
    if (KIT_IDENTITY_SLIDE_CLASS_RE.test(extractClassAttr(attrs))) return open;
    if (!/\bstyle\s*=/i.test(attrs)) return open;
    const nextAttrs = attrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, style: string) => {
        const next = stripNeutralFallbackHostStyle(style);
        return next == null ? `style=${q}${style}${q}` : `style=${q}${next}${q}`;
      },
    );
    return open.replace(attrs, nextAttrs);
  });
  return mapSlideInners(hosts, (inner) => stripNeutralFallbackInnerPaint(inner));
}

/**
 * Official look CSS owns type. MiniMax inline `font-family` on slide hosts
 * (Quicksand / Neutral samples) beats heading lock after merge.
 */
export function stripInlineSlideTypeOnOfficialLook(html: string): string {
  const source = String(html ?? '');
  if (!/\bdata-od-official-look-css\b/i.test(source)) return source;
  return source.replace(SLIDE_OPEN_RE, (open, _tag: string, attrs: string) => {
    if (!isSlideHost(attrs)) return open;
    if (KIT_IDENTITY_SLIDE_CLASS_RE.test(extractClassAttr(attrs))) return open;
    const style = extractStyleAttr(attrs);
    if (!/(?:^|;)\s*font-family\s*:/i.test(style)) return open;
    const nextAttrs = attrs.replace(
      /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, current: string) => {
        const next = String(current)
          .replace(/(?:^|;)\s*font-family\s*:[^;]*/gi, ';')
          .replace(/;;+/g, ';')
          .replace(/^;|;$/g, '')
          .trim();
        return `style=${q}${next}${q}`;
      },
    );
    return open.replace(attrs, nextAttrs);
  });
}

export type PinDeckSlidesToFixedCanvasOptions = {
  /**
   * Compact letterbox path: pin even when the HTML is still classified as an
   * official fullscreen presenter (Studio/Grove `#deck` viewport strips).
   * Without force, catalog dual-classification skips the pin and leaves
   * 100vw/100vh hosts fighting the stacked 1920×1080 stage (§0.93).
   */
  force?: boolean;
};

/**
 * Rewrite body-first / freeform deck slide hosts to a fixed 1920×1080 canvas.
 * No-ops for official fullscreen catalog presenters and non-slide HTML
 * unless `force` is set for compact letterbox dual-classification.
 */
export function pinDeckSlidesToFixedCanvas(
  html: string,
  options?: PinDeckSlidesToFixedCanvasOptions,
): string {
  const source = String(html ?? '');
  if (!source.trim()) return source;
  if (!options?.force && looksLikeOfficialFullscreenPresenterDeck(source)) return source;
  if (countSlideHosts(source) === 0) return source;

  let out = source.replace(SLIDE_OPEN_RE, (open, _tag: string, attrs: string) => {
    if (!isSlideHost(attrs)) return open;
    return pinSlideOpenTag(open, attrs);
  });
  out = flowAbsoluteSlideFooters(out);
  // MiniMax compact / body-first fills need overlapping-card flow.
  // Catalog `#deck` / `.presentation` shells keep authored absolute layouts
  // even after official-look CSS merge (look attr would otherwise flip
  // looksLikeOfficialFullscreenPresenterDeck to false).
  if (shouldApplyCompactCanvasHeals(source)) {
    out = stripNeutralFallbackSlidePaint(out);
    out = stripInlineSlideTypeOnOfficialLook(out);
    out = stripFloatingDeckIndexBadges(out);
    out = flowAbsoluteNonMotifSlideContent(out);
    out = bindFakeOutlineCardsToOfficialKit(out);
    out = wrapNonMotifSlideFlow(out);
  }
  out = injectFixedCanvasStyle(out);
  return out;
}
