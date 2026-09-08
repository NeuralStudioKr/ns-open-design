/**
 * 루프478 — Contrast conformance for official-look decks.
 *
 * MiniMax fills a light-paper kit (Biennale Yellow: `--paper:#E9E5DB` /
 * `--ink:#1B2566`) with an invented dark SaaS palette — `#111c33` cards,
 * `#93c5fd` / `#e0e7ff` copy, `rgba(255,255,255,0.05)` glass panels. Sections
 * that never paint a background inherit the cream paper, so that light copy
 * lands cream-on-cream and the slide reads as empty (사용자 리포트 2026-09-08).
 *
 * A hex denylist cannot keep up with an invented palette, so judge the
 * *effective* background instead: walk each slide's inline styles, track
 * background luminance, and snap only the declarations that fail a legibility
 * bar onto the kit's own paper/ink tokens.
 */

const OFFICIAL_LOOK_CSS_RE =
  /<style\b[^>]*\bdata-od-official-look-css\b[^>]*>([\s\S]*?)<\/style>/i;

/** WCAG contrast ratio below this reads as unstyled/empty copy. */
const MIN_CONTRAST_RATIO = 3;
/** Paper and ink must actually differ before we trust them as snap targets. */
const MIN_SURFACE_CONTRAST_RATIO = 3;
/** Alpha at/below this over a light paper leaves no visible card. */
const GLASS_MAX_ALPHA = 0.35;

const PAPER_TOKEN_NAMES = [
  'paper', 'cream', 'bg', 'background', 'surface', 'offwhite', 'off-white', 'canvas',
];
const INK_TOKEN_NAMES = ['ink', 'text', 'fg', 'foreground', 'body'];

const VOID_TAG_RE =
  /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

type Rgb = { r: number; g: number; b: number };
type ParsedColor = { rgb: Rgb; alpha: number };

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function parseHexColor(raw: string): Rgb | null {
  const hex = raw.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    const [r, g, b] = hex;
    return {
      r: parseInt(r! + r!, 16),
      g: parseInt(g! + g!, 16),
      b: parseInt(b! + b!, 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

/** sRGB relative luminance (WCAG 2.x). */
function relativeLuminance(rgb: Rgb): number {
  const channel = (raw: number): number => {
    const c = clamp01(raw / 255);
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

function contrastRatio(a: number, b: number): number {
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

const NAMED_COLORS: Record<string, Rgb> = {
  white: { r: 255, g: 255, b: 255 },
  black: { r: 0, g: 0, b: 0 },
};

/** Collect `--token: value` pairs from the official look CSS `:root` blocks. */
function readLookTokens(css: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const re = /--([a-z0-9-]+)\s*:\s*([^;{}]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    const name = match[1]!.toLowerCase();
    if (!tokens.has(name)) tokens.set(name, match[2]!.trim());
  }
  return tokens;
}

function parseColorValue(
  raw: string,
  tokens: Map<string, string>,
  depth = 0,
): ParsedColor | null {
  const value = String(raw ?? '').trim();
  if (!value || depth > 3) return null;

  const varMatch = /^var\(\s*--([a-z0-9-]+)\s*(?:,([^)]*))?\)$/i.exec(value);
  if (varMatch) {
    const resolved = tokens.get(varMatch[1]!.toLowerCase());
    if (resolved) return parseColorValue(resolved, tokens, depth + 1);
    return varMatch[2] ? parseColorValue(varMatch[2], tokens, depth + 1) : null;
  }

  const hex = parseHexColor(value);
  if (hex) return { rgb: hex, alpha: 1 };

  const fn = /^rgba?\(([^)]+)\)$/i.exec(value);
  if (fn) {
    const parts = fn[1]!.split(/[,/\s]+/).filter(Boolean).map((part) => part.trim());
    if (parts.length < 3) return null;
    const channel = (part: string): number =>
      part.endsWith('%') ? (Number.parseFloat(part) / 100) * 255 : Number.parseFloat(part);
    const rgb = { r: channel(parts[0]!), g: channel(parts[1]!), b: channel(parts[2]!) };
    if (![rgb.r, rgb.g, rgb.b].every(Number.isFinite)) return null;
    const alphaRaw = parts[3];
    const alpha = alphaRaw === undefined
      ? 1
      : alphaRaw.endsWith('%')
        ? clamp01(Number.parseFloat(alphaRaw) / 100)
        : clamp01(Number.parseFloat(alphaRaw));
    return { rgb, alpha: Number.isFinite(alpha) ? alpha : 1 };
  }

  const named = NAMED_COLORS[value.toLowerCase()];
  if (named) return { rgb: named, alpha: 1 };
  if (/^transparent$/i.test(value)) return { rgb: { r: 0, g: 0, b: 0 }, alpha: 0 };
  return null;
}

/** Luminance of a (possibly translucent) color composited over `underLum`. */
function compositeLuminance(color: ParsedColor, underLum: number): number {
  const own = relativeLuminance(color.rgb);
  return color.alpha >= 1 ? own : color.alpha * own + (1 - color.alpha) * underLum;
}

function declarationValue(style: string, prop: string): string | null {
  const escaped = prop.replace(/-/g, '\\-');
  const re = new RegExp(`(?:^|;)\\s*${escaped}\\s*:\\s*([^;]+)`, 'gi');
  let last: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(style))) last = match[1]!.trim();
  return last;
}

/** Mean luminance of a gradient's parsed color stops. */
function gradientLuminance(
  value: string,
  tokens: Map<string, string>,
  underLum: number,
): number | null {
  if (!/gradient\(/i.test(value)) return null;
  const stops = value.match(/#[0-9a-f]{3,6}|rgba?\([^)]*\)|var\(\s*--[a-z0-9-]+[^)]*\)/gi) ?? [];
  const lums = stops
    .map((stop) => parseColorValue(stop, tokens))
    .filter((color): color is ParsedColor => Boolean(color))
    .map((color) => compositeLuminance(color, underLum));
  if (lums.length === 0) return null;
  return lums.reduce((sum, lum) => sum + lum, 0) / lums.length;
}

/**
 * Class tokens the look CSS paints a background on. Elements carrying one of
 * these own a kit surface we cannot resolve from inline styles alone, so their
 * subtree is left untouched instead of being judged against the paper.
 */
function readLookBackgroundClasses(css: string): Set<string> {
  const classes = new Set<string>();
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    if (!/(?:^|;|\s)background(?:-color|-image)?\s*:/i.test(match[2]!)) continue;
    for (const token of match[1]!.match(/\.([a-z0-9_-]+)/gi) ?? []) {
      classes.add(token.slice(1).toLowerCase());
    }
  }
  return classes;
}

function attrClassTokens(attrs: string): string[] {
  const raw = /\bclass\s*=\s*(['"])([\s\S]*?)\1/i.exec(attrs)?.[2] ?? '';
  return raw.split(/\s+/).filter(Boolean).map((token) => token.toLowerCase());
}

function styleAttrValue(attrs: string): string {
  return /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i.exec(attrs)?.[2] ?? '';
}

function replaceStyleAttr(attrs: string, nextStyle: string): string {
  return attrs.replace(
    /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
    (_m, quote: string) => `style=${quote}${nextStyle}${quote}`,
  );
}

function rgbaLiteral(rgb: Rgb, alpha: number): string {
  return `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${alpha})`;
}

function hexLiteral(rgb: Rgb): string {
  const part = (value: number): string =>
    Math.round(clamp01(value / 255) * 255).toString(16).padStart(2, '0');
  return `#${part(rgb.r)}${part(rgb.g)}${part(rgb.b)}`;
}

type LookSurface = {
  tokens: Map<string, string>;
  backgroundClasses: Set<string>;
  paper: Rgb;
  paperLum: number;
  ink: Rgb;
  inkLum: number;
};

function readLookSurface(html: string): LookSurface | null {
  const css = OFFICIAL_LOOK_CSS_RE.exec(String(html ?? ''))?.[1];
  if (!css) return null;
  const tokens = readLookTokens(css);
  const pick = (names: string[]): ParsedColor | null => {
    for (const name of names) {
      const raw = tokens.get(name);
      if (!raw) continue;
      const color = parseColorValue(raw, tokens);
      if (color && color.alpha >= 1) return color;
    }
    return null;
  };
  const paper = pick(PAPER_TOKEN_NAMES);
  const ink = pick(INK_TOKEN_NAMES);
  if (!paper || !ink) return null;
  const paperLum = relativeLuminance(paper.rgb);
  const inkLum = relativeLuminance(ink.rgb);
  if (contrastRatio(paperLum, inkLum) < MIN_SURFACE_CONTRAST_RATIO) return null;
  return {
    tokens,
    backgroundClasses: readLookBackgroundClasses(css),
    paper: paper.rgb,
    paperLum,
    ink: ink.rgb,
    inkLum,
  };
}

/** `null` = background is kit-owned (class CSS) and must not be judged. */
type Frame = { tag: string; bgLum: number | null; motif: boolean };

function looksLikeGlassPanel(color: ParsedColor, parentLum: number): boolean {
  if (color.alpha <= 0 || color.alpha > GLASS_MAX_ALPHA) return false;
  if (parentLum < 0.4) return false;
  const own = relativeLuminance(color.rgb);
  return own >= 0.6 && contrastRatio(own, parentLum) < MIN_CONTRAST_RATIO;
}

function healElementStyle(
  attrs: string,
  parentLum: number | null,
  look: LookSurface,
): { attrs: string; bgLum: number | null } {
  const style = styleAttrValue(attrs);
  const classes = attrClassTokens(attrs);
  const kitPainted = classes.some((token) => look.backgroundClasses.has(token));
  if (!style) {
    return { attrs, bgLum: kitPainted ? null : parentLum };
  }

  let nextStyle = style;
  let bgLum: number | null = kitPainted ? null : parentLum;

  const bgRaw =
    declarationValue(style, 'background-image')
    ?? declarationValue(style, 'background-color')
    ?? declarationValue(style, 'background');
  if (bgRaw) {
    const base = parentLum ?? look.paperLum;
    const gradient = gradientLuminance(bgRaw, look.tokens, base);
    if (gradient !== null) {
      bgLum = gradient;
    } else {
      const color = parseColorValue(bgRaw, look.tokens);
      if (color) {
        if (looksLikeGlassPanel(color, base)) {
          // Near-invisible glass over light paper: promote to an ink tint so the
          // card keeps its shape instead of dissolving into the paper.
          nextStyle = nextStyle.replace(
            /(^|;)(\s*background(?:-color|-image)?\s*:\s*)([^;]+)/gi,
            (whole, lead: string, prop: string, value: string) => {
              const parsed = parseColorValue(value.trim(), look.tokens);
              if (!parsed || !looksLikeGlassPanel(parsed, base)) return whole;
              return `${lead}${prop}${rgbaLiteral(look.ink, 0.055)}`;
            },
          );
          nextStyle = nextStyle.replace(
            /(^|;)(\s*border(?:-top|-right|-bottom|-left)?(?:-color)?\s*:\s*)([^;]+)/gi,
            (whole, lead: string, prop: string, value: string) => {
              const borderColor = /#[0-9a-f]{3,6}|rgba?\([^)]*\)/i.exec(value)?.[0];
              if (!borderColor) return whole;
              const parsed = parseColorValue(borderColor, look.tokens);
              if (!parsed || !looksLikeGlassPanel(parsed, base)) return whole;
              return `${lead}${prop}${value.replace(borderColor, rgbaLiteral(look.ink, 0.2))}`;
            },
          );
          bgLum = compositeLuminance({ rgb: look.ink, alpha: 0.055 }, base);
        } else {
          bgLum = compositeLuminance(color, base);
        }
      } else if (!kitPainted) {
        // Unresolvable paint (image url, unknown token) — stop judging here.
        bgLum = null;
      }
    }
  }

  const colorRaw = declarationValue(nextStyle, 'color');
  if (colorRaw && bgLum !== null) {
    const color = parseColorValue(colorRaw, look.tokens);
    if (color && color.alpha > 0.5) {
      const textLum = compositeLuminance(color, bgLum);
      if (contrastRatio(textLum, bgLum) < MIN_CONTRAST_RATIO) {
        const snapped = hexLiteral(bgLum >= 0.5 ? look.ink : look.paper);
        nextStyle = nextStyle.replace(
          /(^|;)(\s*color\s*:\s*)([^;]+)/gi,
          (_whole, lead: string, prop: string) => `${lead}${prop}${snapped}`,
        );
      }
    }
  }

  return {
    attrs: nextStyle === style ? attrs : replaceStyleAttr(attrs, nextStyle),
    bgLum,
  };
}

function healSlideInner(inner: string, rootLum: number | null, look: LookSurface): string {
  const stack: Frame[] = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let out = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(inner))) {
    out += inner.slice(cursor, match.index);
    cursor = re.lastIndex;
    const closing = match[1] === '/';
    const tag = match[2]!.toLowerCase();
    const attrs = match[3] ?? '';
    const selfClosing = match[4] === '/';

    if (closing) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]!.tag === tag) {
          stack.length = i;
          break;
        }
      }
      out += match[0];
      continue;
    }

    const parent = stack.length > 0 ? stack[stack.length - 1] : null;
    const inMotif = parent?.motif === true;
    const isMotif = inMotif || /\bdata-od-official-motif-html\b/i.test(attrs);
    const parentLum = parent ? parent.bgLum : rootLum;

    if (isMotif) {
      out += match[0];
      if (!selfClosing && !VOID_TAG_RE.test(tag)) {
        stack.push({ tag, bgLum: parentLum, motif: true });
      }
      continue;
    }

    const healed = healElementStyle(attrs, parentLum, look);
    out += `<${tag}${healed.attrs}${selfClosing ? '/' : ''}>`;
    if (!selfClosing && !VOID_TAG_RE.test(tag)) {
      stack.push({ tag, bgLum: healed.bgLum, motif: false });
    }
  }

  return out + inner.slice(cursor);
}

const SLIDE_SECTION_RE =
  /(<section\b[^>]*>)([\s\S]*?)(<\/section>)/gi;

/**
 * Snap inline colors that fail a legibility bar against their effective
 * background onto the official look's paper/ink. No-op without look CSS, or
 * when the kit's own paper/ink cannot be resolved.
 */
export function conformInlinePaletteToOfficialLook(html: string): string {
  const source = String(html ?? '');
  if (!source.trim()) return source;
  const look = readLookSurface(source);
  if (!look) return source;

  return source.replace(SLIDE_SECTION_RE, (whole, open: string, inner: string, close: string) => {
    if (!/\bclass\s*=\s*(['"])[^'"]*\bslide\b/i.test(open)
      && !/\bdata-screen-label\b/i.test(open)) {
      return whole;
    }
    const hostStyle = styleAttrValue(open);
    const hostClasses = attrClassTokens(open);
    const hostKitPainted = hostClasses.some((token) => look.backgroundClasses.has(token));
    const hostBgRaw =
      declarationValue(hostStyle, 'background-image')
      ?? declarationValue(hostStyle, 'background-color')
      ?? declarationValue(hostStyle, 'background');
    let rootLum: number | null = hostKitPainted ? null : look.paperLum;
    if (hostBgRaw) {
      const gradient = gradientLuminance(hostBgRaw, look.tokens, look.paperLum);
      if (gradient !== null) {
        rootLum = gradient;
      } else {
        const color = parseColorValue(hostBgRaw, look.tokens);
        rootLum = color ? compositeLuminance(color, look.paperLum) : null;
      }
    }
    return `${open}${healSlideInner(inner, rootLum, look)}${close}`;
  });
}
