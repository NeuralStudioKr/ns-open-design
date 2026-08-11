/**
 * Extract a compact, API-mode-safe visual kit from a deck template's
 * `example.html` (or similar preview entry).
 *
 * Zhangzara / html-ppt templates put the real palette + type + motif in the
 * demo HTML `:root` tokens and decorative SVG system. SKILL.md frontmatter
 * only has a short prose blurb ("Cheerful pastel deck…") — not enough for
 * BYOK models that cannot Read companion files.
 *
 * Critical: do NOT dump a truncated first-slide with huge incomplete SVGs.
 * That used to demand "daisies/stars" while giving no pasteable sprites, so
 * models substituted flower/star emoji. Prefer small complete motif SVGs +
 * `.deco` CSS + hard anti-emoji rules placed before any large cue.
 */

// Raised from 5 200 to 6 800 so a real Zhangzara daisy sprite (~2 KB after
// comment strip) can co-exist with the star, rainbow, tokens, decoration
// CSS, and first-slide structure cue without truncating any of them. The
// motif sprites are the single biggest anti-emoji signal we can hand the
// model — clipping them was the reason Daisy Days kept coming back as 🌸
// emoji clusters despite every prompt-level ban we added.
const DEFAULT_MAX_CHARS = 6_800;

function uniquePreserveOrder(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

function compressCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRootCssBlock(html: string): string | null {
  const rootMatch = /:root\s*\{([\s\S]*?)\}/i.exec(html);
  if (!rootMatch?.[1]) return null;
  const inner = compressCss(rootMatch[1]);
  if (!inner) return null;
  return `:root{ ${inner} }`;
}

function extractFontFamilies(html: string): string[] {
  const fromLinks: string[] = [];
  for (const match of html.matchAll(/family=([^&"']+)/gi)) {
    const raw = decodeURIComponent(match[1] ?? '');
    for (const family of raw.split('|')) {
      const name = family.split(':')[0]?.replace(/\+/g, ' ').trim();
      if (name) fromLinks.push(name);
    }
  }
  const fromCss = [...html.matchAll(/--font-[a-zA-Z0-9_-]+\s*:\s*([^;]+);/g)]
    .map((m) => (m[1] ?? '').trim())
    .filter(Boolean);
  return uniquePreserveOrder([...fromLinks, ...fromCss]).slice(0, 8);
}

function extractHexColors(html: string): string[] {
  return uniquePreserveOrder(
    [...html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0] ?? ''),
  ).slice(0, 16);
}

function extractStyleSheets(html: string): string {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n');
}

/** Compact decoration / card CSS the model can paste into a short body style. */
function extractDecorationCss(html: string, budget: number): string | null {
  const sheet = extractStyleSheets(html);
  if (!sheet.trim()) return null;
  const rules = [...sheet.matchAll(/[^{}@][^{]*\{[^}]+\}/g)]
    .map((match) => compressCss(match[0] ?? ''))
    .filter(Boolean);
  const prioritized = rules.filter((rule) =>
    /\.deco\b|\.card\b|\.badge\b|\.slide\b|--border|--shadow|--radius|font-display|font-body/i.test(
      rule,
    ),
  );
  // Prefer .deco* and .card/.badge before generic .slide sizing rules.
  prioritized.sort((a, b) => {
    const score = (rule: string) => {
      if (/\.deco\b/i.test(rule)) return 0;
      if (/\.card\b|\.badge\b/i.test(rule)) return 1;
      if (/--border|--shadow|--radius/i.test(rule)) return 2;
      return 3;
    };
    return score(a) - score(b);
  });
  const picked: string[] = [];
  let used = 0;
  for (const rule of prioritized) {
    if (picked.length >= 18) break;
    if (used + rule.length + 1 > budget) continue;
    picked.push(rule);
    used += rule.length + 1;
  }
  if (picked.length === 0) return null;
  return picked.join('\n');
}

function classifySvg(svg: string): 'daisy' | 'star' | 'rainbow' | 'sun' | 'cloud' | 'other' {
  // Real Zhangzara Daisy Days daisy sprites are multi-petal flowers: 8+ path
  // elements laid out radially around a center square viewBox. A "face"-shaped
  // SVG (circle + ellipse + eyes + smile) previously slipped into the 'daisy'
  // bucket just because it used soft-pink fill, and the model then saw no
  // real daisy in the kit and reached for 🌸 emoji. Same for the 4-arc
  // rainbow (wide viewBox, 4 paths, distinct RYGB colors) — earlier logic
  // routed it to 'daisy' because mint (#8DE3B7) matched a loose palette gate.
  const pathCount = (svg.match(/<path\b/gi) ?? []).length;
  const circleCount = (svg.match(/<circle\b/gi) ?? []).length;
  const ellipseCount = (svg.match(/<ellipse\b/gi) ?? []).length;
  const hasFace = circleCount >= 2 && (ellipseCount >= 1 || /q\s*\d/i.test(svg));
  const viewBox =
    /viewbox\s*=\s*"([^"]+)"/i.exec(svg)?.[1]
    ?? /viewbox\s*=\s*'([^']+)'/i.exec(svg)?.[1]
    ?? '';
  const [vbW = 0, vbH = 0] = viewBox
    .trim()
    .split(/\s+/)
    .slice(2, 4)
    .map((n) => Number(n) || 0);
  const isSquareCanvas = vbW > 0 && vbH > 0 && Math.abs(vbW - vbH) / Math.max(vbW, vbH) < 0.1;
  const isWideCanvas = vbW > 0 && vbH > 0 && vbW / vbH >= 1.25;
  // Multi-petal daisy: 6+ petal paths radiating from a square canvas, uses
  // the daisy petal palette (white / butter yellow / dark ink).
  if (
    pathCount >= 6
    && !hasFace
    && isSquareCanvas
    && /#f{3,6}(?![0-9a-f])|#fcdf6c/i.test(svg)
  ) {
    return 'daisy';
  }
  // Rainbow: wide viewBox with a small stack of concentric arc paths in
  // 3–4 distinct pastel/warm hues (coral, butter, mint, sky).
  if (
    isWideCanvas
    && pathCount >= 3
    && pathCount <= 6
    && /#f8635f|#fde366|#8de3b7|#85c5fe|rainbow/i.test(svg)
  ) {
    return 'rainbow';
  }
  if (/rainbow/i.test(svg)) return 'rainbow';
  // Star: iconic 5-point star viewBox from the Zhangzara star export.
  if (/viewbox="0 0 100 98/i.test(svg) || /\bstar\b/i.test(svg)) return 'star';
  // Loose daisy fallback for the pastel-flower-face style ONLY when the
  // canvas is square (single flower head) and there are no facial features.
  if (
    isSquareCanvas
    && !hasFace
    && pathCount >= 4
    && /#f7c8d4|#ffcd57|#d4a5e8/i.test(svg)
  ) {
    return 'daisy';
  }
  if (/sun|#ffcd57.*circle|circle.*#ffcd57/i.test(svg) && svg.length < 800) return 'sun';
  if (/cloud/i.test(svg)) return 'cloud';
  return 'other';
}

/**
 * Slim an SVG down so the real Daisy Days / Zhangzara sprites can survive
 * the sprite size gate. QuiverAI-exported SVGs ship:
 *   - an Adobe attribution `<!-- SVG created with Arrow, by QuiverAI … -->`
 *     comment (~60 chars each),
 *   - a `<style>` block with `.cls-N { fill / stroke / stroke-linecap / … }`
 *     rules,
 *   - `<path class="cls-N">` consumers.
 *
 * The comment is safe to drop unconditionally. Whether to inline the class
 * rules depends on cost: expanding every `class="cls-N"` into a full inline
 * `style="…"` can BLOAT a 2 KB daisy to 2.6 KB because the same 100-char
 * declaration list is duplicated across a dozen paths. Keep the `<style>`
 * block whenever the inlined output would be larger — models can copy the
 * whole SVG including the tiny leading `<style>` just fine.
 */
function inlineSvgStyleBlock(svg: string): string {
  const withoutComments = svg.replace(/<!--[\s\S]*?-->/g, '');
  const commentStripped = compressCss(withoutComments);
  const styleMatch = /<style\b[^>]*>([\s\S]*?)<\/style>/i.exec(commentStripped);
  if (!styleMatch?.[0] || !styleMatch[1]) return commentStripped;
  const rules = new Map<string, string>();
  for (const rule of styleMatch[1].matchAll(
    /\.([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g,
  )) {
    const cls = rule[1];
    const decls = rule[2]
      ?.split(';')
      .map((d) => d.trim())
      .filter(Boolean);
    if (!cls || !decls || decls.length === 0) continue;
    rules.set(cls, decls.join(';'));
  }
  let inlined = commentStripped.replace(styleMatch[0], '');
  inlined = inlined.replace(/(<[^>]*?)\bclass=(?:"([^"]*)"|'([^']*)')/gi, (_match, prefix, dq, sq) => {
    const classes = (dq ?? sq ?? '').split(/\s+/).filter(Boolean);
    if (classes.length === 0) return prefix;
    const style = classes
      .map((cls: string) => rules.get(cls) ?? '')
      .filter(Boolean)
      .join(';');
    if (!style) return prefix;
    if (/\bstyle\s*=/.test(prefix)) {
      return prefix.replace(
        /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/,
        (_m: string, e1?: string, e2?: string) => `style="${style};${e1 ?? e2 ?? ''}"`,
      );
    }
    return `${prefix} style="${style}"`;
  });
  inlined = compressCss(inlined);
  // Keep whichever variant is smaller. Class-rule inlining loses to shared
  // `<style>` when the same declaration list is duplicated across many paths
  // (typical Zhangzara daisy = 12 paths sharing one 100-char rule).
  return inlined.length < commentStripped.length ? inlined : commentStripped;
}

const SPRITE_MIN_CHARS = 80;
// Bumped from 720 to 2400 so the real Daisy Days daisy SVG (raw ~2040 chars,
// ~1980 chars after comment strip when keeping the shared `<style>` block)
// can survive the sprite gate. Cat / bear face sprites at ~320 chars still
// fit — the tightened classifier prevents them from claiming the 'daisy'
// slot even at this ceiling.
const SPRITE_MAX_CHARS = 2400;

/**
 * Pick a few SMALL complete SVGs as pasteable motif sprites.
 * Avoid the multi-KB QuiverAI paths that blow the kit budget and truncate.
 */
function extractMotifSprites(html: string, budget: number): string[] {
  const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)]
    .map((match) => inlineSvgStyleBlock(match[0] ?? ''))
    .filter((svg) => svg.length >= SPRITE_MIN_CHARS && svg.length <= SPRITE_MAX_CHARS);

  const byKind: Partial<Record<ReturnType<typeof classifySvg>, string>> = {};
  for (const svg of svgs) {
    const kind = classifySvg(svg);
    if (kind === 'other') continue;
    if (!byKind[kind] || svg.length < (byKind[kind]?.length ?? Infinity)) {
      byKind[kind] = svg;
    }
  }

  const order: Array<ReturnType<typeof classifySvg>> = [
    'daisy',
    'star',
    'rainbow',
    'sun',
    'cloud',
  ];
  const out: string[] = [];
  let used = 0;
  for (const kind of order) {
    const svg = byKind[kind];
    if (!svg) continue;
    if (used + svg.length + 40 > budget) continue;
    out.push(svg);
    used += svg.length + 40;
    if (out.length >= 3) break;
  }

  // Fallback: smallest complete SVGs if classifiers missed.
  if (out.length === 0) {
    const smallest = [...svgs].sort((a, b) => a.length - b.length);
    for (const svg of smallest) {
      if (used + svg.length > budget) break;
      out.push(svg);
      used += svg.length;
      if (out.length >= 2) break;
    }
  }
  return out;
}

function extractFontImportHint(html: string, fonts: string[]): string | null {
  const linkMatch =
    /href=("|\')([^"']*fonts\.googleapis\.com\/css2\?[^"']+)\1/i.exec(html)
    ?? /href=("|\')([^"']*fonts\.googleapis\.com\/css\?[^"']+)\1/i.exec(html);
  if (linkMatch?.[2]) {
    return `@import url('${linkMatch[2]}');`;
  }
  if (fonts.length === 0) return null;
  const families = fonts
    .map((font) => font.replace(/['"]/g, '').split(',')[0]?.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (families.length === 0) return null;
  const familyParam = families
    .map((name) => `family=${encodeURIComponent(name!).replace(/%20/g, '+')}:wght@400;700`)
    .join('&');
  return `@import url('https://fonts.googleapis.com/css2?${familyParam}&display=swap');`;
}

/** Structure cue without embedding huge/truncated SVG markup. */
function extractFirstSlideStructureCue(html: string, budget: number): string | null {
  const sectionMatch =
    /<section\b[^>]*class=["'][^"']*slide[^"']*["'][^>]*>[\s\S]*?<\/section>/i.exec(
      html,
    );
  if (!sectionMatch?.[0]) return null;
  const snippet = sectionMatch[0]
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '<!-- use Motif sprites SVG inside .deco -->')
    .replace(/\s+/g, ' ')
    .trim();
  if (!snippet) return null;
  return snippet.length > budget ? `${snippet.slice(0, budget)}…` : snippet;
}

const HARD_RULES = [
  'Hard rules (non-negotiable):',
  '- Keep the template scheme (light pastel stays light; dark terminal stays dark).',
  '- Motif MUST be SVG/CSS from **Motif sprites** / **Decoration CSS** below (e.g. `<div class="deco deco-daisy-tl">…svg…</div>`).',
  '- **Forbidden motif substitutes:** unicode/emoji ornaments as decoration — no 🌼 🌸 🌺 🌻 🌹 ⭐ ✨ 🌟 🌈 ☀️ or similar flower/star/rainbow emoji rows pretending to be the template identity.',
  '- Preserve chunky cards/borders/offset shadows when Decoration CSS shows them.',
  '- Vary slide layouts using the template vocabulary; do not emit sparse title-only Neutral Modern slides.',
];

/**
 * Build a markdown block describing the template's concrete visual system.
 * Returns null when the HTML has no usable `:root` / color cues.
 */
export function extractTemplateVisualKitFromHtml(
  html: string,
  options: { maxChars?: number; title?: string } = {},
): string | null {
  const source = html?.trim() ?? '';
  if (!source) return null;
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const root = extractRootCssBlock(source);
  const fonts = extractFontFamilies(source);
  const colors = extractHexColors(source);
  if (!root && colors.length === 0 && fonts.length === 0) return null;

  const title = options.title?.trim() || 'selected deck template';
  const fontImport = extractFontImportHint(source, fonts);

  // Build with hard rules + tokens first so they cannot be truncated away.
  const lines: string[] = [
    `## Template visual kit (from example.html) — ${title}`,
    '',
    'This is the authoritative visual system for the selected deck template.',
    'Reproduce these tokens with inline styles (or one short body `<style>` after slide 1).',
    'Do NOT replace them with an active design-system palette or a dark corporate default.',
    '',
    ...HARD_RULES,
    '',
  ];
  if (root) {
    lines.push('### CSS tokens', '', '```css', root, '```', '');
  }
  if (fonts.length > 0) {
    lines.push(`### Fonts: ${fonts.join(' | ')}`, '');
  }
  if (fontImport) {
    lines.push(
      '### Font import (put inside the short body `<style>`)',
      '',
      '```css',
      fontImport,
      '```',
      '',
    );
  }
  if (colors.length > 0) {
    lines.push(`### Palette cues: ${colors.join(', ')}`, '');
  }

  let used = lines.join('\n').length;
  const decoBudget = Math.min(1_100, Math.max(320, maxChars - used - 1_800));
  const deco = extractDecorationCss(source, decoBudget);
  if (deco) {
    lines.push(
      '### Decoration CSS (paste into the short body `<style>`)',
      '',
      '```css',
      deco,
      '```',
      '',
    );
  }

  used = lines.join('\n').length;
  // Ceiling raised so a real daisy sprite (~2 KB) fits alongside star +
  // rainbow. The lower bound stays generous for the small structure-cue tail.
  const spriteBudget = Math.min(3_400, Math.max(400, maxChars - used - 700));
  const sprites = extractMotifSprites(source, spriteBudget);
  if (sprites.length > 0) {
    lines.push(
      '### Motif sprites (complete SVGs — copy into corner `<div class="deco …">` wrappers)',
      '',
      'Use 2–4 of these per slide at corners/edges via absolute `.deco` positioning. Do not invent emoji flowers.',
      '',
    );
    for (let i = 0; i < sprites.length; i += 1) {
      lines.push(`\`\`\`html`, sprites[i]!, `\`\`\``, '');
    }
  }

  used = lines.join('\n').length;
  const slideBudget = Math.max(280, maxChars - used - 40);
  const slide = extractFirstSlideStructureCue(source, slideBudget);
  if (slide) {
    lines.push(
      '### First-slide structure cue (SVGs omitted — use Motif sprites above)',
      '',
      '```html',
      slide,
      '```',
      '',
    );
  }

  let out = lines.join('\n').trim();
  if (out.length > maxChars) {
    // Prefer keeping hard rules + tokens + sprites; trim from the end.
    out = `${out.slice(0, maxChars - 1)}…`;
  }
  return out;
}

/** Append kit once; idempotent if the marker is already present. */
export function appendTemplateVisualKit(skillBody: string, kit: string | null | undefined): string {
  const body = skillBody.trim();
  const visualKit = kit?.trim() ?? '';
  if (!body) return visualKit;
  if (!visualKit) return body;
  if (body.includes('## Template visual kit (from example.html)')) return body;
  return `${body}\n\n${visualKit}`;
}
