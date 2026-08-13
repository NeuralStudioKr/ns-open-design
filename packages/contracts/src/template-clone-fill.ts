/**
 * Pure HTML transform for Teamver daemon template Clone.
 *
 * The daemon reads plugin `example.html` from disk and content-swaps Source
 * text into real template shells. Do not dump full HTML into the BYOK system
 * prompt, and do not copy the template original into user-visible project refs/.
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

/** Replace the first text node after a tag close; never rewrite tag innards. */
function replaceFirstTextRun(inner: string, text: string): string {
  const escaped = escapeHtml(text);
  if (!/<[a-zA-Z]/.test(inner)) return escaped;
  // Single wrapper element: recurse into its children (span/em/strong…).
  const wrapped = /^\s*(<([a-zA-Z][\w:-]*)\b[^>]*>)([\s\S]*?)(<\/\2>)\s*$/i.exec(inner);
  if (wrapped?.[1] && wrapped[3] != null && wrapped[4]) {
    return `${wrapped[1]}${replaceFirstTextRun(wrapped[3], text)}${wrapped[4]}`;
  }
  // Otherwise replace the first text run that sits between tags: `>text<`.
  let done = false;
  const next = inner.replace(/(>)([^<]+)(<)/g, (full, gt: string, chunk: string, lt: string) => {
    if (done || !chunk.trim()) return full;
    done = true;
    return `${gt}${escaped}${lt}`;
  });
  return done ? next : escaped;
}

function replaceFirstTagText(html: string, tag: string, text: string): string {
  const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(<\\/${tag}>)`, 'i');
  if (!re.test(html)) return html;
  return html.replace(re, (_match, open: string, inner: string, close: string) => (
    `${open}${replaceFirstTextRun(inner, text)}${close}`
  ));
}

function replaceListItems(html: string, lines: string[]): string {
  if (lines.length === 0) return html;
  const listMatch = /<ul\b[^>]*>[\s\S]*?<\/ul>/i.exec(html)
    ?? /<ol\b[^>]*>[\s\S]*?<\/ol>/i.exec(html);
  if (!listMatch || listMatch.index == null) return html;
  const listHtml = listMatch[0];
  const open = /^<[uo]l\b[^>]*>/i.exec(listHtml)?.[0] ?? '<ul>';
  const close = /<\/[uo]l>$/i.exec(listHtml)?.[0] ?? '</ul>';
  const existingItems = [...listHtml.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)];
  const items = lines.map((line, index) => {
    const attrs = existingItems[index]?.[1] ?? existingItems[0]?.[1] ?? '';
    const priorInner = existingItems[index]?.[2] ?? '';
    if (priorInner && /<[a-zA-Z]/.test(priorInner)) {
      return `<li${attrs}>${replaceFirstTextRun(priorInner, line)}</li>`;
    }
    return `<li${attrs}>${escapeHtml(line)}</li>`;
  }).join('');
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

  // Always clear template marketing subtitle when we own this shell's title.
  if (/<p\b[^>]*class\s*=\s*["'][^"']*subtitle/i.test(body)) {
    const subtitle = bodyLines[0] || bodyText || '';
    body = body.replace(
      /(<p\b[^>]*class\s*=\s*["'][^"']*subtitle[^"']*["'][^>]*>)([\s\S]*?)(<\/p>)/i,
      `$1${escapeHtml(subtitle)}$3`,
    );
  }

  if (bodyLines.length > 0 && /<[uo]l\b/i.test(body)) {
    body = replaceListItems(body, bodyLines);
  } else if (bodyLines[0] || bodyText) {
    const paragraph = bodyLines[0] || bodyText;
    if (!/<p\b[^>]*class\s*=\s*["'][^"']*subtitle/i.test(shell.body) && /<p\b/i.test(body)) {
      body = replaceFirstTagText(body, 'p', paragraph);
    }
  } else if (/<[uo]l\b/i.test(body)) {
    // Title-only pad shells: wipe leftover template English list copy.
    const existingCount = [...body.matchAll(/<li\b/gi)].length;
    if (existingCount > 0) {
      body = replaceListItems(body, Array.from({ length: existingCount }, () => ''));
    }
  }

  // Force Teamver fixed canvas size even when template used vw/vh or had
  // a pre-existing inline style that would otherwise win over CSS overrides.
  let attrs = shell.attrs;
  if (/\bstyle\s*=/i.test(attrs)) {
    attrs = attrs.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i, (_m, q: string, style: string) => {
      let next = String(style);
      next = /\bwidth\s*:/i.test(next)
        ? next.replace(/\bwidth\s*:[^;]*/i, 'width:1920px')
        : `${next};width:1920px`;
      next = /\bheight\s*:/i.test(next)
        ? next.replace(/\bheight\s*:[^;]*/i, 'height:1080px')
        : `${next};height:1080px`;
      if (!/\bbox-sizing\s*:/i.test(next)) next = `${next};box-sizing:border-box`;
      return `style=${q}${next}${q}`;
    });
  } else {
    attrs = `${attrs} style="width:1920px;height:1080px;box-sizing:border-box"`;
  }
  // Remap ids so duplicated shells stay unique.
  attrs = attrs.replace(/\bid\s*=\s*(["'])([^"']*)\1/i, (_m, q: string) => `id=${q}slide-${index + 1}${q}`);
  return `<${shell.tag}${attrs}>${body}</${shell.tag}>`;
}

/**
 * Templates authored for fullscreen `100vw` / `clamp(..., Nvw, ...)` preview
 * drift when Teamver locks `.slide` to a fixed 1920×1080 canvas inside the
 * editor chrome. Rewrite vw/vh as px assuming that canvas IS the viewport.
 */
export function normalizeTemplateCssForFixedCanvas(html: string): string {
  return String(html ?? '')
    .replace(/(\d+(?:\.\d+)?)vw\b/gi, (_m, raw: string) => {
      const px = Math.round(parseFloat(raw) * 19.2 * 100) / 100;
      return Number.isFinite(px) ? `${px}px` : _m;
    })
    .replace(/(\d+(?:\.\d+)?)vh\b/gi, (_m, raw: string) => {
      const px = Math.round(parseFloat(raw) * 10.8 * 100) / 100;
      return Number.isFinite(px) ? `${px}px` : _m;
    });
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
  // Slide-count policy:
  // - Source outline headings win (never silently drop headings for a short hint).
  // - When the hint is *larger* than the outline, pad by cloning body shells.
  // - With no outline, use the hint or the template's natural length.
  const hint = options.maxSlides != null
    ? Math.min(20, Math.max(1, options.maxSlides))
    : null;
  let targetCount: number;
  if (cleanedSlides.length > 0) {
    targetCount = cleanedSlides.length;
    if (hint != null && hint > targetCount) targetCount = hint;
    targetCount = Math.min(20, targetCount);
  } else {
    targetCount = Math.min(shells.length, hint ?? shells.length);
  }
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
  out = normalizeTemplateCssForFixedCanvas(out);
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

const VISIBLE_HEADINGS_RE =
  /(?:Visible headings|Canvas headings|Source headings)\s*[:：]\s*/i;
const HEADINGS_STOP_RE =
  /\s+(?:Source preview|Canvas title|Canvas sections|Drive source(?: file| MIME)?|Drive asset id|User instruction)\s*[:：]/i;
const NUMBERED_SLIDE_RE =
  /^\s*(?:(?:\d+)[\.\)]\s*|(?:0?\d{1,2})\s+|슬라이드\s*\d+\s*[:\.\-]\s*|#{1,3}\s+)(.+)$/i;
const USER_INSTRUCTION_RE =
  /User instruction\s*[:：]\s*([\s\S]*?)(?=\n(?:Source |Canvas |Drive |Visible |Selected )|$)/i;

function cleanCloneTitle(title: string): string {
  return title.replace(/^["'`]|["'`]$/g, '').replace(/\s+/g, ' ').trim();
}

function looksLikeTemplateMarketingTitle(title: string): boolean {
  return /html\s*ppt|daisy days|simple deck|zhangzara|cheerful presentation|template for/i.test(
    title,
  );
}

function extractUserFacingBrief(text: string): string {
  const fromMarker = USER_INSTRUCTION_RE.exec(text)?.[1]?.trim();
  if (fromMarker) return fromMarker;
  return text
    .replace(
      /^(?:Canvas title|Source preview|Drive source(?: file| MIME)?|Drive asset id|Visible headings|Canvas headings|Source headings)\s*[:：].*$/gim,
      '',
    )
    .trim();
}

function deriveTitleFromBrief(brief: string, deckTitle?: string | null): string {
  const preferred = deckTitle?.trim() ?? '';
  if (preferred && !looksLikeTemplateMarketingTitle(preferred)) {
    return cleanCloneTitle(preferred).slice(0, 80);
  }
  const first = brief.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || brief;
  let title = first
    .replace(/^(?:please\s+)?(?:make|create|build|write)\s+(?:me\s+)?(?:a|an|the)?\s*/i, '')
    .replace(/\s+(?:slides?|deck|presentation)\s*\.?$/i, '')
    .replace(
      /\s*(?:에\s*대한\s*)?(?:발표\s*자료|슬라이드|덱|프레젠테이션)?\s*(?:을|를)?\s*(?:만들어|작성|생성)(?:\s*줘|\s*주세요|\s*해(?:\s*줘|\s*주세요)?)?\s*\.?$/i,
      '',
    )
    .replace(/^(?:슬라이드|발표자료|덱)\s*/i, '')
    .trim();
  if (!title || title.length < 2) title = first;
  return cleanCloneTitle(title).slice(0, 60) || 'Presentation';
}

/**
 * Free-form Home/wizard prompts have no Visible-headings outline. Still
 * synthesize multiple content-bearing slides so Clone does not leave the
 * template's marketing titles/subtitles ("Daisy Days", "cheerful…") intact.
 * Slide count stays multi-page via daemon `maxSlides` padding.
 */
export function synthesizeTemplateCloneSlidesFromFreeFormBrief(options: {
  brief: string;
  deckTitle?: string | null;
}): TemplateCloneSlideContent[] {
  const brief = extractUserFacingBrief(options.brief);
  if (!brief || brief.length < 2) return [];

  const title = deriveTitleFromBrief(brief, options.deckTitle);
  const lines = brief.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter(
    (line) => /^[-*•·]\s+/.test(line) || /^\d+[.)]\s+/.test(line),
  );
  if (bulletLines.length >= 2) {
    const out: TemplateCloneSlideContent[] = [{ title, body: '' }];
    for (const line of bulletLines) {
      const item = cleanCloneTitle(
        line.replace(/^[-*•·]\s+/, '').replace(/^\d+[.)]\s+/, ''),
      ).slice(0, 80);
      if (item) out.push({ title: item });
    }
    return out.slice(0, 20);
  }

  const paragraphs = brief
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraphs.length >= 2) {
    const out: TemplateCloneSlideContent[] = [
      { title, body: paragraphs[0]!.slice(0, 200) },
    ];
    for (let i = 1; i < paragraphs.length; i += 1) {
      const para = paragraphs[i]!;
      const firstLine = para.split('\n')[0]!.trim();
      const slideTitle = firstLine.length <= 60
        ? cleanCloneTitle(firstLine).slice(0, 80)
        : `${title} ${i + 1}`;
      const body = firstLine.length <= 60
        ? para.split('\n').slice(1).join('\n').trim() || para
        : para;
      out.push({ title: slideTitle || `${title} ${i + 1}`, body: body.slice(0, 1200) });
    }
    return out.slice(0, 20);
  }

  return [
    { title, body: brief.slice(0, 180) },
    { title: 'Overview', body: brief.slice(0, 1200) },
  ];
}

/**
 * Resolve slide titles from a Canvas/Drive source brief (and optional user
 * instruction) for server-side template clone. Kept in contracts so daemon and
 * FE share one parser — no web-only emergency-deck dependency.
 */
export function resolveTemplateCloneSlidesFromBrief(options: {
  sourceBrief?: string | null;
  userInstruction?: string | null;
  deckTitle?: string | null;
}): TemplateCloneSlideContent[] {
  const text = [options.sourceBrief ?? '', options.userInstruction ?? '']
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const out: TemplateCloneSlideContent[] = [];
  const seen = new Set<string>();

  const push = (rawTitle: string) => {
    const title = cleanCloneTitle(rawTitle);
    if (!title) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ title });
  };

  if (text) {
    const marker = VISIBLE_HEADINGS_RE.exec(text);
    if (marker && marker.index != null) {
      const payload = text
        .slice(marker.index + marker[0].length)
        .replace(HEADINGS_STOP_RE, '\n')
        .split('\n')[0]
        ?.trim() ?? '';
      for (const part of payload.split(/\s+\/\s+/)) push(part);
    }
    if (out.length < 2) {
      for (const line of text.split(/\r?\n/)) {
        const numbered = line.match(NUMBERED_SLIDE_RE);
        if (numbered?.[1]) push(numbered[1]);
      }
    }
  }

  if (out.length > 0) return out.slice(0, 20);

  // Free-form prompt (Home wizard / gallery): synthesize content-bearing
  // slides so template marketing copy is replaced. Empty brief still returns
  // [] so buildTemplateClonedDeckHtml can keep the template's natural shells.
  if (!text) return [];
  return synthesizeTemplateCloneSlidesFromFreeFormBrief({
    brief: text,
    ...(options.deckTitle !== undefined ? { deckTitle: options.deckTitle } : {}),
  });
}
