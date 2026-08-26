/**
 * Pure HTML transform for Teamver daemon template Clone.
 *
 * The daemon reads plugin `example.html` from disk and content-swaps Source
 * text into real template shells. Do not dump full HTML into the BYOK system
 * prompt, and do not copy the template original into user-visible project refs/.
 *
 * Policy: reuse each shell's layout/role/motif — do NOT mirror the template's
 * demo page count, order, or section lineup.
 */

import { attrsLookLikeDeckOrTemplateSlideHost } from './html/deck-slide-class.js';

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
  return attrsLookLikeDeckOrTemplateSlideHost(attrs);
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

  const opens = [...html.matchAll(/<div\b([^>]*)>/gi)]
    .filter((match) => attrsLookLikeDeckOrTemplateSlideHost(match[1] ?? ''));
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

/**
 * Template Clone policy (Teamver):
 * - Do NOT copy the template's page count, order, or section lineup.
 * - Read each shell's layout/role/motif, then reuse the right shell for each
 *   content slide (cover vs list vs cards vs quote…).
 */
export type TemplateCloneShellRole =
  | 'cover'
  | 'list'
  | 'cards'
  | 'timeline'
  | 'stat'
  | 'quote'
  | 'team'
  | 'process'
  | 'closing'
  | 'body';

export function classifyTemplateCloneShellRole(shell: {
  attrs: string;
  body: string;
}): TemplateCloneShellRole {
  const hay = `${shell.attrs}\n${shell.body.slice(0, 800)}`;
  if (/\bslide-title\b|\bcover\b|\bhero\b|\btitle-box\b/i.test(hay)) return 'cover';
  if (/\bslide-quote\b|\bquote-text\b|\bquote-mark\b/i.test(hay)) return 'quote';
  if (/\bslide-timeline\b|\btimeline\b/i.test(hay)) return 'timeline';
  if (/\bslide-donut\b|\bslide-chart|\bdonut\b|\bchart-bar\b|\bkpi\b/i.test(hay)) return 'stat';
  if (/\bslide-team\b|\bteam-member\b|\bteam-avatar\b/i.test(hay)) return 'team';
  if (/\bslide-process\b|\bprocess-|\bstep-circle\b/i.test(hay)) return 'process';
  if (/\bslide-cards\b|\bslide-weekly\b|\bcards-grid\b|\binfo-card\b|\bweekly-grid\b/i.test(hay)) {
    return 'cards';
  }
  if (/\bslide-welcome\b|\bwelcome-list\b|<[uo]l\b/i.test(hay)) return 'list';
  if (/\bslide-closing\b|\bthanks\b|\bend\b|\bclosing\b/i.test(hay)) return 'closing';
  return 'body';
}

export function inferTemplateCloneContentRole(
  slide: TemplateCloneSlideContent,
  index: number,
  total: number,
): TemplateCloneShellRole {
  if (index === 0) return 'cover';
  const title = slide.title.trim();
  const body = slide.body?.trim() ?? '';
  const blob = `${title}\n${body}`;
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (index === total - 1 && total >= 3 && /다음|정리|요약|thanks|closing|wrap.?up|결론/i.test(title)) {
    return 'closing';
  }
  // Body shape wins over title keywords — a "KPI" slide with bullet lines
  // still needs a list shell so content-swap can land the bullets.
  if (lines.length >= 2 || /^[-*•·]/.test(body) || /^\d+[.)]/.test(body)) return 'list';
  if (/\bKPI\b|\d+\s*%|통계|지표|차트|수치/i.test(blob)) return 'stat';
  if (/타임라인|로드맵|일정|milestone|timeline|roadmap/i.test(blob)) return 'timeline';
  if (/팀|멤버|조직|people|team\b/i.test(title)) return 'team';
  if (/프로세스|절차|단계|process|steps?/i.test(title)) return 'process';
  if (body.length >= 100 && lines.length <= 1) return 'quote';
  if (lines.length === 1 && body.length < 100) return 'cards';
  return 'body';
}

function leastUsedShell(pool: SlideShell[], usage: Map<SlideShell, number>): SlideShell | null {
  if (pool.length === 0) return null;
  let best = pool[0]!;
  let bestUses = usage.get(best) ?? 0;
  for (const shell of pool) {
    const uses = usage.get(shell) ?? 0;
    if (uses < bestUses) {
      best = shell;
      bestUses = uses;
    }
  }
  return best;
}

function pickShellByRole(
  role: TemplateCloneShellRole,
  byRole: Map<TemplateCloneShellRole, SlideShell[]>,
  cover: SlideShell,
  bodyPool: SlideShell[],
  usage: Map<SlideShell, number>,
): SlideShell {
  const fallbacks: TemplateCloneShellRole[] = (() => {
    switch (role) {
      case 'cover':
        return ['cover'];
      case 'list':
        return ['list', 'body', 'cards', 'process'];
      case 'cards':
        return ['cards', 'list', 'body'];
      case 'timeline':
        return ['timeline', 'process', 'list', 'body'];
      case 'stat':
        return ['stat', 'cards', 'body'];
      case 'quote':
        return ['quote', 'body'];
      case 'team':
        return ['team', 'cards', 'body'];
      case 'process':
        return ['process', 'timeline', 'list', 'body'];
      case 'closing':
        return ['closing', 'quote', 'body'];
      default:
        return ['body', 'list', 'cards', 'quote'];
    }
  })();

  if (role === 'cover') return cover;

  for (const candidateRole of fallbacks) {
    // Never reuse the cover shell for body roles — title layouts lack list/card slots.
    const pool = (byRole.get(candidateRole) ?? []).filter((shell) => shell !== cover);
    const best = leastUsedShell(pool, usage);
    if (best) return best;
  }

  return leastUsedShell(bodyPool, usage) ?? cover;
}

/** Pick layout shells by content role — never mirror template page order/count. */
export function pickTemplateShellsForContent(
  shells: SlideShell[],
  slides: TemplateCloneSlideContent[],
): SlideShell[] {
  if (shells.length === 0) return [];
  if (slides.length === 0) return [shells[0]!];

  const byRole = new Map<TemplateCloneShellRole, SlideShell[]>();
  for (const shell of shells) {
    const role = classifyTemplateCloneShellRole(shell);
    const list = byRole.get(role) ?? [];
    list.push(shell);
    byRole.set(role, list);
  }
  const cover = byRole.get('cover')?.[0] ?? shells[0]!;
  const bodyPool = shells.filter((shell) => shell !== cover);
  const usage = new Map<SlideShell, number>();
  const picked: SlideShell[] = [];

  for (let i = 0; i < slides.length; i += 1) {
    const role = inferTemplateCloneContentRole(slides[i]!, i, slides.length);
    const shell = pickShellByRole(role, byRole, cover, bodyPool, usage);
    picked.push(shell);
    usage.set(shell, (usage.get(shell) ?? 0) + 1);
  }
  return picked;
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

function isPlaceholderCloneBody(body?: string): boolean {
  const text = String(body ?? '').trim();
  if (!text) return true;
  return text.split(/\r?\n/).every((line) => /^(?:…|\.{3}|⋯|\s)*$/u.test(line.trim()));
}

function headingLooksLikeDemoSentence(inner: string): boolean {
  const plain = String(inner ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length >= 24 || /\bthat\b|[.。]\s*$/i.test(plain)) return true;
  // Cover-style `Project <em>Atlas</em>` — first-run swap would leave English.
  return /<(?:em|i)\b/i.test(inner) && /[A-Za-z]{3,}/.test(plain);
}

/** Full heading swap when the shell is a demo sentence (`A DCF that …`). */
function replaceHeadingText(html: string, tag: string, text: string): string {
  const re = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)(<\\/${tag}>)`, 'i');
  if (!re.test(html)) return html;
  return html.replace(re, (_match, open: string, inner: string, close: string) => {
    if (headingLooksLikeDemoSentence(inner)) {
      return `${open}${escapeHtml(text)}${close}`;
    }
    return `${open}${replaceFirstTextRun(inner, text)}${close}`;
  });
}

function stripClassBlocks(html: string, className: string): string {
  const re = new RegExp(
    `<(div|span|p|header|footer|small|strong|em|i|blockquote|figure|figcaption|aside)\\b([^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*)>[\\s\\S]*?<\\/\\1>`,
    'gi',
  );
  return html.replace(re, '');
}

function emptyClassInners(html: string, className: string): string {
  const re = new RegExp(
    `(<(div|span|p)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["'][^>]*>)[\\s\\S]*?(<\\/\\2>)`,
    'gi',
  );
  return html.replace(re, '$1$3');
}

/** Deck chrome outside slide shells — demo disclaimer, pitch-agent stamp. */
export function stripDeckLevelDemoChrome(html: string): string {
  return String(html ?? '').replace(
    /<(div|aside|p|header|section)\b([^>]*\bclass\s*=\s*["'][^"']*\b(?:demo-banner|agent-stamp|demo-pill)\b[^"']*["'][^>]*)>[\s\S]*?<\/\1>/gi,
    '',
  );
}

function stripLeftoverTemplateDemoCopy(html: string): string {
  let next = String(html ?? '');
  for (const className of [
    'brand',
    'eyebrow',
    'body-text',
    'subhead',
    'lede',
    'pull',
    'who',
    'ribbon',
    'marque',
    'row',
    'meta',
    'demo-pill',
    'demo-banner',
    'agent-stamp',
    'quote-author',
    'kicker',
    'cover-meta',
    'grid-3',
    'criteria',
  ]) {
    next = stripClassBlocks(next, className);
  }
  next = next.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, '');
  next = next.replace(
    /<(footer)\b([^>]*\bclass\s*=\s*["'][^"']*\bfoot\b[^"']*["'][^>]*)>[\s\S]*?<\/\1>/gi,
    '',
  );
  return next;
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
      if (!String(line).trim()) {
        return `<li${attrs}></li>`;
      }
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
    body = replaceHeadingText(body, 'h1', title);
  } else if (/<h2\b/i.test(body)) {
    body = replaceHeadingText(body, 'h2', title);
  } else if (/<h3\b/i.test(body)) {
    body = replaceHeadingText(body, 'h3', title);
  }

  const placeholderBody = isPlaceholderCloneBody(bodyText);

  // Always clear template marketing subtitle when we own this shell's title.
  if (/<p\b[^>]*class\s*=\s*["'][^"']*subtitle/i.test(body)) {
    const subtitle = placeholderBody ? '' : (bodyLines[0] || bodyText || '');
    body = body.replace(
      /(<p\b[^>]*class\s*=\s*["'][^"']*subtitle[^"']*["'][^>]*>)([\s\S]*?)(<\/p>)/i,
      `$1${escapeHtml(subtitle)}$3`,
    );
  }

  if (placeholderBody) {
    // Ellipsis placeholders must not land in the first N list items and
    // leave the rest of the template TOC / finance copy intact.
    if (/<[uo]l\b/i.test(body)) {
      const existingCount = [...body.matchAll(/<li\b/gi)].length;
      if (existingCount > 0) {
        body = replaceListItems(body, Array.from({ length: existingCount }, () => ''));
      }
    } else if (/<p\b/i.test(body)) {
      body = replaceFirstTagText(body, 'p', '');
    }
    body = stripLeftoverTemplateDemoCopy(body);
    body = emptyClassInners(body, 'number');
    body = emptyClassInners(body, 'caption');
    body = emptyClassInners(body, 'quote-text');
    body = emptyClassInners(body, 'quote-author');
    if (!/<h[1-3]\b/i.test(shell.body)) {
      body = body.replace(
        /(<[^>]*\bclass\s*=\s*["'][^"']*\b(?:quote-text|number|caption)\b[^"']*["'][^>]*>)(<\/)/i,
        `$1${escapeHtml(title)}$2`,
      );
    }
  } else if (bodyLines.length > 0 && /<[uo]l\b/i.test(body)) {
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
  } else if (/<p\b/i.test(body)) {
    // Title-only: wipe leftover template marketing paragraphs ("Daisy Days", …).
    body = replaceFirstTagText(body, 'p', '');
  }

  // Partial heading swaps must not keep IB/finance demo chrome/tables.
  if (/Hartfield|NorthPeak|WACC\s*\(\s*base\s*\)|Implied EV|Demo-data notice/i.test(body)) {
    body = stripLeftoverTemplateDemoCopy(body);
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
    const title = sanitizeTemplateCloneDeckTitle(slide.title);
    if (!title) continue;
    const body = slide.body?.trim();
    cleanedSlides.push(body ? { title, body } : { title });
  }
  // Slide-count policy (NOT template fidelity):
  // - Content outline / synthesized brief wins.
  // - Explicit user maxSlides hint may expand (never shrink below outline).
  // - Never default to the template's natural page count/order.
  const hint = options.maxSlides != null
    ? Math.min(20, Math.max(1, options.maxSlides))
    : null;
  const deckTitle =
    sanitizeTemplateCloneDeckTitle(options.title)
    || cleanedSlides[0]?.title
    || '슬라이드';

  let workingSlides: TemplateCloneSlideContent[];
  if (cleanedSlides.length > 0) {
    workingSlides = cleanedSlides.slice(0, 20);
    if (
      hint != null
      && hint > workingSlides.length
      && !workingSlides.every((slide) => isPlaceholderCloneBody(slide.body))
    ) {
      while (workingSlides.length < hint) {
        const n = workingSlides.length + 1;
        workingSlides.push({
          title: n === 1 ? deckTitle : `${deckTitle} · ${n}`,
          body: '',
        });
      }
    }
  } else {
    // Empty brief: short starter deck with role-diverse shells — not all
    // template demo pages in demo order.
    const starterCount = hint ?? 3;
    workingSlides = Array.from({ length: Math.min(20, starterCount) }, (_, index) => ({
      title: index === 0 ? deckTitle : `${deckTitle} · ${index + 1}`,
      body: '',
    }));
  }

  const picked = pickTemplateShellsForContent(shells, workingSlides);
  const filled = picked.map((shell, index) => {
    const content = workingSlides[index] ?? {
      title: index === 0 ? deckTitle : `${deckTitle} · ${index + 1}`,
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
  out = stripDeckLevelDemoChrome(out);
  out = syncClonedDeckChromeCount(out, filled.length);
  out = normalizeTemplateCssForFixedCanvas(out);
  out = injectTeamverSizeStyle(out);
  return out.trim() || null;
}

function syncClonedDeckChromeCount(html: string, count: number): string {
  const padded = String(Math.max(1, count)).padStart(2, '0');
  return String(html ?? '')
    .replace(/(<[^>]*\bid\s*=\s*["']total["'][^>]*>)[\s\S]*?(<\/)/i, `$1${padded}$2`)
    .replace(/(<[^>]*\bid\s*=\s*["']deck-total["'][^>]*>)[\s\S]*?(<\/)/i, `$1${padded}$2`);
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
  /(?:\[User instruction\]|User instruction)\s*[:：]?\s*\n?([\s\S]*?)(?=\n\n\[|\n(?:Source |Canvas |Drive |Visible |Selected |Attachments?:)|$)/i;

function cleanCloneTitle(title: string): string {
  return title.replace(/^["'`]|["'`]$/g, '').replace(/\s+/g, ' ').trim();
}

/** Dense template sample lexicon that must not lock a LOOK seed over a clean re-clone. */
export function looksLikeLeftoverTemplateDemoDeck(html: string): boolean {
  const text = String(html ?? '');
  if (!text.trim()) return false;
  return /Hartfield|NorthPeak Industries|WACC\s*\(|Revenue CAGR|Filebase|Northwind Studios|Daisy Days|The bandwidth bill is the bug|Project Atlas/i.test(
    text,
  );
}

export function looksLikeTemplateMarketingTitle(title: string): boolean {
  const trimmed = title.trim();
  return /html\s*ppt|daisy days|simple deck|zhangzara|cheerful presentation|template for|hartfield|northpeak|filebase|project atlas|northwind studios/i.test(
    trimmed,
  ) || /^(?:presentation(?:\s+template)?|slide)$/i.test(trimmed);
}

function extractUserFacingBrief(text: string): string {
  const fromMarker = USER_INSTRUCTION_RE.exec(text)?.[1]?.trim();
  if (fromMarker) return fromMarker;
  // Drop protocol blocks from full create-slides run prompts.
  let cleaned = text
    .replace(/\n\n\[Deliverable instruction\][\s\S]*$/i, '')
    .replace(/\n\n\[Quick settings\][\s\S]*$/i, '')
    .replace(/\n\n\[Selected slide template(?: priority)?\][\s\S]*$/i, '')
    .replace(/\n\n\[Source brief\][\s\S]*$/i, '');
  cleaned = cleaned
    .replace(
      /^(?:Canvas title|Source preview|Drive source(?: file| MIME)?|Drive asset id|Visible headings|Canvas headings|Source headings)\s*[:：].*$/gim,
      '',
    )
    .trim();
  // Skip attachment/home boilerplate lead lines.
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstUseful = lines.find(
    (line) =>
      !/^첨부(?:한)?\s*.+\s*바탕으로\s*슬라이드/i.test(line)
      && !/^요청한\s*내용으로\s*슬라이드/i.test(line)
      && !/^슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(line),
  );
  return firstUseful
    ? [firstUseful, ...lines.slice(lines.indexOf(firstUseful) + 1)].join('\n')
    : '';
}

function deriveTitleFromBrief(brief: string, deckTitle?: string | null): string {
  const preferred = deckTitle?.trim() ?? '';
  if (preferred && !looksLikeTemplateMarketingTitle(preferred) && !looksLikeInstructionCopy(preferred)) {
    return cleanCloneTitle(preferred).slice(0, 80);
  }
  const first = brief.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || brief;
  // "expo에 대해서 설명하는 피피티 만들어줘" → topic before 설명/피피티/만들어
  const aboutTopic = first.match(
    /^(.+?)\s*(?:에\s*대해(?:서)?|에\s*관한)\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)/i,
  )?.[1]?.trim();
  let title = aboutTopic || first
    .replace(/^(?:please\s+)?(?:make|create|build|write)\s+(?:me\s+)?(?:a|an|the)?\s*/i, '')
    .replace(/\s+(?:slides?|deck|presentation)\s*\.?$/i, '')
    .replace(
      /\s*(?:에\s*대해(?:서)?|에\s*관한)?\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)?\s*(?:을|를)?\s*(?:만들어|작성|생성|설명해?).*$/i,
      '',
    )
    .replace(/^(?:슬라이드|발표자료|덱)\s*/i, '')
    .trim();
  if (
    !title
    || title.length < 2
    || looksLikeInstructionCopy(title)
    || looksLikeTemplateMarketingTitle(title)
  ) {
    title = aboutTopic && !looksLikeTemplateMarketingTitle(aboutTopic)
      ? aboutTopic
      : '슬라이드';
  }
  return cleanCloneTitle(title).slice(0, 60) || '슬라이드';
}

/**
 * Model-parroted host/API-mode instructions. The host persists
 * `<artifact type="deck">` automatically — this prose must never become a
 * cover title or stay visible in chat.
 */
const LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE =
  /(?:API\s+mode\s+without\s+filesystem\s+write\s+tools|without\s+filesystem\s+write\s+tools|save\s+this\s+as\s+deck\.html|here\s+is\s+the\s+complete\s+deck\s+HTML|this\s+workspace\s+is\s+in\s+API\s+mode|API\s*모드[^.!?\n]{0,80}파일\s*시스템|deck\.html(?:로|에)\s*저장)/i;

export function looksLikeLeakedApiModeFilesystemProse(text: string): boolean {
  return LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE.test(String(text ?? '').trim());
}

/** Drop leaked "save this as deck.html" / API-mode filesystem sentences from prose. */
export function stripLeakedApiModeFilesystemProse(text: string): string {
  if (!text || !LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE.test(text)) return text;
  const lines = text.split('\n').map((line) => {
    if (!LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE.test(line)) return line;
    const kept = line
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !LEAKED_API_MODE_FILESYSTEM_FINGERPRINT_RE.test(sentence));
    return kept.join(' ').trim();
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function looksLikeInstructionCopy(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (looksLikeLeakedApiModeFilesystemProse(t)) return true;
  if (/\[(?:Deliverable instruction|Selected slide template|Source brief|Quick settings|User instruction)\]/i.test(t)) {
    return true;
  }
  if (/첨부(?:한)?\s*.+\s*바탕으로\s*슬라이드/i.test(t)) return true;
  if (/요청한\s*내용으로\s*슬라이드/i.test(t)) return true;
  if (/^슬라이드\s*(?:덱|내용)을?\s*(?:만들어|채워)\s*줘\.?$/u.test(t)) return true;
  if (/(?:만들어|작성|생성)\s*(?:줘|주세요)|설명해?\s*(?:줘|주세요)/i.test(t)) return true;
  if (/^(?:please\s+)?(?:make|create|build|write|generate)\s+/i.test(t)) return true;
  if (/피피티|PPT|슬라이드\s*덱/i.test(t) && /(?:만들어|작성|생성|설명)/i.test(t)) return true;
  return false;
}

/**
 * Cover / document title for daemon Clone. Returns null when the candidate is
 * template marketing or a user "만들어줘" instruction — callers must not stuff
 * those into slide headings (AI content-fill writes real titles next).
 */
export function sanitizeTemplateCloneDeckTitle(
  raw: string | null | undefined,
): string | null {
  const title = cleanCloneTitle(String(raw ?? ''));
  if (!title) return null;
  if (looksLikeTemplateMarketingTitle(title) || looksLikeInstructionCopy(title)) {
    return null;
  }
  return title.slice(0, 80);
}

/**
 * Cover title from a Home / wizard / Clone fill prompt. Strips protocol
 * blocks and "만들어줘" wrappers so persist can salvage a head-only CSS
 * shell without parroting Daisy marketing or the raw instruction.
 */
export function deriveDeckCoverTitleFromBrief(
  prompt: string,
  deckTitle?: string | null,
): string {
  const brief = extractUserFacingBrief(prompt);
  return deriveTitleFromBrief(brief, deckTitle);
}

/** Parser / emergency defaults that must not land in the persist manifest. */
export function isGenericDeckArtifactTitle(title: string | null | undefined): boolean {
  return /^(?:response|deck|untitled|artifact|slide|presentation|발표\s*자료)$/i.test(
    String(title ?? '').trim(),
  );
}

function visibleHeadingText(inner: string): string {
  return inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function headingLooksLikeFailedGenerate(visible: string): boolean {
  return looksLikeInstructionCopy(visible) || looksLikeTemplateMarketingTitle(visible);
}

const GENERIC_HEAL_TITLE_RE =
  /^(?:발표\s*개요|overview|agenda|목차|구성|intro|title\s*slide|cover|표지|contents|table\s*of\s*contents)$/i;

function usableHealTitle(
  visible: string,
  options?: { allowGenericRole?: boolean },
): string | null {
  const title = cleanCloneTitle(visible);
  if (title.length < 2 || title.length > 48) return null;
  if (headingLooksLikeFailedGenerate(title)) return null;
  if (!options?.allowGenericRole && GENERIC_HEAL_TITLE_RE.test(title)) return null;
  return title;
}

function screenLabelRoleTitle(attrs: string): string | null {
  const raw = /\bdata-screen-label\s*=\s*(['"])([^'"]*)\1/i.exec(attrs)?.[2]?.trim() ?? '';
  const role = raw.replace(/^\d{2}\s+/, '').trim();
  return role ? usableHealTitle(role, { allowGenericRole: true }) : null;
}

function firstParagraphTitle(body: string): string | null {
  const inner = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(body)?.[1];
  if (!inner) return null;
  const visible = visibleHeadingText(inner);
  const sentence = visible.split(/(?<=[.!?。])\s+/)[0]?.trim() ?? visible;
  if (sentence.length > 48) return null;
  return usableHealTitle(sentence);
}

function roleFallbackTitle(
  attrs: string,
  body: string,
  coverTitle: string,
  index: number,
): string {
  const role = classifyTemplateCloneShellRole({ attrs, body });
  if (role === 'cover' || index === 0) return coverTitle;
  if (role === 'stat') return '핵심 수치';
  if (role === 'quote') return '인용';
  if (role === 'team') return '팀';
  if (role === 'process' || role === 'timeline') return '진행';
  if (role === 'closing') return '다음 단계';
  if (role === 'cards') return '핵심 포인트';
  if (index === 1) return '개요';
  if (index === 2) return '핵심 포인트';
  return '다음 단계';
}

function replaceFailedHeadings(fragment: string, title: string): string {
  const headingRe = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  return fragment.replace(headingRe, (full, level, attrs, inner) => {
    const visible = visibleHeadingText(String(inner ?? ''));
    if (!headingLooksLikeFailedGenerate(visible)) return full;
    return `<h${level}${attrs ?? ''}>${escapeHtml(title)}</h${level}>`;
  });
}

type HealHostSpan = {
  attrs: string;
  bodyStart: number;
  bodyEnd: number;
};

/** Section *and* div hosts in document order — clone shells are section-XOR-div. */
function listHealSlideHostSpans(html: string): HealHostSpan[] {
  const openRe = /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const opens: { tag: string; attrs: string; start: number; openEnd: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    if (!attrsLookLikeDeckOrTemplateSlideHost(match[2] ?? '')) continue;
    opens.push({
      tag: (match[1] ?? 'section').toLowerCase(),
      attrs: match[2] ?? '',
      start: match.index,
      openEnd: match.index + match[0].length,
    });
  }
  return opens.map((open, i) => {
    const limit = i + 1 < opens.length ? opens[i + 1]!.start : html.length;
    const chunk = html.slice(open.openEnd, limit);
    const close = new RegExp(`</${open.tag}\\s*>`, 'i').exec(chunk);
    return {
      attrs: open.attrs,
      bodyStart: open.openEnd,
      bodyEnd: close ? open.openEnd + close.index : limit,
    };
  });
}

/**
 * Persist heal: every host heading that still parrots "만들어줘" / template
 * marketing is rewritten so the majority-heading gate does not skip a
 * complete deck. Walks section *and* div hosts (clone shell list is XOR).
 */
export function healInstructionCopyCoverHeading(
  html: string,
  brief: string,
  deckTitle?: string | null,
): string {
  const dest = String(html ?? '');
  const coverTitle = sanitizeTemplateCloneDeckTitle(
    deriveDeckCoverTitleFromBrief(brief, deckTitle),
  );
  if (!coverTitle || !dest.trim()) return dest;

  const spans = listHealSlideHostSpans(dest);
  if (spans.length === 0) {
    return replaceFailedHeadings(dest, coverTitle);
  }

  let next = dest;
  for (let i = spans.length - 1; i >= 0; i -= 1) {
    const span = spans[i]!;
    const body = next.slice(span.bodyStart, span.bodyEnd);
    const title = i === 0
      ? coverTitle
      : screenLabelRoleTitle(span.attrs)
        || firstParagraphTitle(body)
        || roleFallbackTitle(span.attrs, body, coverTitle, i);
    const rewritten = replaceFailedHeadings(body, title);
    if (rewritten === body) continue;
    next = next.slice(0, span.bodyStart) + rewritten + next.slice(span.bodyEnd);
  }
  return stripDeckLevelDemoChrome(next);
}

/**
 * Free-form Home/wizard prompts have no Visible-headings outline. Still
 * synthesize content-bearing slides so Clone does not leave template marketing
 * copy intact. Length follows the brief — never the template's demo page count.
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
      const item = sanitizeTemplateCloneDeckTitle(
        line.replace(/^[-*•·]\s+/, '').replace(/^\d+[.)]\s+/, ''),
      );
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
        ? (sanitizeTemplateCloneDeckTitle(firstLine) ?? `${title} ${i + 1}`)
        : `${title} ${i + 1}`;
      const body = firstLine.length <= 60
        ? para.split('\n').slice(1).join('\n').trim() || para
        : para;
      out.push({ title: slideTitle || `${title} ${i + 1}`, body: body.slice(0, 1200) });
    }
    return out.slice(0, 20);
  }

  // Short free-form ask: placeholder shells only. AI content-fill turn writes
  // real copy next — never dump "만들어줘" instructions into titles/subtitles.
  return [
    { title, body: '…' },
    { title: '개요', body: '…' },
    { title: '핵심 포인트', body: '…\n…\n…' },
    { title: '다음 단계', body: '…' },
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
    const title = sanitizeTemplateCloneDeckTitle(rawTitle);
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
  // [] — build then uses a short role-diverse starter, not the template's
  // full demo page lineup.
  if (!text) return [];
  return synthesizeTemplateCloneSlidesFromFreeFormBrief({
    brief: text,
    ...(options.deckTitle !== undefined ? { deckTitle: options.deckTitle } : {}),
  });
}
