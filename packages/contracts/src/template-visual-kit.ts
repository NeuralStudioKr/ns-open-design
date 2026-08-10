/**
 * Extract a compact, API-mode-safe visual kit from a deck template's
 * `example.html` (or similar preview entry).
 *
 * Zhangzara / html-ppt templates put the real palette + type + motif in the
 * demo HTML `:root` tokens. SKILL.md frontmatter only has a short prose blurb
 * ("Cheerful pastel deck…") — not enough for BYOK models that cannot Read
 * companion files. Without this kit, Active design system tokens (e.g.
 * Neutral Modern dark) win and the deck looks like the default template.
 */

const DEFAULT_MAX_CHARS = 3_600;

function uniquePreserveOrder(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
}

function extractRootCssBlock(html: string): string | null {
  const rootMatch = /:root\s*\{([\s\S]*?)\}/i.exec(html);
  if (!rootMatch?.[1]) return null;
  const inner = rootMatch[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function extractFirstSlideSnippet(html: string, budget: number): string | null {
  const sectionMatch =
    /<section\b[^>]*class=["'][^"']*slide[^"']*["'][^>]*>[\s\S]*?<\/section>/i.exec(
      html,
    );
  if (!sectionMatch?.[0]) return null;
  const snippet = sectionMatch[0]
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!snippet) return null;
  return snippet.length > budget ? `${snippet.slice(0, budget)}…` : snippet;
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
  const lines = [
    `## Template visual kit (from example.html) — ${title}`,
    '',
    'This is the authoritative visual system for the selected deck template.',
    'Reproduce these tokens with inline styles (or one short body `<style>` after slide 1).',
    'Do NOT replace them with an active design-system palette or a dark corporate default.',
    '',
  ];
  if (root) {
    lines.push('### CSS tokens', '', '```css', root, '```', '');
  }
  if (fonts.length > 0) {
    lines.push(`### Fonts: ${fonts.join(' | ')}`, '');
  }
  if (colors.length > 0) {
    lines.push(`### Palette cues: ${colors.join(', ')}`, '');
  }
  const used = lines.join('\n').length;
  const slideBudget = Math.max(400, maxChars - used - 80);
  const slide = extractFirstSlideSnippet(source, slideBudget);
  if (slide) {
    lines.push('### First-slide structure cue (abbreviated)', '', '```html', slide, '```', '');
  }
  lines.push(
    'Hard rules: keep the template scheme (light pastel stays light; dark terminal stays dark).',
    'Preserve decorative motif density (daisies/stars/borders/chunky shadows when present).',
    'Vary slide layouts using the template vocabulary; do not emit sparse title-only slides.',
  );

  let out = lines.join('\n').trim();
  if (out.length > maxChars) {
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
