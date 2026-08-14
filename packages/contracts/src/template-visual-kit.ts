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

// Raised through 11 000 → 12 000 so Daisy Days can ship daisy+star+rainbow
// plus Layout CSS (grid/flex/regions) without truncating Motif sprites.
// Raised 12 000 → 14 000. The HARD_RULES expansion for the "LAYOUT
// VOCABULARY, NOT SHELL COPY" policy (user report 2026-08-13 "템플릿의
// 페이지 수/순서/구성을 반드시 따를 필요는 없다. 오히려 비권장") added ~500
// chars of prompt real estate; at 12 000 the Decoration / Layout CSS
// blocks fell out of the packing budget for Daisy Days (Motif sprites +
// scaffold map + surface + tokens filled the cap first). 14 000 restores
// full kit output — still ≈3.5k tokens, far below full example.html
// (~87KB) or the retired CONTENT-SWAP HTML scaffold dump.
// BODY-FIRST hard rules tell the model to emit slides before pasting this
// kit into `<head>` so the larger budget does not invite shell-only cuts.
const DEFAULT_MAX_CHARS = 14_000;

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

function firstFontFamilyName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /^var\(/i.test(trimmed)) return null;
  const first = trimmed
    .split(',')[0]
    ?.replace(/['"]/g, '')
    .trim();
  if (!first || /^var\(/i.test(first)) return null;
  // Skip generic CSS families alone — they are not template identity.
  if (/^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset)$/i.test(first)) {
    return null;
  }
  return first;
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
  const fromCssVars = [...html.matchAll(
    /--(?:font-[a-zA-Z0-9_-]+|serif|sans|mono|display|body|heading)\s*:\s*([^;]+);/gi,
  )]
    .map((m) => firstFontFamilyName(m[1] ?? ''))
    .filter((name): name is string => Boolean(name));
  const fromFontFamily = [...html.matchAll(/font-family\s*:\s*([^;!}{]+)/gi)]
    .map((m) => firstFontFamilyName(m[1] ?? ''))
    .filter((name): name is string => Boolean(name));
  return uniquePreserveOrder([...fromLinks, ...fromCssVars, ...fromFontFamily]).slice(0, 8);
}

function extractHexColors(html: string): string[] {
  return uniquePreserveOrder(
    [...html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0] ?? ''),
  ).slice(0, 16);
}

/** Include modern CSS colors (oklch/etc.) so non-hex templates still ship palette cues. */
function extractPaletteCues(html: string): string[] {
  const hex = extractHexColors(html);
  const modern = uniquePreserveOrder(
    [...html.matchAll(/\b(?:oklch|oklab|color-mix)\([^)]+\)/gi)].map((m) => m[0] ?? ''),
  ).slice(0, 8);
  return uniquePreserveOrder([...hex, ...modern]).slice(0, 20);
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
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)|color-mix\([^)]+\)/i,
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
 * Per-slide shells like `.slide-1` / `.slide-title` / `.slide-2` (no descendants).
 * Coral/Cobalt put cream paper here while `html,body` stays dark chrome.
 * Exclude chrome: `.slide-counter`, `.slide-nav`, etc.
 */
function isSlideVariantSurfaceSelector(part: string): boolean {
  const trimmed = part.trim();
  if (!/^(?:[a-z][a-z0-9]*)?\.slide-[a-z0-9_-]+$/i.test(trimmed)) return false;
  if (/\.slide-(?:counter|nav|dot|dots|active|index|number|btn|button|link|arrow)\b/i.test(trimmed)) {
    return false;
  }
  return true;
}

function readBackgroundColorPair(
  ruleBody: string,
  rootBlock: string | null,
): { background: string | null; color: string | null } {
  const bg = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(ruleBody)?.[1];
  const c = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(ruleBody)?.[1];
  const background = bg ? resolveCssTokenValue(rootBlock, bg) : null;
  const color = c ? resolveCssTokenValue(rootBlock, c) : null;
  // Ignore near-transparent overlays — not the slide paper.
  if (background && /^(?:transparent|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0(?:\.0+)?\s*\))$/i.test(background)) {
    return { background: null, color };
  }
  return { background, color };
}

function majoritySlidePaper(
  rules: RegExpMatchArray[],
  rootBlock: string | null,
): { background: string | null; color: string | null; source: string | null; count: number } {
  const tallies = new Map<string, { count: number; color: string | null; source: string }>();
  for (const rule of rules) {
    const selectors = splitCssSelectors(rule[1] ?? '');
    const variant = selectors.find(isSlideVariantSurfaceSelector);
    if (!variant) continue;
    const pair = readBackgroundColorPair(rule[2] ?? '', rootBlock);
    if (!pair.background) continue;
    const prev = tallies.get(pair.background) ?? {
      count: 0,
      color: null,
      source: variant,
    };
    prev.count += 1;
    prev.color ??= pair.color;
    tallies.set(pair.background, prev);
  }
  let best: { background: string; count: number; color: string | null; source: string } | null = null;
  for (const [background, meta] of tallies) {
    if (!best || meta.count > best.count) {
      best = { background, count: meta.count, color: meta.color, source: meta.source };
    }
  }
  if (!best) {
    return { background: null, color: null, source: null, count: 0 };
  }
  return {
    background: best.background,
    color: best.color,
    source: best.source,
    count: best.count,
  };
}

function paperTokenFromRoot(
  rootBlock: string | null,
): { background: string | null; color: string | null; source: string | null } {
  if (!rootBlock) return { background: null, color: null, source: null };
  const vars = extractCssVariables(rootBlock);
  let background: string | null = null;
  let source: string | null = null;
  for (const name of ['cream', 'paper', 'surface', 'bg', 'background'] as const) {
    if (!vars[name]) continue;
    const resolved = resolveCssTokenValue(rootBlock, `var(--${name})`);
    if (!resolved) continue;
    background = resolved;
    source = `--${name}`;
    break;
  }
  let color: string | null = null;
  for (const name of ['text-dark', 'text', 'foreground', 'ink', 'black'] as const) {
    if (!vars[name]) continue;
    color = resolveCssTokenValue(rootBlock, `var(--${name})`);
    if (color) break;
  }
  return { background, color, source };
}

/**
 * Resolve the template's slide paper surface into concrete colors.
 * Prefer real slide paper (`.slide-N` / `.slide` / `--cream|--paper`) over
 * `html,body` stage chrome when they differ (Coral dark body + cream slides).
 */
function extractSlideSurfaceBinding(
  html: string,
  rootBlock: string | null,
): { background: string | null; color: string | null; source: string | null } {
  const sheet = extractStyleSheets(html);
  const rules = [...sheet.matchAll(/([^{}@][^{]*)\{([^}]+)\}/g)];

  const readPair = (
    match: (part: string) => boolean,
  ): { background: string | null; color: string | null } => {
    let background: string | null = null;
    let color: string | null = null;
    for (const rule of rules) {
      if (!splitCssSelectors(rule[1] ?? '').some(match)) continue;
      const pair = readBackgroundColorPair(rule[2] ?? '', rootBlock);
      background ??= pair.background;
      color ??= pair.color;
      if (background && color) break;
    }
    return { background, color };
  };

  const body = readPair(isDocumentSurfaceSelector);
  const slide = readPair(isSlideSurfaceSelector);
  const variantPaper = majoritySlidePaper(rules, rootBlock);
  const tokenPaper = paperTokenFromRoot(rootBlock);

  const preferPaperOverBodyChrome = (
    paper: { background: string | null; color: string | null; source: string | null },
  ) => {
    if (!paper.background || !body.background) return null;
    if (
      contrastLabel(paper.background) !== 'unknown'
      && contrastLabel(body.background) !== 'unknown'
      && contrastLabel(paper.background) !== contrastLabel(body.background)
    ) {
      return {
        background: paper.background,
        color: paper.color
          ?? tokenPaper.color
          ?? slide.color
          ?? (contrastLabel(paper.background) === 'light' ? body.color : null),
        source: paper.source,
      };
    }
    return null;
  };

  // 1) Bare `.slide` surface when present (Daisy Days `.slide{background:var(--cream)}`).
  if (slide.background) {
    const overChrome = preferPaperOverBodyChrome({ ...slide, source: '.slide' });
    if (overChrome) return overChrome;
    return {
      background: slide.background,
      color: slide.color ?? tokenPaper.color ?? body.color,
      source: '.slide',
    };
  }

  // 2) Majority `.slide-N` paper when body is contrasting chrome (Coral).
  // Require ≥2 matching slide shells so a single `.slide-title` accent can't win.
  if (variantPaper.background && variantPaper.count >= 2) {
    const overChrome = preferPaperOverBodyChrome(variantPaper);
    if (overChrome) return overChrome;
  }

  // 3) :root --cream/--paper when body chrome disagrees.
  const fromToken = preferPaperOverBodyChrome(tokenPaper);
  if (fromToken) return fromToken;

  if (variantPaper.background) {
    return {
      background: variantPaper.background,
      color: variantPaper.color ?? tokenPaper.color ?? body.color,
      source: variantPaper.source,
    };
  }
  if (tokenPaper.background) {
    return {
      background: tokenPaper.background,
      color: tokenPaper.color ?? body.color,
      source: tokenPaper.source,
    };
  }
  if (body.background || body.color) {
    return {
      background: body.background,
      color: body.color ?? tokenPaper.color,
      source: 'body',
    };
  }
  return { background: null, color: null, source: null };
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
/**
 * Strip declarations that lock the deck to the browser viewport instead of
 * the fixed 1920×1080 Teamver canvas. `example.html` templates (Zhangzara
 * Daisy Days, most `html-ppt-*`) ship a scroll-snap presenter layout —
 * `width:100vw; height:100vh; scroll-snap-*` — that only works full-screen.
 * When Decoration / Layout CSS blocks include those declarations verbatim,
 * models paste them into the deck `<style>` and the preview panel stretches
 * with the browser (user report 2026-08-13 "ppt 사이즈에 맞지 않고 full size로
 * 만드는데다가 브라우저 사이즈에 따라서 비율이 계속 바뀜").
 */
function sanitizeCssRuleForFixedCanvas(rule: string): string | null {
  const trimmed = rule.trim();
  if (!trimmed) return null;
  const braceOpen = trimmed.indexOf('{');
  const braceClose = trimmed.lastIndexOf('}');
  if (braceOpen < 0 || braceClose < braceOpen) return trimmed;
  const selector = trimmed.slice(0, braceOpen).trim();
  const body = trimmed.slice(braceOpen + 1, braceClose);
  // Drop rules that only exist to lock the whole doc to the viewport.
  if (
    /^(?:html\s*,\s*body|html|body|\.slides-container)$/i.test(selector)
    || /^\.slide$/i.test(selector)
  ) {
    // These rules are always about page-level sizing / scroll plumbing that
    // conflicts with the Teamver canvas. Keep them out of Decoration/Layout
    // CSS entirely — the compact contract owns slide sizing.
    return null;
  }
  const kept = body
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const [rawProp, ...rest] = decl.split(':');
      const prop = (rawProp ?? '').trim().toLowerCase();
      const value = rest.join(':').trim().toLowerCase();
      if (!prop || !value) return false;
      // Viewport-relative sizing on ANY selector — a `.slide-title{height:100vh}`
      // still stretches the slide to the browser.
      if (/^(?:min-|max-)?(?:width|height)$/i.test(prop) && /\b\d+\s*v(?:w|h|min|max|i|b)\b/i.test(value)) {
        return false;
      }
      // Scroll-snap plumbing is presenter-mode only.
      if (/^scroll-snap-(?:type|align|stop)$/i.test(prop) || prop === 'scroll-behavior') return false;
      return true;
    });
  if (kept.length === 0) return null;
  return `${selector}{${kept.join(';')}}`;
}

function extractDecorationCss(html: string, budget: number): string | null {
  const sheet = extractStyleSheets(html);
  if (!sheet.trim()) return null;
  const rules = [...sheet.matchAll(/[^{}@][^{]*\{[^}]+\}/g)]
    .map((match) => compressCss(match[0] ?? ''))
    .map((rule) => sanitizeCssRuleForFixedCanvas(rule))
    .filter((rule): rule is string => Boolean(rule));
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

/**
 * Layout-critical CSS (grid/flex/padding/regions) so decks match template
 * placement — not just palette + a few ornaments.
 */
function extractLayoutCss(html: string, budget: number): string | null {
  const sheet = extractStyleSheets(html);
  if (!sheet.trim()) return null;
  const rules = [...sheet.matchAll(/[^{}@][^{]*\{[^}]+\}/g)]
    .map((match) => compressCss(match[0] ?? ''))
    .map((rule) => sanitizeCssRuleForFixedCanvas(rule))
    .filter((rule): rule is string => Boolean(rule));
  const prioritized = rules.filter((rule) =>
    /display\s*:\s*(?:flex|grid)/i.test(rule)
    || /grid-template/i.test(rule)
    || /flex-direction|justify-content|align-items|gap\s*:/i.test(rule)
    || /\.slide-[a-z0-9_-]+/i.test(rule)
    || /\.(?:title-box|weekly-grid|timeline|welcome-|day-card|card-grid|columns?|hero|meta-row|bottom-section|top-section)\b/i.test(rule),
  );
  prioritized.sort((a, b) => {
    const score = (rule: string) => {
      if (/grid-template|display\s*:\s*grid/i.test(rule)) return 0;
      if (/display\s*:\s*flex/i.test(rule)) return 1;
      if (/\.slide-[a-z0-9_-]+/i.test(rule)) return 2;
      return 3;
    };
    return score(a) - score(b);
  });
  const picked: string[] = [];
  let used = 0;
  for (const rule of prioritized) {
    if (picked.length >= 16) break;
    if (used + rule.length + 1 > budget) continue;
    // Skip pure opacity/visibility chrome from OD stage decks.
    if (/opacity\s*:\s*0|visibility\s*:\s*hidden/i.test(rule) && !/display\s*:/i.test(rule)) {
      continue;
    }
    picked.push(rule);
    used += rule.length + 1;
  }
  if (picked.length === 0) return null;
  return picked.join('\n');
}

function renderMustMatchLookBlock(options: {
  background: string | null;
  color: string | null;
  fonts: readonly string[];
  hasScaffoldMap: boolean;
}): string {
  const lines = [
    '### Must-match look (failed deliverable if missed)',
    '',
    'The finished deck must **look like this template**, not a Neutral reinterpretation:',
  ];
  if (options.background) {
    lines.push(
      `1. **Background/surface:** \`${options.background}\` on BOTH \`html\`/\`body\` AND every \`.slide\`${options.color ? ` (ink \`${options.color}\`)` : ''}.`,
    );
  } else {
    lines.push('1. **Background/surface:** use the kit Slide surface / main surface token on html/body AND every `.slide`.');
  }
  if (options.fonts.length > 0) {
    lines.push(
      `2. **Fonts:** ${options.fonts.slice(0, 4).join(' + ')} — include the Font import; do not substitute Inter/Noto/system-ui alone.`,
    );
  } else {
    lines.push('2. **Fonts:** bind kit font stacks / Font import when present; do not substitute a generic system stack.');
  }
  lines.push(
    options.hasScaffoldMap
      ? '3. **Layout/placement:** the Template scaffold map + Layout CSS below is your *layout vocabulary*. Pick the roles (cover, body, timeline, three-column, quote, chart, closing, …) that fit the user brief\'s actual content and skip the ones that don\'t. Reuse the same role across multiple slides when appropriate. Do NOT force every scaffold-map role into the deck, and do NOT flatten every slide into the same cover composition.'
      : '3. **Layout/placement:** reuse the template\'s multi-region compositions (grids/flex/cards) as a vocabulary. Pick and reorder freely to match the user brief; do not flatten every slide into the same cover composition.',
  );
  lines.push(
    '4. **Motif/density:** when Motif sprites / Decoration CSS are present, show them — sparse title-only slides are a failure.',
  );
  return lines.join('\n');
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

type MotifKind = ReturnType<typeof classifySvg>;

type MotifSprite = {
  kind: MotifKind;
  svg: string;
};

/**
 * Pick a few SMALL complete SVGs as pasteable motif sprites.
 * Named Daisy vocabulary wins when present; otherwise ship the smallest
 * complete in-range SVGs so non-floral templates still get pasteable motifs.
 */
function extractMotifSprites(html: string, budget: number): MotifSprite[] {
  const svgs = [...html.matchAll(/<svg\b[\s\S]*?<\/svg>/gi)]
    .map((match) => inlineSvgStyleBlock(match[0] ?? ''))
    .filter((svg) => svg.length >= SPRITE_MIN_CHARS && svg.length <= SPRITE_MAX_CHARS);

  const byKind: Partial<Record<Exclude<MotifKind, 'other'>, string>> = {};
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

  const order: Array<Exclude<MotifKind, 'other'>> = [
    'daisy',
    'star',
    'rainbow',
    'sun',
    'cloud',
  ];
  const out: MotifSprite[] = [];
  let used = 0;
  for (const kind of order) {
    const svg = byKind[kind];
    if (!svg) continue;
    if (used + svg.length + 40 > budget) continue;
    out.push({ kind, svg });
    used += svg.length + 40;
    if (out.length >= 3) break;
  }

  // Generalized fallback: any complete in-range SVG (pin-and-paper, cobalt,
  // scatterbrain, etc.) — never leave Motif sprites empty when HTML has SVGs.
  if (out.length < 3) {
    const smallest = [...svgs].sort((a, b) => a.length - b.length);
    for (const svg of smallest) {
      if (out.some((item) => item.svg === svg)) continue;
      if (used + svg.length + 40 > budget) continue;
      const kind = classifySvg(svg);
      out.push({ kind, svg });
      used += svg.length + 40;
      if (out.length >= 3) break;
    }
  }
  return out;
}

function decoClassMatchesAvailableSprites(
  decoClass: string,
  kinds: ReadonlySet<string>,
): boolean {
  if (kinds.size === 0) return true;
  const lower = decoClass.toLowerCase();
  const mentioned = (['daisy', 'star', 'rainbow', 'sun', 'cloud'] as const)
    .filter((kind) => lower.includes(kind));
  // Generic `.deco` wrappers without a motif kind stay; motif-named slots
  // without a matching Motif sprite are dropped so the model is not asked
  // to invent star/rainbow/sun SVGs the kit never provided.
  if (mentioned.length === 0) return true;
  return mentioned.some((kind) => kinds.has(kind));
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
  const divMatch =
    /<div\b[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*>[\s\S]{0,2400}?<\/div>/i.exec(
      html,
    );
  const raw = sectionMatch?.[0] ?? divMatch?.[0] ?? null;
  if (!raw) return null;
  const snippet = raw
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '<!-- use Motif sprites SVG inside .deco -->')
    .replace(/\s+/g, ' ')
    .trim();
  if (!snippet) return null;
  return snippet.length > budget ? `${snippet.slice(0, budget)}…` : snippet;
}

type SlideShell = { attrs: string; body: string };

/** Collect slide shells from `<section class="slide|s-*">` or `<div class="slide">`. */
function listSlideShells(html: string): SlideShell[] {
  const sections = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)]
    .map((match) => ({ attrs: match[1] ?? '', body: match[2] ?? '' }))
    .filter(({ attrs }) =>
      /\bslide\b/i.test(attrs)
      || /\bclass\s*=\s*["'][^"']*\bs-[a-z0-9_-]+/i.test(attrs)
      || /\bid\s*=\s*["']slide/i.test(attrs)
    );
  if (sections.length > 0) return sections;

  const opens = [...html.matchAll(
    /<div\b([^>]*\bclass\s*=\s*(["'])[^"']*\bslide\b[^"']*\2[^>]*)>/gi,
  )];
  const out: SlideShell[] = [];
  for (let i = 0; i < opens.length; i += 1) {
    const open = opens[i]!;
    const start = (open.index ?? 0) + open[0].length;
    const end = i + 1 < opens.length ? (opens[i + 1]!.index ?? html.length) : html.length;
    let body = html.slice(start, end);
    const close = body.lastIndexOf('</div>');
    if (close >= 0) body = body.slice(0, close);
    out.push({ attrs: open[1] ?? '', body });
  }
  return out;
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

function extractTemplateScaffoldMap(
  html: string,
  budget: number,
  availableSpriteKinds: ReadonlySet<string> = new Set(),
): string | null {
  const shells = listSlideShells(html);
  if (shells.length === 0) return null;
  const lines: string[] = [];
  let used = 0;
  for (let i = 0; i < Math.min(shells.length, 12); i += 1) {
    const attrs = shells[i]?.attrs ?? '';
    const body = shells[i]?.body ?? '';
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
        .map((match) => (match[1] ?? '').trim())
        .filter((cls) => decoClassMatchesAvailableSprites(cls, availableSpriteKinds)),
    ).slice(0, 4);
    const layoutRole = className
      .split(/\s+/)
      .find((cls) =>
        (cls.startsWith('slide-') && cls !== 'slide')
        || /^s-[a-z0-9_-]+$/i.test(cls)
      )
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
    'Token-safe layout contract from example.html (classes/roles only — not a full HTML dump). Replace visible content only; reuse Motif sprites below for deco slots.',
    ...lines,
  ].join('\n');
}

const HARD_RULES = [
  'Hard rules (non-negotiable):',
  '- **LOOK LIKE THE TEMPLATE — but restructure for the brief.** Background/surface, fonts, borders/shadows, and motif sprites MUST match this kit. Slide count, slide order, and per-slide composition MUST match the **user brief**, not the template\'s natural shell sequence. The template is a **visual and layout vocabulary** to draw from, not a slide skeleton to clone verbatim. A Neutral / "similar vibe" reinterpretation IS a failure — but so is a rigid shell-for-shell copy that keeps the template\'s Weekly Grid or Timeline when the brief has nothing to do with days-of-week or a schedule.',
  '- **LAYOUT VOCABULARY, NOT SHELL COPY:** treat `### Template scaffold map` (below) as a *catalog of available layouts* (cover / welcome / weekly-grid / timeline / chart / quote / three-column / closing / …). Pick the layout roles that fit the user brief\'s actual content. Reuse the same role across multiple content slides when appropriate; skip roles whose semantic doesn\'t fit (e.g. don\'t force `weekly-grid` on a sales pitch, don\'t force `timeline` on a static explainer). Slide count is driven by the user brief / Plugin `slideCount` / an auto default of 6–8, NOT by the template\'s shell count.',
  '- **BODY-FIRST:** emit `<body>` / filled `<section class="slide">` (or the template\'s slide wrapper) BEFORE a large `<head>`/`<style>` dump. Put Motif sprites + Layout/Decoration CSS in one short body `<style>` after slide 1 (or tiny inline tokens). A CSS-only truncation is a failed deliverable.',
  '- **Background:** bind `### Slide surface` on BOTH `html`/`body` AND every `.slide`. Dark-on-dark, light-on-light, or paper-slides-on-wrong-shell are failed deliverables. Ink/border tokens are stroke/text, not backgrounds.',
  '- **Fonts:** use kit Font import + font-family names exactly; do not substitute Inter/Noto/system-ui alone when the kit lists display/body faces.',
  '- Motif MUST be copied from **Motif sprites** / **Decoration CSS** below when present. Paste sprites VERBATIM into the template\'s ornament wrappers. Use only sprites listed in Motif sprites — never invent SVG/emoji for a missing slot. Copy at least one complete provided SVG on the cover when sprites are present.',
  '- **Forbidden motif substitutes:** unicode/emoji ornaments as decoration pretending to be the template identity. Do not invent ellipse "daisy" SVGs or generic flower geometry when sprites are provided.',
  '- Preserve chunky cards/borders/offset shadows when Decoration CSS / `:root` tokens show them (`--border`, `--shadow`).',
  '- Do not substitute OD skeleton terracotta `#c96442` unless that hex is listed in this kit\'s palette cues.',
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
  const colors = extractPaletteCues(source);
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

  // Extract optional sections first, then pack by priority so Motif sprites
  // and layout CSS cannot be squeezed out by cue growth.
  const sprites = extractMotifSprites(source, 3_400);
  const spriteKinds = new Set(sprites.map((sprite) => sprite.kind));
  const scaffold = extractTemplateScaffoldMap(source, 1_000, spriteKinds);
  // Keep Decoration CSS in the kit when the template is ornament-heavy (Daisy).
  // Layout CSS is important too, but a missing `.deco` block regresses look more.
  const deco = extractDecorationCss(source, 820);
  const layout = extractLayoutCss(source, deco ? 900 : 1_200);
  const slideCue = extractFirstSlideStructureCue(source, 320);

  lines.push(
    renderMustMatchLookBlock({
      background: surfaceBinding.background,
      color: surfaceBinding.color,
      fonts,
      hasScaffoldMap: Boolean(scaffold),
    }),
    '',
  );

  const spriteBlock: string[] = [];
  if (sprites.length > 0) {
    spriteBlock.push(
      '### Motif sprites (complete SVGs — copy into the template ornament wrappers)',
      '',
      'Copy at least one complete SVG from this block onto the cover. Reuse these sprites in the template\'s `.deco` / ornament slots (2–4 per slide when the template is decorative). Paste sprites VERBATIM (keep fill/stroke/`<style>` classes). When Decoration CSS lists multiple matching corner slots, fill them — one lonely ornament is not the template. Do not invent emoji ornaments or generic geometry. Do not paste every sprite into `<head>` before writing slides — BODY-FIRST.',
      '',
    );
    for (const sprite of sprites) {
      spriteBlock.push('```html', sprite.svg, '```', '');
    }
  }

  // Pack Motif + map + deco first (look fidelity), then layout CSS, cue last.
  const optionalBlocks: string[][] = [spriteBlock];
  if (scaffold) {
    optionalBlocks.push([
      '### Template scaffold map (layout vocabulary — pick appropriate roles for the user brief)',
      '',
      'This is a **catalog of the template\'s available slide layouts and roles**, NOT a slide order to clone verbatim. Pick the layouts that fit the user brief\'s actual content — do NOT force a Weekly Grid, Timeline, or Chart layout just because the template ships one, if the brief is not about time / progression / data. Reuse the same layout role across multiple content slides when appropriate. Slide count is driven by the user brief / Plugin `slideCount` / an auto default of 6–8 — NOT by the template\'s natural shell count.',
      '',
      '```text',
      scaffold,
      '```',
      '',
    ]);
  }
  if (deco) {
    optionalBlocks.push([
      '### Decoration CSS (paste into the short body `<style>` AFTER slide 1)',
      '',
      '```css',
      deco,
      '```',
      '',
    ]);
  }
  if (layout) {
    optionalBlocks.push([
      '### Layout CSS (grids/flex/regions — paste into the short body `<style>` AFTER slide 1)',
      '',
      '```css',
      layout,
      '```',
      '',
    ]);
  }
  if (slideCue) {
    optionalBlocks.push([
      '### First-slide structure cue (SVGs omitted — use Motif sprites above)',
      '',
      '```html',
      slideCue,
      '```',
      '',
    ]);
  }

  for (const block of optionalBlocks) {
    if (block.length === 0) continue;
    const candidate = [...lines, ...block].join('\n').trim();
    if (candidate.length > maxChars) {
      // Never drop Motif sprites for a structure cue / extra deco — skip this block.
      if (block === spriteBlock) {
        // Try packing sprites alone by dropping later optionals (already skipped).
        // If even sprites overflow, keep as many complete sprites as fit.
        const kept = [...lines];
        kept.push(
          '### Motif sprites (complete SVGs — copy into corner `<div class="deco …">` wrappers)',
          '',
          'Copy at least one complete SVG from this block onto the cover. Paste sprites VERBATIM. BODY-FIRST.',
          '',
        );
        for (const sprite of sprites) {
          const next = [...kept, '```html', sprite.svg, '```', ''].join('\n').trim();
          if (next.length > maxChars) break;
          kept.push('```html', sprite.svg, '```', '');
        }
        lines.length = 0;
        lines.push(...kept);
      }
      continue;
    }
    lines.push(...block);
  }

  let out = lines.join('\n').trim();
  if (out.length > maxChars) {
    out = out
      .replace(/\n### First-slide structure cue[\s\S]*$/i, '')
      .trim();
  }
  if (out.length > maxChars) {
    // Last resort: never emit a mid-cut SVG — trim only after a fence close.
    const cut = out.slice(0, maxChars - 1);
    const fence = cut.lastIndexOf('\n```');
    out = fence > maxChars * 0.5 ? `${cut.slice(0, fence + 4)}\n…` : `${cut}…`;
  }
  return out;
}

/**
 * API / Teamver mode cannot clone template files. Neutralize SKILL.md
 * "Clone example.html" workflow steps so they cannot override the
 * token-safe visual-kit content-swap contract.
 */
export function neutralizeFilesystemCloneWorkflow(skillBody: string): string {
  const body = skillBody ?? '';
  if (!/Clone\s+`?example\.html`?/i.test(body)) return body;
  const apiStep =
    '**API / Teamver mode — do not clone files.** Bind the Template visual kit + scaffold map; content-swap Source text into those layouts. Never dump or rewrite a full example.html.';
  return body
    .replace(
      /^(\d+\.\s+)\*\*Clone `example\.html`(?:\s+AND the `assets\/` folder)?\*\*[^\n]*/gim,
      `$1${apiStep}`,
    )
    .replace(
      /^(?!\d+\.\s).*Clone\s+`?example\.html`?[^\n]*/gim,
      apiStep,
    )
    .replace(
      /^\s*\(daemon\s*\/\s*local skill runs with tools\)\.\s*In Teamver API mode,\s*skip clone\s*[—\-]\s*bind the visual kit tokens instead\.\s*$/gim,
      '',
    );
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

/**
 * First Clone content-fill turns hang when the model pastes multi-KB Motif SVGs
 * / Decoration / Layout CSS before cover titles (OD succeeds because it edits a
 * cloned file in place — Teamver BYOK regenerates). Slim the kit to
 * palette/fonts/surface (+ short scaffold map) for fill stability.
 */
export function slimTemplateVisualKitForFill(skillBody: string): string {
  const body = String(skillBody ?? '');
  if (!body.includes('## Template visual kit (from example.html)')) return body;
  let next = body;
  next = next.replace(
    /### Motif sprites[\s\S]*?(?=\n### |\n## |$)/g,
    [
      '### Motif sprites (omitted for first content-fill stability)',
      '',
      'Do NOT paste Motif `<svg>` markup on this fill turn — large SVG+`<style>` dumps stall after a few lines.',
      'Use kit palette hex + fonts + CSS circles / rounded cards / chunky borders for decoration instead.',
      'Motif SVGs can be added later in a follow-up edit after a closed deck exists.',
      '',
    ].join('\n'),
  );
  next = next.replace(
    /### Decoration CSS[\s\S]*?(?=\n### |\n## |$)/g,
    [
      '### Decoration CSS (omitted for first content-fill stability)',
      '',
      'Use simple CSS shapes / chunky borders in kit palette hex. Do not paste Decoration CSS blocks this turn.',
      '',
    ].join('\n'),
  );
  next = next.replace(
    /### Layout CSS[\s\S]*?(?=\n### |\n## |$)/g,
    [
      '### Layout CSS (omitted for first content-fill stability)',
      '',
      'Use simple flex/grid inline styles. Do not paste Layout CSS blocks this turn.',
      '',
    ].join('\n'),
  );
  next = next.replace(
    /### First-slide structure cue[\s\S]*?(?=\n### |\n## |$)/g,
    '',
  );
  next = next.replace(
    /- Motif MUST be copied from[\s\S]*?(?=\n- |\n### |\n## |$)/g,
    '- Motif SVG paste is DISABLED for first content-fill. Decorate with CSS shapes in kit palette hex only.\n',
  );
  next = next.replace(
    /Copy at least one complete (?:provided )?SVG[^\n]*/gi,
    'Do not copy Motif SVGs on this fill turn — CSS shapes only.',
  );
  next = next.replace(
    /Paste sprites VERBATIM[^\n]*/gi,
    'Do not paste sprites on this fill turn.',
  );
  next = next.replace(
    /Every slide should carry 1–3 recognizable Motif sprites[^\n]*/gi,
    'Every slide should use kit palette + fonts; Motif SVGs are deferred until after a closed deck.',
  );
  next = next.replace(
    /4\.\s*\*\*Motif\/density:\*\*[^\n]*/gi,
    '4. **Motif/density:** deferred — CSS shapes only on first fill; Motif SVGs later.',
  );
  return next;
}

/** @deprecated Use slimTemplateVisualKitForFill — kept for older call sites. */
export function stripTemplateVisualKitMotifSpritesForFill(skillBody: string): string {
  return slimTemplateVisualKitForFill(skillBody);
}
