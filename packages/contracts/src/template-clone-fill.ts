/**
 * Server/FE-side Open Design Clone for Teamver BYOK.
 *
 * Messages API has no Read/Write/Clone tools, so the FE (acting as the
 * "server" for this step) must clone `example.html` and content-swap Source
 * text into the real template shells — without dumping full HTML into the
 * system prompt.
 */

export type TemplateCloneSlideContent = {
  title: string;
  body?: string;
};

type SlideShell = {
  tag: 'section' | 'div';
  attrs: string;
  body: string;
  full: string;
};

const TEAMVER_SLIDE_SIZE_CSS = [
  'html,body{margin:0;padding:0;overflow:auto}',
  '.slides-container{width:auto;height:auto;overflow:visible;scroll-snap-type:none}',
  '.slide{width:1920px;height:1080px;min-height:1080px;max-height:1080px;box-sizing:border-box;scroll-snap-align:none}',
  '.nav-dots,.slide-counter,.nav-dot{display:none!important}',
].join('');

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripScriptsAndNav(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<div\b[^>]*\b(?:nav-dots|slide-counter)\b[^>]*>[\s\S]*?<\/div>/gi, '');
}

function isSlideAttrs(attrs: string): boolean {
  return (
    /\bslide\b/i.test(attrs)
    || /\bclass\s*=\s*["'][^"']*\bs-[a-z0-9_-]+/i.test(attrs)
    || /\bid\s*=\s*["']slide/i.test(attrs)
  );
}

/** Collect slide shells from `<section class="slide|s-*">` or `<div class="slide">`. */
export function listTemplateCloneSlideShells(html: string): SlideShell[] {
  const sections = [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi)]
    .map((match) => ({
      tag: 'section' as const,
      attrs: match[1] ?? '',
      body: match[2] ?? '',
      full: match[0] ?? '',
    }))
    .filter((shell) => isSlideAttrs(shell.attrs));
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
    out.push({
      tag: 'div',
      attrs: open[1] ?? '',
      body,
      full: `${open[0]}${body}</div>`,
    });
  }
  return out;
}

function pickTemplateShells(shells: SlideShell[], count: number): SlideShell[] {
  if (shells.length === 0) return [];
  if (count <= 0) return [shells[0]!];
  if (shells.length === count) return shells;
  if (shells.length > count) {
    if (count === 1) return [shells[0]!];
    const out: SlideShell[] = [shells[0]!];
    const body = shells.slice(1);
    const remaining = count - 1;
    if (body.length <= remaining) return [...out, ...body].slice(0, count);
    for (let i = 0; i < remaining; i += 1) {
      const idx = Math.round((i * (body.length - 1)) / Math.max(1, remaining - 1));
      const shell = body[idx]!;
      if (!out.includes(shell)) out.push(shell);
    }
    for (const shell of body) {
      if (out.length >= count) break;
      if (!out.includes(shell)) out.push(shell);
    }
    return out.slice(0, count);
  }
  // Need more slides than the template provides — cycle body shells.
  const out = [...shells];
  const bodyPool = shells.length > 1 ? shells.slice(1) : shells;
  let i = 0;
  while (out.length < count) {
    out.push(bodyPool[i % bodyPool.length]!);
    i += 1;
  }
  return out;
}

function replaceFirstTagText(html: string, tag: string, text: string): string {
  const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(<\\/${tag}>)`, 'i');
  if (!re.test(html)) return html;
  return html.replace(re, `$1${escapeHtml(text)}$3`);
}

function replaceListItems(html: string, lines: string[]): string {
  if (lines.length === 0) return html;
  const listMatch = /<ul\b[^>]*>[\s\S]*?<\/ul>/i.exec(html)
    ?? /<ol\b[^>]*>[\s\S]*?<\/ol>/i.exec(html);
  if (!listMatch || listMatch.index == null) return html;
  const listHtml = listMatch[0];
  const open = /^<[uo]l\b[^>]*>/i.exec(listHtml)?.[0] ?? '<ul>';
  const close = /<\/[uo]l>$/i.exec(listHtml)?.[0] ?? '</ul>';
  const itemClass = /<li\b([^>]*)>/i.exec(listHtml)?.[1] ?? '';
  const items = lines
    .map((line) => `<li${itemClass}>${escapeHtml(line)}</li>`)
    .join('');
  const nextList = `${open}${items}${close}`;
  return (
    html.slice(0, listMatch.index)
    + nextList
    + html.slice(listMatch.index + listHtml.length)
  );
}

function fillSlideShell(
  shell: SlideShell,
  content: TemplateCloneSlideContent,
  index: number,
): string {
  let body = shell.body;
  const title = content.title.trim() || `Slide ${index + 1}`;
  const bodyText = content.body?.trim() ?? '';
  const bodyLines = bodyText
    ? bodyText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : [];

  if (/<h1\b/i.test(body)) {
    body = replaceFirstTagText(body, 'h1', title);
  } else if (/<h2\b/i.test(body)) {
    body = replaceFirstTagText(body, 'h2', title);
  } else if (/<h3\b/i.test(body)) {
    body = replaceFirstTagText(body, 'h3', title);
  }

  if (bodyLines.length > 1 && /<[uo]l\b/i.test(body)) {
    body = replaceListItems(body, bodyLines);
  } else if (bodyLines[0] || bodyText) {
    const paragraph = bodyLines[0] || bodyText;
    if (/<p\b[^>]*class\s*=\s*["'][^"']*subtitle/i.test(body)) {
      body = body.replace(
        /(<p\b[^>]*class\s*=\s*["'][^"']*subtitle[^"']*["'][^>]*>)([\s\S]*?)(<\/p>)/i,
        `$1${escapeHtml(paragraph)}$3`,
      );
    } else if (/<p\b/i.test(body)) {
      body = replaceFirstTagText(body, 'p', paragraph);
    }
  }

  // Keep Teamver fixed canvas size even when template used vw/vh.
  let attrs = shell.attrs;
  if (!/\bstyle\s*=/i.test(attrs)) {
    attrs = `${attrs} style="width:1920px;height:1080px;box-sizing:border-box"`;
  }
  // Remap ids so duplicated shells stay unique.
  attrs = attrs.replace(/\bid\s*=\s*(["'])([^"']*)\1/i, (_m, q: string) => `id=${q}slide-${index + 1}${q}`);
  return `<${shell.tag}${attrs}>${body}</${shell.tag}>`;
}

function injectTeamverSizeStyle(html: string): string {
  if (/data-teamver-template-clone-size/i.test(html)) return html;
  const style = `<style data-teamver-template-clone-size>${TEAMVER_SLIDE_SIZE_CSS}</style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${style}</head>`);
  }
  if (/<body\b/i.test(html)) {
    return html.replace(/<body\b[^>]*>/i, (open) => `${open}\n${style}`);
  }
  return `${style}\n${html}`;
}

function replaceDocumentTitle(html: string, title: string): string {
  if (!/<title\b/i.test(html)) return html;
  return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function replaceSlideBlocks(html: string, shells: SlideShell[], filledSlides: string[]): string | null {
  if (shells.length === 0 || filledSlides.length === 0) return null;
  const first = shells[0]!;
  const last = shells[shells.length - 1]!;
  const firstIdx = html.indexOf(first.full);
  const lastIdx = html.indexOf(last.full);
  if (firstIdx < 0 || lastIdx < 0) return null;
  const end = lastIdx + last.full.length;
  return `${html.slice(0, firstIdx)}${filledSlides.join('\n\n')}${html.slice(end)}`;
}

/**
 * Clone a template `example.html` and content-swap Source slide titles/bodies
 * into the real CSS/SVG/layout shells. Returns null when no slide shells exist.
 */
export function buildTemplateClonedDeckHtml(
  exampleHtml: string,
  slides: TemplateCloneSlideContent[],
  options: { title?: string; maxSlides?: number } = {},
): string | null {
  const source = stripScriptsAndNav(String(exampleHtml ?? '').trim());
  if (!source) return null;
  const shells = listTemplateCloneSlideShells(source);
  if (shells.length === 0) return null;

  const cleanedSlides: TemplateCloneSlideContent[] = [];
  for (const slide of slides) {
    const title = slide.title.trim();
    if (!title) continue;
    const body = slide.body?.trim();
    cleanedSlides.push(body ? { title, body } : { title });
  }
  const maxSlides = Math.min(
    Math.max(1, options.maxSlides ?? 15),
    20,
  );
  const targetCount = cleanedSlides.length > 0
    ? Math.min(Math.max(cleanedSlides.length, 1), maxSlides)
    : Math.min(shells.length, maxSlides);
  const picked = pickTemplateShells(shells, targetCount);
  const deckTitle = options.title?.trim()
    || cleanedSlides[0]?.title
    || 'Presentation';

  const filled = picked.map((shell, index) => {
    const content = cleanedSlides[index] ?? {
      title: index === 0 ? deckTitle : `${deckTitle} ${index + 1}`,
    };
    return fillSlideShell(shell, content, index);
  });

  let out = replaceSlideBlocks(source, shells, filled);
  if (!out) {
    // Fallback: synthesize a minimal document keeping extracted styles.
    const styles = [...source.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)]
      .map((match) => match[0] ?? '')
      .join('\n');
    const fontLinks = [...source.matchAll(/<link\b[^>]*fonts\.googleapis\.com[^>]*>/gi)]
      .map((match) => match[0] ?? '')
      .join('\n');
    out = [
      '<!doctype html>',
      '<html lang="ko">',
      '<head>',
      '<meta charset="utf-8" />',
      `<title>${escapeHtml(deckTitle)}</title>`,
      fontLinks,
      styles,
      '</head>',
      '<body>',
      '<div class="slides-container">',
      ...filled,
      '</div>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  out = replaceDocumentTitle(out, deckTitle);
  out = injectTeamverSizeStyle(out);
  return out.trim() || null;
}

/** Parse a slide-count hint like "6-8" / "10" into a concrete target. */
export function resolveTemplateCloneSlideCountHint(
  hint: string | number | null | undefined,
): number | null {
  if (typeof hint === 'number' && Number.isFinite(hint)) {
    const n = Math.round(hint);
    return n >= 1 && n <= 20 ? n : null;
  }
  const raw = String(hint ?? '').trim();
  if (!raw) return null;
  const range = raw.match(/^(\d{1,2})\s*[-~–—]\s*(\d{1,2})$/);
  if (range?.[1] && range[2]) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 1 && b >= a && b <= 20) {
      return Math.round((a + b) / 2);
    }
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= 20) return Math.round(n);
  return null;
}
