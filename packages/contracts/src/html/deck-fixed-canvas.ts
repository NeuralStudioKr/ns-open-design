/**
 * Force Teamver slide hosts onto a fixed 1920×1080 (16:9) canvas.
 *
 * Freeform / BYOK fills often copy Neutral samples with `min-height:100vh` or
 * wrap slides in `.presentation` / `.deck`. Without this pin the tall preview
 * panel treats each slide as a full document viewport (portrait scroll).
 */

import { looksLikeOfficialFullscreenPresenterDeck } from './deck-template-look-css.js';

export const DECK_FIXED_CANVAS_PIN_ATTR = 'data-od-deck-fixed-canvas-pin';

const SLIDE_OPEN_RE =
  /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

const FIXED_CANVAS_STYLE =
  'width:1920px;height:1080px;box-sizing:border-box';

const FIXED_CANVAS_CSS = `
/* Teamver fixed 16:9 canvas pin (size only; Motif-safe — no overflow clip) */
html, body { margin: 0; }
.slide,
[data-screen-label],
section[data-slide],
main[data-slide],
article[data-slide],
.deck-slide,
.ppt-slide {
  width: 1920px !important;
  height: 1080px !important;
  min-width: 1920px !important;
  min-height: 1080px !important;
  max-width: 1920px !important;
  max-height: 1080px !important;
  box-sizing: border-box !important;
  overflow: visible !important;
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
  if (/\bslide\b/i.test(extractClassAttr(source))) return true;
  if (!/\bdata-screen-label\s*=/i.test(source)) return false;
  if (/\bdata-screen-label\s*=\s*(['"])\d{2}(?:\s|\1)/i.test(source)) return true;
  const style = extractStyleAttr(source);
  return hasFixedCanvasSizing(style) || hasViewportSlideSizing(style);
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

function injectFixedCanvasStyle(html: string): string {
  const pinRe = new RegExp(
    `(<style\\b[^>]*\\b${DECK_FIXED_CANVAS_PIN_ATTR}\\b[^>]*>)([\\s\\S]*?)(<\\/style>)`,
    'i',
  );
  const existing = pinRe.exec(html);
  if (existing) {
    const body = existing[2] ?? '';
    // Upgrade pre-§0.73 pin sheets that still force overflow:hidden (§0.76).
    if (
      /overflow\s*:\s*(?:hidden|clip)/i.test(body)
      || !/overflow\s*:\s*visible/i.test(body)
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

/**
 * Rewrite body-first / freeform deck slide hosts to a fixed 1920×1080 canvas.
 * No-ops for official fullscreen catalog presenters and non-slide HTML.
 */
export function pinDeckSlidesToFixedCanvas(html: string): string {
  const source = String(html ?? '');
  if (!source.trim()) return source;
  if (looksLikeOfficialFullscreenPresenterDeck(source)) return source;
  if (countSlideHosts(source) === 0) return source;

  let out = source.replace(SLIDE_OPEN_RE, (open, _tag: string, attrs: string) => {
    if (!isSlideHost(attrs)) return open;
    return pinSlideOpenTag(open, attrs);
  });
  out = flowAbsoluteSlideFooters(out);
  out = injectFixedCanvasStyle(out);
  return out;
}
