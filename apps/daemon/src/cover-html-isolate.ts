/**
 * First-slide isolation for HTML card covers — port of web
 * `apps/web/src/teamver/htmlCoverSrcDoc.ts` isolate helpers (no React / base href).
 */

import { repairArtifactStyleSheets } from '@open-design/contracts';

/** Opening-tag attrs that may contain `>` inside quotes (style/content). */
const TAG_OPEN_ATTRS_RE = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const COVER_SLIDE_OPEN_RE = new RegExp(
  String.raw`<(section|div)\b(${TAG_OPEN_ATTRS_RE})>`,
  'gi',
);

export type CoverSlideSection = {
  openTag: string;
  outerHtml: string;
  start: number;
  end: number;
};

/**
 * Drop every top-level slide-like block after the first so card thumbs cannot
 * paint later-slide absolute/manual-edit chrome over the cover.
 */
export function isolateFirstDeckSlideHtml(html: string): string {
  const slides = extractCoverSlideSections(html);
  if (slides.length <= 1) return html;
  let out = html;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const slide = slides[i];
    if (!slide) continue;
    out = `${out.slice(0, slide.start)}${out.slice(slide.end)}`;
  }
  return out;
}

export function extractCoverSlideSections(html: string): CoverSlideSection[] {
  const raw: CoverSlideSection[] = [];
  const openRe = new RegExp(COVER_SLIDE_OPEN_RE.source, 'gi');
  const closeByTag = {
    section: /<\/section\s*>/gi,
    div: /<\/div\s*>/gi,
  } as const;

  let searchFrom = 0;
  while (searchFrom < html.length) {
    openRe.lastIndex = searchFrom;
    const openMatch = openRe.exec(html);
    if (!openMatch) break;
    const tag = (openMatch[1] ?? 'section').toLowerCase();
    const attrs = openMatch[2] ?? '';
    const openStart = openMatch.index;
    const openEnd = openStart + openMatch[0].length;
    if (!isCoverSlideOpen(tag, attrs)) {
      searchFrom = openEnd;
      continue;
    }
    const closeRe = new RegExp(closeByTag[tag as keyof typeof closeByTag].source, 'gi');
    const nestedOpenRe = new RegExp(String.raw`<${tag}\b${TAG_OPEN_ATTRS_RE}>`, 'gi');
    let depth = 1;
    let cursor = openEnd;
    let matchedCloseEnd = -1;
    while (cursor < html.length && depth > 0) {
      nestedOpenRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen = nestedOpenRe.exec(html);
      const nextClose = closeRe.exec(html);
      if (!nextClose) break;
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        const closeEnd = nextClose.index + nextClose[0].length;
        cursor = closeEnd;
        if (depth === 0) matchedCloseEnd = closeEnd;
      }
    }
    if (matchedCloseEnd === -1) {
      searchFrom = openEnd;
      continue;
    }
    raw.push({
      openTag: openMatch[0],
      outerHtml: html.slice(openStart, matchedCloseEnd),
      start: openStart,
      end: matchedCloseEnd,
    });
    searchFrom = matchedCloseEnd;
  }

  return raw.filter(
    (slide, index) =>
      !raw.some(
        (other, otherIndex) =>
          otherIndex !== index && other.start < slide.start && other.end >= slide.end,
      ),
  );
}

export function stripHtmlScripts(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
    .replace(/<script\b[^>]*\/>/giu, '');
}

/** Prepare HTML for card cover batch — isolate first slide + drop scripts. */
export function prepareCoverHtmlBatchBody(html: string): string {
  return stripHtmlScripts(isolateFirstDeckSlideHtml(repairArtifactStyleSheets(html)));
}

function isCoverSlideOpen(tag: string, attrs: string): boolean {
  if (hasSlideClass(attrs)) return true;
  if (tag !== 'section') return false;
  return (
    /\bdata-slide(?:-index)?\s*=/i.test(attrs)
    || /\bdata-screen-label\s*=/i.test(attrs)
  );
}

function hasSlideClass(attrs: string): boolean {
  const match = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(attrs);
  if (!match) return false;
  const value = match[1] ?? match[2] ?? match[3] ?? '';
  return /(^|\s)slide(\s|$)/i.test(value);
}
