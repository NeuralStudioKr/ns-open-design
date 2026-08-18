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
const DEFAULT_MAX_CHARS = 16_000;

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

type IdentityScope = {
  className: string | null;
  tokenCss: string | null;
  background: string | null;
  color: string | null;
  fonts: string[];
};

/**
 * html-ppt full-decks ship a shared light `:root` plus the real look on
 * `.tpl-*` / `.theme-*` (Hermes `--hc-bg:#0a0c10`, Graphify dark gradient).
 * Identity scope wins over the shared white/Inter defaults.
 */
function extractIdentityScope(html: string): IdentityScope {
  const empty: IdentityScope = {
    className: null,
    tokenCss: null,
    background: null,
    color: null,
    fonts: [],
  };
  const bodyClass = /<body\b[^>]*class\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ?? '';
  const fromBody = bodyClass.split(/\s+/).find((cls) => /^(?:tpl|theme)-/i.test(cls)) ?? null;
  // Comment-stripped sheets only — raw HTML comments can poison `.tpl-x {`.
  const sheet = extractStyleSheets(html);
  const hosts = [...sheet.matchAll(/\.((?:tpl|theme)-[a-z0-9_-]+)\s*\{([^}]+)\}/gi)];
  let bestClass = fromBody;
  let bestBody = '';
  let bestScore = -1;
  for (const rule of hosts) {
    const cls = (rule[1] ?? '').toLowerCase();
    const body = rule[2] ?? '';
    const varCount = (body.match(/--[a-zA-Z0-9_-]+\s*:/g) ?? []).length;
    const hasSurface = /background(?:-color)?\s*:/i.test(body);
    if (varCount === 0 && !hasSurface) continue;
    const score = (fromBody && cls === fromBody.toLowerCase() ? 100 : 0)
      + varCount
      + (hasSurface ? 5 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestClass = fromBody && cls === fromBody.toLowerCase() ? fromBody : cls;
      bestBody = body;
    }
  }
  if (!bestBody && !bestClass) return empty;
  const identityRoot = bestBody ? `:root{ ${compressCss(bestBody)} }` : null;
  const pair = readBackgroundColorPair(bestBody, identityRoot);
  const fonts: string[] = [];
  if (bestClass) {
    const escaped = bestClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const scoped = new RegExp(`\\.${escaped}[^{]*\\{([^}]+)\\}`, 'gi');
    for (const rule of sheet.matchAll(scoped)) {
      for (const match of (rule[1] ?? '').matchAll(/font-family\s*:\s*([^;!}{]+)/gi)) {
        const name = firstFontFamilyName(match[1] ?? '');
        if (name) fonts.push(name);
      }
    }
  }
  return {
    className: bestClass,
    tokenCss: bestBody ? compressCss(bestBody) : null,
    background: pair.background,
    color: pair.color,
    fonts: uniquePreserveOrder(fonts),
  };
}

function mergeCssVariableMaps(
  ...blocks: Array<string | null | undefined>
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const block of blocks) {
    if (!block) continue;
    Object.assign(vars, extractCssVariables(`:root{ ${block} }`));
  }
  return vars;
}

function formatRootCssFromVars(vars: Record<string, string>): string | null {
  const keys = Object.keys(vars);
  if (keys.length === 0) return null;
  const inner = keys.map((key) => `--${key}: ${vars[key]}`).join('; ');
  return `:root{ ${inner} }`;
}

function extractRootCssBlock(html: string, identity: IdentityScope | null = null): string | null {
  const rootInners = [...html.matchAll(/:root\s*\{([\s\S]*?)\}/gi)]
    .map((match) => match[1] ?? '')
    .filter(Boolean);
  const vars = mergeCssVariableMaps(...rootInners, identity?.tokenCss);
  return formatRootCssFromVars(vars);
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

function extractFontFamilies(html: string, identityFonts: readonly string[] = []): string[] {
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
  return uniquePreserveOrder([
    ...identityFonts,
    ...fromCssVars,
    ...fromFontFamily,
    ...fromLinks,
  ]).slice(0, 8);
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

/**
 * Rank surface tokens so html-ppt identity (`--hc-bg`, `--gd-bg`) wins over
 * the shared light `--surface` / `--bg` that every full-deck ships.
 */
function pickSurfaceTokenName(vars: Record<string, string>): string | null {
  if (vars.cream?.trim()) return 'cream';
  if (vars.paper?.trim()) return 'paper';
  const namedBg = Object.keys(vars)
    .sort()
    .find((name) => /-(?:bg|background)$/.test(name) && name !== 'bg' && name !== 'background' && vars[name]?.trim());
  if (namedBg) return namedBg;
  if (vars.surface?.trim()) return 'surface';
  if (vars.bg?.trim()) return 'bg';
  if (vars.background?.trim()) return 'background';
  return null;
}

function pickInkTokenName(vars: Record<string, string>): string | null {
  const namedInk = Object.keys(vars)
    .sort()
    .find((name) => /-(?:ink|fg|text)$/.test(name) && !['ink', 'text', 'fg'].includes(name) && vars[name]?.trim());
  if (namedInk) return namedInk;
  if (vars['text-dark']?.trim()) return 'text-dark';
  if (vars.ink?.trim()) return 'ink';
  if (vars.foreground?.trim()) return 'foreground';
  if (vars.text?.trim()) return 'text';
  if (vars.fg?.trim()) return 'fg';
  return null;
}

function buildTemplateAnchorSummary(options: {
  title: string;
  rootCss: string | null;
  fonts: readonly string[];
}): string[] {
  const vars = extractCssVariables(options.rootCss);
  const anchors: string[] = [];
  const surfaceName = pickSurfaceTokenName(vars);
  const inkName = pickInkTokenName(vars);
  const surface = surfaceName && vars[surfaceName] ? `--${surfaceName} ${vars[surfaceName]}` : firstVarValue(vars, ['cream', 'paper', 'surface', 'bg', 'background']);
  const text = inkName && vars[inkName] ? `--${inkName} ${vars[inkName]}` : firstVarValue(vars, ['text-dark', 'text', 'foreground', 'ink']);
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
  anchors.push(
    '- Identity lock: bind THIS kit\'s Slide surface + Fonts + Palette cues. Decorative density must use THIS kit\'s Motif/Decoration classes (or capped sprites AFTER title) — never another template\'s ornaments.',
  );
  return anchors;
}

function extractStyleSheets(html: string): string {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
}

function resolveCssTokenValue(rootBlock: string | null, expr: string): string | null {
  const trimmed = expr.trim();
  if (!trimmed) return null;
  if (/^(?:linear|radial|conic)-gradient\(/i.test(trimmed)) {
    return trimmed.length > 220 ? trimmed.slice(0, 220) : trimmed;
  }
  const literal = trimmed.match(
    /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)|oklab\([^)]+\)|color-mix\([^)]+\)/i,
  )?.[0];
  if (literal && !/^var\(/i.test(trimmed) && !/gradient\(/i.test(trimmed)) return literal;
  if (/gradient\(/i.test(trimmed) && !/^var\(/i.test(trimmed)) {
    return trimmed.length > 220 ? trimmed.slice(0, 220) : trimmed;
  }
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
  const surfaceName = pickSurfaceTokenName(vars);
  const inkName = pickInkTokenName(vars);
  let background: string | null = null;
  let source: string | null = null;
  if (surfaceName && vars[surfaceName]) {
    const resolved = resolveCssTokenValue(rootBlock, `var(--${surfaceName})`);
    if (resolved) {
      background = resolved;
      source = `--${surfaceName}`;
    }
  }
  const color = inkName
    ? resolveCssTokenValue(rootBlock, `var(--${inkName})`)
    : null;
  return { background, color, source };
}

/**
 * Resolve the template's slide paper surface into concrete colors.
 * Prefer real slide paper (`.slide-N` / `.slide` / `--cream|--paper`) over
 * `html,body` stage chrome when they differ (Coral dark body + cream slides).
 */
function isIdentitySlideSurfaceSelector(part: string, identity: IdentityScope | null): boolean {
  if (!identity?.className) return false;
  const host = identity.className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\.${host}\\b`, 'i').test(part) && /\.slide\b/i.test(part);
}

function extractSlideSurfaceBinding(
  html: string,
  rootBlock: string | null,
  identity: IdentityScope | null = null,
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
  const identitySlide = readPair((part) => isIdentitySlideSurfaceSelector(part, identity));
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

  // 0) html-ppt identity `.tpl-* .slide` / host background beats shared white :root.
  if (identitySlide.background) {
    return {
      background: identitySlide.background,
      color: identitySlide.color ?? identity?.color ?? tokenPaper.color ?? slide.color ?? body.color,
      source: identity?.className ? `.${identity.className} .slide` : '.slide',
    };
  }
  if (identity?.background) {
    return {
      background: identity.background,
      color: identity.color ?? tokenPaper.color ?? body.color,
      source: identity.className ? `.${identity.className}` : tokenPaper.source,
    };
  }

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
      ? 'Contrast: **light background + dark ink**. Paint BOTH `html, body` AND every `.slide` with these hexes **edge-to-edge for the full 1920×1080 canvas**. Painting only `.slide` leaves a wrong preview-panel letterbox; painting only an inner paper panel leaves white top/bottom bands. Never use an ink/border token (e.g. `#2D2D2D`) as a background.'
      : bgLabel === 'dark'
        ? 'Contrast: **dark background + light ink**. Paint BOTH `html, body` AND every `.slide` edge-to-edge. Never leave `body` on a light default around dark slides.'
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

/** Catalog-wide Motif class lexicon — not Capsule/Daisy-only. */
const MOTIF_CLASS_TOKEN_RE =
  /\b(?:deco(?:-[a-z0-9_-]+)?|pill(?:-[a-z0-9_-]+)?|deco-pills|floating-pills|[cf]-pill|blob(?:-[a-z0-9_-]+)?|petal(?:s)?|stamp|tape|pin|doodle|scribble(?:-[a-z0-9_-]+)?|shape|sticker|dot-grid|ornament|floater|spark|confetti|grain|pixel(?:-[a-z0-9_-]+)?|ribbon|glow|hairlines?|stripes?|bracket|corner-bracket|post-it(?:-[a-z0-9_-]+)?|cork|scanlines?|orb(?:-[a-z0-9_-]+)?|ambient|starfield|cross|cassette|jis|bg-cork|(?:tpl|theme)-[a-z0-9_-]+|(?:hc|gd|win)-[a-z0-9_-]+)\b/i;

const MOTIF_CSS_SELECTOR_RE =
  /\.(?:deco(?:-[a-z0-9_-]+)?|pill(?:-[a-z0-9_-]+)?|deco-pills|floating-pills|[cf]-pill|blob(?:-[a-z0-9_-]+)?|petal(?:s)?|stamp|tape|pin|doodle|scribble(?:-[a-z0-9_-]+)?|shape|sticker|dot-grid|ornament|floater|spark|confetti|grain|pixel(?:-[a-z0-9_-]+)?|ribbon|glow|hairlines?|stripes?|bracket|corner-bracket|post-it(?:-[a-z0-9_-]+)?|cork|scanlines?|orb(?:-[a-z0-9_-]+)?|ambient|starfield|cross|cassette|jis|(?:tpl|theme)-[a-z0-9_-]+|(?:hc|gd|win)-[a-z0-9_-]+)\b/i;

function listMotifVocabularyHints(text: string): string[] {
  const hints: string[] = [];
  if (/\.deco-pill\b|deco-pills|\.pill-[a-z0-9_-]+|\.c-pill\b|\.f-pill\b|\.orbit-pill\b/i.test(text)) {
    hints.push('`.deco-pill` / pill-* capsules');
  }
  if (/\.petal|\.blob/i.test(text)) hints.push('`.petal` / `.blob`');
  if (/\.stamp|\.tape|\.pin|\.post-it|\.doodle|\.scribble|\.bg-cork/i.test(text)) {
    hints.push('stamp/tape/pin/post-it/doodle ornaments');
  }
  if (/\.pixel-|\.starfield|\.scanline/i.test(text)) hints.push('pixel/arcade ornaments');
  if (/\.tpl-[a-z0-9_-]+|\.theme-[a-z0-9_-]+/i.test(text)) hints.push('identity `.tpl-*` / `.theme-*` host');
  if (/\.hc-[a-z0-9_-]+/i.test(text)) hints.push('`.hc-*` terminal chrome');
  if (/\.gd-[a-z0-9_-]+/i.test(text)) hints.push('`.gd-*` graph ornaments');
  if (/\.win-[a-z0-9_-]+/i.test(text)) hints.push('`.win-*` window chrome');
  if (/\.deco-(?:circle|dots|star|stripes|square)|\.dot-grid|\.corner-bracket/i.test(text)) {
    hints.push('geometric `.deco-*` / dot-grid shapes');
  }
  if (/\.shape\b|\.ribbon|\.glow|\.orb/i.test(text)) hints.push('shape/ribbon/glow/orb accents');
  if (/\.deco\b/i.test(text) && hints.length === 0) hints.push('kit `.deco` ornaments');
  if (/```html[\s\S]*?<svg\b|<svg\b/i.test(text)) hints.push('capped Motif SVG sprites (AFTER title)');
  return uniquePreserveOrder(hints);
}

function extractTemplateVisualKitTitle(text: string): string | null {
  return /^## Template visual kit \(from example\.html\)\s*(?:—|-)\s*([^\n]+)/im.exec(text)?.[1]?.trim() || null;
}

function listTemplateTitleMotifHints(text: string): string[] {
  const title = extractTemplateVisualKitTitle(text) ?? '';
  const lower = title.toLowerCase();
  const hints: string[] = [];
  if (/\bcapsules?\b/.test(lower)) hints.push('title cue: capsule / pill objects');
  if (/\bdaisy|flower|floral\b/.test(lower)) hints.push('title cue: daisy / flower objects');
  if (/\bgrid\b/.test(lower)) hints.push('title cue: grid geometry');
  if (/\bterminal|cyber|crt\b/.test(lower)) hints.push('title cue: terminal / CRT chrome');
  if (/\bgraph|chart|dashboard\b/.test(lower)) hints.push('title cue: graph / chart language');
  if (/\bretro|8\s*bit|pixel|orbit\b/.test(lower)) hints.push('title cue: retro / pixel / orbit accents');
  if (/\bcreative|studio|editorial|magazine\b/.test(lower)) hints.push('title cue: expressive editorial composition');
  if (/\bblue|cobalt\b/.test(lower)) hints.push('title cue: blue / cobalt palette');
  if (/\bcoral\b/.test(lower)) hints.push('title cue: coral palette accents');
  if (/\bobsidian|dark|black\b/.test(lower)) hints.push('title cue: dark / obsidian surface');
  return uniquePreserveOrder(hints);
}

function listConcreteMotifClassHints(
  text: string,
  availableSpriteKinds: ReadonlySet<string> = new Set(),
): string[] {
  return uniquePreserveOrder(
    [...text.matchAll(/\.([a-zA-Z0-9_-]+)/g)]
      .map((match) => match[1] ?? '')
      .filter((cls) => MOTIF_CLASS_TOKEN_RE.test(cls))
      .filter((cls) => decoClassMatchesAvailableSprites(cls, availableSpriteKinds))
      .map((cls) => `.${cls}`),
  ).slice(0, 18);
}

function formatMotifVocabularyGuidance(
  text: string,
  availableSpriteKinds: ReadonlySet<string> = new Set(),
): string {
  const hints = uniquePreserveOrder([
    ...listTemplateTitleMotifHints(text),
    ...listMotifVocabularyHints(text),
  ]);
  const concrete = listConcreteMotifClassHints(text, availableSpriteKinds);
  if (hints.length === 0 && concrete.length === 0) {
    return 'kit Motif CSS / sprites listed below (never invent generic circles or emoji when Motif cues exist)';
  }
  return [
    hints.join(' + '),
    concrete.length > 0 ? `concrete classes: ${concrete.join(', ')}` : '',
  ].filter(Boolean).join(' + ');
}

function renderMotifVocabularyBlock(
  text: string,
  availableSpriteKinds: ReadonlySet<string> = new Set(),
): string | null {
  const guidance = formatMotifVocabularyGuidance(text, availableSpriteKinds);
  if (/^kit Motif CSS \/ sprites listed below/i.test(guidance)) return null;
  return [
    '### Motif vocabulary (required compact cue)',
    '',
    `Required recognizable motif/style vocabulary from this selected template: ${guidance}.`,
    'Use these exact class/token families when they exist in Decorations CSS or scaffold map. If capped Motif SVGs are listed, place at most one AFTER title/lead; otherwise implement the same motif with the listed CSS classes and palette. Do not replace with plain generic circles, emoji, or another template family.',
    '',
  ].join('\n');
}

function extractDecorationCss(html: string, budget: number, identity: IdentityScope | null = null): string | null {
  const sheet = extractStyleSheets(html);
  if (!sheet.trim()) return null;
  const identityHost = identity?.className
    ? new RegExp(`\\.${identity.className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    : null;
  const rules = [...sheet.matchAll(/[^{}@][^{]*\{[^}]+\}/g)]
    .map((match) => compressCss(match[0] ?? ''))
    .map((rule) => sanitizeCssRuleForFixedCanvas(rule))
    .filter((rule): rule is string => Boolean(rule));
  const prioritized = rules.filter((rule) =>
    MOTIF_CSS_SELECTOR_RE.test(rule)
    || Boolean(identityHost?.test(rule))
    || /\.deco\b|\.card\b|\.badge\b|\.slide\b|--border|--shadow|--radius|font-display|font-body|border-radius\s*:\s*999/i.test(
      rule,
    ),
  );
  const score = (rule: string) => {
    if (identityHost?.test(rule) && /background(?:-color)?\s*:|--(?:[a-z0-9_-]+-)?(?:bg|ink|surface)/i.test(rule)) {
      return -1;
    }
    // Positioned Motif shells (pills/petals/blobs/pins/…) beat chrome.
    if (MOTIF_CSS_SELECTOR_RE.test(rule) && /position\s*:/i.test(rule)) return 0;
    if (/\.deco-pill\b|deco-pills|floating-pills|border-radius\s*:\s*999/i.test(rule) && MOTIF_CSS_SELECTOR_RE.test(rule)) {
      return 1;
    }
    // Identity color / named Motif tokens (pill-coral, petal, blob, stamp…).
    if (/\.pill-[a-z0-9_-]+|\.petal|\.blob|\.stamp|\.tape|\.pin|\.pixel-|\.shape\b|\.post-it|\.doodle|\.ribbon|\.orb/i.test(rule)) {
      return 2;
    }
    if (MOTIF_CSS_SELECTOR_RE.test(rule)) return 3;
    if (/\.deco\b|\.pill\b/i.test(rule)) return 4;
    if (/\.card\b|\.badge\b/i.test(rule)) return 5;
    if (/--border|--shadow|--radius/i.test(rule)) return 6;
    return 7;
  };
  prioritized.sort((a, b) => score(a) - score(b));
  const picked: string[] = [];
  let used = 0;
  const tryPick = (rule: string) => {
    if (picked.includes(rule)) return;
    if (picked.length >= 28) return;
    if (used + rule.length + 1 > budget) return;
    picked.push(rule);
    used += rule.length + 1;
  };
  // Phase 1: Motif vocabulary (shells + identity tokens) before generic chrome.
  for (const rule of prioritized) {
    if (score(rule) <= 2) tryPick(rule);
  }
  // Phase 2: remaining deco/card/slide chrome.
  for (const rule of prioritized) tryPick(rule);
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
    '4. **Motif/density:** when Motif sprites / Decorations CSS are present, use the kit Motif vocabulary listed there (pills, petals, blobs, pins, geometric `.deco-*`, sprites, …) — Motif SVG only AFTER title/lead. Sparse title-only slides are a failure; Motif-before-title hangs are also a failure.',
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
  const preferred = fonts[0];
  if (preferred) {
    const escaped = preferred
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/ /g, '(?:\\+|%20| )');
    const importRe = new RegExp(
      `@import url\\(('|")([^'"]*fonts\\.googleapis\\.com[^'"]*${escaped}[^'"]*)\\1\\)`,
      'i',
    );
    const fromImport = importRe.exec(html);
    if (fromImport?.[2]) return `@import url('${fromImport[2]}');`;
    const linkRe = new RegExp(
      `href=("|')([^"']*fonts\\.googleapis\\.com[^"']*${escaped}[^"']*)\\1`,
      'i',
    );
    const fromLink = linkRe.exec(html);
    if (fromLink?.[2]) return `@import url('${fromLink[2]}');`;
  }
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
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '<!-- kit Motif AFTER title/lead — Motif CSS or capped sprite -->')
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
      [...body.matchAll(/class\s*=\s*["']([^"']+)["']/gi)]
        .flatMap((match) => (match[1] ?? '').split(/\s+/))
        .map((cls) => cls.trim())
        .filter((cls) => MOTIF_CLASS_TOKEN_RE.test(cls))
        .filter((cls) => decoClassMatchesAvailableSprites(cls, availableSpriteKinds)),
    ).slice(0, 6);
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
    'Token-safe layout contract from example.html (classes/roles only — not a full HTML dump). Replace visible content only; decorate with kit Motif CSS/`.deco` first — Motif sprites are capped and only AFTER title/lead.',
    ...lines,
  ].join('\n');
}

const HARD_RULES = [
  'Hard rules (non-negotiable):',
  '- **LOOK LIKE THE TEMPLATE — but restructure for the brief.** Background/surface, fonts, borders/shadows, and motif sprites MUST match this kit. Slide count, slide order, and per-slide composition MUST match the **user brief**, not the template\'s natural shell sequence. The template is a **visual and layout vocabulary** to draw from, not a slide skeleton to clone verbatim. A Neutral / "similar vibe" reinterpretation IS a failure — but so is a rigid shell-for-shell copy that keeps the template\'s Weekly Grid or Timeline when the brief has nothing to do with days-of-week or a schedule.',
  '- **LAYOUT VOCABULARY, NOT SHELL COPY:** treat `### Template scaffold map` (below) as a *catalog of available layouts* (cover / welcome / weekly-grid / timeline / chart / quote / three-column / closing / …). Pick the layout roles that fit the user brief\'s actual content. Reuse the same role across multiple content slides when appropriate; skip roles whose semantic doesn\'t fit (e.g. don\'t force `weekly-grid` on a sales pitch, don\'t force `timeline` on a static explainer). Slide count is driven by the user brief / Plugin `slideCount` / an auto default of 6–8, NOT by the template\'s shell count.',
  '- **BODY-FIRST:** emit `<body>` / filled `<section class="slide">` (or the template\'s slide wrapper) BEFORE a large `<head>`/`<style>` dump. Put compact CSS/deco tokens (and optional Motif sprites only AFTER title/lead) in one short body `<style>` after slide 1 — never Motif SVG before cover copy. A CSS-only truncation is a failed deliverable.',
  '- **Background:** bind `### Slide surface` on BOTH `html`/`body` AND every `.slide` edge-to-edge (full 1920×1080). Dark-on-dark, light-on-light, paper-slides-on-wrong-shell, or white outer + inner cream panel (white top/bottom bands) are failed deliverables. Ink/border tokens are stroke/text, not backgrounds.',
  '- **Fonts:** use kit Font import + font-family names exactly; do not substitute Inter/Noto/system-ui alone when the kit lists display/body faces.',
  '- Motif language comes from **Motif sprites** / **Decorations CSS** below when present. Prefer the kit Motif vocabulary (pills/petals/blobs/pins/geometric `.deco-*`/sprites) in kit hex first. Motif SVG paste is optional: at most one short complete sprite AFTER visible title/lead on a slide, never before cover copy, never a multi-KB `<svg><style>` dump, and skip entirely if paste risks a hang. Use only listed sprites — never invent SVG/emoji for a missing slot.',
  '- **Forbidden motif substitutes:** unicode/emoji ornaments as decoration pretending to be the template identity. Do not invent ellipse "daisy" SVGs, generic flower geometry, or plain CSS circles when the kit lists Motif CSS/sprites.',
  '- Preserve chunky cards/borders/offset shadows when Decorations CSS / `:root` tokens show them (`--border`, `--shadow`).',
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
  const identity = extractIdentityScope(source);
  const root = extractRootCssBlock(source, identity);
  const rootForPrompt = identity.tokenCss
    ? formatRootCssFromVars(mergeCssVariableMaps(identity.tokenCss))
    : root;
  const fonts = extractFontFamilies(source, identity.fonts);
  const colors = extractPaletteCues(source);
  if (!root && !rootForPrompt && colors.length === 0 && fonts.length === 0) return null;

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
  if (rootForPrompt) {
    lines.push('### CSS tokens', '', '```css', rootForPrompt, '```', '');
  }
  const surfaceBinding = extractSlideSurfaceBinding(source, root, identity);
  const surfaceBlock = renderSlideSurfaceBlock(surfaceBinding, colors);
  if (surfaceBlock) {
    lines.push(surfaceBlock, '');
  }
  const anchors = buildTemplateAnchorSummary({ title, rootCss: rootForPrompt, fonts });
  if (identity.className && !anchors.some((line) => line.includes(identity.className!))) {
    anchors.unshift(`- Identity host class: \`.${identity.className}\``);
  }
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
  // Keep Decorations CSS in the kit when the template is ornament-heavy.
  // Layout CSS is important too, but a missing Motif block regresses look more.
  const deco = extractDecorationCss(source, 1_800, identity);
  const layout = extractLayoutCss(source, deco ? 900 : 1_200);
  const slideCue = extractFirstSlideStructureCue(source, 320);
  const motifVocabulary = renderMotifVocabularyBlock([
    `## Template visual kit (from example.html) — ${title}`,
    source,
    scaffold ?? '',
    deco ?? '',
  ].join('\n'), spriteKinds);

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
      '### Motif sprites (optional complete SVGs — AFTER title/lead only)',
      '',
      'These sprites are the ONLY allowed Motif SVG vocabulary (keep fill/stroke/`<style>` classes if you paste). Prefer CSS shapes / `.deco` / chunky borders for density. If you paste SVG: at most one short complete sprite AFTER visible title/lead on a slide; never open `<svg` before cover copy; never dump multiple sprites or a multi-KB `<svg><style>` block into `<head>`; skip Motif SVG entirely when paste risks a hang. Do not invent emoji ornaments or generic geometry. BODY-FIRST always.',
      '',
    );
    for (const sprite of sprites) {
      spriteBlock.push('```html', sprite.svg, '```', '');
    }
  }

  // Pack Motif + map + deco first (look fidelity), then layout CSS, cue last.
  const optionalBlocks: string[][] = [spriteBlock];
  if (motifVocabulary) {
    optionalBlocks.push([motifVocabulary]);
  }
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
      '### Decorations CSS (paste into the short body `<style>` AFTER slide 1)',
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
          '### Motif sprites (optional — AFTER title/lead only)',
          '',
          'Prefer CSS/`.deco` density. At most one short complete sprite AFTER title/lead; skip Motif SVG if hang risk. BODY-FIRST.',
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
  const needsRewrite =
    /Clone\s+`?example\.html`?/i.test(body)
    || /copy\s+`?index\.html`?/i.test(body)
    || /Start from the matching template folder/i.test(body)
    || /skills\/html-ppt\/templates\//i.test(body);
  if (!needsRewrite) return body;
  const apiStep =
    '**API / Teamver mode — do not clone files.** Bind the Template visual kit + scaffold map; content-swap Source text into those layouts. Never dump or rewrite a full example.html / index.html.';
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
      /^(\d+\.\s+)\*\*Start from the matching template folder:\*\*[^\n]*/gim,
      `$1${apiStep}`,
    )
    .replace(
      /^(\d+\.\s+)\*\*Bring the shared runtime with the template\.\*\*[^\n]*/gim,
      `$1${apiStep}`,
    )
    .replace(
      /copy\s+`index\.html`[^\n]*/gi,
      apiStep,
    )
    .replace(
      /skills\/html-ppt\/templates\/[^\s`]+/gi,
      'the selected template visual kit',
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
 * / full Decorations dumps BEFORE cover titles. Cap Motif/Deco for fill stability
 * while keeping each template's Motif vocabulary (sprites + Motif CSS lexicon).
 * Layout CSS + first-slide cues stay omitted.
 */
function capMotifSpritesSectionForFill(section: string): string {
  const svgs = [...section.matchAll(/```html\s*([\s\S]*?)```/gi)]
    .map((match) => (match[1] ?? '').trim())
    .filter((svg) => /^<svg\b/i.test(svg) && svg.length >= 80 && svg.length <= 2_400);
  const looksLikeDaisy = /deco-daisy|#F5F0E6/i.test(section);
  const identityScore = (svg: string) => {
    if (looksLikeDaisy && /#fcdf6c/i.test(svg)) return 0; // Daisy butter-center only for Daisy kits
    if (/#f8635f|#fde366|#8de3b7|#85c5fe|rainbow/i.test(svg)) return 1;
    if (/viewbox="0 0 100 98/i.test(svg) || /\bstar\b/i.test(svg)) return 2;
    if (/\bpin\b|#pin|doodle|stamp/i.test(svg)) return 3;
    return 4;
  };
  const ranked = [...svgs].sort((a, b) => {
    const delta = identityScore(a) - identityScore(b);
    if (delta !== 0) return delta;
    return b.length - a.length;
  });
  const kept: string[] = [];
  let used = 0;
  for (const svg of ranked) {
    if (kept.length >= 2) break;
    if (used + svg.length > 3_000) continue;
    kept.push(svg);
    used += svg.length;
  }
  const lines = [
    '### Motif sprites (capped for first content-fill — AFTER title/lead only)',
    '',
  ];
  if (kept.length > 0) {
    lines.push(
      'Paste ONLY these sprites, and ONLY AFTER a real cover `<h1>`/`<h2>` + lead. At most one short sprite per slide. Never open `<svg` before title copy. Do not invent ellipse flowers / emoji / generic circles.',
      '',
    );
    for (const svg of kept) {
      lines.push('```html', svg, '```', '');
    }
  } else {
    lines.push(
      `No compact Motif SVG survived the fill cap. Use **Decorations CSS** Motif vocabulary below (${formatMotifVocabularyGuidance(section)}). Do NOT invent generic CSS circles as Motif substitutes.`,
      '',
    );
  }
  return lines.join('\n');
}

function capDecorationsCssSectionForFill(section: string): string {
  const css = /```css\s*([\s\S]*?)```/i.exec(section)?.[1] ?? '';
  const rules = css
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const score = (rule: string) => {
    if (MOTIF_CSS_SELECTOR_RE.test(rule) && /position\s*:/i.test(rule)) return 0;
    if (/\.deco-pill\b|deco-pills|floating-pills|border-radius\s*:\s*999/i.test(rule) && MOTIF_CSS_SELECTOR_RE.test(rule)) {
      return 1;
    }
    if (/\.pill-[a-z0-9_-]+|\.petal|\.blob|\.stamp|\.tape|\.pin|\.pixel-|\.shape\b|\.post-it|\.doodle|\.ribbon|\.orb/i.test(rule)) {
      return 2;
    }
    if (MOTIF_CSS_SELECTOR_RE.test(rule)) return 3;
    if (/\.deco\b|\.pill\b/i.test(rule)) return 4;
    if (/\.card\b|\.badge\b/i.test(rule)) return 5;
    return 6;
  };
  rules.sort((a, b) => score(a) - score(b));
  const picked: string[] = [];
  let used = 0;
  const tryPick = (rule: string) => {
    if (picked.includes(rule)) return;
    if (picked.length >= 20) return;
    if (used + rule.length + 1 > 1_500) return;
    picked.push(rule);
    used += rule.length + 1;
  };
  for (const rule of rules) {
    if (score(rule) <= 2) tryPick(rule);
  }
  for (const rule of rules) tryPick(rule);
  const pickedCss = picked.join('\n');
  const vocab = formatMotifVocabularyGuidance(`${section}\n${pickedCss}`);
  const lines = [
    '### Decorations CSS (capped for first content-fill — paste AFTER slide 1)',
    '',
    `REQUIRED Motif vocabulary from this kit: ${vocab}. Do NOT invent generic CSS circles / emoji ornaments as substitutes.`,
  ];
  if (/\.deco-pill\b|\.pill-[a-z0-9_-]+/i.test(pickedCss)) {
    lines.push(
      'Example capsule (AFTER title): `<div class="deco-pill pill-coral" style="position:absolute;top:48px;left:64px;width:180px;height:72px;border-radius:9999px;border:2px solid #1A1A1A;background:#E85D4E"></div>`.',
    );
  } else if (/\.petal|\.blob/i.test(pickedCss)) {
    lines.push(
      'Example Motif (AFTER title): reuse kit `.petal` / `.blob` classes with absolute positioning — do not invent capsules or plain circles.',
    );
  } else if (/\.stamp|\.tape|\.pin|\.post-it|\.doodle/i.test(pickedCss)) {
    lines.push(
      'Example Motif (AFTER title): reuse kit stamp/tape/pin/post-it/doodle classes — do not invent capsules or plain circles.',
    );
  } else if (/\.deco-|pixel-|dot-grid|shape|ribbon|glow|orb/i.test(pickedCss)) {
    lines.push(
      'Example Motif (AFTER title): reuse the kit Motif classes above with absolute positioning in kit palette hex.',
    );
  }
  lines.push(
    '',
    '```css',
    ...(picked.length > 0
      ? picked
      : ['/* kit Motif rules unavailable — reuse Motif class names from scaffold/deco cues in kit palette hex */']),
    '```',
    '',
  );
  return lines.join('\n');
}

export function slimTemplateVisualKitForFill(skillBody: string): string {
  const body = String(skillBody ?? '');
  let next = body;
  if (next.includes('### Motif sprites')) {
    next = next.replace(
      /### Motif sprites[\s\S]*?(?=\n### |\n## |$)/g,
      (section) => capMotifSpritesSectionForFill(section),
    );
  }
  // Drop Motif SVGs that leaked outside the Motif section (structure cues etc.).
  // Keep the capped Motif fences we just wrote.
  next = next.replace(
    /### First-slide structure cue[\s\S]*?(?=\n### |\n## |$)/g,
    '',
  );
  if (/### Decorations? CSS/i.test(next)) {
    next = next.replace(
      /### Decorations? CSS[\s\S]*?(?=\n### |\n## |$)/gi,
      (section) => capDecorationsCssSectionForFill(section),
    );
  }
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
    /- Motif (?:MUST be copied from|language comes from)[\s\S]*?(?=\n- |\n### |\n## |$)/g,
    '- Motif vocabulary is REQUIRED from kit Motif sprites (AFTER title/lead) and/or Decorations CSS Motif classes listed in this kit. Never invent generic CSS circles or emoji ornaments when the kit provides Motif CSS/sprites.\n',
  );
  next = next.replace(
    /4\.\s*\*\*Motif\/density:\*\*[^\n]*/gi,
    '4. **Motif/density:** use capped kit Motif sprites AFTER title/lead and/or kit Motif CSS from Decorations — never generic circles when the kit has Motif vocabulary.',
  );
  next = next.replace(
    /treat its\s+CSS tokens, fonts, (?:Motif sprites|compact motif\/deco cues)[^\n]*/gi,
    'treat its CSS tokens, fonts, capped Motif sprites / Decorations CSS Motif vocabulary, and scaffold map as mandatory this fill turn.',
  );
  next = next.replace(
    /The cover MUST (?:show the provided daisy SVG motif|use kit cream\/ink \+ CSS-shape decoration)[^\n]*/gi,
    'The cover MUST use kit surface + kit Motif vocabulary (sprites AFTER title and/or Motif CSS classes) — not generic circles.',
  );
  next = next.replace(
    /when Motif sprites \/ Decorations CSS are present[^\n]*/gi,
    'when Motif sprites / Decorations CSS are present, use that Motif vocabulary (sprites AFTER title; Motif CSS classes from the kit) — never plain circle substitutes.',
  );
  next = next.replace(
    /<!-- (?:use Motif sprites SVG inside \.deco|optional Motif sprite AFTER title\/lead[^>]*) -->/gi,
    '<!-- kit Motif: sprite AFTER title or Motif CSS class — not a generic circle -->',
  );
  next = next.replace(
    /On first Clone content-fill:[^\n]*/gi,
    'On first Clone content-fill: title-first, then kit Motif vocabulary (capped sprites and/or Motif CSS). Never open Motif `<svg>` before cover title; never invent generic circles when the kit has Motif vocabulary.',
  );
  next = next.replace(
    /If Motif sprites are present[^\n]*/gi,
    'If Motif sprites are present, paste at most one short sprite AFTER visible title/body copy; otherwise use kit Motif CSS classes — not generic circles.',
  );
  next = next.replace(
    /Motif SVG paste is DISABLED[^\n]*/gi,
    'Motif vocabulary is REQUIRED from the capped kit Motif/Deco sections — title-first; no generic circles.',
  );
  next = next.replace(
    /Do not (?:copy|paste) Motif SVGs on this fill turn[^\n]*/gi,
    'Paste capped kit Motif sprites only AFTER title/lead; otherwise use kit Motif CSS from Decorations.',
  );
  next = next.replace(
    /Do not paste sprites on this fill turn\.?/gi,
    'Paste capped kit sprites only AFTER title/lead.',
  );
  next = next.replace(
    /Motif SVG vocabulary is omitted this fill turn[^\n]*/gi,
    'Use capped Motif sprites AFTER title/lead and/or kit Motif CSS — not generic circles.',
  );
  next = next.replace(
    /Prefer kit cream\/ink \+ CSS-shape daisy accents[^\n]*/gi,
    'Prefer kit Motif sprites AFTER title/lead (or kit Motif CSS cues) — not generic circles.',
  );
  next = next.replace(
    /Every slide should use kit palette \+ fonts; Motif SVGs are deferred[^\n]*/gi,
    'Every slide should use kit palette + fonts + kit Motif vocabulary (sprites AFTER title and/or Motif CSS).',
  );
  next = next.replace(
    /Motif sprites (?:are deferred this fill turn|below are optional AFTER title\/lead)\.?/gi,
    'Motif sprites are capped and only AFTER title/lead.',
  );
  next = next.replace(
    /decorate with CSS\/`\.deco` only — Motif sprites are deferred this fill turn\.?/gi,
    'decorate with kit Motif sprites AFTER title/lead and/or kit Motif CSS.',
  );
  next = next.replace(
    /use at most one short (?:complete )?(?:sprite|snippet)[^\n]*/gi,
    'use at most one short kit Motif sprite AFTER title/lead (or kit Motif CSS classes).',
  );
  return next;
}

/** @deprecated Use slimTemplateVisualKitForFill — kept for older call sites. */
export function stripTemplateVisualKitMotifSpritesForFill(skillBody: string): string {
  return slimTemplateVisualKitForFill(skillBody);
}
