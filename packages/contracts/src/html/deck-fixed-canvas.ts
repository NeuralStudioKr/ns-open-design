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
.slide {
  width: 1920px !important;
  height: 1080px !important;
  min-width: 1920px !important;
  min-height: 1080px !important;
  max-width: 1920px !important;
  max-height: 1080px !important;
  box-sizing: border-box !important;
}
`.trim();

function extractClassAttr(attrs: string): string {
  const match = attrs.match(/\bclass\s*=\s*(['"])([\s\S]*?)\1/i);
  return match?.[2] ?? '';
}

function isSlideHost(attrs: string): boolean {
  return /\bslide\b/i.test(extractClassAttr(attrs));
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

function pinInlineSlideStyle(style: string): string {
  let next = String(style ?? '');
  // Already a fixed 16:9 canvas without viewport sizing — keep authored
  // flex/grid axis declarations intact for split layouts.
  if (hasFixedCanvasSizing(next) && !hasViewportSlideSizing(next)) {
    if (!/\bbox-sizing\s*:/i.test(next)) next = `${next};box-sizing:border-box`;
    // Do not force overflow:hidden — Motif corner hangs must remain visible.
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
  // Size pin only — overflow:hidden clips Daisy Motif corner hangs (§0.71).
  next = next.replace(/\bmin-height\s*:\s*100(?:vh|dvh|svh|lvh)\b/gi, 'min-height:1080px');
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

function injectFixedCanvasStyle(html: string): string {
  if (new RegExp(`<style\\b[^>]*\\b${DECK_FIXED_CANVAS_PIN_ATTR}\\b`, 'i').test(html)) {
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
  out = injectFixedCanvasStyle(out);
  return out;
}
