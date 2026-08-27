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

function officialLookCssText(html: string): string {
  return [...String(html ?? '').matchAll(
    /<style\b[^>]*\bdata-od-official-look-css\b[^>]*>([\s\S]*?)<\/style>/gi,
  )].map((match) => match[1] ?? '').join('\n');
}

/**
 * IB pitch-book magazine kit only. `.slide-inner` + `--accent` is common
 * (weekly-update, Studio, Daisy) and must not rebuild those covers.
 */
function looksLikeOfficialMagazineLook(html: string): boolean {
  const dest = String(html ?? '');
  if (!/\bdata-od-official-look-css\b/i.test(dest)) return false;
  const css = officialLookCssText(dest) || dest;
  // IB is the only official kit that authors `h1.display`. Streaming look-heal
  // can park a fragment sheet with just that rule before `--accent` lands.
  if (/h1\.display/i.test(css)) return true;
  // Full magazine chrome without the display rule yet — still IB-only.
  // Do not treat Daisy/Studio/weekly `.slide-inner` as magazine proof.
  return (
    /\.cover\s+\.ribbon/i.test(css)
    && /\.cover-meta/i.test(css)
    && /\.mast\s*\{/i.test(css)
  );
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
    const textChrome = hasExactClass(open, 'ribbon')
      || hasExactClass(open, 'stamp')
      || hasExactClass(open, 'agent-stamp')
      || hasExactClass(open, 'demo-banner')
      || hasExactClass(open, 'demo-pill');
    if (!/\bdata-od-official-motif-html\b/i.test(open) && !textChrome) continue;
    if (!textChrome) continue;
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
    .replace(/<(p|div|span|h[1-6]|li|ul|ol)\s*=\s*["'][^"']*["']\s*>/gi, '<$1>')
    .replace(/<\/(div|p|span)>\s*·\s*[^<>]{1,48}<\/\1>/gi, '</$1>')
    // "…</div> · Small talk" with no extra close tag
    .replace(/<\/(div|p|span)>\s*·\s*[^<>\n]{1,48}(?=<|$)/gi, '</$1>')
    // "의견 표현 · Agree / Disagree · Agree / Disagree"
    .replace(/(\s*·\s*)([^·<\n]{2,40})\s*·\s*\2/gi, '$1$2')
    .replace(/([^·<\n]{2,40})\s*·\s*\1(?=\s*(?:·|<|$))/gi, '$1');
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
    if (
      title.length >= 4
      && title.length <= 48
      && !looksLikeLeftoverOutlineChip(title)
      && !out.includes(title)
    ) {
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
  const heading = visibleText(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1] ?? '');
  if (/에\s*대한$|예시에?$/u.test(heading)) return true;
  const prose = visibleText(/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(body)?.[1] ?? '');
  if (heading.length >= 4 && prose.length >= 12) return false;
  if (/<(?:p|div|aside)\b/i.test(body) && /<h1\b/i.test(body) && text.length >= 80) {
    return false;
  }
  if (/<h2\b/i.test(body) && /<(?:p|aside|ul|ol)\b/i.test(body) && text.length >= 120) {
    return false;
  }
  return /<h1\b/i.test(body) && !/<h2\b/i.test(body) && text.length < 80;
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
        .replace(/(?:^|;)\s*align-items\s*:[^;]*/gi, ';')
        .replace(/(?:^|;)\s*flex-direction\s*:[^;]*/gi, ';')
        .replace(/(?:^|;)\s*display\s*:[^;]*/gi, ';')
        .replace(/(?:^|;)\s*gap\s*:[^;]*/gi, ';')
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

function brandFromTitle(title: string): { brand: string; accent: string } {
  const parts = title.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { brand: escapeHtml(parts[0]!), accent: escapeHtml(parts.slice(1, 3).join(' ')) };
  }
  const raw = title.slice(0, 24) || 'Notes';
  return { brand: escapeHtml(raw), accent: '' };
}

/** Fill the 1920×1080 page — official IB `.slide-inner` is a 1320×820 card.
 * Use min-height:100% / height:auto so the flow clip cannot flex-shrink to 0. */
const MAGAZINE_INNER_FILL_STYLE =
  'width:100%;min-height:100%;height:auto;max-width:none;margin:0;box-sizing:border-box;display:grid;grid-template-rows:auto 1fr auto';

function peelFlowAndMotif(body: string): { chrome: string; content: string } {
  let chrome = '';
  let content = String(body ?? '');
  const openRe = /<(div|span)\b[^>]*>/gi;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(content)) !== null) {
    const open = match[0] ?? '';
    if (
      !/\bdata-od-official-motif-html\b/i.test(open)
      && !/\bdata-od-slide-flow\b/i.test(open)
    ) {
      continue;
    }
    starts.push(match.index);
  }
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]!;
    const block = extractBalancedElement(content, start);
    if (!block) continue;
    if (/\bdata-od-official-motif-html\b/i.test(block)) {
      chrome = `${block}${chrome}`;
      content = `${content.slice(0, start)}${content.slice(start + block.length)}`;
      continue;
    }
    const innerOpen = /^<div\b[^>]*>/i.exec(block)?.[0] ?? '';
    const closeMatch = /<\/div\s*>$/i.exec(block);
    const inner = closeMatch
      ? block.slice(innerOpen.length, block.length - closeMatch[0].length)
      : block.slice(innerOpen.length);
    content = `${content.slice(0, start)}${inner}${content.slice(start + block.length)}`;
  }
  return { chrome, content: content.trim() };
}

function takeHeading(content: string): { heading: string; rest: string } {
  const match = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/i.exec(content);
  if (!match || match.index == null) return { heading: '', rest: content };
  const inner = match[3] ?? '';
  const heading = /<h2\b[^>]*\bsection\b/i.test(match[0] ?? '')
    ? match[0]!
    : `<h2 class="section">${inner}</h2>`;
  return {
    heading,
    rest: `${content.slice(0, match.index)}${content.slice(match.index + match[0].length)}`.trim(),
  };
}

function looksLikeMagazineFillTrack(rest: string): boolean {
  const source = String(rest ?? '');
  if (/grid-template/i.test(source)) return true;
  if ((source.match(/<li\b/gi)?.length ?? 0) >= 3) return true;
  if ((source.match(/<(?:article|section|aside)\b/gi)?.length ?? 0) >= 2) return true;
  return (source.match(/<div\b[^>]*>/gi)?.length ?? 0) >= 3;
}

/**
 * MiniMax compact leftovers (`첫 만남 · Small talk`) are outline debris,
 * not requested body copy. Featuring them as cover-meta invents a topic.
 */
function looksLikeLeftoverOutlineChip(text: string): boolean {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return true;
  if (value.length > 64) return false;
  return /·/.test(value) || /^\s*·/.test(value);
}

function dropLeftoverOutlineChips(html: string): string {
  return String(html ?? '')
    .replace(/<(div|span|p)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => (
      looksLikeLeftoverOutlineChip(visibleText(block)) ? '' : block
    ))
    .replace(/\s*·\s*[A-Za-z][^<>]{0,40}(?=<|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function takeFirstParagraph(rest: string): { lede: string; remaining: string } {
  const match = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(rest);
  if (!match || match.index == null) return { lede: '', remaining: rest };
  return {
    lede: `<div class="lede">${match[1]}</div>`,
    remaining: `${rest.slice(0, match.index)}${rest.slice(match.index + match[0].length)}`.trim(),
  };
}

function coverMetaRowsFromBlocks(html: string): string {
  const texts = [...String(html ?? '').matchAll(
    /<(?:div|p|span|li)\b[^>]*>([\s\S]*?)<\/(?:div|p|span|li)>/gi,
  )]
    .map((match) => visibleText(match[1] ?? ''))
    .filter((text) => text.length >= 2 && !looksLikeLeftoverOutlineChip(text))
    .slice(0, 4);
  if (texts.length === 0) {
    const fallback = visibleText(html);
    if (fallback.length >= 2 && !looksLikeLeftoverOutlineChip(fallback)) texts.push(fallback);
  }
  return texts.map((text, index) => (
    `<div class="row"><span class="k">${escapeHtml(String(index + 1).padStart(2, '0'))}</span><span class="v">${escapeHtml(text)}</span></div>`
  )).join('\n        ');
}

/**
 * Chrome-measured 16:9 pages: a centered column leaves a dead right half,
 * and a centered heading+grid leaves a dead top. Sparse prose becomes a
 * two-pane spread; lists/cards pin the heading and fill the remaining row.
 */
function wrapFillTrackChildren(rest: string): string {
  const inner = String(rest ?? '').trim();
  if (!inner) return '';
  if (/^<div class="od-magazine-fill-track"[\s>]/.test(inner) && /<\/div>\s*$/.test(inner)) {
    return inner;
  }
  return (
    `<div class="od-magazine-fill-track" style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column">` +
    `${inner}</div>`
  );
}

function magazineFillBodyMarkup(heading: string, rest: string): string {
  rest = dropLeftoverOutlineChips(rest);
  if (looksLikeMagazineFillTrack(rest)) {
    return `
    <div class="body" style="display:flex;flex-direction:column;justify-content:flex-start;gap:28px;min-height:0;height:100%;box-sizing:border-box">
      ${heading}
      ${wrapFillTrackChildren(rest)}
    </div>`;
  }
  const { lede, remaining } = takeFirstParagraph(rest);
  const aside = coverMetaRowsFromBlocks(remaining);
  if (lede && aside) {
    return `
    <div class="body" style="display:flex;flex-direction:column;justify-content:flex-start;gap:28px;min-height:0;height:100%;box-sizing:border-box">
      ${heading}
      <div class="od-magazine-sparse-spread" style="display:grid;grid-template-columns:1.3fr 1fr;gap:48px;align-items:start;flex:1 1 auto;min-height:0">
        ${lede}
        <div class="cover-meta">
        ${aside}
        </div>
      </div>
    </div>`;
  }
  if (lede) {
    return `
    <div class="body" style="display:flex;flex-direction:column;justify-content:flex-start;gap:28px;min-height:0;height:100%;box-sizing:border-box">
      ${heading}
      <div class="od-magazine-lede-fill" style="flex:1 1 auto;min-height:0;display:flex;align-items:center">
        ${lede}
      </div>
    </div>`;
  }
  return `
    <div class="body" style="display:flex;flex-direction:column;justify-content:flex-start;gap:28px;min-height:0;height:100%;box-sizing:border-box">
      ${heading}
      ${rest}
    </div>`;
}

function buildMagazineBodyInner(
  heading: string,
  rest: string,
  index: number,
  slideCount: number,
  footLabel: string,
): string {
  const label = escapeHtml((footLabel || 'Notes').slice(0, 40));
  return `
  <div class="slide-inner" style="${MAGAZINE_INNER_FILL_STYLE}">
    <header class="mast">
      <div class="brand">${label}</div>
      <div class="meta"><span>${String(index).padStart(2, '0')}</span><span>${String(slideCount).padStart(2, '0')}</span></div>
    </header>
    ${magazineFillBodyMarkup(heading, rest)}
    <footer class="foot">
      <span class="conf">${label}</span>
      <span>${String(index).padStart(2, '0')} / ${String(slideCount).padStart(2, '0')}</span>
    </footer>
  </div>`;
}

function healOfficialMagazineBodyFrames(html: string): string {
  const dest = String(html ?? '');
  if (!dest.trim() || !looksLikeOfficialMagazineLook(dest)) return dest;
  const slides = listMagazineSlideSpans(dest);
  if (slides.length < 2) return dest;
  let out = dest;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const slide = slides[i]!;
    const body = out.slice(slide.openEnd, slide.bodyEnd);
    if (/\bslide-inner\b/i.test(body)) continue;
    if (/<(?:table|svg)\b/i.test(body) && visibleText(body).length >= 200) continue;
    const { chrome, content } = peelFlowAndMotif(body);
    const cleaned = dropLeftoverOutlineChips(content);
    if (!cleaned.trim()) continue;
    const { heading, rest } = takeHeading(cleaned);
    const title = visibleText(heading) || visibleText(cleaned).slice(0, 40) || '슬라이드';
    const nextInner = `${chrome}${buildMagazineBodyInner(heading, rest, i + 1, slides.length, title)}`;
    const nextAttrs = slimCoverHostStyle(slide.attrs);
    out = `${out.slice(0, slide.start)}<${slide.tag}${nextAttrs}>${nextInner}</${slide.tag}>${out.slice(slide.end)}`;
  }
  return out;
}

function buildMagazineCoverInner(
  title: string,
  laterTitles: string[],
  slideCount: number,
): string {
  const hangul = /[가-힣]/.test(title);
  const ribbon = hangul ? '학습 노트' : 'Working notes';
  const notesLabel = hangul ? '학습 노트' : 'Notes';
  const slidesLabel = hangul ? '슬라이드' : 'slides';
  const metaRows = laterTitles.filter((label) => !looksLikeLeftoverOutlineChip(label)).slice(0, 4);
  const subhead = metaRows[0] || '';
  const { brand, accent } = brandFromTitle(title);
  const brandHtml = accent ? `${brand} <i>${accent}</i>` : brand;
  const rows = metaRows.map((label, index) => (
    `<div class="row"><span class="k">${escapeHtml(String(index + 1).padStart(2, '0'))}</span><span class="v">${escapeHtml(label)}</span></div>`
  )).join('\n        ');
  return `
  <div class="slide-inner" style="${MAGAZINE_INNER_FILL_STYLE}">
    <header class="mast">
      <div class="brand">${brandHtml}</div>
      <div class="meta"><span>${notesLabel}</span><span>${escapeHtml(String(slideCount).padStart(2, '0'))} ${slidesLabel}</span></div>
    </header>
    <div class="body">
      <div>
        <span class="ribbon">${escapeHtml(ribbon)}</span>
        <h1 class="display">${formatDisplayTitle(title)}</h1>
        ${subhead ? `<div class="subhead">${escapeHtml(subhead)}</div>` : ''}
      </div>
      ${rows ? `<div class="cover-meta">
        ${rows}
      </div>` : ''}
    </div>
    <footer class="foot">
      <span class="conf">${escapeHtml(title.slice(0, 40) || 'Notes')}</span>
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
  return healOfficialMagazineBodyFrames(
    healSparseOfficialMagazineCover(
      stripEmptyOfficialTextChromeMotifs(repairCompactFirstFillMarkup(dest)),
      brief,
    ),
  );
}
