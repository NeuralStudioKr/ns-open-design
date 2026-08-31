/**
 * Persist/preview heal for AI-generated deck HTML.
 *
 * Distinct from `heal-official-magazine-layout.ts` — that module only touches
 * `data-od-official-look-css` IB magazine kit. This module handles freeform
 * AI-emitted slide markup (custom `s-cover`/`s-chapter`/`s-data` classes,
 * mid-stream truncation, brief text leaked into slot text). Rules are
 * shape-based so they can never touch author catalog HTML.
 *
 * 슬라이스 0826-N01 F7: 사용자 첨부 브리핑 렌더링 회귀 5종 대응.
 */

import { attrsLookLikeDeckOrTemplateSlideHost } from './deck-slide-class.js';
import {
  catalogExampleShouldBeScrubbed,
  scrubLeftoverCatalogExampleHtml,
} from '../template-clone-fill.js';

function destHasHangulTopic(html: string): boolean {
  return ((String(html ?? '').match(/[가-힣]/g) ?? []).length >= 4);
}

function sourceHasHangulGate(html: string, brief?: string | null): boolean {
  return destHasHangulTopic(html) || Boolean(String(brief ?? '').trim());
}

function visibleText(html: string): string {
  return String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' SVG ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type SlideSpan = {
  tag: string;
  attrs: string;
  start: number;
  openEnd: number;
  bodyEnd: number;
  end: number;
};

function listAiSlideSpans(html: string): SlideSpan[] {
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

/**
 * Q1 — Drop deck slides whose body is empty after fill.
 *
 * AI sometimes emits `<section class="slide s-chapter" style="..."></section>`
 * when the outline had a placeholder chapter but no content. That paints a
 * dead 1920×1080 rectangle. Drop the slide only when the body has zero
 * visible text AND no meaningful media (svg / img / video / canvas).
 *
 * Never drop the FIRST slide — even an empty cover is preferable to a deck
 * starting mid-body.
 */
export function dropEmptyLikelyDeckSlides(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const slides = listAiSlideSpans(out);
  if (slides.length < 2) return out;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const slide = slides[i]!;
    const body = out.slice(slide.openEnd, slide.bodyEnd);
    if (visibleText(body).length >= 2) continue;
    if (/<(?:svg|img|video|canvas|iframe|picture|figure)\b/i.test(body)) continue;
    // Preserve motif-only decorative shells (background-image / gradient inline styles).
    if (/\bbackground(?:-image)?\s*:\s*(?:url|linear-gradient|radial-gradient|conic-gradient)/i.test(slide.attrs)) {
      continue;
    }
    out = `${out.slice(0, slide.start)}${out.slice(slide.end)}`;
  }
  return out;
}

function topicFromBrief(brief?: string | null): string {
  const first = String(brief ?? '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
  return first.match(
    /^(.+?)\s*(?:에\s*대해(?:서)?|에\s*대한|에\s*관한)\s*(?:설명하는\s*)?(?:발표\s*자료|피피티|PPT|슬라이드|덱|프레젠테이션)/i,
  )?.[1]?.trim() ?? '';
}

function topicFromCoverHeading(html: string): string {
  const inner = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(html)?.[1] ?? '';
  return visibleText(inner);
}

function slideLooksTitleOnlyNumberedLeftover(body: string, topic: string): boolean {
  const headingInner = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(body)?.[1];
  if (!headingInner || topic.length < 2) return false;
  const heading = visibleText(headingInner);
  const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`^${escaped}\\s*(?:[·•]\\s*)?\\d{1,2}$`, 'u').test(heading)) return false;
  const withoutHeading = body.replace(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/i, '');
  return visibleText(withoutHeading).length < 2;
}

/**
 * Q1-b — Drop leftover numbered shells (`삼각함수 · 3`, `삼각함수 2`)
 * whose only visible text is the cover topic plus an index.
 *
 * MiniMax restamps kami/IB chapter shells this way after wiping demo copy.
 * `dropEmptyLikelyDeckSlides` keeps them because the heading has text.
 * Never invent replacement lecture copy. Never drop the first slide.
 */
export function dropTitleOnlyNumberedLeftoverSlides(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  const slides = listAiSlideSpans(out);
  if (slides.length < 2) return out;
  const firstBody = out.slice(slides[0]!.openEnd, slides[0]!.bodyEnd);
  const topic = topicFromCoverHeading(firstBody) || topicFromBrief(brief);
  if (topic.length < 2) return out;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const slide = slides[i]!;
    const body = out.slice(slide.openEnd, slide.bodyEnd);
    if (/<(?:svg|img|video|canvas|iframe|picture|figure)\b/i.test(body)) continue;
    if (!slideLooksTitleOnlyNumberedLeftover(body, topic)) continue;
    out = `${out.slice(0, slide.start)}${out.slice(slide.end)}`;
  }
  return out;
}

/**
 * 루프182 — Drop consecutive duplicate title-only leftover slides.
 *
 * Complements upstream 루프181 persist gate (heading-only outline refuse):
 * when an old artifact bypasses persist gate (recover / reuse read paths),
 * MiniMax's body-fill failure still ships the same title-only slide
 * (`<section class="slide"><h1>삼각함수</h1></section>`) twice or more in
 * a row. `dropTitleOnlyNumberedLeftoverSlides` only handles the
 * `삼각함수 · 2` counter form; `dropEmptyLikelyDeckSlides` keeps the shell
 * because the heading carries text.
 *
 * Rules:
 *   - Two adjacent slides whose normalized visible text is identical
 *   - Body is title-only (visible text length ≤ 40)
 *   - No media / decorative background
 *   - Never drop the first slide
 *   - Only collapse CONSECUTIVE duplicates (chapter divider reuse stays intact)
 *
 * Idempotent — the removal is greedy from the tail, so a second pass sees
 * no adjacent duplicates left.
 */
const DUPLICATE_TITLE_ONLY_VISIBLE_TEXT_LIMIT = 40;

function normalizeVisibleTextForDedup(html: string): string {
  return visibleText(html).replace(/\s+/g, ' ').trim();
}

function slideBodyLooksTitleOnly(body: string): boolean {
  if (/<(?:svg|img|video|canvas|iframe|picture|figure)\b/i.test(body)) return false;
  const text = normalizeVisibleTextForDedup(body);
  if (text.length === 0) return false;
  if (text.length > DUPLICATE_TITLE_ONLY_VISIBLE_TEXT_LIMIT) return false;
  return true;
}

function removeSlideSpan(html: string, slide: SlideSpan): string {
  return `${html.slice(0, slide.start)}${html.slice(slide.end)}`;
}

export function dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const slides = listAiSlideSpans(out);
  if (slides.length < 2) return out;
  // Walk from the tail so each removal keeps indexes valid for earlier slides.
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const curr = slides[i]!;
    const prev = slides[i - 1]!;
    const currBody = out.slice(curr.openEnd, curr.bodyEnd);
    const prevBody = out.slice(prev.openEnd, prev.bodyEnd);
    if (!slideBodyLooksTitleOnly(currBody)) continue;
    if (!slideBodyLooksTitleOnly(prevBody)) continue;
    const currText = normalizeVisibleTextForDedup(currBody);
    const prevText = normalizeVisibleTextForDedup(prevBody);
    if (!currText || currText !== prevText) continue;
    // Preserve motif-only decorative shells — a background gradient host may
    // legitimately reuse the same heading text as a chapter marker.
    if (/\bbackground(?:-image)?\s*:\s*(?:url|linear-gradient|radial-gradient|conic-gradient)/i.test(curr.attrs)) {
      continue;
    }
    out = `${out.slice(0, curr.start)}${out.slice(curr.end)}`;
  }
  return out;
}

const SEVERE_CONTAINER_IMBALANCE_THRESHOLD = 2;

function stripInertTagsForBalanceCounting(body: string): string {
  return String(body ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function countContainerImbalance(body: string): number {
  const source = stripInertTagsForBalanceCounting(body);
  const opens = (source.match(/<(?:div|article|aside|main)\b/gi) ?? []).length;
  const closes = (source.match(/<\/(?:div|article|aside|main)\s*>/gi) ?? []).length;
  return opens - closes;
}

/**
 * 루프190 / 196 — Drop slides whose container tags are severely unbalanced.
 *
 * 사용자 리포트 2026-08-31 · 삼각함수 (loop186–189 후속):
 *   MiniMax fill 이 슬라이드 4 (`04 항등식`) · 슬라이드 5 (`05 그래프`) 에서
 *   nested `<div class="card">` 를 열고 닫지 않았음. 브라우저는 `</section>`
 *   에서 강제로 남은 `<div>` 를 닫아 이후 슬라이드 콘텐츠가 이 슬라이드 안에
 *   삽입되거나, srcdoc 파서에 따라 카드 그리드가 세로로 무너져 렌더됨.
 *
 * 루프196 residual: 루프194가 `.card` 형제를 봉합해도 `article`/`aside`
 * 2겹이나 봉합 실패 leftover(diff 2)는 임계 3에 안 걸린다. 단일 미종료
 * 래퍼(diff 1)는 유지한다.
 *
 * 안전한 shape-based 자동 재봉합 (missing `</div>` 자동 삽입) 은 위험 —
 * 뒤에 오는 형제 컨테이너를 잘못 카드 안으로 편입시키거나, `<style>` 안 문자열
 * (`content:"</div>"`) 을 close 로 오인할 수 있음. 대신 슬라이드 단위 drop.
 *
 * Rules:
 *   - `stripInertTagsForBalanceCounting` 후 `div|article|aside|main`
 *     open − close 가 `≥ 2` 인 슬라이드만 drop
 *   - 첫 슬라이드는 절대 drop 안 함 (cover 만이라도 유지)
 *   - Idempotent · 다른 heal 룰 순서와 무관
 */
export function dropSlidesWithSeverelyUnbalancedContainerTags(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const slides = listAiSlideSpans(out);
  if (slides.length < 2) return out;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const slide = slides[i]!;
    const body = out.slice(slide.openEnd, slide.bodyEnd);
    const diff = countContainerImbalance(body);
    if (diff < SEVERE_CONTAINER_IMBALANCE_THRESHOLD) continue;
    out = `${out.slice(0, slide.start)}${out.slice(slide.end)}`;
  }
  return out;
}

function normalizedTopicForComparison(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

function slideBodyLooksSubstantive(body: string): boolean {
  if (/<(?:svg|img|video|canvas|iframe|picture|figure|table|ul|ol)\b/i.test(body)) return true;
  const text = normalizeVisibleTextForDedup(body);
  return text.length >= 60;
}

function attrsLookLikeGeneratedIntroShell(attrs: string): boolean {
  const source = String(attrs ?? '');
  // A real cover/chapter host is never treated as the stray splash.
  if (attrsLookLikeRealCoverSlide(source)) return false;
  if (/\b(?:s-chapter|s-data|s-manifesto|s-programme|chapter)\b/i.test(source)) {
    return false;
  }
  // Explicit `slide-title` splash OR bare title-only first slide before the
  // selected-template cover (루프188 — MiniMax often omits `slide-title`).
  return true;
}

function attrsLookLikeRealCoverSlide(attrs: string): boolean {
  const source = String(attrs ?? '');
  return (
    /\bdata-screen-label\s*=\s*["'][^"']*\bcover\b/i.test(source)
    || /\bclass\s*=\s*["'][^"']*\b(?:s-cover|cover|slide-cover)\b/i.test(source)
  );
}

/**
 * 루프186 / 루프188 — Drop a stray generated intro splash before the real cover.
 *
 * Recent template-fill failures sometimes prepend
 * `<section class="slide slide-title"><h1>{topic}</h1></section>` (or a bare
 * title-only `<section class="slide">`) and then append the actual
 * selected-template cover as slide 2. The old duplicate guard intentionally
 * never removed slide 1, so users saw a blank/dark title-only first page even
 * though the next slide had the real deck.
 *
 * Remove slide 1 only when it is a short title-only shell and slide 2 is
 * substantive and clearly about the same topic. This keeps intentional
 * chapter/title covers and single-page title decks intact.
 */
export function dropLeadingTitleOnlyIntroBeforeRealCover(
  html: string,
  brief?: string | null,
): string {
  const source = String(html ?? '');
  if (!source) return source;
  const slides = listAiSlideSpans(source);
  if (slides.length < 2) return source;
  const first = slides[0]!;
  const second = slides[1]!;
  if (!attrsLookLikeGeneratedIntroShell(first.attrs)) return source;
  if (!attrsLookLikeRealCoverSlide(second.attrs)) return source;
  const firstBody = source.slice(first.openEnd, first.bodyEnd);
  const secondBody = source.slice(second.openEnd, second.bodyEnd);
  if (!slideBodyLooksTitleOnly(firstBody)) return source;
  if (!slideBodyLooksSubstantive(secondBody)) return source;

  const title = normalizedTopicForComparison(normalizeVisibleTextForDedup(firstBody));
  if (title.length < 2) return source;
  const briefTopic = normalizedTopicForComparison(topicFromBrief(brief));
  const secondText = normalizedTopicForComparison(normalizeVisibleTextForDedup(secondBody));
  const sameTopic =
    secondText.includes(title)
    || (briefTopic.length >= 2 && title.includes(briefTopic))
    || (briefTopic.length >= 2 && secondText.includes(briefTopic));
  if (!sameTopic) return source;
  return removeSlideSpan(source, first);
}

/**
 * Q2 — Un-nest block children (div/section/aside/p) that got parsed inside
 * a heading.
 *
 * MiniMax cover fills often emit
 *   `<h1>...text...<div style="...">lede</div></h1>`
 * which is invalid: heading elements cannot contain flow blocks. Browsers
 * auto-close the h1 before the div in some cases and swallow the div text
 * as heading in others, so the lede paints inside the huge title font.
 *
 * Fix: close the heading before the first block child; keep the block as a
 * sibling AFTER the heading.
 */
export function unnestHeadingBlockChildren(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const headingRe = /<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  while ((match = headingRe.exec(out)) !== null) {
    const tag = (match[1] ?? '').toLowerCase();
    const attrs = match[2] ?? '';
    const inner = match[3] ?? '';
    const blockRe = /<(div|section|aside|p|ul|ol|figure|table|blockquote|main|article|header|footer)\b[^>]*>/i;
    const first = blockRe.exec(inner);
    if (!first || first.index == null) continue;
    if (first.index === 0) continue;
    const before = inner.slice(0, first.index);
    const after = inner.slice(first.index);
    if (!visibleText(before)) continue;
    patches.push({
      start: match.index,
      end: match.index + match[0].length,
      replacement: `<${tag}${attrs}>${before}</${tag}>${after}`,
    });
  }
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

const GRID_BLOCK_CHILD_RE =
  /^(div|section|article|li|figure|aside|header|footer|main|nav|ul|ol|p|table)$/;
const EQUAL_FR_TRACK_RE = /^(?:1fr|minmax\(\s*0\s*,\s*1fr\s*\))$/i;

function countDirectBlockChildren(inner: string): number {
  const tokenRe = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*(\/)?>/gi;
  let depth = 0;
  let directChildren = 0;
  let tok: RegExpExecArray | null;
  while ((tok = tokenRe.exec(inner)) !== null) {
    const closing = tok[1] === '/';
    const tagName = (tok[2] ?? '').toLowerCase();
    const selfClose = tok[3] === '/';
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && GRID_BLOCK_CHILD_RE.test(tagName)) directChildren += 1;
    if (!selfClose) depth += 1;
  }
  return directChildren;
}

function findSameTagClose(
  html: string,
  tag: string,
  openEnd: number,
): { closeStart: number } | null {
  const scanRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  scanRe.lastIndex = openEnd;
  let depth = 1;
  let tok: RegExpExecArray | null;
  while ((tok = scanRe.exec(html)) !== null) {
    if (tok[0]!.startsWith('</')) {
      depth -= 1;
      if (depth === 0) return { closeStart: tok.index };
    } else if (!tok[0]!.endsWith('/>')) {
      depth += 1;
    }
  }
  return null;
}

type EqualColumnDecl = {
  kind: 'repeat' | 'list';
  count: number;
  unit: string;
  important: boolean;
};

/**
 * Accept `repeat(N, 1fr)` and explicit equal tracks (`1fr 1fr 1fr`,
 * `minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)`). Mixed tracks such as
 * `1.3fr 1fr` or `220px 1fr` are real two-pane layouts — leave them.
 */
function parseDeclaredEqualColumns(value: string): EqualColumnDecl | null {
  const important = /!important/i.test(value);
  const cleaned = value.replace(/!important/gi, '').trim();
  if (!cleaned) return null;
  const repeat = cleaned.match(/^repeat\s*\(\s*(\d+)\s*,\s*([^)]+?)\s*\)$/i);
  if (repeat) {
    const count = Number.parseInt(repeat[1] ?? '0', 10);
    const unit = (repeat[2] ?? '').trim();
    if (!Number.isFinite(count) || count < 2 || !unit) return null;
    return { kind: 'repeat', count, unit, important };
  }
  const tracks: string[] = [];
  const trackRe = /minmax\s*\([^)]*\)|[^\s]+/gi;
  let tm: RegExpExecArray | null;
  while ((tm = trackRe.exec(cleaned)) !== null) tracks.push(tm[0]!);
  if (tracks.length < 2) return null;
  if (!tracks.every((t) => EQUAL_FR_TRACK_RE.test(t))) return null;
  return {
    kind: 'list',
    count: tracks.length,
    unit: tracks[0]!.replace(/\s+/g, ''),
    important,
  };
}

function formatEqualColumns(decl: EqualColumnDecl, nextCount: number): string {
  const suffix = decl.important ? ' !important' : '';
  if (decl.kind === 'repeat') {
    return `repeat(${nextCount}, ${decl.unit})${suffix}`;
  }
  if (nextCount <= 1) return `${decl.unit}${suffix}`;
  return `${Array.from({ length: nextCount }, () => decl.unit).join(' ')}${suffix}`;
}

/**
 * Q3 — Shrink equal-column grids when far fewer children were emitted.
 *
 * AI outlines "세 기둥" / "네 가지 리츄얼" and picks a 3- or 4-column
 * grid (`repeat(N, 1fr)` **or** `1fr 1fr 1fr`), then only fills the first
 * cards. The leftover tracks become an empty band and the visible cards
 * sit left-cramped. Shrink columns to the direct child count so those
 * cards fill the row. Never grow — inventing the missing card is not
 * our job.
 *
 * Only shrinks when count of block children inside the grid is ≥1 and
 * strictly less than the declared column count.
 */
export function shrinkOverAllocatedRepeatGrid(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b([^>]*\bstyle\s*=\s*(["'])([^"']*)\3[^>]*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const style = match[4] ?? '';
    const colsMatch = style.match(/grid-template-columns\s*:\s*([^;]+)/i);
    if (!colsMatch) continue;
    const decl = parseDeclaredEqualColumns((colsMatch[1] ?? '').trim());
    if (!decl) continue;
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const start = match.index;
    const openEnd = start + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const inner = out.slice(openEnd, close.closeStart);
    const directChildren = countDirectBlockChildren(inner);
    if (directChildren === 0 || directChildren >= decl.count) continue;
    const nextOpen = openTag.replace(
      /grid-template-columns\s*:\s*[^;"']+/i,
      `grid-template-columns:${formatEqualColumns(decl, directChildren)}`,
    );
    patches.push({ start, end: openEnd, replacement: nextOpen });
  }
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

function replaceStyleDecl(openTag: string, prop: string, value: string): string {
  const styleMatch = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(openTag);
  if (!styleMatch) {
    return openTag.replace(/^<([a-zA-Z][\w-]*)\b/i, `<$1 style="${prop}:${value}"`);
  }
  const quote = styleMatch[1] ?? '"';
  let style = styleMatch[2] ?? '';
  const declRe = new RegExp(`${prop}\\s*:[^;]+`, 'i');
  if (declRe.test(style)) {
    style = style.replace(declRe, `${prop}:${value}`);
  } else {
    style = `${style.replace(/;?\s*$/, '')};${prop}:${value}`;
  }
  return (
    openTag.slice(0, styleMatch.index)
    + `style=${quote}${style}${quote}`
    + openTag.slice((styleMatch.index ?? 0) + styleMatch[0].length)
  );
}

function minmaxUnitForEqualFr(decl: EqualColumnDecl): EqualColumnDecl | null {
  const unit = decl.unit.replace(/\s+/g, '').toLowerCase();
  if (unit === 'minmax(0,1fr)') return null;
  if (unit !== '1fr') return null;
  return { ...decl, unit: 'minmax(0,1fr)' };
}

/**
 * 루프194 — Equal `1fr` tracks size as minmax(auto, 1fr). A filled
 * three-card row then overflows the 1920 canvas and the last card clips.
 * Rewrite to `minmax(0,1fr)` so tracks can shrink. Mixed sidebar tracks
 * stay untouched.
 */
export function normalizeEqualFrTracksToMinmax(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b([^>]*\bstyle\s*=\s*(["'])([^"']*)\3[^>]*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const style = match[4] ?? '';
    const colsMatch = style.match(/grid-template-columns\s*:\s*([^;]+)/i);
    if (!colsMatch) continue;
    const decl = parseDeclaredEqualColumns((colsMatch[1] ?? '').trim());
    if (!decl) continue;
    const next = minmaxUnitForEqualFr(decl);
    if (!next) continue;
    const openTag = match[0] ?? '';
    patches.push({
      start: match.index,
      end: match.index + openTag.length,
      replacement: replaceStyleDecl(
        openTag,
        'grid-template-columns',
        formatEqualColumns(next, decl.count),
      ),
    });
  }
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

/**
 * 루프194 — 2×2 leftover: two cards in `1fr 1fr / 1fr 1fr` sit on the
 * first row and leave an empty bottom band. Shrink equal rows to
 * ceil(children / columns). Never invent missing cards.
 */
export function shrinkOverAllocatedEqualTrackRows(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b([^>]*\bstyle\s*=\s*(["'])([^"']*)\3[^>]*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const style = match[4] ?? '';
    const rowsMatch = style.match(/grid-template-rows\s*:\s*([^;]+)/i);
    if (!rowsMatch) continue;
    const rowsDecl = parseDeclaredEqualColumns((rowsMatch[1] ?? '').trim());
    if (!rowsDecl) continue;
    const colsMatch = style.match(/grid-template-columns\s*:\s*([^;]+)/i);
    const colsDecl = colsMatch
      ? parseDeclaredEqualColumns((colsMatch[1] ?? '').trim())
      : null;
    if (colsMatch && !colsDecl) continue;
    const colCount = colsDecl?.count ?? 1;
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const start = match.index;
    const openEnd = start + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const directChildren = countDirectBlockChildren(out.slice(openEnd, close.closeStart));
    if (directChildren === 0) continue;
    const usedRows = Math.max(1, Math.ceil(directChildren / colCount));
    if (usedRows >= rowsDecl.count) continue;
    patches.push({
      start,
      end: openEnd,
      replacement: replaceStyleDecl(
        openTag,
        'grid-template-rows',
        formatEqualColumns(rowsDecl, usedRows),
      ),
    });
  }
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

type ClassEqualTrackDecl = {
  cols?: EqualColumnDecl;
  rows?: EqualColumnDecl;
};

function collectClassEqualTrackDecls(html: string): Map<string, ClassEqualTrackDecl> {
  const found = new Map<string, ClassEqualTrackDecl>();
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = styleRe.exec(html)) !== null) {
    const css = sm[1] ?? '';
    const ruleRe = /(?:^|})\s*((?:\.[\w-]+\s+)*)\.([a-zA-Z][\w-]*)\s*\{([^}]+)\}/g;
    let rm: RegExpExecArray | null;
    while ((rm = ruleRe.exec(css)) !== null) {
      const className = (rm[2] ?? '').toLowerCase();
      const body = rm[3] ?? '';
      if (!className || /^(?:slide|deck|presentation|stage|cover|body|html)$/.test(className)) {
        continue;
      }
      const colsRaw = /grid-template-columns\s*:\s*([^;]+)/i.exec(body)?.[1];
      const rowsRaw = /grid-template-rows\s*:\s*([^;]+)/i.exec(body)?.[1];
      const cols = colsRaw ? parseDeclaredEqualColumns(colsRaw.trim()) : undefined;
      const rows = rowsRaw ? parseDeclaredEqualColumns(rowsRaw.trim()) : undefined;
      if (!cols && !rows) continue;
      found.set(className, { cols: cols ?? undefined, rows: rows ?? undefined });
    }
  }
  return found;
}

function collectClassFlexRowNames(html: string): Set<string> {
  const found = new Set<string>();
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let sm: RegExpExecArray | null;
  while ((sm = styleRe.exec(html)) !== null) {
    const css = sm[1] ?? '';
    const ruleRe = /(?:^|})\s*((?:\.[\w-]+\s+)*)\.([a-zA-Z][\w-]*)\s*\{([^}]+)\}/g;
    let rm: RegExpExecArray | null;
    while ((rm = ruleRe.exec(css)) !== null) {
      const className = (rm[2] ?? '').toLowerCase();
      const body = rm[3] ?? '';
      if (!className || /^(?:slide|deck|presentation|stage|cover|body|html)$/.test(className)) {
        continue;
      }
      const style = `;${body}`;
      if (!/(?:^|;)\s*display\s*:\s*(?:inline-)?flex\b/i.test(style)) continue;
      if (/(?:^|;)\s*flex-direction\s*:\s*column(?:-reverse)?\b/i.test(style)) continue;
      found.add(className);
    }
  }
  return found;
}

function classTokensFromAttrs(attrs: string): string[] {
  const raw = /\bclass\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs)?.[2] ?? '';
  return raw.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * 루프194 — Compact fills reuse leftover `.grid` / `.cards-grid` rules
 * (`1fr 1fr 1fr` or 2×2) without inline tracks. Heal only Hangul or
 * brief-backed decks so official English catalogs stay designed 2×2.
 */
export function shrinkClassBoundEqualTrackGrids(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!destHasHangulTopic(out) && !String(brief ?? '').trim()) return out;
  const decls = collectClassEqualTrackDecls(out);
  if (decls.size === 0) return out;
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    if (/grid-template-columns\s*:/i.test(style) && /grid-template-rows\s*:/i.test(style)) {
      continue;
    }
    const tokens = classTokensFromAttrs(attrs);
    let bound: ClassEqualTrackDecl | undefined;
    for (const token of tokens) {
      const hit = decls.get(token);
      if (hit) {
        bound = hit;
        break;
      }
    }
    if (!bound) continue;
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const start = match.index;
    const openEnd = start + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const directChildren = countDirectBlockChildren(out.slice(openEnd, close.closeStart));
    if (directChildren === 0) continue;
    let nextOpen = openTag;
    const cols = bound.cols;
    if (cols && !/grid-template-columns\s*:/i.test(style) && directChildren < cols.count) {
      const unit = minmaxUnitForEqualFr(cols) ?? cols;
      nextOpen = replaceStyleDecl(
        nextOpen,
        'grid-template-columns',
        formatEqualColumns(unit, directChildren),
      );
    }
    const colCount = cols
      ? Math.min(cols.count, Math.max(1, directChildren))
      : 1;
    const rows = bound.rows;
    const usedRows = Math.max(1, Math.ceil(directChildren / colCount));
    if (rows && !/grid-template-rows\s*:/i.test(style) && usedRows < rows.count) {
      nextOpen = replaceStyleDecl(
        nextOpen,
        'grid-template-rows',
        formatEqualColumns(minmaxUnitForEqualFr(rows) ?? rows, usedRows),
      );
    }
    if (nextOpen === openTag) continue;
    patches.push({ start, end: openEnd, replacement: nextOpen });
  }
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

const CARDISH_CLASS_RE =
  /\b(?:card|pillar|col(?:umn)?s?|tile|panel|cell|box|metric|stat|kpi)\b/i;

function styleHasFlexGrow(style: string): boolean {
  if (/(?:^|;)\s*flex-grow\s*:\s*(?!0(?:\s|;|!|$))/i.test(style)) return true;
  const flex = /(?:^|;)\s*flex\s*:\s*([^;]+)/i.exec(style);
  if (!flex) return false;
  const head = (flex[1] ?? '').trim().split(/\s+/)[0] ?? '';
  if (/^(?:auto|none|initial|inherit|unset)$/i.test(head)) {
    return /^auto$/i.test(head);
  }
  const grow = Number.parseFloat(head);
  return Number.isFinite(grow) && grow > 0;
}

function styleLooksLikeFixedSidebar(style: string): boolean {
  return /(?:^|;)\s*(?:width|flex-basis|min-width)\s*:\s*\d+(?:\.\d+)?(?:px|rem|em|ch)\b/i.test(
    style,
  );
}

function isFlexRowContainerStyle(style: string): boolean {
  if (!/(?:^|;)\s*display\s*:\s*(?:inline-)?flex\b/i.test(style)) return false;
  if (/(?:^|;)\s*flex-direction\s*:\s*column(?:-reverse)?\b/i.test(style)) return false;
  return true;
}

function childLooksLikePeerCard(attrs: string, style: string): boolean {
  if (styleLooksLikeFixedSidebar(style)) return false;
  if (CARDISH_CLASS_RE.test(classAttrValue(attrs))) return true;
  // MiniMax often emits padded/background boxes without a card class.
  if (/(?:^|;)\s*padding(?:-inline|-block|-left|-right)?\s*:/i.test(style)) return true;
  if (
    /(?:^|;)\s*background(?:-color)?\s*:/i.test(style)
    && /(?:^|;)\s*(?:border|border-radius|gap)\s*:/i.test(style)
  ) {
    return true;
  }
  return false;
}

function extractInlineStyle(attrs: string): string {
  const m = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs);
  return m?.[2] ?? '';
}

function withFlexGrowOnOpenTag(openTag: string): string {
  const styleMatch = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(openTag);
  const growDecl = 'flex:1 1 0;min-width:0';
  if (!styleMatch) {
    return openTag.replace(/^<([a-zA-Z][\w-]*)\b/i, `<$1 style="${growDecl}"`);
  }
  const quote = styleMatch[1] ?? '"';
  let style = (styleMatch[2] ?? '').trim().replace(/;?\s*$/, '');
  style = style
    .replace(/(?:^|;)\s*flex\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*flex-grow\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*min-width\s*:[^;]*/gi, '')
    .replace(/^;+|;+$/g, '')
    .trim();
  const next = style ? `${style};${growDecl}` : growDecl;
  return (
    openTag.slice(0, styleMatch.index)
    + `style=${quote}${next}${quote}`
    + openTag.slice(styleMatch.index! + styleMatch[0].length)
  );
}

type DirectChildOpen = {
  absStart: number;
  absEnd: number;
  open: string;
  attrs: string;
  style: string;
};

function listDirectBlockChildOpens(
  html: string,
  innerStart: number,
  innerEnd: number,
): DirectChildOpen[] {
  const inner = html.slice(innerStart, innerEnd);
  const tokenRe = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*(\/)?>/gi;
  let depth = 0;
  const opens: DirectChildOpen[] = [];
  let tok: RegExpExecArray | null;
  while ((tok = tokenRe.exec(inner)) !== null) {
    const closing = tok[1] === '/';
    const tagName = (tok[2] ?? '').toLowerCase();
    const selfClose = tok[3] === '/' || /\/>\s*$/.test(tok[0] ?? '');
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && GRID_BLOCK_CHILD_RE.test(tagName)) {
      const absStart = innerStart + tok.index;
      const absEnd = absStart + tok[0]!.length;
      const attrs = tok[0]!.replace(/^<[a-zA-Z][\w-]*/i, '').replace(/\/?>$/, '');
      opens.push({
        absStart,
        absEnd,
        open: tok[0]!,
        attrs,
        style: extractInlineStyle(attrs),
      });
    }
    if (!selfClose) depth += 1;
  }
  return opens;
}

type DirectChildSpan = DirectChildOpen & {
  tag: string;
  inner: string;
  absCloseEnd: number;
};

function tagNameFromOpen(open: string): string {
  return /^<([a-zA-Z][\w-]*)/i.exec(open)?.[1]?.toLowerCase() ?? '';
}

function listDirectBlockChildSpans(
  html: string,
  innerStart: number,
  innerEnd: number,
): DirectChildSpan[] {
  const opens = listDirectBlockChildOpens(html, innerStart, innerEnd);
  const spans: DirectChildSpan[] = [];
  for (const open of opens) {
    const tag = tagNameFromOpen(open.open);
    if (!tag) continue;
    const selfClose = /\/\s*>$/.test(open.open);
    if (selfClose) {
      spans.push({ ...open, tag, inner: '', absCloseEnd: open.absEnd });
      continue;
    }
    const close = findSameTagClose(html, tag, open.absEnd);
    if (!close || close.closeStart > innerEnd) continue;
    const closeTok = html.slice(close.closeStart).match(new RegExp(`^</${tag}\\s*>`, 'i'));
    if (!closeTok) continue;
    spans.push({
      ...open,
      tag,
      inner: html.slice(open.absEnd, close.closeStart),
      absCloseEnd: close.closeStart + closeTok[0].length,
    });
  }
  return spans;
}

const LEFTOVER_PEER_PLACEHOLDER_TOKENS = [
  '내용을입력하세요',
  '설명을입력하세요',
  '텍스트를입력하세요',
  '내용입력하세요',
  '설명입력하세요',
  '텍스트입력하세요',
  'yourtexthere',
  'loremipsum',
  'placeholder',
  'texthere',
  'subtitle',
  'heading',
  'caption',
  'bodycopy',
  '부제목',
  '소제목',
  '카드제목',
  'title',
  'lorem',
  'body',
  '제목',
  '부제',
  '내용',
  '본문',
  '설명',
  '항목',
  '포인트',
  '카드',
  // 루프202 — stub labels MiniMax leaves on the missing pillar.
  'comingsoon',
  '준비중',
  '작성중',
  '미정',
  '추후',
  'todo',
  'tba',
  'tbd',
  'wip',
  'na',
  // 루프208 — Korean absence stubs on the missing pillar.
  '해당없음',
  '해당무',
  '비어있음',
  '미입력',
  '없음',
].sort((a, b) => b.length - a.length);

const LEFTOVER_PEER_PLACEHOLDER_PUNCT_RE = /^(?:[.…·•\-–—]{1,3})/u;

function compactLeftoverPeerPlaceholder(text: string): string {
  return visibleText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.…·•\-–—]+/gu, '');
}

function leftoverPlaceholderTokenLength(compact: string): number | null {
  const punct = LEFTOVER_PEER_PLACEHOLDER_PUNCT_RE.exec(compact);
  if (punct) return punct[0].length;
  const hit = LEFTOVER_PEER_PLACEHOLDER_TOKENS.find((token) => compact.startsWith(token));
  return hit ? hit.length : null;
}

function leftoverPlaceholderTokenCount(compact: string): number | null {
  let rest = compact;
  let count = 0;
  while (rest && count < 4) {
    const n = leftoverPlaceholderTokenLength(rest);
    if (n == null) return null;
    rest = rest.slice(n);
    count += 1;
  }
  return rest === '' && count > 0 ? count : null;
}

function textLooksLikeLeftoverPeerPlaceholder(html: string): boolean {
  const raw = visibleText(html);
  if (raw.length < 2) return true;
  const compact = compactLeftoverPeerPlaceholder(raw);
  if (!compact) return true;
  // 루프200 — MiniMax fills the missing pillar with 제목/내용/... so
  // child count stays 3 and 190/195/197 cannot shrink the blank band.
  return leftoverPlaceholderTokenCount(compact) != null;
}

/**
 * 루프205 — A third card that is only `PILLAR 03` / `COLUMN 3` / `03`
 * is a leftover index shell, not a pillar. Keep `PILLAR 01 lim` and
 * numbered step rows where every peer is an index.
 */
function textLooksLikeLeftoverIndexLabel(html: string): boolean {
  const text = visibleText(html).replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/^(?:pillar|column|col|card|item|step|part|#)?\s*0?[1-9][.\u2026·•\-–—]?$/i.test(text)) {
    return true;
  }
  return /^(?:기둥|열|카드|항목|단계|파트)\s*0?[1-9][.\u2026·•\-–—]?$/u.test(text);
}

function childLooksEmptyLeftoverPeer(child: DirectChildSpan): boolean {
  if (/<(?:svg|img|video|canvas|iframe|picture|figure)\b/i.test(child.inner)) return false;
  if (
    /\bbackground(?:-image)?\s*:\s*(?:url|linear-gradient|radial-gradient|conic-gradient)/i
      .test(child.style)
  ) {
    return false;
  }
  return (
    textLooksLikeLeftoverPeerPlaceholder(child.inner)
    || textLooksLikeLeftoverIndexLabel(child.inner)
  );
}

function containerLooksLikeAllocatedCardRow(
  style: string,
  tokens: string[],
  decls: Map<string, ClassEqualTrackDecl>,
): boolean {
  if (isFlexRowContainerStyle(style)) return true;
  const colsRaw = /grid-template-columns\s*:\s*([^;]+)/i.exec(style)?.[1];
  if (colsRaw) {
    const decl = parseDeclaredEqualColumns(colsRaw.trim());
    if (decl && decl.count >= 2) return true;
  }
  for (const token of tokens) {
    const bound = decls.get(token);
    if (bound?.cols && bound.cols.count >= 2) return true;
  }
  return false;
}

/**
 * 루프197 — Drop empty leftover peer cards that keep a 3-track row alive.
 *
 * Loops 190/195 shrink equal tracks by *child count*. MiniMax often still
 * emits the missing pillar as `<div class="card"></div>` (or a padded
 * empty box) so the row stays 3-wide: two filled cards + a blank band.
 * Loop 191 then gives that empty shell `flex:1`, which paints the same
 * 미적분 leftover. Remove empty cardish peers only; never invent copy.
 * Hangul/brief-gated so official English catalogs stay intact.
 */
export function dropEmptyLeftoverPeerCardsInAllocatedRows(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceHasHangulGate(out, brief)) return out;
  const decls = collectClassEqualTrackDecls(out);
  const openRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const removals: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    const tokens = classTokensFromAttrs(attrs);
    if (!containerLooksLikeAllocatedCardRow(style, tokens, decls)) continue;
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + match[0].length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildSpans(out, openEnd, close.closeStart);
    const peers = children.filter((c) => childLooksLikePeerCard(c.attrs, c.style));
    if (peers.length < 2 || peers.length > 6) continue;
    const emptyPeers = peers.filter((c) => childLooksEmptyLeftoverPeer(c));
    const filledPeers = peers.filter((c) => !childLooksEmptyLeftoverPeer(c));
    if (emptyPeers.length === 0 || filledPeers.length === 0) continue;
    for (const empty of emptyPeers) {
      removals.push({ start: empty.absStart, end: empty.absCloseEnd });
    }
  }
  removals.sort((a, b) => b.start - a.start);
  let lastKeptStart = Number.POSITIVE_INFINITY;
  for (const removal of removals) {
    if (removal.end > lastKeptStart) continue;
    out = `${out.slice(0, removal.start)}${out.slice(removal.end)}`;
    lastKeptStart = removal.start;
  }
  return out;
}

const PEER_FIXED_MAIN_SIZE_MIN_PX = 280;
const PEER_FIXED_MAIN_SIZE_RATIO = 1.35;
/** 루프207 — 3-col leftover `%` shares (skip 100% stretch and 50% splits). */
const PEER_COLUMN_SHARE_PERCENT_MIN = 22;
const PEER_COLUMN_SHARE_PERCENT_MAX = 48;
const PEER_CANVAS_PX = 1920;

function cssLengthToPx(raw: string): number | null {
  const source = String(raw ?? '').trim();
  const percent = /^(\d+(?:\.\d+)?)\s*%$/i.exec(source);
  if (percent) {
    const value = Number.parseFloat(percent[1] ?? '');
    if (!Number.isFinite(value)) return null;
    if (value < PEER_COLUMN_SHARE_PERCENT_MIN || value > PEER_COLUMN_SHARE_PERCENT_MAX) {
      return null;
    }
    return (PEER_CANVAS_PX * value) / 100;
  }
  const match = /^(\d+(?:\.\d+)?)\s*(px|rem|em|ch)\b/i.exec(source);
  if (!match) return null;
  const value = Number.parseFloat(match[1] ?? '');
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? 'px').toLowerCase();
  if (unit === 'px') return value;
  if (unit === 'rem' || unit === 'em') return value * 16;
  if (unit === 'ch') return value * 8;
  return null;
}

function flexShorthandLockedBasisPx(style: string): number | null {
  const decl = /(?:^|;)\s*flex\s*:\s*([^;]+)/i.exec(style);
  if (!decl) return null;
  const raw = String(decl[1] ?? '').trim();
  if (!/^0\s+0\s+/i.test(raw) && !/^none\b/i.test(raw)) return null;
  // `%` is not a word char, so `\b` after it fails at end-of-decl (`33%`).
  const length = /(\d+(?:\.\d+)?)\s*(px|rem|em|ch|%)/i.exec(raw);
  if (!length) return null;
  return cssLengthToPx(`${length[1]}${length[2]}`);
}

function peerFixedMainSizePx(style: string): number | null {
  for (const prop of ['width', 'flex-basis', 'min-width', 'max-width']) {
    const decl = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(style);
    if (!decl) continue;
    const px = cssLengthToPx(decl[1] ?? '');
    if (px != null) return px;
  }
  return flexShorthandLockedBasisPx(style);
}

function childLooksLikeSizedPeerCard(attrs: string, style: string): boolean {
  if (CARDISH_CLASS_RE.test(classAttrValue(attrs))) return true;
  if (/(?:^|;)\s*padding(?:-inline|-block|-left|-right)?\s*:/i.test(style)) return true;
  if (
    /(?:^|;)\s*background(?:-color)?\s*:/i.test(style)
    && /(?:^|;)\s*(?:border|border-radius|gap)\s*:/i.test(style)
  ) {
    return true;
  }
  return false;
}

function peersHaveUniformFixedMainSize(styles: string[]): boolean {
  const sizes = styles.map((style) => peerFixedMainSizePx(style));
  if (sizes.some((size) => size == null)) return false;
  const nums = sizes as number[];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min < PEER_FIXED_MAIN_SIZE_MIN_PX) return false;
  return max <= min * PEER_FIXED_MAIN_SIZE_RATIO;
}

function stripFixedMainSizeFromOpenTag(openTag: string): string {
  const styleMatch = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(openTag);
  if (!styleMatch) return openTag;
  const quote = styleMatch[1] ?? '"';
  let style = (styleMatch[2] ?? '').trim().replace(/;?\s*$/, '');
  style = style
    .replace(/(?:^|;)\s*width\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*min-width\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*max-width\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*flex-basis\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*flex\s*:\s*(?:0\s+0|none)\s+[^;]*/gi, '')
    .replace(/^;+|;+$/g, '')
    .replace(/;;+/g, ';')
    .trim();
  return (
    openTag.slice(0, styleMatch.index)
    + `style=${quote}${style}${quote}`
    + openTag.slice(styleMatch.index! + styleMatch[0].length)
  );
}

/**
 * 루프198 — Relax uniform px/rem width on peer cards in a shared row.
 *
 * Loop 195 lets equal `1fr` tracks shrink via `minmax(0,1fr)`, but MiniMax
 * still stamps `width:560px` / `min-width:580px` on every card. Three of
 * those overflow the 1920 canvas. Loop 191 also skips the whole flex row
 * when any child looks like a fixed sidebar — so a 3-card row with the
 * same hardcoded width never gets `flex:1` and sits clipped or left-cramped.
 *
 * Strip width / min-width / max-width / flex-basis / `flex:0 0 N` only when
 * every peer has a similar large fixed main size. Mixed sidebar + fluid
 * (or 280 vs 900) stays. Hangul/brief-gated. Never invent missing cards.
 * 루프201 — max-width / flex:0 0 still cap the row after 198 width strip.
 * 루프207 — uniform 22–48% column-share widths (and flex:0 0 32%) also lock
 * the row. 100% stretch and 50% splits stay.
 */
export function relaxUniformPeerCardFixedMainSize(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceHasHangulGate(out, brief)) return out;
  const decls = collectClassEqualTrackDecls(out);
  const openRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    const tokens = classTokensFromAttrs(attrs);
    if (!containerLooksLikeAllocatedCardRow(style, tokens, decls)) continue;
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + match[0].length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildOpens(out, openEnd, close.closeStart);
    const peers = children.filter((c) => childLooksLikeSizedPeerCard(c.attrs, c.style));
    if (peers.length < 2 || peers.length > 6) continue;
    if (!peersHaveUniformFixedMainSize(peers.map((c) => c.style))) continue;
    for (const peer of peers) {
      const next = stripFixedMainSizeFromOpenTag(peer.open);
      if (next === peer.open) continue;
      patches.push({ start: peer.absStart, end: peer.absEnd, replacement: next });
    }
  }
  patches.sort((a, b) => b.start - a.start);
  for (const patch of patches) {
    out = `${out.slice(0, patch.start)}${patch.replacement}${out.slice(patch.end)}`;
  }
  return out;
}

/**
 * 루프191 — Equalize peer cards in a flex row that has no flex-grow.
 *
 * MiniMax often emits `display:flex;gap:…` with 2–3 padded cards and no
 * `flex:1`, so the cards sit left-cramped with a large empty band on the
 * right (same visual failure mode as underfilled `1fr 1fr 1fr` grids).
 * Give each peer card `flex:1 1 0;min-width:0`. Never invent missing cards.
 * Skip columns, fixed-width sidebars, and non-card chrome rows.
 */
export function balanceUnderfilledFlexCardRow(html: string): string {
  let out = String(html ?? '');
  if (!out || !/display\s*:\s*(?:inline-)?flex/i.test(out)) return out;
  const flexOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b([^>]*\bstyle\s*=\s*(["'])([^"']*)\3[^>]*)>/gi;
  const parentPatches: Array<{ start: number; end: number; replacement: string }> = [];
  const childPatches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = flexOpenRe.exec(out)) !== null) {
    const style = match[4] ?? '';
    if (!isFlexRowContainerStyle(style)) continue;
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const start = match.index;
    const openEnd = start + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildOpens(out, openEnd, close.closeStart);
    if (children.length < 2 || children.length > 6) continue;
    if (children.some((c) => styleHasFlexGrow(c.style))) continue;
    if (children.some((c) => styleLooksLikeFixedSidebar(c.style))) continue;
    if (!children.every((c) => childLooksLikePeerCard(c.attrs, c.style))) continue;
    for (const child of children) {
      childPatches.push({
        start: child.absStart,
        end: child.absEnd,
        replacement: withFlexGrowOnOpenTag(child.open),
      });
    }
    // Avoid shrink-wrap left band when the row itself is width:auto.
    if (!/(?:^|;)\s*width\s*:/i.test(style)) {
      const quote = match[3] ?? '"';
      const nextStyle = `${style.replace(/;?\s*$/, '')};width:100%;min-width:0`;
      const nextOpen = openTag.replace(
        /\bstyle\s*=\s*(["'])[\s\S]*?\1/i,
        `style=${quote}${nextStyle}${quote}`,
      );
      parentPatches.push({ start, end: openEnd, replacement: nextOpen });
    }
  }
  const patches = [...parentPatches, ...childPatches].sort((a, b) => b.start - a.start);
  for (const p of patches) {
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

/**
 * 루프204 — Same leftover as 191, but the flex row lives on a class rule
 * (`.cards { display:flex }`) with no inline display. 191 never sees it.
 * Hangul/brief-gated. Skip inline-flex rows (191) and flex columns.
 */
export function balanceClassBoundFlexCardRow(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceHasHangulGate(out, brief)) return out;
  const flexNames = collectClassFlexRowNames(out);
  if (flexNames.size === 0) return out;
  const openRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const parentPatches: Array<{ start: number; end: number; replacement: string }> = [];
  const childPatches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    if (isFlexRowContainerStyle(style)) continue;
    const tokens = classTokensFromAttrs(attrs);
    if (!tokens.some((token) => flexNames.has(token))) continue;
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const start = match.index;
    const openEnd = start + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildOpens(out, openEnd, close.closeStart);
    if (children.length < 2 || children.length > 6) continue;
    if (children.some((c) => styleHasFlexGrow(c.style))) continue;
    if (children.some((c) => styleLooksLikeFixedSidebar(c.style))) continue;
    if (!children.every((c) => childLooksLikePeerCard(c.attrs, c.style))) continue;
    for (const child of children) {
      childPatches.push({
        start: child.absStart,
        end: child.absEnd,
        replacement: withFlexGrowOnOpenTag(child.open),
      });
    }
    if (!/(?:^|;)\s*width\s*:/i.test(style)) {
      parentPatches.push({
        start,
        end: openEnd,
        replacement: replaceStyleDecl(openTag, 'width', '100%'),
      });
    }
  }
  const patches = [...parentPatches, ...childPatches].sort((a, b) => b.start - a.start);
  for (const p of patches) {
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
  }
  return out;
}

const VOID_HTML_TAGS_RE =
  /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

function classAttrValue(attrs: string): string {
  const quoted = /\bclass\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs);
  if (quoted) return quoted[2] ?? '';
  const bare = /\bclass\s*=\s*([^\s>]+)/i.exec(attrs);
  return bare?.[1] ?? '';
}

function attrsLookCardish(attrs: string): boolean {
  // Only the class token list — never style values like grid-template-columns.
  return CARDISH_CLASS_RE.test(classAttrValue(attrs));
}

/**
 * 루프203 — End index after the just-opened `<div>` closes, or null if it
 * never does. Nested divs are counted. Unclosed sibling cards return null
 * so 194 still inserts a close.
 */
function findOpenedDivCloseEnd(source: string, afterOpen: number): number | null {
  let i = afterOpen;
  let depth = 1;
  while (i < source.length && depth > 0) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      i = end < 0 ? source.length : end + 3;
      continue;
    }
    const opaque = /^<(script|style)\b[^>]*>/i.exec(source.slice(i));
    if (opaque) {
      const tag = opaque[1]!;
      const close = new RegExp(`</${tag}\\s*>`, 'i').exec(source.slice(i));
      i = close ? i + close.index + close[0].length : source.length;
      continue;
    }
    const closeDiv = /^<\/div\s*>/i.exec(source.slice(i));
    if (closeDiv) {
      depth -= 1;
      i += closeDiv[0].length;
      continue;
    }
    const openDiv = /^<div\b[^>]*>/i.exec(source.slice(i));
    if (openDiv) {
      if (!/\/\s*>$/.test(openDiv[0]!)) depth += 1;
      i += openDiv[0]!.length;
      continue;
    }
    const anyTag = /^<\/?[a-zA-Z][\w-]*\b[^>]*>/i.exec(source.slice(i));
    if (anyTag) {
      i += anyTag[0].length;
      continue;
    }
    i += 1;
  }
  return depth === 0 ? i : null;
}

/**
 * True when this card is a balanced inner wrap (title + inner `.card`)
 * whose close is followed by the host `</div>`. A well-formed sibling
 * card that follows unclosed host content ends at EOF or another peer
 * — those still get the 194 sibling close.
 */
function openedCardLooksLikeNestedHostChild(source: string, afterOpen: number): boolean {
  const closeEnd = findOpenedDivCloseEnd(source, afterOpen);
  if (closeEnd == null) return false;
  return /^<\/div\s*>/i.test(source.slice(closeEnd).replace(/^\s+/, ''));
}

/**
 * Repair one slide body: un-nest accidental sibling cards and close leftover
 * opens at the end of the slide. Never invents content — only inserts close
 * tags (루프194).
 */
export function repairUnbalancedCardDivsInFragment(inner: string): string {
  const source = String(inner ?? '');
  if (!source) return source;
  type Frame = { tag: string; cardish: boolean };
  const stack: Frame[] = [];
  let out = '';
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      const stop = end < 0 ? source.length : end + 3;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    const opaqueOpen = /^<(script|style)\b[^>]*>/i.exec(source.slice(i));
    if (opaqueOpen) {
      const tag = opaqueOpen[1]!;
      const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
      const close = closeRe.exec(source.slice(i));
      const stop = close ? i + close.index + close[0].length : source.length;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    const closeM = /^<\/([a-zA-Z][\w-]*)\s*>/i.exec(source.slice(i));
    if (closeM) {
      const tag = closeM[1]!.toLowerCase();
      let idx = stack.length - 1;
      while (idx >= 0 && stack[idx]!.tag !== tag) idx -= 1;
      if (idx >= 0) stack.length = idx;
      out += closeM[0]!;
      i += closeM[0]!.length;
      continue;
    }
    const openM = /^<([a-zA-Z][\w-]*)(\b[^>]*)>/i.exec(source.slice(i));
    if (openM) {
      const tag = openM[1]!.toLowerCase();
      const attrs = openM[2] ?? '';
      const full = openM[0]!;
      const selfClose = /\/\s*>$/.test(full) || VOID_HTML_TAGS_RE.test(tag);
      const cardish = tag === 'div' && attrsLookCardish(attrs);
      if (cardish && !selfClose) {
        // Peer cards must be siblings — MiniMax often opens the next card
        // without closing the previous one (slides 4/5 nested `.card`).
        // 루프203 — skip that close when this card already closes on its
        // own (title + inner card host). Unclosed siblings still close.
        while (stack.length > 0 && stack[stack.length - 1]!.cardish) {
          if (openedCardLooksLikeNestedHostChild(source, i + full.length)) break;
          out += '</div>';
          stack.pop();
        }
      }
      out += full;
      i += full.length;
      if (!selfClose) stack.push({ tag, cardish });
      continue;
    }
    out += source[i]!;
    i += 1;
  }
  // Truncation mid-card: close leftover opens before the slide ends.
  while (stack.length > 0) {
    const frame = stack.pop()!;
    out += `</${frame.tag}>`;
  }
  return out;
}

/**
 * 루프194 — Per-slide repair for unclosed / accidentally nested `.card` divs.
 *
 * Loop189 noted slides 4/5 where MiniMax opened nested `<div class="card">`
 * without matching closes, so later content was swallowed. Scope to slide
 * inners and only insert close tags — never rewrite copy.
 */
export function closeUnclosedSiblingCardsInSlides(html: string): string {
  const source = String(html ?? '');
  if (!source || !/<div\b/i.test(source)) return source;
  const slides = listAiSlideSpans(source);
  if (slides.length === 0) return source;
  let out = source;
  for (let i = slides.length - 1; i >= 0; i -= 1) {
    const slide = slides[i]!;
    const inner = out.slice(slide.openEnd, slide.bodyEnd);
    const repaired = repairUnbalancedCardDivsInFragment(inner);
    if (repaired === inner) continue;
    out = `${out.slice(0, slide.openEnd)}${repaired}${out.slice(slide.bodyEnd)}`;
  }
  return out;
}

const EXACT_CARDISH_TOKEN_RE =
  /^(?:card|pillar|tile|panel|cell|box|metric|stat|kpi)$/i;

function exactCardishTokens(attrs: string): string[] {
  return classTokensFromAttrs(attrs).filter((token) => EXACT_CARDISH_TOKEN_RE.test(token));
}

function sharesExactCardishToken(outerAttrs: string, innerAttrs: string): boolean {
  const inner = exactCardishTokens(innerAttrs);
  return exactCardishTokens(outerAttrs).some((token) => inner.includes(token));
}

function unwrapRedundantNestedPeerCardsOnce(html: string): string {
  const openRe =
    /<(div|section|article|aside)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    const attrs = match[2] ?? '';
    if (exactCardishTokens(attrs).length === 0) continue;
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + match[0].length;
    const close = findSameTagClose(html, tag, openEnd);
    if (!close) continue;
    const closeTok = html.slice(close.closeStart).match(new RegExp(`^</${tag}\\s*>`, 'i'));
    if (!closeTok) continue;
    const outerEnd = close.closeStart + closeTok[0].length;
    const children = listDirectBlockChildSpans(html, openEnd, close.closeStart);
    if (children.length !== 1) continue;
    const child = children[0]!;
    if (!sharesExactCardishToken(attrs, child.attrs)) continue;
    const before = visibleText(html.slice(openEnd, child.absStart));
    const after = visibleText(html.slice(child.absCloseEnd, close.closeStart));
    if (before.length >= 2 || after.length >= 2) continue;
    patches.push({
      start: match.index,
      end: outerEnd,
      replacement: html.slice(child.absStart, child.absCloseEnd),
    });
  }
  if (patches.length === 0) return html;
  patches.sort((a, b) => b.start - a.start);
  let out = html;
  let lastKeptStart = Number.POSITIVE_INFINITY;
  for (const patch of patches) {
    if (patch.end > lastKeptStart) continue;
    out = `${out.slice(0, patch.start)}${patch.replacement}${out.slice(patch.end)}`;
    lastKeptStart = patch.start;
  }
  return out;
}

/**
 * 루프199 — Unwrap a balanced card-in-card leftover.
 *
 * Loop 194 only inserts missing closes when MiniMax opens the next `.card`
 * without closing the previous one. A already-balanced
 * `<div class="card"><div class="card">…</div></div>` survives and paints
 * double padding / nested chrome (the 삼각함수 4/5 residual after close).
 * Keep the inner card; drop the outer only when it has no own text and
 * exactly one same-token child. `card-body` / two-card hosts stay.
 * Hangul/brief-gated. Never invent copy.
 */
export function unwrapRedundantNestedPeerCards(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceHasHangulGate(out, brief)) return out;
  if (!/<div\b/i.test(out)) return out;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = unwrapRedundantNestedPeerCardsOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Q4 — Strip AI mid-stream tag soup left after the model was cut off.
 *
 * `<div>Shado</div></div></h></div></div></section>` — a truncated
 * "Shadowing" and stray `</h>` (no digit). The stray tag either does not
 * exist in HTML, or forms an orphan single-letter close (`</h>` / `<h>`).
 * Removing them stops the browser from silently opening a phantom element
 * that swallows all following content.
 *
 * Never touch valid `h1`..`h6` — those are numbered.
 */
export function scrubTruncatedAiTagSoup(html: string): string {
  return String(html ?? '')
    .replace(/<\/?h(?![1-6])(?=[\s>/])>/gi, '')
    .replace(/<\/?h\s*>/gi, '');
}

/**
 * Q5-a — Restore missing space between Hangul noun and particle after AI
 * `<br>` splits and cleanups.
 *
 * `발화 회로 를 단련` — an authored `<br>` between "회로" and "를" leaves a
 * stray space once the `<br>` is stripped, causing the particle to detach
 * visually. Collapse the single space back into the noun so the postposition
 * reattaches (`회로를`). We only fix the well-known Korean particles.
 */
export function normalizeHangulParticleGaps(html: string): string {
  return String(html ?? '').replace(
    /([\uac00-\ud7af])\s+(를|을|이|가|은|는|에|의|와|과|도|로|으로|께|께서|한테|에서|부터|까지|만|보다|처럼|같이|마다|뿐|씩|이나|나|든지|라도|이든|든|밖에)(?=[\s<.,!?'")\]}]|$)/g,
    '$1$2',
  );
}

/**
 * 루프183-b — Remove unanchored vertical centering transforms inside slides.
 *
 * `transform:translateY(-50%)` is valid only with an explicit positioning
 * anchor (`position:absolute; top:50%`, etc.). Generated decks copied the
 * transform without the anchor, so flow content moved upward and clipped at
 * the 1920×1080 canvas edge. Scope to slide markup and inline styles only.
 */
export function neutralizeUnanchoredTranslateYInSlideContent(html: string): string {
  const source = String(html ?? '');
  if (!source || !/translateY\s*\(\s*-50%\s*\)/i.test(source)) return source;
  let out = source;
  const slides = listAiSlideSpans(source);
  for (let i = slides.length - 1; i >= 0; i -= 1) {
    const slide = slides[i]!;
    const body = out.slice(slide.openEnd, slide.bodyEnd);
    const nextBody = body.replace(
      /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*\bstyle\s*=\s*(['"])([\s\S]*?)\3(?:[^>"']|"[^"]*"|'[^']*')*)>/g,
      (open, _tag: string, _attrs: string, q: string, style: string) => {
        if (!/translateY\s*\(\s*-50%\s*\)/i.test(style)) return open;
        if (/position\s*:\s*(?:absolute|fixed)/i.test(style) && /\btop\s*:\s*50%/i.test(style)) {
          return open;
        }
        if (/\btop\s*:\s*50%/i.test(style) || /\bbottom\s*:/i.test(style)) return open;
        const nextStyle = style
          .replace(/(?:^|;)\s*transform\s*:\s*translateY\s*\(\s*-50%\s*\)\s*(?=;|$)/gi, ';')
          .replace(/translateY\s*\(\s*-50%\s*\)/gi, '')
          .replace(/;;+/g, ';')
          .replace(/^;|;$/g, '')
          .trim();
        return open.replace(`style=${q}${style}${q}`, `style=${q}${nextStyle}${q}`);
      },
    );
    if (nextBody === body) continue;
    out = `${out.slice(0, slide.openEnd)}${nextBody}${out.slice(slide.bodyEnd)}`;
  }
  return out;
}

/**
 * Q5-b — Blank slots whose only text matches the raw user brief.
 *
 * Cover meta rows (`<div class="v">`) and footer confidentials
 * (`<span class="conf">`) sometimes leak the brief verbatim, which is
 * indistinguishable from a caption. When the brief text matches the slot
 * text (whitespace normalized), replace it with an empty inner so the slot
 * still holds layout but no raw prompt copy leaks into the page.
 */
export function scrubBriefLeakFromMetaSlots(html: string, brief?: string | null): string {
  const source = String(html ?? '');
  const briefText = String(brief ?? '').replace(/\s+/g, ' ').trim();
  if (!source || briefText.length < 4) return source;
  const briefEscaped = briefText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 루프178 — Broadside catalog uses `.lead` (not `.lede`). Keep both
  // spellings so we do not regress older kits and cover the new
  // Broadside/SPACE10 kits.
  const slotClasses = ['v', 'conf', 'kicker', 'brief', 'summary', 'note', 'lede', 'tagline', 'lead'];
  let out = source;
  for (const cls of slotClasses) {
    const re = new RegExp(
      `(<(div|span|p)\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>)\\s*(?:${briefEscaped})\\s*(<\\/\\2>)`,
      'gi',
    );
    out = out.replace(re, '$1$3');
  }
  // 루프168 — MiniMax kami leftover ships the raw brief in `<ul class="dash">
  // <li>${brief}</li></ul>`. Dash lists are legitimate content, so we
  // narrowly clear ONLY the list item whose entire text equals the brief.
  // Preserves adjacent list items that happen to reuse a topic word.
  const liRe = new RegExp(
    `(<li\\b[^>]*>)\\s*(?:${briefEscaped})\\s*(</li>)`,
    'gi',
  );
  out = out.replace(liRe, '$1$2');
  return out;
}

/**
 * 루프178 — Strip unresolved template placeholders that MiniMax left in
 * catalog examples. Broadside covers ship `[[Author Name]]` / `[Year]` /
 * `[Author Name]` in `.broadside-num` and footer `.label` slots; other
 * business templates commonly leave `[Company Name]` / `[Client]` /
 * `[Project]` / `[Version]` etc.
 *
 * Defence-in-depth complement to upstream `scrubTemplatePlaceholderSlots`
 * (loop175–176 · narrow 3-token whitelist). This wider whitelist covers
 * business-template tokens BUT only clears elements whose ENTIRE inner
 * text equals the placeholder — inline prose that legitimately mentions
 * a placeholder (e.g. instructions saying "replace [Company]") is
 * preserved. Citation-style refs (`[Smith 2024]`) and Korean bracketed
 * prose (`[참고]`, `[주1]`, `[1]`) never match by construction.
 *
 * Gated on `destHasHangulTopic` at the heal call site (see pipeline
 * below) so official English catalog demos stay intact.
 *
 * Idempotent — a second pass matches nothing.
 */
const UNRESOLVED_PLACEHOLDER_TOKENS = [
  'Author Name',
  'Author',
  'Year',
  'Date',
  'Title',
  'Subtitle',
  'Company',
  'Company Name',
  'Client',
  'Client Name',
  'Project',
  'Project Name',
  'Team',
  'Team Name',
  'Product',
  'Product Name',
  'Version',
  'Location',
  'Category',
  'Section',
  'Chapter',
  'Speaker',
  'Presenter',
  'Organization',
];

const PLACEHOLDER_WRAP_TAGS = 'div|span|p|h[1-6]|li|a|em|strong|small|td|th';

export function scrubUnresolvedTemplatePlaceholders(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  let out = source;
  for (const token of UNRESOLVED_PLACEHOLDER_TOKENS) {
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Only clear an element whose ENTIRE inner text equals the placeholder.
    // <span>[[Author Name]]</span> → <span></span>
    // <p>연구 [Company] 발표</p> is preserved (placeholder is inline prose).
    out = out.replace(
      new RegExp(
        `(<(${PLACEHOLDER_WRAP_TAGS})\\b[^>]*>)\\s*\\[\\[\\s*${esc}\\s*\\]\\]\\s*(</\\2>)`,
        'gi',
      ),
      '$1$3',
    );
    out = out.replace(
      new RegExp(
        `(<(${PLACEHOLDER_WRAP_TAGS})\\b[^>]*>)\\s*\\[\\s*${esc}\\s*\\]\\s*(</\\2>)`,
        'gi',
      ),
      '$1$3',
    );
  }
  return out;
}

/**
 * Combined heal for AI-generated deck HTML. Idempotent — every helper is
 * shape-based so a second pass is a no-op.
 */
/**
 * Q6 — Strip leftover instruction tails (`에 대한`, `예시에`) from headings
 * and short slots. Do not invent replacement copy.
 */
export function polishTruncatedInstructionTitles(html: string): string {
  return String(html ?? '').replace(
    /<(h[1-3]|p|div|span)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs: string, inner: string) => {
      if (/<(?:div|ul|ol|section|article|aside|table)\b/i.test(inner)) return full;
      const text = visibleText(inner);
      if (!/에\s*대한$|예시에?$/u.test(text)) return full;
      const next = String(inner)
        .replace(/(?:<br\s*\/?>\s*)?[,，]?\s*예시에?\s*대한\s*$/u, '')
        .replace(/(?:<br\s*\/?>\s*)?\s*에\s*대한\s*$/u, '')
        .replace(/(?:<br\s*\/?>\s*)+$/g, '')
        .trim();
      if (!next || next === inner) return full;
      return `<${tag}${attrs}>${next}</${tag}>`;
    },
  );
}

/**
 * Body-first leftover dumps keep empty `#nav` / `#hint` / progress chrome
 * after MiniMax restamp. Official presenters keep a `<script>` and must
 * retain that chrome. Do not invent replacement nav.
 */
const ENTRANCE_ANIM_REVEAL_CSS = [
  '[data-anim],[data-anim-target],[class*="anim-"]{',
  'opacity:1!important;visibility:visible!important;',
  'transform:none!important;filter:none!important;clip-path:none!important;',
  'animation:none!important;animation-delay:0s!important;',
  '}',
].join('');

/**
 * Stacked persist/preview does not replay Broadside/Studio `.is-active`
 * entrance animations. Without this, leftover and filled decks both look
 * empty. Official catalog thumbs already neutralize this in cover srcdoc.
 */
export function revealEntranceAnimSlots(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  if (!/\bdata-anim\b/.test(source) && !/\[data-anim/.test(source)) return source;
  if (/\bdata-od-data-anim-reveal\b/.test(source) || /od-data-anim-reveal/.test(source)) {
    return source;
  }
  const tag = `<style data-od-data-anim-reveal>${ENTRANCE_ANIM_REVEAL_CSS}</style>`;
  if (/<\/head>/i.test(source)) return source.replace(/<\/head>/i, `${tag}</head>`);
  if (/<body\b/i.test(source)) return source.replace(/<body\b[^>]*>/i, (open) => `${open}${tag}`);
  return `${tag}${source}`;
}

/** Clone leftovers keep `[[Author Name]]` / `[Year]` as entire slot text. */
export function scrubTemplatePlaceholderSlots(html: string): string {
  return String(html ?? '').replace(
    /(<(div|span|p)\b[^>]*>)\s*(?:\[\[Author Name\]\]|\[Author Name\]|\[Year\])\s*(<\/\2>)/gi,
    '$1$3',
  );
}

export function stripEmptyLeftoverPresenterChrome(html: string): string {
  const source = String(html ?? '');
  if (!source || /<script\b/i.test(source)) return source;
  return source
    .replace(/<div\b[^>]*\bid\s*=\s*["']nav["'][^>]*>\s*<\/div>/gi, '')
    .replace(/<div\b[^>]*\bid\s*=\s*["']hint["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(
      /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bdeck-progress\b[^"']*["'][^>]*>\s*<div\b[^>]*>\s*<\/div>\s*<\/div>/gi,
      '',
    );
}

export function healAiGeneratedDeckMarkup(html: string, brief?: string | null): string {
  let out = String(html ?? '');
  if (!out.trim()) return out;
  // 루프168 — MiniMax `AGENT_EXECUTION_FAILED` recovery / same-turn-write
  // reuse persist paths in ProjectView call heal without a preceding
  // scrubLeftoverCatalogExampleHtml. Own the leftover scrub here so any
  // heal caller (recover / reuse / preview / persist) is safe.
  //
  // Idempotent: `catalogExampleShouldBeScrubbed` returns false on already-
  // scrubbed markup, so callers that already scrubbed (srcdoc / persist)
  // pass through untouched.
  try {
    // Do not pass allowEmptyBrief here. FileViewer / export / srcdoc heal
    // official English catalog examples (kami LOOK seed, gallery export)
    // with an empty brief — those must stay intact. Hangul-restamped
    // leftover still scrubs because catalogExampleShouldBeScrubbed sees
    // Hangul on the dest.
    if (catalogExampleShouldBeScrubbed(out, brief)) {
      const scrubbed = scrubLeftoverCatalogExampleHtml(out, brief);
      if (scrubbed && scrubbed !== out) {
        out = scrubbed;
      }
    }
  } catch (_) {
    // Fall through — shape-based heals below are still worth running.
  }
  out = scrubTruncatedAiTagSoup(out);
  // 루프199 — unwrap balanced card-in-card BEFORE 194. 194 assumes
  // cards are never nested and would insert a sibling close, leaving
  // an empty outer shell plus a leftover </div>.
  out = unwrapRedundantNestedPeerCards(out, brief);
  out = closeUnclosedSiblingCardsInSlides(out);
  out = unnestHeadingBlockChildren(out);
  out = polishTruncatedInstructionTitles(out);
  // 루프197 — empty leftover card shells keep 3-track rows alive so
  // 190/195 cannot shrink and 191 grows the blank column. Drop first.
  out = dropEmptyLeftoverPeerCardsInAllocatedRows(out, brief);
  // 루프198 — uniform px/rem card widths fight minmax/flex shrink and
  // make 191 treat the whole row as a sidebar. Strip first.
  out = relaxUniformPeerCardFixedMainSize(out, brief);
  out = shrinkOverAllocatedRepeatGrid(out);
  out = normalizeEqualFrTracksToMinmax(out);
  out = shrinkOverAllocatedEqualTrackRows(out);
  out = shrinkClassBoundEqualTrackGrids(out, brief);
  out = balanceUnderfilledFlexCardRow(out);
  out = balanceClassBoundFlexCardRow(out, brief);
  out = normalizeHangulParticleGaps(out);
  out = neutralizeUnanchoredTranslateYInSlideContent(out);
  out = scrubBriefLeakFromMetaSlots(out, brief);
  out = dropLeadingTitleOnlyIntroBeforeRealCover(out, brief);
  out = dropEmptyLikelyDeckSlides(out);
  out = dropTitleOnlyNumberedLeftoverSlides(out, brief);
  // 루프182 — MiniMax body-fill failure ships the same title-only slide
  // twice. Collapse consecutive duplicates so preview does not read as
  // "content missing + template not applied" for artifacts that bypassed
  // the upstream 루프181 persist gate.
  out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(out);
  // 루프190/196 residual — after 루프194 card close, leftover
  // article/aside/main or unclosed pairs (diff ≥ 2) still swallow the next
  // slide. Drop those shells only. Diff 1 stays.
  out = dropSlidesWithSeverelyUnbalancedContainerTags(out);
  out = stripEmptyLeftoverPresenterChrome(out);
  if (destHasHangulTopic(out)) {
    // Upstream narrow scrub (3 tokens) first, then defence-in-depth
    // wider whitelist (Company / Client / Project / Version etc.) —
    // both are Hangul-gated so English official catalogs stay intact.
    out = scrubTemplatePlaceholderSlots(out);
    out = scrubUnresolvedTemplatePlaceholders(out);
  }
  out = revealEntranceAnimSlots(out);
  return out;
}

// silence unused import when the module is bundled without callers
void escapeHtml;
