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

// Raised 5 200 → 7 800 → 8 800 so a real Zhangzara daisy sprite (~2 KB after
// comment strip) can co-exist with the star, rainbow, tokens, decoration
// CSS, scaffold map, ### Slide surface binding, and first-slide structure
// cue without truncating any of them. Motif sprites + surface hex are the
// two signals that stop Daisy Days coming back as 🌸 emoji or dark-on-dark
// / cream-slides-on-dark-shell decks.
// BODY-FIRST hard rules below tell the model to emit slides before pasting
// this kit into `<head>` so the larger budget does not invite shell-only cuts.
const DEFAULT_MAX_CHARS = 8_800;

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

function extractCssVariables(rootCss: string | null): Record<string, string> {
  if (!rootCss) return {};
  const vars: Record<string, string> = {};
  for (const match of rootCss.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value) vars[key] = value;
  }
  return vars;
}

function firstVarValue(vars: Record<string, string>, names: readonly string[]): string | null {
  for (const name of names) {
    const value = vars[name]?.trim();
    if (value) return `--${name} ${value}`;
  }
  return null;
}

function buildTemplateAnchorSummary(options: {
  title: string;
  rootCss: string | null;
  fonts: readonly string[];
}): string[] {
  const vars = extractCssVariables(options.rootCss);
  const anchors: string[] = [];
  const surface = firstVarValue(vars, ['cream', 'background', 'bg', 'surface', 'paper']);
  const text = firstVarValue(vars, ['text-dark', 'text', 'foreground', 'ink']);
  const accent = firstVarValue(vars, ['turquoise', 'coral', 'butter', 'mint', 'primary', 'accent']);
  const border = firstVarValue(vars, ['border', 'border-width']);
  const shadow = firstVarValue(vars, ['shadow', 'shadow-sm']);
  if (surface) {
    anchors.push(
      `- Main surface/background: ${surface}. The cover and most slides MUST use this template surface; do not choose a dark default unless this value is dark.`,
    );
  }
  if (text) anchors.push(`- Main text/ink: ${text}.`);
  if (accent) anchors.push(`- Accent cue: ${accent}.`);
  if (options.fonts.length > 0) {
    anchors.push(`- Typography: ${options.fonts.slice(0, 4).join(' | ')}.`);
  }
  if (border || shadow) {
    anchors.push(`- Chunky outline/card treatment: ${[border, shadow].filter(Boolean).join(' ; ')}.`);
  }
  if (/daisy/i.test(options.title)) {
    anchors.push(
      '- Daisy Days identity: cream paper, dark ink outline, butter-yellow daisy center, hand-drawn white petals, pastel star/badge accents. The cover MUST show the provided daisy SVG motif, not a generic dark flower.',
    );
  }
  return anchors;
}

function extractStyleSheets(html: string): string {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n');
}

function resolveCssTokenValue(rootBlock: string | null, expr: string): string | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  const literal = trimmed.match(
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/,
  )?.[0];
  if (literal && !/^var\(/i.test(trimmed)) return literal;
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
      const nested = resolveCssTokenValue(rootBlock, rootValue);
      if (nested) return nested;
      return rootValue;
    }
  }
  return fallback ? resolveCssTokenValue(rootBlock, fallback) : null;
}

function splitCssSelectors(selectorText: string): string[] {
  return selectorText.split(',').map((part) => part.trim()).filter(Boolean);
}

/** `html` / `body` / `.deck-stage` only — never `.welcome-body` or `.slide-body`. */
function isDocumentSurfaceSelector(part: string): boolean {
  return /^(?:html|body)$/i.test(part)
    || /^html\s+body$/i.test(part)
    || /^\.deck-stage$/i.test(part)
    || /^\.slides-container$/i.test(part);
}

/** Bare `.slide` / `section.slide` — never `.slide-title` or `.slide-welcome`. */
function isSlideSurfaceSelector(part: string): boolean {
  return /^(?:[a-z][a-z0-9]*)?\.slide$/i.test(part);
}

/**
 * Resolve the template's actual `html,body { background; color }` binding
 * into concrete hex. Token names alone (`--cream`, `--border`, `--text-dark`)
 * let models treat the ink stroke (`#2D2D2D`) as a slide background.
 *
 * Selectors are matched as whole comma-separated parts so `.welcome-body`
 * cannot steal the document surface from `html,body`.
 */
function extractSlideSurfaceBinding(
  html: string,
  rootBlock: string | null,
): { background: string | null; color: string | null; source: string | null } {
  const sheet = extractStyleSheets(html);
  const rules = [...sheet.matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)];
  let background: string | null = null;
  let color: string | null = null;
  let source: string | null = null;

  const readRule = (
    selectorText: string,
    body: string,
    kind: 'body' | '.slide',
    match: (part: string) => boolean,
  ): void => {
    if (!splitCssSelectors(selectorText).some(match)) return;
    if (!background) {
      const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(body)?.[1];
      const resolved = bg ? resolveCssTokenValue(rootBlock, bg) : null;
      if (resolved) {
        background = resolved;
        source ??= kind;
      }
    }
    if (!color) {
      const c = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(body)?.[1];
      const resolved = c ? resolveCssTokenValue(rootBlock, c) : null;
      if (resolved) {
        color = resolved;
        source ??= kind;
      }
    }
  };

  for (const rule of rules) {
    readRule(rule[1] ?? '', rule[2] ?? '', 'body', isDocumentSurfaceSelector);
    if (background && color) return { background, color, source };
  }
  for (const rule of rules) {
    readRule(rule[1] ?? '', rule[2] ?? '', '.slide', isSlideSurfaceSelector);
    if (background && color) return { background, color, source };
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
  const luminance = (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255;
  return luminance >= 0.5 ? 'light' : 'dark';
}

function renderSlideSurfaceBlock(
  binding: ReturnType<typeof extractSlideSurfaceBinding>,
  colors: readonly string[],
): string | null {
  let background = binding.background;
  let color = binding.color;
  const source = binding.source;
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
  const contrastNote = conflict
    ? '⚠️ background and text are both ' + bgLabel + '. Increase contrast — never ship dark-on-dark or light-on-light slides.'
    : bgLabel === 'light'
      ? 'Contrast: **light background + dark ink**. Paint BOTH `html, body` AND every `.slide` with these hexes. Painting only `.slide` leaves a dark preview-panel shell (list thumbnail still looks cream because it force-covers the viewport). Never use an ink/border token (e.g. `#2D2D2D`) as a background.'
      : bgLabel === 'dark'
        ? 'Contrast: **dark background + light ink**. Paint BOTH `html, body` AND every `.slide`. Never leave `body` on a light default around dark slides.'
        : 'Verify text/background contrast; failing the WCAG legibility bar is a failed deliverable.';

  return [
    '### Slide surface (bind html/body AND every `.slide`)',
    '',
    background
      ? `- **background**: \`${background}\`${source ? ` (from \`${source}\`)` : ''}`
      : '- **background**: pick the lightest pastel hex from the palette above',
    color ? `- **color** (text): \`${color}\`` : '- **color** (text): dark ink from the palette above',
    '',
    contrastNote,
    '',
    '```css',
    `html, body, .slide { background:${bgLiteral}; color:${colorLiteral}; }`,
    '```',
  ].join('\n');
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
  // elements laid out radially around a ~150×150 square viewBox with white
  // petals + butter-yellow (#FCDF6C) centers. Cloud SVGs also use `#fff` on a
  // square canvas and previously won the 'daisy' slot via shorter-wins — the
  // model then invented ellipse "daisies" / emoji because the kit had no
  // pasteable flower.
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
  const looksLikeCloud =
    /#c6e3f6/i.test(svg)
    || (/\bcloud\b/i.test(svg) && /#(?:fff|ffffff|c6e3f6)/i.test(svg));
  if (looksLikeCloud) return 'cloud';
  // Multi-petal daisy: butter-yellow center is the Zhangzara signature.
  // Also accept ~150 square white-petal flowers with 8+ paths (no sky blue).
  const hasButterCenter = /#fcdf6c/i.test(svg);
  const hasWhitePetal = /#fff(?:fff)?(?![0-9a-f])|#ffffff/i.test(svg);
  const daisySized = vbW >= 140 && vbW <= 160 && isSquareCanvas;
  if (
    !hasFace
    && isSquareCanvas
    && hasWhitePetal
    && (
      (hasButterCenter && pathCount >= 6)
      || (daisySized && pathCount >= 8)
    )
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
    && !looksLikeCloud
    && pathCount >= 4
    && /#f7c8d4|#ffcd57|#d4a5e8|#fcdf6c/i.test(svg)
  ) {
    return 'daisy';
  }
  // Face sprites must never claim 'sun' — that used to replace rainbow/daisy.
  if (!hasFace && /sun|#ffcd57.*circle|circle.*#ffcd57/i.test(svg) && svg.length < 800) {
    return 'sun';
  }
  if (/\bcloud\b/i.test(svg)) return 'cloud';
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
    const prev = byKind[kind];
    // Daisy/rainbow: prefer the LARGEST complete sprite (real petal daisy ~2KB
    // beats a false-positive cloud). Other kinds still prefer the compact one.
    const preferLarger = kind === 'daisy' || kind === 'rainbow';
    if (
      !prev
      || (preferLarger ? svg.length > prev.length : svg.length < prev.length)
    ) {
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

function stripHtmlText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTemplateScaffoldMap(html: string, budget: number): string | null {
  const sections = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)];
  if (sections.length === 0) return null;
  const lines: string[] = [];
  let used = 0;
  for (let i = 0; i < Math.min(sections.length, 12); i += 1) {
    const attrs = sections[i]?.[1] ?? '';
    const body = sections[i]?.[2] ?? '';
    const className =
      /class\s*=\s*"([^"]+)"/i.exec(attrs)?.[1]
      ?? /class\s*=\s*'([^']+)'/i.exec(attrs)?.[1]
      ?? 'slide';
    const id =
      /id\s*=\s*"([^"]+)"/i.exec(attrs)?.[1]
      ?? /id\s*=\s*'([^']+)'/i.exec(attrs)?.[1]
      ?? null;
    const heading =
      /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(body)?.[1]
      ?? /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]
      ?? '';
    const cleanHeading = stripHtmlText(heading).slice(0, 80);
    const decoClasses = uniquePreserveOrder(
      [...body.matchAll(/class\s*=\s*["']([^"']*\bdeco\b[^"']*)["']/gi)]
        .map((match) => (match[1] ?? '').trim()),
    ).slice(0, 4);
    const layoutRole = className
      .split(/\s+/)
      .find((cls) => cls.startsWith('slide-') && cls !== 'slide')
      ?.replace(/^slide-/, '')
      || 'body';
    const parts = [
      `- ${i + 1}. classes="${className}"`,
      id ? `id="${id}"` : null,
      `role=${layoutRole}`,
      cleanHeading ? `sample="${cleanHeading}"` : null,
      decoClasses.length > 0 ? `deco=${decoClasses.join(' | ')}` : null,
    ].filter(Boolean);
    const line = parts.join('; ');
    if (used + line.length + 1 > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (lines.length === 0) return null;
  return [
    'Use this example.html slide order/classes as the base scaffold. Replace visible content only.',
    ...lines,
  ].join('\n');
}

const HARD_RULES = [
  'Hard rules (non-negotiable):',
  '- **TEMPLATE-AS-BASE:** treat `example.html` as the base deck. Preserve its slide classes, layout roles, surface colors, decorative wrappers, border/shadow/card treatment, and SVG motif language. Replace only visible content: headings, paragraphs, bullets, chart/table labels/values, and image slots.',
  '- **BODY-FIRST:** emit `<body>` / filled `<section class="slide">` slides BEFORE a large `<head>`/`<style>` dump. Put Motif sprites + Decoration CSS in one short body `<style>` after slide 1 (or tiny inline tokens). A CSS-only truncation is a failed deliverable.',
  '- Keep the template scheme exactly (light pastel stays light; dark terminal stays dark). If the kit has a named main surface/background token, use it on the cover.',
  '- **Surface hex:** bind `### Slide surface` background/color on BOTH `html`/`body` AND every `.slide`. Dark-on-dark, light-on-light, or cream-slides-on-dark-shell (preview panel dark / thumbnail cream) are failed deliverables. Ink tokens (`#2D2D2D`) are stroke/text, not backgrounds.',
  '- Motif MUST be copied from **Motif sprites** / **Decoration CSS** below (e.g. `<div class="deco deco-daisy-tl">…exact svg…</div>`). Use 2–4 sprites max per slide; copy at least one complete provided SVG on the cover when sprites are present. When Decoration CSS ships `.deco-daisy-tl/tr/bl/br`, fill all four corners — a single lonely sprite is not the template. Paste sprites VERBATIM (do not recolor fills).',
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
  const surfaceBinding = extractSlideSurfaceBinding(source, root);
  const surfaceBlock = renderSlideSurfaceBlock(surfaceBinding, colors);
  if (surfaceBlock) {
    lines.push(surfaceBlock, '');
  }
  const anchors = buildTemplateAnchorSummary({ title, rootCss: root, fonts });
  if (anchors.length > 0) {
    lines.push('### Must-match anchors (read this even if CSS variables are unfamiliar)', '', ...anchors, '');
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
  const scaffoldBudget = Math.min(1_100, Math.max(420, maxChars - used - 3_700));
  const scaffold = extractTemplateScaffoldMap(source, scaffoldBudget);
  if (scaffold) {
    lines.push(
      '### Template scaffold map (preserve layout/classes; replace content only)',
      '',
      '```text',
      scaffold,
      '```',
      '',
    );
  }

  used = lines.join('\n').length;
  // Preserve enough room for one real multi-petal motif SVG (Daisy Days is
  // ~2 KB). Decoration CSS is useful, but without the actual sprite the model
  // falls back to generic dark flowers / emoji-like approximations.
  const decoBudget = Math.min(820, Math.max(240, maxChars - used - 3_000));
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
      '### Motif sprites (complete SVGs — copy into corner `<div class="deco …">` wrappers)',
      '',
      'Copy at least one complete SVG from this block onto the cover. Use 2–4 of these per slide at corners/edges via absolute `.deco` positioning. Do not invent emoji flowers or approximate with generic flowers. Paste sprites VERBATIM (keep fill/stroke/`<style>` classes). When Decoration CSS lists `.deco-daisy-tl/tr/bl/br`, fill all four corners — one lonely sprite is a corporate deck with a stray flower. Do not paste every sprite into `<head>` before writing slides — BODY-FIRST.',
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
