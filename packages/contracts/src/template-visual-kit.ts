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

// Raised 5 200 → 6 800 → 7 400 → 9 600 → 11 000 so the real Zhangzara
// daisy sprite (~2 KB), star (~500 B), rainbow (~600 B), CSS tokens,
// decoration CSS, the ### Slide surface binding with dual-body/slide
// code samples, first-slide structure cue, verbatim-copy rule, and
// 4-corner cover density rule can all co-exist without truncation.
// Motif sprites + surface binding + verbatim-copy rule are the three
// biggest anti-regression signals we can hand the model — clipping any
// of them was the reason Daisy Days kept coming back as:
//   1. 🌸 emoji clusters (no real daisy sprite)
//   2. dark-on-dark unreadable slides (surface binding missing)
//   3. cream slides on dark shell (single-surface binding)
//   4. one lonely coral-recolored daisy in one corner (misclassified
//      cloud sprite + missing "verbatim colors" / "4-corner density"
//      guidance) — user report 2026-08-13 preview-panel.
// BODY-FIRST hard rules below tell the model to emit slides before
// pasting this kit into `<head>` so the larger budget does not invite
// shell-only cuts.
const DEFAULT_MAX_CHARS = 11_000;

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

const COLOR_VALUE_RE = /(?:#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)/;

function resolveCssTokenValue(rootBlock: string | null, expr: string): string | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  // Direct color literal — return as-is.
  if (COLOR_VALUE_RE.test(trimmed) && !/^var\(/i.test(trimmed)) {
    const literal = trimmed.match(
      /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/,
    )?.[0];
    if (literal) return literal;
  }
  // var(--token) → look up in :root block.
  const varMatch = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/i.exec(trimmed);
  if (!varMatch?.[1]) return null;
  const tokenName = varMatch[1];
  const fallback = varMatch[2]?.trim();
  if (rootBlock) {
    const tokenPattern = new RegExp(
      `${tokenName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*:\\s*([^;}]+)`,
      'i',
    );
    const rootValue = tokenPattern.exec(rootBlock)?.[1]?.trim();
    if (rootValue) {
      // Follow one level of indirection (e.g. `--bg: var(--cream)`).
      const nested = resolveCssTokenValue(rootBlock, rootValue);
      if (nested) return nested;
      return rootValue;
    }
  }
  return fallback ? resolveCssTokenValue(rootBlock, fallback) : null;
}

/**
 * Pull the actual slide-surface binding out of the template's example.html
 * — the concrete `background` and `color` the body / `.slide` container
 * uses. Without this the kit only exposes token names (`--cream`,
 * `--border`, `--text-dark`) and models routinely mistake the ink stroke
 * token (`--border: #2D2D2D`) for a background, producing dark-on-dark
 * unreadable slides on templates whose true surface is a light pastel.
 */
function extractSlideSurfaceBinding(
  html: string,
  rootBlock: string | null,
): { background: string | null; color: string | null; source: string | null } {
  const sheet = extractStyleSheets(html);
  const searchTargets: Array<{ selector: RegExp; label: string }> = [
    { selector: /html\s*,\s*body|body|\.deck-stage|\.slides-container/i, label: 'body' },
    { selector: /\.slide(?!\s*[.:])/i, label: '.slide' },
  ];
  let background: string | null = null;
  let color: string | null = null;
  let source: string | null = null;
  const rules = [...sheet.matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)];
  for (const { selector, label } of searchTargets) {
    for (const rule of rules) {
      const selectorText = (rule[1] ?? '').trim();
      const body = rule[2] ?? '';
      if (!selector.test(selectorText)) continue;
      if (!background) {
        const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(body)?.[1];
        if (bg) {
          const resolved = resolveCssTokenValue(rootBlock, bg);
          if (resolved) {
            background = resolved;
            source ??= label;
          }
        }
      }
      if (!color) {
        const c = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(body)?.[1];
        if (c) {
          const resolved = resolveCssTokenValue(rootBlock, c);
          if (resolved) {
            color = resolved;
            source ??= label;
          }
        }
      }
      if (background && color) break;
    }
    if (background && color) break;
  }
  return { background, color, source };
}

function contrastLabel(hex: string): 'light' | 'dark' | 'unknown' {
  const short = hex.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  const full = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  const parts = full
    ? [full[1], full[2], full[3]]
    : short
      ? [short[1]! + short[1]!, short[2]! + short[2]!, short[3]! + short[3]!]
      : null;
  if (!parts) return 'unknown';
  const [r, g, b] = parts.map((h) => Number.parseInt(h!, 16));
  if (![r, g, b].every((n) => Number.isFinite(n))) return 'unknown';
  // Perceptual luminance (Rec. 601). Threshold at 0.5 to bucket into
  // "light" (needs dark text) vs "dark" (needs light text).
  const luminance = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255;
  return luminance >= 0.5 ? 'light' : 'dark';
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
  // elements laid out radially around a center square viewBox, with a
  // signature butter-yellow (#FCDF6C or #FDE366) center and white petals
  // (#FFFFFF) on a dark ink stroke (#232323 / #2D2D2D).
  //
  // History of misclassifications (all shipped 🌸 emoji / recolored motif
  // to the user):
  // - "face"-shaped SVG (circle + ellipse + eyes + smile) slipped into the
  //   daisy bucket on soft-pink fill; excluded via `hasFace`.
  // - 4-arc rainbow (wide viewBox, 4 paths, distinct RYGB) slipped in on
  //   mint (#8DE3B7); excluded via square/wide check.
  // - Sky-blue **cloud/wave** sprite (128×128, 10 paths, `.cl0 #C6E3F6`
  //   + `.cl2 #fff` white with black stroke) slipped in because
  //   `#fff` matched a loose white-fill gate; the model then saw no real
  //   daisy and painted a coral-recolored single-shape sprite (Daisy Days
  //   user report 2026-08-13 preview-panel). Fix: require the butter-
  //   yellow center hex AND reject sky-blue fills for the daisy bucket.
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
  // Anti-cloud gate: sky-blue fills (`#C6E3F6`, `#A8D8F0`, `#85C5FE`) are the
  // Daisy Days cloud/sky palette, not the daisy palette. Any sprite that
  // has a sky-blue fill and does NOT have the butter-yellow center is a
  // cloud-family sprite, not a daisy.
  const hasSkyBlueFill = /#c6e3f6|#a8d8f0|#85c5fe/i.test(svg);
  const hasButterYellowCenter = /#fcdf6c|#fde366/i.test(svg);
  // Real multi-petal daisy: 6+ petal paths on a square canvas with the
  // butter-yellow center hex present. White-only fills are NOT enough
  // (cloud/wave sprites also use white).
  if (
    pathCount >= 6
    && !hasFace
    && isSquareCanvas
    && hasButterYellowCenter
    && !hasSkyBlueFill
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
  // canvas is square (single flower head), no facial features, and NO
  // sky-blue cloud-palette fill.
  if (
    isSquareCanvas
    && !hasFace
    && pathCount >= 4
    && !hasSkyBlueFill
    && /#f7c8d4|#ffcd57|#d4a5e8/i.test(svg)
  ) {
    return 'daisy';
  }
  // Cloud/wave: 128×128 square, sky-blue fill, no butter-yellow center.
  if (hasSkyBlueFill && !hasButterYellowCenter && isSquareCanvas && pathCount >= 4) {
    return 'cloud';
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
  '- **BODY-FIRST:** emit `<body>` / filled `<section class="slide">` slides BEFORE a large `<head>`/`<style>` dump. Put Motif sprites + Decoration CSS in one short body `<style>` after slide 1 (or tiny inline tokens). A CSS-only truncation is a failed deliverable.',
  '- **Surface binding is authoritative — read `### Slide surface` below and use those EXACT `background` / `color` hex values on BOTH `html` / `body` AND every `<section class="slide">`.** Painting only the slides while leaving `body` at its default (or a dark app-shell) produces cream slides floating on a dark shell — the deck looks correct in the list thumbnail (which forces slides to cover the viewport) but reads as a dark corporate deck in the project preview panel. Do NOT substitute a border/ink token (e.g. `#2D2D2D`, `#232323`, `#1E1E1C`) for a slide background — those are stroke colors, not surface colors. Dark-on-dark, light-on-light, and cream-slides-on-dark-shell are all failed deliverables.',
  '- Keep the template scheme (light pastel stays light; dark terminal stays dark).',
  '- Motif MUST be SVG/CSS from **Motif sprites** / **Decoration CSS** below (e.g. `<div class="deco deco-daisy-tl">…svg…</div>`). **Paste each sprite VERBATIM — keep its original `fill`, `stroke`, `<style>` classes, and `path` `d=` data exactly as shown.** Do NOT recolor the sprite (a Daisy Days daisy has white petals with a butter-yellow `#FCDF6C` center and dark `#232323` stroke — do not swap those for coral / border-ink / palette hexes to \"match the deck\"). Do NOT redraw the sprite as a single-shape blob. If a sprite has an internal `<style>` block with `.cls-N { fill: … }` selectors, keep the `<style>` block AND the class attributes on the paths, or inline the fills on the paths — never drop them.',
  '- **Cover-slide motif density (Zhangzara pattern):** Zhangzara daisy / floral covers place motif sprites in **all four corners** (top-left, top-right, bottom-left, bottom-right) with 1–2 accent sprites (small star / heart / rainbow) tucked next to the corner daisies. A single sprite in one corner reads as a corporate deck with a stray flower; use 3–5 sprites on the cover and 1–2 on body slides. Non-Zhangzara templates: match the density visible in the **First-slide structure cue** below.',
  '- **Forbidden motif substitutes:** unicode/emoji ornaments as decoration — no 🌼 🌸 🌺 🌻 🌹 ⭐ ✨ 🌟 🌈 ☀️ or similar flower/star/rainbow emoji rows pretending to be the template identity.',
  '- Preserve chunky cards/borders/offset shadows when Decoration CSS shows them.',
  '- Vary slide layouts using the template vocabulary; do not emit sparse title-only Neutral Modern slides.',
];

function renderSlideSurfaceBlock(
  binding: ReturnType<typeof extractSlideSurfaceBinding>,
  colors: readonly string[],
): string | null {
  let background = binding.background;
  let color = binding.color;
  const source = binding.source;
  // Fill missing background from the first light palette hex when the CSS
  // parser missed it (some templates set body bg via var() indirection).
  if (!background) {
    for (const hex of colors) {
      if (contrastLabel(hex) === 'light') {
        background = hex;
        break;
      }
    }
  }
  if (!color) {
    for (const hex of colors) {
      if (contrastLabel(hex) === 'dark') {
        color = hex;
        break;
      }
    }
  }
  if (!background && !color) return null;

  const bgLabel = background ? contrastLabel(background) : 'unknown';
  const textLabel = color ? contrastLabel(color) : 'unknown';
  const conflict = bgLabel !== 'unknown' && textLabel !== 'unknown' && bgLabel === textLabel;

  const bgLiteral = background ?? '<template surface hex>';
  const colorLiteral = color ?? '<template ink hex>';
  const lines = [
    `### Slide surface (bind BOTH the outer document AND every \`<section class="slide">\`)`,
    '',
    background ? `- **background**: \`${background}\`${source ? ` (from \`${source}\`)` : ''}` : '- **background**: pick the lightest pastel hex from the palette above',
    color ? `- **color** (text): \`${color}\`` : '- **color** (text): dark ink from the palette above',
    '',
    'You MUST paint the surface hex on the outer document *and* on each slide, or the preview panel shows a dark shell around cream slides (and vice-versa). Two acceptable shapes:',
    '',
    '```html',
    `<body style="background:${bgLiteral};color:${colorLiteral};margin:0;">`,
    `  <section class="slide" style="background:${bgLiteral};color:${colorLiteral};width:1920px;height:1080px;box-sizing:border-box;position:relative;overflow:hidden;">…</section>`,
    '</body>',
    '```',
    '',
    'or a single short body `<style>` after slide 1:',
    '',
    '```html',
    '<style>',
    `  html, body { background:${bgLiteral}; color:${colorLiteral}; margin:0; }`,
    `  .slide { background:${bgLiteral}; color:${colorLiteral}; width:1920px; height:1080px; box-sizing:border-box; position:relative; overflow:hidden; }`,
    '</style>',
    '```',
    '',
    conflict
      ? '⚠️ background and text are both ' + bgLabel + '. Increase contrast — never ship dark-on-dark or light-on-light slides.'
      : bgLabel === 'light'
        ? 'Contrast: **light background + dark ink**. Every heading, paragraph, list item, badge, and card body must use dark ink text on the light surface. Do not leave `html` / `body` with a dark app-shell default — cream slides floating on a dark shell is the same failure as dark-on-dark slides.'
        : bgLabel === 'dark'
          ? 'Contrast: **dark background + light ink**. Every heading, paragraph, list item, badge, and card body must use light text (kit cream / white) on the dark surface. Also paint `html` / `body` with the dark surface so the outer document does not flash a bright default background around the slides.'
          : 'Verify text and background contrast; failing the WCAG legibility bar is a failed deliverable.',
    '',
    'Cover / body / stat / closing slides all inherit the same surface unless the template ships alternate slide-variant classes above; when in doubt, keep the same background across the deck.',
  ];
  return lines.join('\n');
}

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
  // Slide surface (background + ink) pinned RIGHT after tokens so the model
  // sees the concrete `background:` / `color:` hex before any font / palette
  // / motif material. Without this, models routinely picked the ink stroke
  // token (`#2D2D2D`) as a slide background and shipped dark-on-dark
  // unreadable decks (Daisy Days user report 2026-08-13).
  const surfaceBinding = extractSlideSurfaceBinding(source, root);
  const surfaceBlock = renderSlideSurfaceBlock(surfaceBinding, colors);
  if (surfaceBlock) {
    lines.push(surfaceBlock, '');
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
      '### Decoration CSS (paste into the short body `<style>` AFTER slide 1)',
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
      '### Motif sprites (complete SVGs — copy VERBATIM into corner `<div class="deco …">` wrappers)',
      '',
      'Paste each sprite **byte-for-byte** into a `<div class="deco deco-corner-…">` wrapper. Do NOT edit the `fill` / `stroke` / `<style>` classes / `path d=` — the colors baked into the sprite ARE the template identity (a Daisy Days daisy is white + butter-yellow + dark stroke; a Zhangzara star is soft-pink or mint on dark stroke; recoloring them to `#F8635F` coral or a single palette hex loses the template look entirely). If you need a different color accent, pick a DIFFERENT sprite from the list — do not recolor the existing one.',
      '',
      'Cover slide should place motif in **all four corners** (top-left / top-right / bottom-left / bottom-right) plus 1–2 small accent sprites tucked beside the corner daisies — 3–5 sprites total. Body slides can use 1–2 corner sprites. A single lonely sprite in one corner reads as a corporate deck with a stray flower, not the template.',
      '',
      'Do not paste every sprite into `<head>` before writing slides — BODY-FIRST.',
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
