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
    const close = new RegExp(`</${open.tag}\\s*>`, 'i').exec(chunk);
    return {
      start: open.openEnd,
      end: close ? open.openEnd + close.index : limit,
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
  /^\d{2}\s*\/\s*[A-Za-z가-힣][A-Za-z가-힣\s-]{1,20}$/;

const KIT_CARD_TOKEN_RE = /\b(?:info-card|stat-card|card)\b/i;
const FAKE_OUTLINE_COLOR_RE =
  /#(?:0f172a|1e293b|111827|0b1220|1d4ed8|2563eb|3b82f6|1e40af|1e3a8a|172554|1e3a5f|4f46e5|6366f1|4338ca|312e81|0000ff|00f\b)|(?:\bnavy\b|\broyalblue\b|\bmediumblue\b|\bindigo\b)/i;
const SPLIT_LAYOUT_RE = /\bsplit-(?:left|right|pane|top|bottom)\b/i;

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
  if (/^(span|small|label|em|strong|b|i)$/i.test(tag)) return true;
  // MiniMax often parks "05 / CHECKLIST" on absolute `div`/`p` chrome.
  // Keep in-flow template chrome like `.slide-chrome` / `01 / Studio`.
  if (!/^(div|p)$/i.test(tag)) return false;
  if (/\bslide-chrome\b/i.test(attrs)) return false;
  const style = extractStyleAttr(attrs);
  if (/position\s*:\s*absolute/i.test(style)) return true;
  return /\b(?:badge|index|overlay|page-label|slide-label|kicker)\b/i.test(attrs);
}

function stripFloatingIndexBadgesInSpan(inner: string): string {
  const segs = listTopLevelSegments(inner);
  let next = inner;
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const seg = segs[i]!;
    const raw = next.slice(seg.start, seg.end);
    const open = openTagOf(raw);
    if (!open) continue;
    if (!isFloatingIndexBadgeHost(open.tag, open.attrs)) continue;
    if (isMotifOrDecoAttrs(open.attrs) || isContentFooterHost(open.attrs)) continue;
    if (!INDEX_BADGE_TEXT_RE.test(innerTextOf(raw))) continue;
    next = `${next.slice(0, seg.start)}${next.slice(seg.end)}`;
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

function shouldSkipSlideFlowWrap(inner: string, hostAttrs: string): boolean {
  if (new RegExp(`\\b${DECK_SLIDE_FLOW_ATTR}\\b`, 'i').test(inner)) return true;
  if (SPLIT_LAYOUT_RE.test(inner)) return true;
  const style = extractStyleAttr(hostAttrs);
  return /display\s*:\s*grid/i.test(style);
}

function wrapFlowOpenTag(hostAttrs: string): string {
  const style = extractStyleAttr(hostAttrs);
  const justify = /justify-content\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const align = /align-items\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
  const parts: string[] = [];
  if (justify) parts.push(`justify-content:${justify}`);
  if (align) parts.push(`align-items:${align}`);
  const styleAttr = parts.length > 0 ? ` style="${parts.join(';')}"` : '';
  return `<div ${DECK_SLIDE_FLOW_ATTR}${styleAttr}>`;
}

function wrapNonMotifInSpan(inner: string, hostAttrs: string): string {
  if (shouldSkipSlideFlowWrap(inner, hostAttrs)) return inner;
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
    out += `${wrapFlowOpenTag(hostAttrs)}${pending}</div>`;
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

function looksLikeFakeOutlineStyle(style: string): boolean {
  const source = String(style ?? '');
  if (!/(?:^|;)\s*(?:border|outline)(?:-width|-color|-style)?\s*:/i.test(source)) return false;
  if (!/\b(?:1px|2px)\b/i.test(source)) return false;
  return FAKE_OUTLINE_COLOR_RE.test(source);
}

function stripFakeOutlineStyle(style: string): string {
  return String(style ?? '')
    .replace(/(?:^|;)\s*(?:border|outline)(?:-width|-color|-style)?\s*:[^;]*/gi, ';')
    .replace(/;;+/g, ';')
    .replace(/^;|;$/g, '')
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
  /<(div|aside|article|section)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

function bindFakeOutlineCardsInSpan(html: string, cardClass: string): string {
  return html.replace(KIT_CARD_OPEN_RE, (open, _tag: string, attrs: string) => {
    if (isSlideHost(attrs) || isMotifOrDecoAttrs(attrs) || isContentFooterHost(attrs)) {
      return open;
    }
    const style = extractStyleAttr(attrs);
    if (!looksLikeFakeOutlineStyle(style)) return open;
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

/**
 * MiniMax compact samples paint `#0f172a` / cream gradients inline. Those
 * beat official look `.slide { background: var(--paper) }` after merge.
 */
export function stripNeutralFallbackSlidePaint(html: string): string {
  const source = String(html ?? '');
  if (!/\bdata-od-official-look-css\b/i.test(source)) return source;
  return source.replace(SLIDE_OPEN_RE, (open, _tag: string, attrs: string) => {
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
    out = stripFloatingDeckIndexBadges(out);
    out = flowAbsoluteNonMotifSlideContent(out);
    out = bindFakeOutlineCardsToOfficialKit(out);
    out = wrapNonMotifSlideFlow(out);
  }
  out = injectFixedCanvasStyle(out);
  return out;
}
