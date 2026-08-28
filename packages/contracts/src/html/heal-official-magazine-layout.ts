/**
 * Persist/preview heal for IB-magazine official look after leftover scrub.
 *
 * Compact first-fill often leaves a title-only cover, empty Motif `.ribbon` /
 * `.stamp` shells, and broken tags (`</p="">`). Official look CSS is already
 * merged — this restores cover density without re-injecting Hartfield copy.
 */

import { attrsLookLikeDeckOrTemplateSlideHost } from './deck-slide-class.js';
import {
  deriveDeckCoverTitleFromBrief,
  restyleForeignIbMagazineCover,
} from '../template-clone-fill.js';

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
const LOOK_NEUTRALIZE_TAIL_RE = /\n?\/\*\s*stacked preview\/export:[\s\S]*$/i;

function looksLikeOfficialMagazineLook(html: string): boolean {
  const dest = String(html ?? '');
  if (!/\bdata-od-official-look-css\b/i.test(dest)) return false;
  // Neutralize now mentions `h1.display` for cover type scale — that must
  // not flip Daisy/Studio/weekly merges into IB magazine rebuilds.
  const css = (officialLookCssText(dest) || dest).replace(LOOK_NEUTRALIZE_TAIL_RE, '');
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
function salvageBareHeadingClose(html: string): string {
  return String(html ?? '').replace(/<\/h\s*>/gi, (_m, offset: number, src: string) => {
    const opens = [...String(src).slice(0, offset).matchAll(/<h([1-6])\b/gi)];
    const last = opens[opens.length - 1];
    return last ? `</h${last[1]}>` : '';
  });
}

/** MiniMax nests lede/grids inside h1/h2, then emits a bare `</h>`. */
function peelLayoutBlocksOutOfHeadings(html: string): string {
  let out = salvageBareHeadingClose(String(html ?? ''));
  const openRe = /<h([1-3])\b[^>]*>/gi;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) starts.push(match.index);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]!;
    const block = extractBalancedElement(out, start);
    if (!block) continue;
    const open = /^<h([1-3])\b[^>]*>/i.exec(block);
    if (!open) continue;
    const tag = open[1]!;
    const close = `</h${tag}>`;
    if (!block.toLowerCase().endsWith(close)) continue;
    const inner = block.slice(open[0].length, block.length - close.length);
    const firstBlock = /<(div|section|article|aside|ul|ol|table)\b/i.exec(inner);
    if (!firstBlock || firstBlock.index == null) continue;
    const before = inner.slice(0, firstBlock.index);
    const after = inner.slice(firstBlock.index).trim();
    if (!visibleText(before) || !after) continue;
    if (/<(div|section|article|aside|ul|ol|table)\b/i.test(before)) continue;
    const headingInner = before.replace(/\s+$/, '');
    out = `${out.slice(0, start)}${open[0]}${headingInner}${close}\n${after}${out.slice(start + block.length)}`;
  }
  return out;
}

function collapseHeadingDoubleBreaks(html: string): string {
  return String(html ?? '').replace(
    /<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (_m, tag: string, attrs: string, inner: string) => (
      `<${tag}${attrs}>${String(inner).replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>')}</${tag}>`
    ),
  );
}

function polishTruncatedHeadingInner(inner: string): string {
  return String(inner ?? '')
    .replace(/(?:<br\s*\/?>\s*)?[,，]?\s*예시에?\s*대한\s*$/u, '')
    .replace(/(?:<br\s*\/?>\s*)?\s*에\s*대한\s*$/u, '')
    .replace(/(?:<br\s*\/?>\s*)+$/g, '')
    .trim();
}

/** Truncated prompt tails belong in any official look, not only IB magazine rebuilds. */
function polishTruncatedHeadingsInPlace(html: string): string {
  return String(html ?? '').replace(
    /<(h[1-3])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs: string, inner: string) => {
      const text = visibleText(inner);
      if (!/에\s*대한$|예시에?$/u.test(text)) return full;
      const next = polishTruncatedHeadingInner(inner);
      if (!next || next === inner) return full;
      return `<${tag}${attrs}>${next}</${tag}>`;
    },
  );
}

/** Footer `.conf` / brand crumbs truncate the same prompt tail as headings. */
function polishTruncatedPromptLeaves(html: string): string {
  return String(html ?? '').replace(/>([^<]*[가-힣][^<]*)</g, (full, inner: string) => {
    const text = String(inner).replace(/\s+/g, ' ').trim();
    if (!/에\s*대한$|예시에?$/u.test(text)) return full;
    const next = polishTruncatedHeadingInner(inner);
    if (!next || next === inner) return full;
    return `>${next}<`;
  });
}

const GENERIC_EN_STUDY_CHROME_RE = /^(?:Study Notes|Working notes)$/i;

/**
 * MiniMax copies IB English ribbon chrome onto Hangul Biennale decks.
 * Drop the exact leftover strings only — do not invent `학습 노트`.
 */
function dropGenericEnglishStudyChrome(html: string): string {
  const dest = String(html ?? '');
  if (!/[가-힣]/.test(visibleText(dest))) return dest;
  return dest.replace(/>([^<]+)</g, (full, inner: string) => {
    const text = String(inner).replace(/\s+/g, ' ').trim();
    return GENERIC_EN_STUDY_CHROME_RE.test(text) ? '><' : full;
  });
}

const COMPLETE_TOKEN_SKIP_RE =
  /^(?:study|notes|working|cover|index|title|about|brief|volume|edition|english|speaking|ritual|daily|week|weeks|days|minutes|chapter|section|footer|header|paper|yellow|black|white|cards|card|recipe|routine)$/i;

/**
 * Restore a truncated Latin leaf from a unique longer word already in the
 * same document. Never invent a topic that is not already present.
 * Only whole-leaf tokens (`>Shado<`) are completed so `Board of Directors`
 * cannot become `Board's of Directors`.
 */
function completeTruncatedTokensFromDocument(html: string): string {
  const dest = String(html ?? '');
  const words = visibleText(dest).match(/[A-Za-z]{6,}/g) ?? [];
  const longer = [...new Set(words.map((word) => word))];
  if (longer.length === 0) return dest;
  return dest.replace(/>([^<]+)</g, (full, inner: string) => {
    const token = String(inner).replace(/\s+/g, ' ').trim();
    if (!/^[A-Za-z]{4,8}$/.test(token)) return full;
    if (COMPLETE_TOKEN_SKIP_RE.test(token)) return full;
    const key = token.toLowerCase();
    const matches = longer.filter((word) => {
      const lower = word.toLowerCase();
      if (!lower.startsWith(key) || lower.length < key.length + 2) return false;
      return /^[a-z]{2,}$/.test(lower.slice(key.length));
    });
    if (matches.length !== 1) return full;
    return `>${matches[0]}<`;
  });
}

/**
 * Overlay sun/orb paint must stay out of document flow. MiniMax often emits
 * the 560 box + radial circle + centered badge as `position:relative`.
 */
function restoreOverlayOrbPositioning(html: string): string {
  return String(html ?? '').replace(
    /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi,
    (full, q: string, style: string) => {
      if (!/\bposition\s*:\s*relative\b/i.test(style)) return full;
      if (!isOverlayOrbStyle(style)) return full;
      return `style=${q}${style.replace(/\bposition\s*:\s*relative\b/i, 'position:absolute')}${q}`;
    },
  );
}

function isOverlayOrbStyle(style: string): boolean {
  const source = String(style ?? '');
  if (/translate\(\s*-50%\s*,\s*-50%\s*\)/i.test(source)) return true;
  if (/\bborder-radius\s*:\s*50%/i.test(source) && /radial-gradient/i.test(source)) {
    return true;
  }
  const width = source.match(/\bwidth\s*:\s*(\d+)px/i);
  const height = source.match(/\bheight\s*:\s*(\d+)px/i);
  return Boolean(
    width && height && width[1] === height[1] && Number(width[1]) >= 400,
  );
}

function looksLikeTruncatedPromptChrome(text: string): boolean {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!value) return true;
  if (/에\s*대한$|예시에?$/u.test(value)) return true;
  return /^(?:brief|prompt|요청|과제)$/i.test(value);
}

function dropEchoBriefCoverMeta(html: string): string {
  let out = String(html ?? '');
  const metaOpens = /<(aside|div) class="cover-meta"[^>]*>/gi;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = metaOpens.exec(out)) !== null) starts.push(match.index);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]!;
    const block = extractBalancedElement(out, start);
    if (!block) continue;
    const copy = magazineRowFeaturedCopy(block) || visibleText(block);
    if (copy && !looksLikeTruncatedPromptChrome(copy) && !looksLikeLeftoverOutlineChip(copy)) {
      continue;
    }
    out = `${out.slice(0, start)}${out.slice(start + block.length)}`;
  }
  return collapseCoverBodyWhenMetaGone(out);
}

function collapseCoverBodyWhenMetaGone(html: string): string {
  let out = String(html ?? '');
  const openRe = /<div class="body"[^>]*>/gi;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) starts.push(match.index);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]!;
    const block = extractBalancedElement(out, start);
    if (!block) continue;
    if (/class="cover-meta"/i.test(block)) continue;
    const next = block.replace(
      /grid-template-columns\s*:\s*1\.3fr\s+1fr/i,
      'grid-template-columns:1fr',
    );
    if (next !== block) {
      out = `${out.slice(0, start)}${next}${out.slice(start + block.length)}`;
    }
  }
  return out;
}

function countTopLevelElements(inner: string): number {
  const source = String(inner ?? '');
  let i = 0;
  let n = 0;
  while (i < source.length) {
    const rel = source.slice(i).search(/<[a-zA-Z]/);
    if (rel < 0) break;
    const abs = i + rel;
    const block = extractBalancedElement(source, abs);
    if (!block) break;
    n += 1;
    i = abs + block.length;
  }
  return n;
}

/** A 4-col ritual grid with one surviving card must not leave three empty tracks. */
function collapseLonelyRepeatGrids(html: string): string {
  let out = String(html ?? '');
  const openRe = /<div\b[^>]*grid-template-columns:\s*repeat\(\s*[2-9]\s*,[^)]*\)[^>]*>/gi;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) starts.push(match.index);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]!;
    const block = extractBalancedElement(out, start);
    if (!block) continue;
    const open = /^<div\b[^>]*>/i.exec(block)?.[0] ?? '';
    const inner = block.slice(open.length).replace(/<\/div>\s*$/i, '');
    if (countTopLevelElements(inner) !== 1) continue;
    const nextOpen = open.replace(
      /grid-template-columns:\s*repeat\(\s*[2-9]\s*,[^)]*\)/i,
      'grid-template-columns:minmax(0,1fr)',
    );
    out = `${out.slice(0, start)}${nextOpen}${block.slice(open.length)}${out.slice(start + block.length)}`;
  }
  return out;
}

function dropEmptyDeckSlides(html: string): string {
  const dest = String(html ?? '');
  const slides = listMagazineSlideSpans(dest);
  if (slides.length < 2) return dest;
  let out = dest;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const slide = slides[i]!;
    const body = out.slice(slide.openEnd, slide.bodyEnd);
    if (/<(?:img|svg|video|canvas|iframe)\b/i.test(body)) continue;
    if (visibleText(body).length > 0) continue;
    out = `${out.slice(0, slide.start)}${out.slice(slide.end)}`;
  }
  return out;
}

/** Biennale Yellow chapter/data slides are cream paper — not inverted #0a0a0a. */
function relaxBiennaleInvertedSlidePaint(html: string): string {
  const dest = String(html ?? '');
  const css = officialLookCssText(dest);
  if (!/--sun\s*:\s*#F1EE2E/i.test(css) || !/--paper\s*:/i.test(css)) return dest;
  return dest.replace(
    /(<section\b[^>]*\b(?:s-chapter|s-data|s-cover|s-manifesto|s-programme|s-quote|s-cal|s-colophon)\b[^>]*style="[^"]*)background\s*:\s*#0a0a0a/gi,
    '$1background:var(--paper)',
  ).replace(
    /(<div\b[^>]*data-od-slide-flow[^>]*style="[^"]*)background\s*:\s*#0a0a0a/gi,
    '$1background:var(--paper)',
  ).replace(
    // Cream text on remapped cream paper is invisible. Keep #F1EE2E accents.
    // `(?<![\w-])` so `border-color:#E9E5DB` and `--paper:#E9E5DB` stay.
    /(?<![\w-])color\s*:\s*#(?:E9E5DB|DCD6C4)\b/gi,
    'color:var(--ink)',
  );
}

export function repairCompactFirstFillMarkup(html: string): string {
  return collapseHeadingDoubleBreaks(
    peelLayoutBlocksOutOfHeadings(
      salvageBareHeadingClose(
        String(html ?? '')
          .replace(/<\/(p|div|span|h[1-6]|li|ul|ol)\s*=\s*["'][^"']*["']\s*>/gi, '</$1>')
          .replace(/<(p|div|span|h[1-6]|li|ul|ol)\s*=\s*["'][^"']*["']\s*>/gi, '<$1>')
          .replace(/<\/(div|p|span)>\s*·\s*[^<>]{1,48}<\/\1>/gi, '</$1>')
          // "…</div> · Small talk" with no extra close tag
          .replace(/<\/(div|p|span)>\s*·\s*[^<>\n]{1,48}(?=<|$)/gi, '</$1>')
          // "…</div> 첫 만남 - Small talk" bilingual crumb after a close tag
          .replace(/<\/(div|p|span)>\s*[가-힣][^<>\n]{0,20}[·/–—-]\s*[A-Za-z][^<>\n]{0,24}(?=<|$)/gi, '</$1>')
          // "의견 표현 · Agree / Disagree · Agree / Disagree"
          .replace(/(\s*·\s*)([^·<\n]{2,40})\s*·\s*\2/gi, '$1$2')
          .replace(/([^·<\n]{2,40})\s*·\s*\1(?=\s*(?:·|<|$))/gi, '$1'),
      ),
    ),
  );
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

function firstSlideProse(body: string): string {
  const paragraph = visibleText(/<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(body)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (paragraph.length >= 12) return paragraph;
  const block = /<div\b[^>]*>([\s\S]*?)<\/div>/i.exec(body);
  if (!block) return '';
  const inner = block[1] ?? '';
  if (/<(?:ul|ol|table|svg|div|article|section|aside|h[1-6])\b/i.test(inner)) return '';
  return visibleText(inner).replace(/\s+/g, ' ').trim();
}

/** First later-slide paragraphs — on-brief subheads, not invented TOC labels. */
function collectBodySlideLedes(html: string, skipFirst = true): string[] {
  const slides = listMagazineSlideSpans(html);
  const out: string[] = [];
  for (let i = skipFirst ? 1 : 0; i < slides.length; i += 1) {
    const body = html.slice(slides[i]!.openEnd, slides[i]!.bodyEnd);
    const prose = firstSlideProse(body);
    if (
      prose.length >= 12
      && prose.length <= 160
      && !looksLikeLeftoverOutlineChip(prose)
      && !out.includes(prose)
    ) {
      out.push(prose);
    }
    if (out.length >= 2) break;
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
  if ((source.match(/<li\b/gi)?.length ?? 0) >= 2) return true;
  if ((source.match(/<(?:article|section|aside)\b/gi)?.length ?? 0) >= 2) return true;
  return (source.match(/<div\b[^>]*>/gi)?.length ?? 0) >= 3;
}

/**
 * MiniMax compact leftovers (`첫 만남 · Small talk`) are outline debris,
 * not requested body copy. Featuring them as cover-meta invents a topic.
 * Hangul `듣기 · 따라 말하기` is requested punctuation — do not drop it.
 * Empty wrappers are structural, not leftover chips.
 */
function looksLikeLeftoverOutlineChip(text: string): boolean {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!value || value.length > 48) return false;
  // MiniMax bilingual crumbs only. Latin `Volume IV · Edition 02` is IB chrome.
  return /[가-힣].{0,24}[·/–—-]\s*[A-Za-z]/.test(value);
}

function dropLeftoverOutlineChips(html: string): string {
  let out = String(html ?? '');
  const openRe = /<(div|span|p|li|h[3-4])\b[^>]*>/gi;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) starts.push(match.index);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]!;
    const block = extractBalancedElement(out, start);
    if (!block) continue;
    if (!looksLikeLeftoverOutlineChip(visibleText(block))) continue;
    out = `${out.slice(0, start)}${out.slice(start + block.length)}`;
  }
  return out
    .replace(/\s*·\s*[A-Za-z][^<>]{0,40}(?=<|$)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function magazineRowFeaturedCopy(block: string): string {
  const value = visibleText(
    /<(?:span|div) class="v">([\s\S]*?)<\/(?:span|div)>/i.exec(block)?.[1] ?? '',
  );
  return value || visibleText(block).replace(/^\d+\s*$|^(?:brief|prompt|요청|과제)\s*/i, '');
}

/** Re-persist of 142–143 decks can already have leftover inside `.slide-inner`. */
function scrubLeftoverMagazineCopy(html: string): string {
  let out = dropLeftoverOutlineChips(String(html ?? ''));
  const rowOpens = /<div class="row"[^>]*>/gi;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowOpens.exec(out)) !== null) starts.push(match.index);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const start = starts[i]!;
    const block = extractBalancedElement(out, start);
    if (!block) continue;
    const copy = magazineRowFeaturedCopy(block);
    if (
      copy
      && !looksLikeLeftoverOutlineChip(copy)
      && !looksLikeTruncatedPromptChrome(copy)
    ) {
      continue;
    }
    out = `${out.slice(0, start)}${out.slice(start + block.length)}`;
  }
  out = out.replace(
    /<div class="subhead">\s*(?:핵심 내용을 한 장에 정리합니다|Key points for this discussion)\s*<\/div>/gi,
    '',
  );
  return out.replace(/<div class="cover-meta">\s*<\/div>/gi, '');
}

function takeFirstLede(rest: string): { lede: string; remaining: string } {
  const source = String(rest ?? '');
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(source);
  if (paragraph && paragraph.index != null) {
    const text = visibleText(paragraph[1] ?? '');
    if (text.length >= 12 && !looksLikeLeftoverOutlineChip(text)) {
      return {
        lede: `<div class="lede">${paragraph[1]}</div>`,
        remaining: `${source.slice(0, paragraph.index)}${source.slice(paragraph.index + paragraph[0].length)}`.trim(),
      };
    }
  }
  // MiniMax often parks the lede in a bare div instead of <p>.
  const block = /<div\b([^>]*)>([\s\S]*?)<\/div>/i.exec(source);
  if (block && block.index != null) {
    const attrs = block[1] ?? '';
    const inner = block[2] ?? '';
    if (
      !/<(?:ul|ol|table|svg|div|article|section|aside|h[1-6])\b/i.test(inner)
      && !/grid-template|od-magazine-/i.test(attrs)
    ) {
      const text = visibleText(inner);
      if (text.length >= 12 && text.length <= 220 && !looksLikeLeftoverOutlineChip(text)) {
        return {
          lede: `<div class="lede">${inner}</div>`,
          remaining: `${source.slice(0, block.index)}${source.slice(block.index + block[0].length)}`.trim(),
        };
      }
    }
  }
  return { lede: '', remaining: source };
}

const MAGAZINE_BODY_OPEN =
  '<div class="body" style="display:flex;flex-direction:column;justify-content:flex-start;gap:28px;min-height:0;height:100%;box-sizing:border-box">';

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
  const { lede, remaining } = takeFirstLede(rest);
  if (looksLikeMagazineFillTrack(remaining)) {
    return `
    ${MAGAZINE_BODY_OPEN}
      ${heading}
      ${lede}
      ${wrapFillTrackChildren(remaining)}
    </div>`;
  }
  const aside = coverMetaRowsFromBlocks(remaining);
  const asideRows = aside.match(/class="row"/g)?.length ?? 0;
  if (lede && aside && asideRows >= 2) {
    return `
    ${MAGAZINE_BODY_OPEN}
      ${heading}
      <div class="od-magazine-sparse-spread" style="display:grid;grid-template-columns:1.3fr 1fr;gap:48px;align-items:start;flex:1 1 auto;min-height:0">
        ${lede}
        <div class="cover-meta">
        ${aside}
        </div>
      </div>
    </div>`;
  }
  const leftoverFreeRemaining = dropLeftoverOutlineChips(remaining);
  if (lede && leftoverFreeRemaining) {
    return `
    <div class="body" style="display:flex;flex-direction:column;justify-content:flex-start;gap:28px;min-height:0;height:100%;box-sizing:border-box">
      ${heading}
      ${lede}
      ${leftoverFreeRemaining}
    </div>`;
  }
  if (lede) {
    return `
    ${MAGAZINE_BODY_OPEN}
      ${heading}
      <div class="od-magazine-lede-fill" style="flex:1 1 auto;min-height:0;display:flex;align-items:center">
        ${lede}
      </div>
    </div>`;
  }
  if (!visibleText(remaining)) {
    return `
    ${MAGAZINE_BODY_OPEN}
      <div class="od-magazine-title-fill" style="flex:1 1 auto;min-height:0;display:flex;align-items:center">
        ${heading}
      </div>
    </div>`;
  }
  return `
    ${MAGAZINE_BODY_OPEN}
      ${heading}
      ${leftoverFreeRemaining || remaining || rest}
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

function looksLikeCatalogIbPaperCopy(html: string): boolean {
  return /Hartfield|NorthPeak|WACC|Project Atlas|Hartfield\s*&/i.test(html);
}

function isSparseFramedMagazineBody(body: string): boolean {
  if (!/\bslide-inner\b/i.test(body)) return false;
  if (/\bod-magazine-(?:fill-track|lede-fill|sparse-spread|title-fill)\b/i.test(body)) return false;
  if (looksLikeCatalogIbPaperCopy(body)) return false;
  if (/<h1\b[^>]*\bdisplay\b/i.test(body) && visibleText(body).length >= 80) return false;
  if (/<(?:table|svg)\b/i.test(body) && visibleText(body).length >= 200) return false;
  const text = visibleText(body);
  if (text.length >= 360) return false;
  return true;
}

function peelSparseFramedInner(body: string): { chrome: string; heading: string; rest: string } | null {
  const { chrome, content } = peelFlowAndMotif(body);
  const start = content.search(/<(div|section)\b[^>]*\bslide-inner\b/i);
  if (start < 0) return null;
  const block = extractBalancedElement(content, start);
  if (!block) return null;
  const open = /^<[^>]+>/.exec(block)?.[0] ?? '';
  const close = /<\/(?:div|section)\s*>$/i.exec(block)?.[0] ?? '';
  let inner = block.slice(open.length, close ? block.length - close.length : undefined);
  inner = inner
    .replace(/<header\b[^>]*\bmast\b[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[^>]*\bfoot\b[^>]*>[\s\S]*?<\/footer>/gi, '')
    .trim();
  const bodyWrap = /^<div\b[^>]*\bclass\s*=\s*(['"])[^"'<>]*\bbody\b[^"'<>]*\1[^>]*>([\s\S]*)<\/div>\s*$/i.exec(inner);
  if (bodyWrap) inner = (bodyWrap[2] ?? '').trim();
  const cleaned = dropLeftoverOutlineChips(inner);
  if (!cleaned.trim()) return null;
  const { heading, rest } = takeHeading(cleaned);
  return { chrome, heading, rest };
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
    if (/<(?:table|svg)\b/i.test(body) && visibleText(body).length >= 200) continue;
    let chrome = '';
    let heading = '';
    let rest = '';
    if (/\bslide-inner\b/i.test(body)) {
      if (!isSparseFramedMagazineBody(body)) continue;
      const peeled = peelSparseFramedInner(body);
      if (!peeled) continue;
      chrome = peeled.chrome;
      heading = peeled.heading;
      rest = peeled.rest;
    } else {
      const peeled = peelFlowAndMotif(body);
      chrome = peeled.chrome;
      const cleaned = dropLeftoverOutlineChips(peeled.content);
      if (!cleaned.trim()) continue;
      const taken = takeHeading(cleaned);
      heading = taken.heading;
      rest = taken.rest;
    }
    const title = visibleText(heading) || visibleText(rest).slice(0, 40) || '슬라이드';
    const nextInner = `${chrome}${buildMagazineBodyInner(heading, rest, i + 1, slides.length, title)}`;
    const nextAttrs = slimCoverHostStyle(slide.attrs);
    out = `${out.slice(0, slide.start)}<${slide.tag}${nextAttrs}>${nextInner}</${slide.tag}>${out.slice(slide.end)}`;
  }
  return out;
}

function buildMagazineCoverInner(
  title: string,
  laterTitles: string[],
  laterLedes: string[],
  slideCount: number,
): string {
  const hangul = /[가-힣]/.test(title);
  const ribbon = hangul ? '학습 노트' : 'Working notes';
  const notesLabel = hangul ? '학습 노트' : 'Notes';
  const slidesLabel = hangul ? '슬라이드' : 'slides';
  const metaRows = laterTitles.filter((label) => !looksLikeLeftoverOutlineChip(label)).slice(0, 4);
  const subhead = metaRows[0] || laterLedes[0] || '';
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
  const fromBrief = String(brief ?? '').trim()
    ? polishCoverTitle(deriveDeckCoverTitleFromBrief(brief ?? '', existing || null))
    : '';
  const title = fromBrief || polishCoverTitle(existing);
  if (!title) return dest;
  const laterTitles = collectBodySlideTitles(dest);
  const laterLedes = collectBodySlideLedes(dest);
  const nextInner = buildMagazineCoverInner(title, laterTitles, laterLedes, slides.length);
  const hasMeta = laterTitles.some((label) => !looksLikeLeftoverOutlineChip(label));
  let coverAttrs = addClassToAttrs(first.attrs, 'cover');
  if (!hasMeta) coverAttrs = addClassToAttrs(coverAttrs, 'od-magazine-cover-solo');
  const nextAttrs = slimCoverHostStyle(coverAttrs);
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
      dropEmptyDeckSlides(
        collapseLonelyRepeatGrids(
          dropEchoBriefCoverMeta(
            restyleForeignIbMagazineCover(
              completeTruncatedTokensFromDocument(
                polishTruncatedPromptLeaves(
                  polishTruncatedHeadingsInPlace(
                    restoreOverlayOrbPositioning(
                      relaxBiennaleInvertedSlidePaint(
                        scrubLeftoverMagazineCopy(
                          stripEmptyOfficialTextChromeMotifs(
                            dropGenericEnglishStudyChrome(repairCompactFirstFillMarkup(dest)),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      brief,
    ),
  );
}
