import { repairArtifactStyleSheets } from '@open-design/contracts';

/**
 * Preview letterbox / inner-paper bleed repair.
 *
 * Daisy Days fill often paints cream only on an inner panel (or only on
 * `.slide`) while `html`/`body` stay white. The Teamver scaled preview then
 * shows white bands above/below the cream rectangle — users read that as a
 * "background color bug" even when palette tokens are otherwise correct.
 *
 * Promote the inferred paper surface onto `html`/`body` (and `.slide` only when
 * the slide itself is still white). Do not `!important`-flatten per-slide
 * radial washes — Capsule / html-ppt fills paint gradients on `.slide`.
 */

const SURFACE_STYLE_ATTR = 'data-od-slide-surface-bleed';

const SURFACE_STYLE_RE = new RegExp(
  `<style\\b[^>]*\\b${SURFACE_STYLE_ATTR}\\b[^>]*>[\\s\\S]*?<\\/style>`,
  'i',
);

const WHITE_OR_EMPTY_RE =
  /^(?:#fff(?:fff)?|white|transparent|inherit|initial|unset|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*1(?:\.0+)?\s*\))?$/i;

const SLIDE_OPEN_RE =
  /<(section|div)\b([^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'|[^\s"'=<>]*\bslide\b[^\s"'=<>]*)[^>]*)>/gi;

function isWhiteOrEmptyBackground(value: string | null | undefined): boolean {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return true;
  return WHITE_OR_EMPTY_RE.test(trimmed);
}

/** Radial washes / images must not be flattened by paper-token !important. */
function isDecorativeBackground(value: string | null | undefined): boolean {
  return /gradient\s*\(|\burl\s*\(|image-set\s*\(/i.test(String(value ?? ''));
}

function extractSlideBackground(html: string): string | null {
  return (
    extractInlineSlideBackground(html)
    ?? extractRuleBackground(html, /^(?:[a-z][a-z0-9]*)?\.slide$/i)
  );
}

/**
 * Persist sanitize used to cut Google Fonts `@import` at the first `;` inside
 * the css2 URL, leaving `1,6..96…swap');` at the start of `<style>` — Motif
 * class rules then fail for Capsule, Daisy, Hermes, Sakura, etc.
 * Use the shared catalog-wide style repair (not a Capsule-only remnant regex).
 */
function repairOrphanFontImportDebrisInStyles(html: string): string {
  return repairArtifactStyleSheets(html);
}

function surfaceBleedSelectors(preserveSlidePaint: boolean): string {
  return preserveSlidePaint
    ? 'html, body'
    : 'html, body, .slide, section.slide';
}

function renderSurfaceBleedStyle(paper: DeckSlidePaperSurface, preserveSlidePaint: boolean): string {
  return [
    `<style ${SURFACE_STYLE_ATTR}>`,
    `${surfaceBleedSelectors(preserveSlidePaint)} { background: ${paper.background} !important; color: ${paper.color} !important; }`,
    '</style>',
  ].join('');
}

function bleedStyleTargetsSlides(html: string): boolean {
  return /\.slide\b/i.test(html.match(SURFACE_STYLE_RE)?.[0] ?? '');
}

function readBackgroundFromStyleDecl(style: string | null | undefined): string | null {
  const raw = String(style ?? '');
  const match = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(raw);
  const value = match?.[1]?.trim() ?? '';
  return value || null;
}

function readColorFromStyleDecl(style: string | null | undefined): string | null {
  const raw = String(style ?? '');
  const match = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(raw);
  const value = match?.[1]?.trim() ?? '';
  return value || null;
}

function extractCssVarLiteral(html: string, names: readonly string[]): string | null {
  for (const name of names) {
    const pattern = new RegExp(
      `--${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;}\\n]+)`,
      'i',
    );
    const raw = pattern.exec(html)?.[1]?.trim() ?? '';
    if (!raw) continue;
    if (/^var\(/i.test(raw)) continue;
    if (/^#|^rgb|^hsl|^oklch|^oklab|^color-mix/i.test(raw)) return raw;
  }
  return null;
}

function extractRuleBackground(html: string, selectorHint: RegExp): string | null {
  const sheets = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n');
  if (!sheets.trim()) return null;
  for (const rule of sheets.matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((part) => part.trim());
    if (!selectors.some((selector) => selectorHint.test(selector))) continue;
    const background = readBackgroundFromStyleDecl(rule[2] ?? '');
    if (background && !isWhiteOrEmptyBackground(background)) return background;
  }
  return null;
}

function extractInlineSlideBackground(html: string): string | null {
  SLIDE_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLIDE_OPEN_RE.exec(html)) !== null) {
    const attrs = match[2] ?? '';
    const style =
      /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]
      ?? /style\s*=\s*'([^']*)'/i.exec(attrs)?.[1]
      ?? '';
    const background = readBackgroundFromStyleDecl(style);
    if (background && !isWhiteOrEmptyBackground(background)) return background;
  }
  return null;
}

function extractBodyBackground(html: string): string | null {
  const bodyOpen = /<body\b([^>]*)>/i.exec(html)?.[1] ?? '';
  const inline =
    /style\s*=\s*"([^"]*)"/i.exec(bodyOpen)?.[1]
    ?? /style\s*=\s*'([^']*)'/i.exec(bodyOpen)?.[1]
    ?? '';
  const fromInline = readBackgroundFromStyleDecl(inline);
  if (fromInline && !isWhiteOrEmptyBackground(fromInline)) return fromInline;
  return extractRuleBackground(html, /^(?:html|body|html\s+body)$/i);
}

function extractInnerPaperBackground(html: string): string | null {
  // Prefer a near-full-bleed inner panel (common fill failure: cream card
  // smaller than 1920×1080 sitting on a white `.slide`).
  const candidates: Array<{ background: string; score: number }> = [];
  for (const match of html.matchAll(
    /<(?:div|section|article|main)\b([^>]*style\s*=\s*(?:"[^"]*"|'[^']*')[^>]*)>/gi,
  )) {
    const attrs = match[1] ?? '';
    if (/\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*')/i.test(attrs)) {
      continue;
    }
    const style =
      /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]
      ?? /style\s*=\s*'([^']*)'/i.exec(attrs)?.[1]
      ?? '';
    const background = readBackgroundFromStyleDecl(style);
    if (!background || isWhiteOrEmptyBackground(background)) continue;
    const width = /(?:^|;)\s*width\s*:\s*([\d.]+)px/i.exec(style)?.[1];
    const height = /(?:^|;)\s*height\s*:\s*([\d.]+)px/i.exec(style)?.[1];
    const w = width ? Number(width) : 0;
    const h = height ? Number(height) : 0;
    let score = 1;
    if (w >= 1500) score += 3;
    if (h >= 800) score += 3;
    if (w >= 1800 && h >= 1000) score += 4;
    if (/position\s*:\s*absolute/i.test(style) && /inset\s*:\s*0|top\s*:\s*0/i.test(style)) {
      score += 2;
    }
    candidates.push({ background, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.score && candidates[0].score >= 4
    ? candidates[0].background
    : null;
}

export type DeckSlidePaperSurface = {
  background: string;
  color: string;
};

/**
 * Infer the deck paper color that should fill html/body/.slide edge-to-edge.
 */
export function inferDeckSlidePaperSurface(html: string): DeckSlidePaperSurface | null {
  const source = String(html ?? '');
  if (!source.trim()) return null;

  const background =
    extractCssVarLiteral(source, ['cream', 'paper', 'surface', 'bg', 'background'])
    ?? extractRuleBackground(source, /^(?:[a-z][a-z0-9]*)?\.slide$/i)
    ?? extractInlineSlideBackground(source)
    ?? extractInnerPaperBackground(source);
  if (!background || isWhiteOrEmptyBackground(background)) return null;

  const color =
    extractCssVarLiteral(source, ['text-dark', 'text', 'ink', 'foreground', 'black'])
    ?? extractRuleBackgroundColor(source)
    ?? '#2D2D2D';

  return { background, color };
}

function extractRuleBackgroundColor(html: string): string | null {
  const sheets = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n');
  for (const rule of sheets.matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((part) => part.trim());
    if (!selectors.some((selector) => /^(?:html|body|[a-z]*\.slide)$/i.test(selector))) {
      continue;
    }
    const color = readColorFromStyleDecl(rule[2] ?? '');
    if (color && !isWhiteOrEmptyBackground(color)) return color;
  }
  return null;
}

function bodyOrSlideNeedsSurfacePromotion(
  html: string,
  paper: DeckSlidePaperSurface,
  preserveSlidePaint: boolean,
): boolean {
  const bodyBg = extractBodyBackground(html);
  const slideBg = extractSlideBackground(html);
  const norm = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  const paperNorm = norm(paper.background);

  const bodyMissing = isWhiteOrEmptyBackground(bodyBg);
  if (preserveSlidePaint) {
    // Letterbox only — do not treat a gradient slide as "disagreeing" with --bg.
    if (bodyMissing) return true;
    return Boolean(bodyBg && norm(bodyBg) !== paperNorm && !isDecorativeBackground(bodyBg));
  }

  const slideMissing = isWhiteOrEmptyBackground(slideBg);
  if (bodyMissing || slideMissing) return true;

  // Body/slide disagree with inferred paper (e.g. white body + cream slide).
  if (bodyBg && norm(bodyBg) !== paperNorm) return true;
  if (slideBg && norm(slideBg) !== paperNorm) return true;
  return false;
}

/**
 * Inject a full-bleed paper surface onto html/body/.slide when the deck's
 * cream/pastel paper is only applied to an inner panel or slide-only, leaving
 * white letterbox bands in the Teamver preview.
 */
export function repairDeckSlideSurfaceBleed(html: string): string {
  const source = repairOrphanFontImportDebrisInStyles(String(html ?? ''));
  if (!source.trim()) return source;
  if (!/\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'|[^\s"'=<>]*\bslide\b)/i.test(source)) {
    return source;
  }

  const paper = inferDeckSlidePaperSurface(source);
  const preserveSlidePaint = isDecorativeBackground(extractSlideBackground(source));
  const hasBleed = new RegExp(`\\b${SURFACE_STYLE_ATTR}\\b`, 'i').test(source);

  if (hasBleed) {
    if (paper && preserveSlidePaint && bleedStyleTargetsSlides(source)) {
      return source.replace(SURFACE_STYLE_RE, renderSurfaceBleedStyle(paper, true));
    }
    return source;
  }

  if (!paper) return source;
  if (!bodyOrSlideNeedsSurfacePromotion(source, paper, preserveSlidePaint)) return source;

  const style = renderSurfaceBleedStyle(paper, preserveSlidePaint);

  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${style}</body>`);
  }
  if (/<body\b[^>]*>/i.test(source)) {
    return source.replace(/<body\b[^>]*>/i, (open) => `${open}${style}`);
  }
  return `${style}${source}`;
}
