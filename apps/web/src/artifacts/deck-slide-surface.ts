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
 * paint — official decks use `.slide-N` washes, Daisy/Cartesian role classes
 * (`.slide-weekly`, `.slide-title`), Bold Poster `.slide-red`, Biennale
 * `.s-cover`, and `.slide::before` grain.
 */

const SURFACE_STYLE_ATTR = 'data-od-slide-surface-bleed';

const SURFACE_STYLE_RE = new RegExp(
  `<style\\b[^>]*\\b${SURFACE_STYLE_ATTR}\\b[^>]*>[\\s\\S]*?<\\/style>`,
  'i',
);

const WHITE_OR_EMPTY_RE =
  /^(?:#fff(?:fff)?|white|transparent|inherit|initial|unset|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*1(?:\.0+)?\s*\))?$/i;

const TAG_OPEN_RE = /<(section|div)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

function elementHasExactSlideClass(attrs: string): boolean {
  const match = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(attrs);
  if (!match) return false;
  const value = match[1] ?? match[2] ?? match[3] ?? '';
  return /(^|\s)slide(\s|$)/i.test(value);
}

function isWhiteOrEmptyBackground(value: string | null | undefined): boolean {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return true;
  return WHITE_OR_EMPTY_RE.test(trimmed);
}

/** Radial washes / images must not be flattened by paper-token !important. */
function isDecorativeBackground(value: string | null | undefined): boolean {
  return /gradient\s*\(|\burl\s*\(|image-set\s*\(/i.test(String(value ?? ''));
}

/**
 * Letterbox paper must be a solid token, not the slide wash itself.
 * `radial-gradient(..., #F5F5F0)` → `#F5F5F0`.
 */
function solidPaperFromBackground(value: string | null | undefined): string | null {
  const raw = stripImportantFlag(String(value ?? '').trim());
  if (!raw || isWhiteOrEmptyBackground(raw)) return null;
  if (!isDecorativeBackground(raw)) return raw;
  const tail = /(?:,\s*)(#[0-9a-fA-F]{3,8}|rgb[a]?\([^)]+\)|hsl[a]?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)|var\([^)]+\)|[a-zA-Z]+)\s*$/.exec(raw);
  const last = tail?.[1]?.trim() ?? '';
  if (!last || isDecorativeBackground(last) || isWhiteOrEmptyBackground(last)) return null;
  return last;
}

function extractSlideBackground(html: string): string | null {
  const extras = collectSlideHostExtraClasses(html);
  return (
    extractInlineSlideBackground(html)
    ?? extractRuleBackground(html, (selector) => isDeckSlideSurfaceSelector(selector, extras))
  );
}

/**
 * Persist sanitize used to cut Google Fonts `@import` at the first `;` inside
 * the css2 URL, leaving `1,6..96…swap');` at the start of `<style>` — Motif
 * class rules then fail for Capsule, Daisy, Hermes, Sakura, etc.
 * Use the shared catalog-wide style repair (not a Capsule-only remnant regex).
 */
function healDeckStyleSheets(html: string): string {
  return repairArtifactStyleSheets(String(html ?? ''));
}

/**
 * Nested chrome / chrome-only hosts — not the 1920×1080 slide surface.
 * Daisy `.slide-title` and Cartesian `.slide-hero` are surfaces; Capsule
 * `.slide-inner` is not.
 */
const SLIDE_CHROME_SUFFIX_RE =
  /^(?:inner|header|headers|counter|number|content|body|chrome|foot|frame|meta|sidebar|deck|controls|nav|pager|progress|hint)$/i;

function stripCssSelectorComments(selector: string): string {
  return String(selector ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').trim();
}

function cssLeafSelector(selector: string): string {
  return stripCssSelectorComments(selector).split(/[\s>+~]/).pop()?.trim() ?? '';
}

function cssLeafClassNames(leaf: string): string[] {
  return [...leaf.matchAll(/\.(-?[_A-Za-z]+[\w-]*)/g)].map((match) => match[1] ?? '');
}

function isSlideChromeClassName(className: string): boolean {
  const suffix = /^slide-(.+)$/i.exec(className)?.[1];
  return Boolean(suffix && SLIDE_CHROME_SUFFIX_RE.test(suffix));
}

function isGenericSlideOnlyLeaf(leaf: string): boolean {
  return /^(?:[a-z][\w-]*)?\.slide(?:\.(?:active|is-active|current))?(?:::?(?:before|after))?$/i.test(leaf);
}

/**
 * Catalog-wide slide surface: generic `.slide`, numbered `.slide-N`, role
 * classes (`.slide-title`, `.slide-red`), Biennale/Neo `.s-cover`, plus extra
 * classes actually present on a `class="slide …"` host (`.bg-cork`).
 */
export function isDeckSlideSurfaceSelector(
  selector: string,
  hostExtraClasses: ReadonlySet<string> = new Set(),
): boolean {
  const leaf = cssLeafSelector(selector);
  if (!leaf) return false;
  const classes = cssLeafClassNames(leaf);
  if (classes.some((name) => name.toLowerCase() === 'slide')) return true;
  if (classes.some((name) => /^slide-\d+$/i.test(name))) return true;
  if (classes.some((name) => /^slide-/i.test(name) && !isSlideChromeClassName(name))) {
    return true;
  }
  if (classes.some((name) => /^s-[a-z][\w-]*$/i.test(name))) return true;
  return classes.some((name) => hostExtraClasses.has(name));
}

function collectSlideHostExtraClasses(html: string): Set<string> {
  const extras = new Set<string>();
  TAG_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_OPEN_RE.exec(html)) !== null) {
    const attrs = match[2] ?? '';
    if (!elementHasExactSlideClass(attrs)) continue;
    const classMatch = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(attrs);
    const raw = classMatch?.[1] ?? classMatch?.[2] ?? classMatch?.[3] ?? '';
    for (const name of raw.split(/\s+/).filter(Boolean)) {
      const cls = name.trim();
      if (!cls) continue;
      if (/^(?:slide|active|is-active|current)$/i.test(cls)) continue;
      if (isSlideChromeClassName(cls)) continue;
      extras.add(cls);
    }
  }
  return extras;
}

/** True when any non-generic slide role/variant paints its own background. */
export function deckHasPerSlideSurfacePaint(html: string): boolean {
  const extras = collectSlideHostExtraClasses(html);
  const sheets = collectAuthorStyleSheetTexts(html);
  if (!sheets.trim()) return false;
  for (const rule of sheets.matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((part) => cssLeafSelector(part)).filter(Boolean);
    const surfaceSelectors = selectors.filter((selector) => isDeckSlideSurfaceSelector(selector, extras));
    if (surfaceSelectors.length === 0) continue;
    if (surfaceSelectors.every((selector) => isGenericSlideOnlyLeaf(selector))) continue;
    const background = readBackgroundFromStyleDecl(rule[2] ?? '');
    if (background && !isWhiteOrEmptyBackground(background)) return true;
  }
  if (/\.slide\b[^ {]*::(?:before|after)\s*\{[^}]*\bbackground(?:-image|-color)?\s*:/i.test(sheets)) {
    return true;
  }
  return false;
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

function stripImportantFlag(value: string): string {
  return value.replace(/\s*!important\s*$/i, '').trim();
}

function readBackgroundFromStyleDecl(style: string | null | undefined): string | null {
  const raw = String(style ?? '');
  const shorthand = /(?:^|;)\s*background\s*:\s*([^;]+)/i.exec(raw)?.[1]?.trim();
  if (shorthand) return stripImportantFlag(shorthand) || null;
  const image = /(?:^|;)\s*background-image\s*:\s*([^;]+)/i.exec(raw)?.[1]?.trim();
  if (image) return stripImportantFlag(image) || null;
  const color = /(?:^|;)\s*background-color\s*:\s*([^;]+)/i.exec(raw)?.[1]?.trim();
  return color ? stripImportantFlag(color) || null : null;
}

function readColorFromStyleDecl(style: string | null | undefined): string | null {
  const raw = String(style ?? '');
  const match = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(raw);
  const value = stripImportantFlag(match?.[1]?.trim() ?? '');
  return value || null;
}

/** Author sheets only — skip our own letterbox inject so re-entry stays idempotent. */
function collectAuthorStyleSheetTexts(html: string): string {
  return [...String(html ?? '').matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)]
    .filter((match) => !new RegExp(`\\b${SURFACE_STYLE_ATTR}\\b`, 'i').test(match[1] ?? ''))
    .map((match) => match[2] ?? '')
    .join('\n');
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

function extractRuleBackground(
  html: string,
  selectorHint: RegExp | ((selector: string) => boolean),
): string | null {
  const sheets = collectAuthorStyleSheetTexts(html);
  if (!sheets.trim()) return null;
  const matchesHint = (selector: string): boolean => (
    typeof selectorHint === 'function' ? selectorHint(selector) : selectorHint.test(selector)
  );
  let solid: string | null = null;
  for (const rule of sheets.matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)) {
    const selectors = (rule[1] ?? '').split(',').map((part) => part.trim());
    if (!selectors.some((selector) => matchesHint(selector))) continue;
    const background = readBackgroundFromStyleDecl(rule[2] ?? '');
    if (!background || isWhiteOrEmptyBackground(background)) continue;
    if (isDecorativeBackground(background)) return background;
    if (!solid) solid = background;
  }
  return solid;
}

function extractInlineSlideBackground(html: string): string | null {
  TAG_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_OPEN_RE.exec(html)) !== null) {
    const attrs = match[2] ?? '';
    if (!elementHasExactSlideClass(attrs)) continue;
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
    if (elementHasExactSlideClass(attrs)) {
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
    ?? solidPaperFromBackground(extractRuleBackground(source, /^(?:[a-z][a-z0-9]*)?\.slide$/i))
    ?? solidPaperFromBackground(extractInlineSlideBackground(source))
    ?? extractInnerPaperBackground(source)
    ?? solidPaperFromBackground(extractBodyBackground(source));
  if (!background || isWhiteOrEmptyBackground(background)) return null;

  const color =
    extractCssVarLiteral(source, ['text-dark', 'text', 'ink', 'foreground', 'black'])
    ?? extractRuleBackgroundColor(source)
    ?? '#2D2D2D';

  return { background, color };
}

function extractRuleBackgroundColor(html: string): string | null {
  const sheets = collectAuthorStyleSheetTexts(html);
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
  const source = healDeckStyleSheets(String(html ?? ''));
  if (!source.trim()) return source;
  TAG_OPEN_RE.lastIndex = 0;
  let hasSlide = false;
  let openMatch: RegExpExecArray | null;
  while ((openMatch = TAG_OPEN_RE.exec(source)) !== null) {
    if (elementHasExactSlideClass(openMatch[2] ?? '')) {
      hasSlide = true;
      break;
    }
  }
  if (!hasSlide) return source;

  const paper = inferDeckSlidePaperSurface(source);
  const preserveSlidePaint =
    isDecorativeBackground(extractSlideBackground(source))
    || deckHasPerSlideSurfacePaint(source);
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
