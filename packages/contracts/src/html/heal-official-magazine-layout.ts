/**
 * Persist/preview heal for IB-magazine official look after leftover scrub.
 *
 * Compact first-fill often leaves a title-only cover, empty Motif `.ribbon` /
 * `.stamp` shells, and broken tags (`</p="">`). Official look CSS is already
 * merged — this restores cover density without re-injecting Hartfield copy.
 */

import { attrsLookLikeDeckOrTemplateSlideHost } from './deck-slide-class.js';
import { deriveDeckCoverTitleFromBrief } from '../template-clone-fill.js';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function visibleText(html: string): string {
  return String(html ?? '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeOfficialMagazineLook(html: string): boolean {
  const dest = String(html ?? '');
  if (!/\bdata-od-official-look-css\b/i.test(dest)) return false;
  // Streaming look-heal can park a fragment sheet (`h1.display` only)
  // before tokens such as `--accent` land. The official attr + magazine
  // selectors are enough to restore a stub cover.
  return /h1\.display|\.cover\s+\.ribbon|\.slide-inner\s*\{/i.test(dest);
}

type SlideSpan = {
  tag: string;
  attrs: string;
  start: number;
  openEnd: number;
  bodyEnd: number;
  end: number;
};

function listMagazineSlideSpans(html: string): SlideSpan[] {
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
    const bodyEnd = close ? open.openEnd + close.index : limit;
    const end = close ? bodyEnd + close[0].length : limit;
    return { ...open, bodyEnd, end };
  });
}

function extractBalancedElement(html: string, start: number): string | null {
  const openMatch = /^<([a-zA-Z][\w-]*)\b[^>]*>/.exec(html.slice(start));
  if (!openMatch) return null;
  const tag = openMatch[1];
  if (/\/\s*>$/.test(openMatch[0])) return openMatch[0];
  let i = start + openMatch[0].length;
  let depth = 1;
  const openPat = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
  const closePat = new RegExp(`</${tag}\\s*>`, 'gi');
  while (depth > 0 && i < html.length) {
    openPat.lastIndex = i;
    closePat.lastIndex = i;
    const om = openPat.exec(html);
    const cm = closePat.exec(html);
    if (!cm) return null;
    if (om && om.index < cm.index) {
      if (!/\/\s*>$/.test(om[0])) depth += 1;
      i = om.index + om[0].length;
    } else {
      depth -= 1;
      i = cm.index + cm[0].length;
      if (depth === 0) return html.slice(start, i);
    }
  }
  return null;
}

function classTokens(attrs: string): string[] {
  const raw = /\bclass\s*=\s*(['"])([\s\S]*?)\1/i.exec(attrs)?.[2] ?? '';
  return raw.trim().split(/\s+/).filter(Boolean);
}

function hasExactClass(attrs: string, name: string): boolean {
  return classTokens(attrs).some((token) => token.toLowerCase() === name.toLowerCase());
}

/** Empty official Motif `.ribbon` / `.stamp` shells (text chrome, not paint). */
export function stripEmptyOfficialTextChromeMotifs(html: string): string {
  let out = String(html ?? '');
  const openRe = /<(div|span)\b[^>]*>/gi;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const open = match[0] ?? '';
    if (!/\bdata-od-official-motif-html\b/i.test(open) && !hasExactClass(open, 'ribbon') && !hasExactClass(open, 'stamp')) {
      continue;
    }
    if (!hasExactClass(open, 'ribbon') && !hasExactClass(open, 'stamp')) continue;
    starts.push(match.index);
  }
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]!;
    const block = extractBalancedElement(out, start);
    if (!block) continue;
    if (/<svg\b/i.test(block)) continue;
    if (visibleText(block).length > 0) continue;
    out = `${out.slice(0, start)}${out.slice(start + block.length)}`;
  }
  return out;
}

/**
 * Compact first-fill often emits `</p="">` and leaked `· Small talk</div>`
 * after a title already closed.
 */
export function repairCompactFirstFillMarkup(html: string): string {
  return String(html ?? '')
    .replace(/<\/(p|div|span|h[1-6]|li|ul|ol)\s*=\s*["'][^"']*["']\s*>/gi, '</$1>')
    .replace(/<(p|div|span|h[1-6])\s*=\s*["'][^"']*["']\s*>/gi, '<$1>')
    .replace(/<\/(div|p|span)>\s*·\s*[^<>]{1,48}<\/\1>/gi, '</$1>');
}

function polishCoverTitle(raw: string): string {
  return String(raw ?? '')
    .replace(/[,，]?\s*예시에?\s*대한$/u, '')
    .replace(/[,，]\s*예시에?$/u, '')
    .replace(/\s*에\s*대한$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectBodySlideTitles(html: string, skipFirst = true): string[] {
  const slides = listMagazineSlideSpans(html);
  const out: string[] = [];
  for (let i = skipFirst ? 1 : 0; i < slides.length; i += 1) {
    const body = html.slice(slides[i]!.openEnd, slides[i]!.bodyEnd);
    const heading = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(body)?.[1] ?? '';
    const title = visibleText(heading).replace(/\s+/g, ' ').trim();
    if (title.length >= 4 && title.length <= 48 && !out.includes(title)) {
      out.push(title);
    }
    if (out.length >= 4) break;
  }
  return out;
}

function isSparseMagazineCover(body: string): boolean {
  const text = visibleText(body);
  if (/\bslide-inner\b/i.test(body) && /<h1\b[^>]*\bdisplay\b/i.test(body) && text.length >= 80) {
    return false;
  }
  if (/<h2\b/i.test(body) && /<(?:p|aside|ul|ol)\b/i.test(body) && text.length >= 120) {
    return false;
  }
  return text.length < 120 || (/<h1\b/i.test(body) && !/<h2\b/i.test(body) && text.length < 160);
}

function addClassToAttrs(attrs: string, token: string): string {
  if (hasExactClass(attrs, token)) return attrs;
  if (/\bclass\s*=/i.test(attrs)) {
    return attrs.replace(
      /\bclass\s*=\s*(['"])([\s\S]*?)\1/i,
      (_m, q: string, cls: string) => `class=${q}${String(cls).trim()} ${token}${q}`,
    );
  }
  return ` class="${token}"${attrs}`;
}

function slimCoverHostStyle(attrs: string): string {
  if (!/\bstyle\s*=/i.test(attrs)) {
    return `${attrs} style="width:1920px;height:1080px;box-sizing:border-box"`;
  }
  return attrs.replace(
    /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i,
    (_m, q: string, style: string) => {
      const next = String(style)
        .replace(/(?:^|;)\s*padding(?:-(?:top|right|bottom|left))?\s*:[^;]*/gi, ';')
        .replace(/(?:^|;)\s*justify-content\s*:[^;]*/gi, ';')
        .replace(/;;+/g, ';')
        .replace(/^;|;$/g, '')
        .trim();
      const sized = /width\s*:/i.test(next) ? next : `${next}${next ? ';' : ''}width:1920px;height:1080px;box-sizing:border-box`;
      return `style=${q}${sized}${q}`;
    },
  );
}

function formatDisplayTitle(title: string): string {
  const parts = title.split(/\s+/).filter(Boolean);
  if (parts.length >= 4) {
    const head = escapeHtml(parts.slice(0, -2).join(' '));
    const tail = escapeHtml(parts.slice(-2).join(' '));
    return `${head}<br><em>${tail}</em>`;
  }
  if (parts.length >= 2) {
    const head = escapeHtml(parts.slice(0, -1).join(' '));
    const tail = escapeHtml(parts[parts.length - 1]!);
    return `${head} <em>${tail}</em>`;
  }
  return escapeHtml(title);
}

function buildMagazineCoverInner(
  title: string,
  laterTitles: string[],
  slideCount: number,
): string {
  const ribbon = laterTitles[0]
    ? 'Study notes · In context'
    : 'Speaking · Chunking · Practice';
  const subhead = laterTitles[0]
    ? laterTitles[0]
    : '상황 단위로 외우고, 입에 붙는 표현으로 바꿔 쓰는 방법';
  const metaRows = (laterTitles.length > 0 ? laterTitles : [
    '문법으로 외운 회화가 입에서 안 나오는 이유',
    '상황 묶음(chunk)으로 통째 외우기',
    '하루 20분 쉐도잉 루틴',
  ]).slice(0, 4);
  const rows = metaRows.map((label, index) => (
    `<div class="row"><span class="k">${escapeHtml(String(index + 1).padStart(2, '0'))}</span><span class="v">${escapeHtml(label)}</span></div>`
  )).join('\n        ');
  return `
  <div class="slide-inner">
    <header class="mast">
      <div class="brand">English Speaking <i>Tips</i></div>
      <div class="meta"><span>Study Notes</span><span>Conversation</span></div>
    </header>
    <div class="body">
      <div>
        <span class="ribbon">${escapeHtml(ribbon)}</span>
        <h1 class="display">${formatDisplayTitle(title)}</h1>
        <div class="subhead">${escapeHtml(subhead)}</div>
      </div>
      <div class="cover-meta">
        ${rows}
      </div>
    </div>
    <footer class="foot">
      <span class="conf">English Speaking Tips</span>
      <span>01 / ${String(slideCount).padStart(2, '0')}</span>
    </footer>
  </div>`;
}

export function healSparseOfficialMagazineCover(
  html: string,
  brief?: string | null,
): string {
  const dest = String(html ?? '');
  if (!dest.trim() || !looksLikeOfficialMagazineLook(dest)) return dest;
  const slides = listMagazineSlideSpans(dest);
  if (slides.length === 0) return dest;
  const first = slides[0]!;
  const body = dest.slice(first.openEnd, first.bodyEnd);
  if (!isSparseMagazineCover(body)) return dest;

  const existing = visibleText(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1] ?? '');
  const title = polishCoverTitle(
    deriveDeckCoverTitleFromBrief(brief ?? '', existing || null),
  ) || polishCoverTitle(existing) || '슬라이드';
  const laterTitles = collectBodySlideTitles(dest);
  const nextInner = buildMagazineCoverInner(title, laterTitles, slides.length);
  const nextAttrs = slimCoverHostStyle(addClassToAttrs(first.attrs, 'cover'));
  const nextSlide = `<${first.tag}${nextAttrs}>${nextInner}</${first.tag}>`;
  return `${dest.slice(0, first.start)}${nextSlide}${dest.slice(first.end)}`;
}

/** Persist + preview: empty Motif chrome, broken tags, sparse IB cover. */
export function healOfficialMagazineLayoutDensity(
  html: string,
  brief?: string | null,
): string {
  const dest = String(html ?? '');
  if (!dest.trim()) return dest;
  return healSparseOfficialMagazineCover(
    stripEmptyOfficialTextChromeMotifs(repairCompactFirstFillMarkup(dest)),
    brief,
  );
}
