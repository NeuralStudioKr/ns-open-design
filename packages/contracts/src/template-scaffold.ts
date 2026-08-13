/**
 * Build a Teamver-ready **content-swap scaffold** from a deck template's
 * `example.html` preview.
 *
 * Product rule: when the user picks a visual template, the model must start
 * FROM the template's real HTML/CSS/SVG structure and only replace text /
 * list / image content for the user brief — not reinvent a "similar vibe"
 * from a compact visual-kit nuance block.
 *
 * Full Daisy Days `example.html` is ~87KB (too large for BYOK system prompts
 * and invites incomplete-html-document-shell). This extractor keeps shared
 * CSS + a capped set of slide shells, dedupes Motif SVGs, and emits a
 * body-first document the model can copy.
 */

import { extractTemplateVisualKitFromHtml } from './template-visual-kit.js';

export const TEMPLATE_SCAFFOLD_MARKER = '## Template scaffold (CONTENT-SWAP BASE)';

const DEFAULT_SCAFFOLD_MAX_CHARS = 16_000;
const DEFAULT_MAX_SLIDES = 6;

function compressCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFontImport(html: string): string | null {
  const linkMatch =
    /href=("|\')([^"']*fonts\.googleapis\.com\/css2\?[^"']+)\1/i.exec(html)
    ?? /href=("|\')([^"']*fonts\.googleapis\.com\/css\?[^"']+)\1/i.exec(html);
  if (linkMatch?.[2]) {
    return `@import url('${linkMatch[2]}');`;
  }
  return null;
}

function extractStyleSheets(html: string): string {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n');
}

function listSlideSections(html: string): string[] {
  return [...html.matchAll(
    /<section\b[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'|[^\s"'`=<>]*\bslide\b[^\s"'`=<>]*)[^>]*>[\s\S]*?<\/section>/gi,
  )].map((match) => match[0] ?? '').filter(Boolean);
}

/** Pick cover + evenly spaced body slides up to maxSlides. */
function pickScaffoldSlides(slides: string[], maxSlides: number): string[] {
  if (slides.length <= maxSlides) return slides;
  const out: string[] = [slides[0]!];
  const remaining = maxSlides - 1;
  if (remaining <= 0) return out;
  const body = slides.slice(1);
  if (body.length <= remaining) return [...out, ...body];
  for (let i = 0; i < remaining; i += 1) {
    const idx = Math.round((i * (body.length - 1)) / Math.max(1, remaining - 1));
    const slide = body[idx]!;
    if (!out.includes(slide)) out.push(slide);
  }
  // Fill if rounding collided.
  for (const slide of body) {
    if (out.length >= maxSlides) break;
    if (!out.includes(slide)) out.push(slide);
  }
  return out.slice(0, maxSlides);
}

function extractMotifSpritePool(html: string): string[] {
  // Reuse the hardened kit classifier via a temporary kit extract so daisy
  // (not cloud) wins — then pull complete SVG fences from that kit.
  // Use the same default budget as the hot-path kit so daisy+star+rainbow
  // survive (8.8KB historically dropped the petal daisy under star/rainbow).
  const kit = extractTemplateVisualKitFromHtml(html, { maxChars: 11_000, title: 'scaffold' });
  if (!kit) return [];
  const sprites: string[] = [];
  for (const match of kit.matchAll(/```html\s*([\s\S]*?)```/gi)) {
    const svg = (match[1] ?? '').trim();
    if (/^<svg\b/i.test(svg) && /<\/svg>/i.test(svg)) sprites.push(svg);
  }
  return sprites.slice(0, 3);
}

function replaceSvgsWithSpritePool(sectionHtml: string, sprites: string[]): string {
  if (sprites.length === 0) {
    return sectionHtml.replace(/<svg\b[\s\S]*?<\/svg>/gi, '');
  }
  let i = 0;
  return sectionHtml.replace(/<svg\b[\s\S]*?<\/svg>/gi, () => {
    const sprite = sprites[i % sprites.length]!;
    i += 1;
    return sprite;
  });
}

function stripScriptsAndNav(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<div\b[^>]*\b(?:nav-dots|slide-counter)\b[^>]*>[\s\S]*?<\/div>/gi, '');
}

function teamverSlideCssOverrides(): string {
  return [
    'html,body{margin:0;padding:0;background:var(--cream,#F5F0E6);color:var(--text-dark,#2D2D2D);font-family:var(--font-body),system-ui,sans-serif}',
    '.slides-container{width:auto;height:auto;overflow:visible;scroll-snap-type:none}',
    '.slide{width:1920px;height:1080px;min-height:1080px;max-height:1080px;padding:64px 80px;box-sizing:border-box;position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;align-items:stretch;scroll-snap-align:none}',
    '.nav-dots,.slide-counter,.nav-dot{display:none!important}',
    '.deco{position:absolute;pointer-events:none;z-index:1}',
    '.deco svg{width:100%;height:100%;display:block}',
  ].join('');
}

function prepareSharedCss(html: string, budget: number): string {
  const raw = extractStyleSheets(html);
  let css = compressCss(raw);
  // Drop interactive chrome that Teamver decks do not use.
  css = css
    .replace(/\.nav-dots[^{]*\{[^}]*\}/gi, '')
    .replace(/\.nav-dot[^{]*\{[^}]*\}/gi, '')
    .replace(/\.nav-dot\.active[^{]*\{[^}]*\}/gi, '')
    .replace(/\.slide-counter[^{]*\{[^}]*\}/gi, '');
  const overrides = teamverSlideCssOverrides();
  let out = `${overrides}${css}`;
  if (out.length > budget) {
    out = out.slice(0, budget);
    // Avoid cutting mid-rule when possible.
    const lastBrace = out.lastIndexOf('}');
    if (lastBrace > budget * 0.6) out = out.slice(0, lastBrace + 1);
  }
  return out;
}

function normalizeSlideShell(sectionHtml: string): string {
  let out = sectionHtml.trim();
  // Ensure class keeps `slide` and force Teamver canvas size via style attr.
  if (!/\bstyle\s*=/i.test(out)) {
    out = out.replace(
      /^(<section\b[^>]*)(>)/i,
      '$1 style="width:1920px;height:1080px;box-sizing:border-box"$2',
    );
  }
  return out;
}

function buildScaffoldMarkdown(options: {
  title: string;
  fontImport: string | null;
  css: string;
  slides: string[];
}): string {
  const [first, ...rest] = options.slides;
  if (!first) return '';
  const styleBlock = `<style>\n${options.fontImport ? `${options.fontImport}\n` : ''}${options.css}\n</style>`;
  const scaffoldHtml = [
    '<!doctype html>',
    '<html lang="ko">',
    '<body style="margin:0">',
    first,
    styleBlock,
    ...rest,
    '</body>',
    '</html>',
  ].join('\n');

  return [
    `${TEMPLATE_SCAFFOLD_MARKER} — ${options.title}`,
    '',
    'This HTML is the **authoritative working document** for the selected template.',
    '**CONTENT-SWAP ONLY:** start from this scaffold. Replace visible text (headings, paragraphs, list items, badges, labels, chart captions) so the deck matches the user brief / source material.',
    '**KEEP verbatim:** every `class`, the `<style>` block, Motif `<svg>` sprites, `.deco` wrappers, borders, shadows, radii, and fonts. Do NOT invent a new palette, typography, or ellipse/emoji daisy.',
    '**Slide count:** duplicate or drop whole `<section class="slide">` blocks from this scaffold to hit the requested count — do not invent new layout shells.',
    '**Forbidden:** OD skeleton terracotta `#c96442`, Neutral slate `#0f172a`, Noto-only covers that ignore scaffold fonts, emoji ornament rows as motif substitutes.',
    'Emit ONE `<artifact type="deck" identifier="deck">` whose body is this scaffold with content swapped. Prefer the scaffold byte-order (first slide → `<style>` → remaining slides).',
    '',
    '```html',
    scaffoldHtml,
    '```',
  ].join('\n');
}

/**
 * Extract a markdown block containing a CONTENT-SWAP HTML scaffold derived
 * from the template preview. Returns null when the HTML has no slide sections.
 */
export function extractTemplateScaffoldFromHtml(
  html: string,
  options: { maxChars?: number; maxSlides?: number; title?: string } = {},
): string | null {
  const source = stripScriptsAndNav(String(html ?? '').trim());
  if (!source) return null;
  const slides = listSlideSections(source);
  if (slides.length === 0) return null;

  const maxChars = options.maxChars ?? DEFAULT_SCAFFOLD_MAX_CHARS;
  const title = options.title?.trim() || 'selected deck template';
  const sprites = extractMotifSpritePool(source);
  const fontImport = extractFontImport(source);
  const cssBudget = Math.min(7_500, Math.max(2_200, maxChars - 3_500));
  const css = prepareSharedCss(source, cssBudget);

  // Shrink slide count until the markdown fits the char budget.
  let slideCap = Math.min(options.maxSlides ?? DEFAULT_MAX_SLIDES, slides.length);
  let out: string | null = null;
  while (slideCap >= 2) {
    const picked = pickScaffoldSlides(slides, slideCap).map((slide) =>
      normalizeSlideShell(replaceSvgsWithSpritePool(slide, sprites)),
    );
    const candidate = buildScaffoldMarkdown({
      title,
      fontImport,
      css,
      slides: picked,
    }).trim();
    if (candidate.length <= maxChars) {
      out = candidate;
      break;
    }
    slideCap -= 1;
  }
  if (!out) {
    // Last resort: cover + style only.
    const cover = normalizeSlideShell(replaceSvgsWithSpritePool(slides[0]!, sprites));
    out = buildScaffoldMarkdown({
      title,
      fontImport,
      css: css.slice(0, Math.min(css.length, 4_500)),
      slides: [cover],
    }).trim();
  }
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars - 1)}…`;
  }
  return out;
}

/** True when skill body already carries a CONTENT-SWAP scaffold block. */
export function skillBodyHasTemplateScaffold(skillBody: string | null | undefined): boolean {
  return Boolean(skillBody && skillBody.includes(TEMPLATE_SCAFFOLD_MARKER));
}

/** Append scaffold once; idempotent. */
export function appendTemplateScaffold(
  skillBody: string,
  scaffold: string | null | undefined,
): string {
  const body = skillBody.trim();
  const block = scaffold?.trim() ?? '';
  if (!body) return block;
  if (!block) return body;
  if (body.includes(TEMPLATE_SCAFFOLD_MARKER)) return body;
  return `${body}\n\n${block}`;
}
