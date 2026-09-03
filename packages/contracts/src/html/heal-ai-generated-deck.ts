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
  officialLookIsCapsule,
  officialLookIsEightBitOrbit,
  scrubLeftoverCatalogExampleHtml,
  stripLeafEmptyListAndParagraphShells,
} from '../template-clone-fill.js';

function destHasHangulTopic(html: string): boolean {
  return ((String(html ?? '').match(/[가-힣]/g) ?? []).length >= 4);
}

function sourceHasHangulGate(html: string, brief?: string | null): boolean {
  return destHasHangulTopic(html) || Boolean(String(brief ?? '').trim());
}

/**
 * 루프252 — Class-bound layout heals used to require Hangul (or a brief).
 * English MiniMax fills with `data-od-slide-flow` / `tpl-*` / multi-slide
 * card rows never entered shrink/balance. Keep empty-brief English catalog
 * fragments (no AI markers) skipped.
 */
function sourceLooksLikeAiGeneratedDeck(html: string, brief?: string | null): boolean {
  if (sourceHasHangulGate(html, brief)) return true;
  const source = String(html ?? '');
  if (!source) return false;
  if (/\bdata-od-slide-flow\b/i.test(source)) return true;
  if (/\btpl-[\w-]+\b/i.test(source)) return true;
  if (/\bclass\s*=\s*["'][^"']*\b(?:s-cover|s-chapter|s-data|slide-cover)\b/i.test(source)) {
    return true;
  }
  const slides = listAiSlideSpans(source);
  if (
    slides.length >= 2
    && /\bclass\s*=\s*["'][^"']*\b(?:card|cards-grid|cards|pillar|grid)\b/i.test(source)
  ) {
    return true;
  }
  return false;
}

function visibleText(html: string): string {
  return String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' SVG ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    // 루프356 — MiniMax sometimes emits numeric / hex nbsp instead of &nbsp;.
    .replace(/&#0*160;/gi, ' ')
    .replace(/&#x0*a0;/gi, ' ')
    // 루프357 — dash / ellipsis entities left as literal text look "filled".
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '…')
    .replace(/&#0*8212;/gi, '—')
    .replace(/&#x0*2014;/gi, '—')
    .replace(/&#0*8211;/gi, '–')
    .replace(/&#x0*2013;/gi, '–')
    .replace(/&#0*8230;/gi, '…')
    .replace(/&#x0*2026;/gi, '…')
    .replace(/[\u00a0\u200b\u200c\u200d\u2060\ufeff\u00ad]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const HTML_VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

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

/**
 * 루프254 — Depth-matched slide host spans (parity with web
 * `extractSlideHostBlocks`). The previous first-close / next-open limit
 * mis-sliced nested or unclosed `section.slide` hosts so card-close, empty
 * drop, and translate heals applied to the wrong body.
 */
export function listAiSlideSpans(html: string): SlideSpan[] {
  const source = String(html ?? '');
  if (!source) return [];
  const raw: SlideSpan[] = [];
  const openRe = /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let searchFrom = 0;
  while (searchFrom < source.length) {
    openRe.lastIndex = searchFrom;
    const openMatch = openRe.exec(source);
    if (!openMatch) break;
    const tag = (openMatch[1] ?? 'section').toLowerCase();
    const attrs = openMatch[2] ?? '';
    const start = openMatch.index;
    const openEnd = start + openMatch[0].length;
    if (!attrsLookLikeDeckOrTemplateSlideHost(attrs)) {
      searchFrom = openEnd;
      continue;
    }
    const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
    const nestedOpenRe = new RegExp(
      `<${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`,
      'gi',
    );
    let depth = 1;
    let cursor = openEnd;
    let bodyEnd = -1;
    let end = -1;
    while (cursor < source.length && depth > 0) {
      nestedOpenRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen = nestedOpenRe.exec(source);
      const nextClose = closeRe.exec(source);
      if (!nextClose) break;
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        cursor = nextClose.index + nextClose[0].length;
        if (depth === 0) {
          bodyEnd = nextClose.index;
          end = cursor;
        }
      }
    }
    if (bodyEnd < 0 || end < 0) {
      raw.push({
        tag,
        attrs,
        start,
        openEnd,
        bodyEnd: source.length,
        end: source.length,
      });
      break;
    }
    raw.push({ tag, attrs, start, openEnd, bodyEnd, end });
    searchFrom = end;
  }
  // Drop nested hosts fully contained by an outer slide (web parity).
  return raw.filter(
    (slide, index) =>
      !raw.some(
        (other, otherIndex) =>
          otherIndex !== index
          && other.start < slide.start
          && other.end >= slide.end,
      ),
  );
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
 * Q1-b — Drop leftover numbered shells (`{topic} · 3`, `{topic} 2`)
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
 * (`<section class="slide"><h1>{topic}</h1></section>`) twice or more in
 * a row. `dropTitleOnlyNumberedLeftoverSlides` only handles the
 * `{topic} · 2` counter form; `dropEmptyLikelyDeckSlides` keeps the shell
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

/**
 * 루프182 / 루프236 — Drop duplicate title-only leftover slides.
 *
 * MiniMax body-fill failure often emits the same title-only shell more than
 * once. Consecutive pairs were handled first (루프182). Non-adjacent leftovers
 * (`title | real body | same title-only`) still left a content-missing page
 * after a filled slide (루프236) — drop later non-cover title-only shells whose
 * normalized text matches an earlier title-only slide.
 */
export function dropDuplicateConsecutiveTitleOnlyLeftoverSlides(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const slides = listAiSlideSpans(out);
  if (slides.length < 2) return out;
  // Walk from the tail so each removal keeps indexes valid for earlier slides.
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const curr = slides[i]!;
    const currBody = out.slice(curr.openEnd, curr.bodyEnd);
    if (!slideBodyLooksTitleOnly(currBody)) continue;
    // Never drop an explicit cover/chapter host.
    if (attrsLookLikeRealCoverSlide(curr.attrs)) continue;
    if (/\b(?:s-chapter|chapter)\b/i.test(curr.attrs)) continue;
    const currText = normalizeVisibleTextForDedup(currBody);
    if (!currText) continue;
    // Preserve motif-only decorative shells — a background gradient host may
    // legitimately reuse the same heading text as a chapter marker.
    if (/\bbackground(?:-image)?\s*:\s*(?:url|linear-gradient|radial-gradient|conic-gradient)/i.test(curr.attrs)) {
      continue;
    }
    let matchesEarlierTitleOnly = false;
    for (let j = 0; j < i; j += 1) {
      const earlier = slides[j]!;
      const earlierBody = out.slice(earlier.openEnd, earlier.bodyEnd);
      if (!slideBodyLooksTitleOnly(earlierBody)) continue;
      if (normalizeVisibleTextForDedup(earlierBody) === currText) {
        matchesEarlierTitleOnly = true;
        break;
      }
    }
    if (!matchesEarlierTitleOnly) continue;
    out = `${out.slice(0, curr.start)}${out.slice(curr.end)}`;
  }
  return out;
}

/**
 * 루프295 — 본문이 있는 연속 중복 슬라이드.
 *
 * 루프182/236은 title-only(≤40자)만 접는다. MiniMax는 같은 마무리 장을
 * 실체 본문째 한 번 더 넣는다. 정규화 텍스트가 완전히 같고, 둘 다
 * title-only 한도(40자)를 넘으며 바로 옆일 때만 뒤 장을 제거. 루프319는
 * 문장부호만 다른 연속 장도 접는다. 커버·챕터·비인접 재사용·추가 문장은 유지.
 * 카피 발명 없음.
 */
export function dropDuplicateConsecutiveSubstanceSlides(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const slides = listAiSlideSpans(out);
  if (slides.length < 2) return out;
  for (let i = slides.length - 1; i >= 1; i -= 1) {
    const curr = slides[i]!;
    const prev = slides[i - 1]!;
    if (attrsLookLikeRealCoverSlide(curr.attrs)) continue;
    if (/\b(?:s-chapter|chapter)\b/i.test(curr.attrs)) continue;
    if (/\bbackground(?:-image)?\s*:\s*(?:url|linear-gradient|radial-gradient|conic-gradient)/i.test(curr.attrs)) {
      continue;
    }
    const currBody = out.slice(curr.openEnd, curr.bodyEnd);
    const prevBody = out.slice(prev.openEnd, prev.bodyEnd);
    const currText = normalizeVisibleTextForDedup(currBody);
    const prevText = normalizeVisibleTextForDedup(prevBody);
    // Title-only leftovers are 루프182/236. This pass is the same page
    // emitted twice with real body copy (> 40).
    if (currText.length <= DUPLICATE_TITLE_ONLY_VISIBLE_TEXT_LIMIT) continue;
    if (prevText.length <= DUPLICATE_TITLE_ONLY_VISIBLE_TEXT_LIMIT) continue;
    if (!currText || !prevText) continue;
    // 루프319 — 문장부호·공백만 다른 연속 장 (`있다.` vs `있다`).
    // 추가 문장이 있는 마무리는 유지.
    if (
      currText !== prevText
      && normalizedTopicForComparison(currText) !== normalizedTopicForComparison(prevText)
    ) {
      continue;
    }
    out = removeSlideSpan(out, curr);
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
 * 사용자 리포트 2026-08-31 (loop186–189 후속):
 *   MiniMax fill 이 중간 슬라이드에서 nested `<div class="card">` 를 열고
 *   닫지 않았음. 브라우저는 `</section>` 에서 강제로 남은 `<div>` 를 닫아
 *   이후 슬라이드 콘텐츠가 이 슬라이드 안에 삽입되거나, srcdoc 파서에 따라
 *   카드 그리드가 세로로 무너져 렌더됨.
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
 * 루프186 / 루프188 / 루프234 — Drop a stray generated intro splash before the
 * real cover (or a substantive same-topic opener).
 *
 * Recent template-fill failures sometimes prepend
 * `<section class="slide slide-title"><h1>{topic}</h1></section>` (or a bare
 * title-only `<section class="slide">`) and then append the actual
 * selected-template cover as slide 2. MiniMax often omits `s-cover` /
 * `data-screen-label=…Cover` on that second slide, so requiring cover attrs
 * alone left the splash in place (루프234).
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
  // Chapter hosts after a splash are intentional openers — do not drop.
  if (/\b(?:s-chapter|s-data|s-manifesto|s-programme|chapter)\b/i.test(second.attrs)) {
    return source;
  }
  const firstBody = source.slice(first.openEnd, first.bodyEnd);
  const secondBody = source.slice(second.openEnd, second.bodyEnd);
  if (!slideBodyLooksTitleOnly(firstBody)) return source;
  if (!slideBodyLooksSubstantive(secondBody)) return source;
  // Explicit cover attrs are preferred but not required — MiniMax often emits
  // a bare `class="slide"` substantive cover as slide 2 (루프234).

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
/** 루프300 — MiniMax writes `minmax(0px,1fr)` / `minmax(0%,33%)`. */
/** 루프318 — same leftover with `0ch` / `0ex` / `0lh` / `0cqw` floors. */
const SOFT_MINMAX_FLOOR = '(?:0(?:px|%|em|rem|pt|ch|ex|lh|rlh|cap|ic|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)?|auto|min-content|max-content)';
const EQUAL_FR_TRACK_RE = new RegExp(
  `^(?:1(?:\\.0+)?fr|minmax\\(\\s*${SOFT_MINMAX_FLOOR}\\s*,\\s*1(?:\\.0+)?fr\\s*\\))$`,
  'i',
);
/** 루프255 — identical 0.22–0.48fr leftover shares (skip 0.5fr splits). */
const EQUAL_FR_SHARE_TRACK_RE = /^0?\.(?:2[2-9]|3\d|4[0-8])\d*fr$/i;
/** 루프210/215/238 — identical 22–48% or viewport/container shares (skip 50 splits). */
const EQUAL_COLUMN_SHARE_TRACK_RE =
  /^(?:2[2-9]|3\d|4[0-8])(?:\.\d+)?(?:%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)$/i;

/**
 * 루프292 — `calc(33%)` / `calc(100%/3)` leftover shares. `50%` splits
 * stay (not in the 22–48 band).
 */
function unwrapCalcShareInner(inner: string): string | null {
  const compact = String(inner ?? '').replace(/\s+/g, '').toLowerCase();
  const calc = /^calc\((.+)\)$/i.exec(compact);
  if (!calc) return null;
  const expr = calc[1] ?? '';
  if (EQUAL_FR_SHARE_TRACK_RE.test(expr) || EQUAL_COLUMN_SHARE_TRACK_RE.test(expr)) {
    return expr;
  }
  const third = /^100(%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)\/3$/i
    .exec(expr);
  if (third) return `33${(third[1] ?? '%').toLowerCase()}`;
  // 루프314 — `calc(100%/sibling-count())` is equal-fr leftover, not 50%.
  if (/^100(?:%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)\/sibling-count\(\)$/i.test(expr)) {
    return '1fr';
  }
  if (/^\(100(?:%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)[-](?:\d+(?:\.\d+)?)(?:px|rem|em|ch)\)\/sibling-count\(\)$/i.test(expr)) {
    return '1fr';
  }
  return unwrapCalcGapAdjustedShare(expr);
}

const CALC_GAP_LENGTH_MAX_PX = 160;

function calcGapLengthPx(value: string, unit: string): number | null {
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num) || num < 0) return null;
  const u = unit.toLowerCase();
  const px = u === 'px' ? num : u === 'rem' || u === 'em' ? num * 16 : u === 'ch' ? num * 8 : null;
  if (px == null || px > CALC_GAP_LENGTH_MAX_PX) return null;
  return px;
}

/**
 * 루프312 — MiniMax leftover often subtracts row gap from the share:
 * `calc(33% - 16px)`, `calc(100%/3 - 8px)`, `calc((100% - 48px) / 3)`.
 * Small subtract only. `calc(50% - 16px)` / large sidebar subtract 유지.
 */
function unwrapCalcGapAdjustedShare(expr: string): string | null {
  const shareMinus = new RegExp(
    `^(${EQUAL_FR_SHARE_TRACK_RE.source.slice(1, -1)}|${EQUAL_COLUMN_SHARE_TRACK_RE.source.slice(1, -1)})[-](\\d+(?:\\.\\d+)?)(px|rem|em|ch)$`,
    'i',
  ).exec(expr);
  if (shareMinus && calcGapLengthPx(shareMinus[2] ?? '', shareMinus[3] ?? '')) {
    return shareMinus[1] ?? null;
  }
  const thirdMinus = /^100(%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)\/3[-](\d+(?:\.\d+)?)(px|rem|em|ch)$/i
    .exec(expr);
  if (thirdMinus && calcGapLengthPx(thirdMinus[2] ?? '', thirdMinus[3] ?? '')) {
    return `33${(thirdMinus[1] ?? '%').toLowerCase()}`;
  }
  const grouped = /^\(100(%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)[-](\d+(?:\.\d+)?)(px|rem|em|ch)\)\/3$/i
    .exec(expr);
  if (grouped && calcGapLengthPx(grouped[2] ?? '', grouped[3] ?? '')) {
    return `33${(grouped[1] ?? '%').toLowerCase()}`;
  }
  const groupedMul = /^\(100(%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)[-](\d+(?:\.\d+)?)\*(\d+(?:\.\d+)?)(px|rem|em|ch)\)\/3$/i
    .exec(expr);
  if (groupedMul) {
    const times = Number.parseFloat(groupedMul[2] ?? '');
    const gap = calcGapLengthPx(groupedMul[3] ?? '', groupedMul[4] ?? '');
    if (Number.isFinite(times) && times >= 1 && times <= 6 && gap != null && times * gap <= CALC_GAP_LENGTH_MAX_PX) {
      return `33${(groupedMul[1] ?? '%').toLowerCase()}`;
    }
  }
  const groupedMulFlip = /^\(100(%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)[-](\d+(?:\.\d+)?)(px|rem|em|ch)\*(\d+(?:\.\d+)?)\)\/3$/i
    .exec(expr);
  if (groupedMulFlip) {
    const times = Number.parseFloat(groupedMulFlip[4] ?? '');
    const gap = calcGapLengthPx(groupedMulFlip[2] ?? '', groupedMulFlip[3] ?? '');
    if (Number.isFinite(times) && times >= 1 && times <= 6 && gap != null && times * gap <= CALC_GAP_LENGTH_MAX_PX) {
      return `33${(groupedMulFlip[1] ?? '%').toLowerCase()}`;
    }
  }
  return null;
}

/**
 * 루프299 — `var(--col, 33%)` fallback만 share로 본다.
 * 루프310 — `env(safe-area-inset-*, 33%)` fallback도 동일.
 * 루프317 — 구형 `constant(safe-area-inset-*, 33%)` alias도 동일.
 */
function cssFnCommaFallbackInner(
  compact: string,
  fn: 'var' | 'env' | 'constant',
): string | null {
  const head = new RegExp(`^${fn}\\(`, 'i').exec(compact);
  if (!head) return null;
  const inner = compact.slice(head[0].length);
  let depth = 1;
  let comma = -1;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]!;
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        if (i !== inner.length - 1) return null;
        if (comma < 0) return null;
        return inner.slice(comma + 1, i);
      }
    }
    if (ch === ',' && depth === 1 && comma < 0) comma = i;
  }
  return null;
}

function splitCssFnArgs(compact: string): string[] {
  const open = compact.indexOf('(');
  if (open < 0 || !compact.endsWith(')')) return [];
  const inner = compact.slice(open + 1, -1);
  const args: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of inner) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (buf) args.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf) args.push(buf);
  return args;
}

/**
 * 루프303 — `clamp(0px,33%,1fr)` preferred(middle) · `min(33%,1fr)` /
 * `max(0px,33%)`에서 22–48 share가 하나(또는 전부 동일)일 때만.
 * `clamp(...,50%,...)` / `min(50%,1fr)` 스플릿은 유지.
 */
function unwrapClampOrMinMaxShare(compact: string): string | null {
  if (/^clamp\(/i.test(compact)) {
    const args = splitCssFnArgs(compact);
    if (args.length !== 3) return null;
    return unwrapShareValue(args[1] ?? '');
  }
  if (!/^(?:min|max)\(/i.test(compact)) return null;
  const shares = splitCssFnArgs(compact)
    .map((arg) => unwrapShareValue(arg))
    .filter((share): share is string => share != null);
  if (shares.length === 1) return shares[0]!;
  if (shares.length >= 2 && shares.every((share) => share === shares[0])) return shares[0]!;
  return null;
}

function unwrapFitContentShare(compact: string): string | null {
  if (!/^fit-content\(/i.test(compact) || !compact.endsWith(')')) return null;
  return unwrapShareValue(compact.slice('fit-content('.length, -1));
}

/** 루프292/296/299/303/306 — bare share · calc · var · clamp/min/max · fit-content. */
function unwrapShareValue(raw: string): string | null {
  const compact = String(raw ?? '').replace(/\s+/g, '').toLowerCase();
  if (!compact) return null;
  if (EQUAL_FR_SHARE_TRACK_RE.test(compact) || EQUAL_COLUMN_SHARE_TRACK_RE.test(compact)) {
    return compact;
  }
  const calc = unwrapCalcShareInner(compact);
  if (calc) return calc;
  const fallback = cssFnCommaFallbackInner(compact, 'var')
    ?? cssFnCommaFallbackInner(compact, 'env')
    ?? cssFnCommaFallbackInner(compact, 'constant');
  if (fallback) return unwrapShareValue(fallback);
  const fit = unwrapFitContentShare(compact);
  if (fit) return fit;
  return unwrapClampOrMinMaxShare(compact);
}

/**
 * 루프289 — MiniMax wraps leftover shares as `minmax(0,33%)` /
 * `minmax(0,30vw)` / `minmax(0,0.33fr)` so bare-share parsers miss them.
 * Only soft floors (0/auto/min-content/max-content) unwrap; `minmax(200px,1fr)`
 * sidebars stay.
 * 루프292 — second arg may be `calc(33%)` / `calc(100%/3)`. `[^)]+` cannot
 * parse nested parens, so the second arg is sliced by depth.
 * 루프300 — floor may be `0px` / `0%` / `0em`, not only bare `0`.
 * 루프303 — second arg may be `clamp(0px,33%,1fr)` / `min(33%,1fr)`.
 * 루프306 — `fit-content(33%)` / `fit-content(calc(100%/3))`.
 */
function unwrapEqualShareTrack(track: string): string | null {
  const compact = String(track ?? '').replace(/\s+/g, '');
  const head = new RegExp(`^minmax\\(${SOFT_MINMAX_FLOOR},`, 'i').exec(compact);
  if (!head) return unwrapShareValue(compact);
  const innerStart = head[0].length;
  let depth = 1;
  for (let i = innerStart; i < compact.length; i += 1) {
    const ch = compact[i]!;
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth !== 0) continue;
      if (i !== compact.length - 1) return null;
      const inner = compact.slice(innerStart, i).toLowerCase();
      if (EQUAL_FR_SHARE_TRACK_RE.test(inner) || EQUAL_COLUMN_SHARE_TRACK_RE.test(inner)) {
        return inner;
      }
      return unwrapShareValue(inner);
    }
  }
  return null;
}

function equalShareTrackKey(track: string): string | null {
  const compact = String(track ?? '').replace(/\s+/g, '').toLowerCase();
  if (EQUAL_FR_SHARE_TRACK_RE.test(compact) || EQUAL_COLUMN_SHARE_TRACK_RE.test(compact)) {
    return compact;
  }
  return unwrapEqualShareTrack(compact) ?? unwrapShareValue(compact);
}

const NEAR_EQUAL_SHARE_DELTA = 2;
const NEAR_EQUAL_FR_DELTA = 0.02;

function leftoverShareMeasure(key: string): { value: number; unit: string } | null {
  const compact = String(key ?? '').replace(/\s+/g, '').toLowerCase();
  const frShare = /^(0?\.(?:2[2-9]|3\d|4[0-8])\d*)fr$/.exec(compact);
  if (frShare) {
    const value = Number.parseFloat(frShare[1] ?? '');
    return Number.isFinite(value) ? { value, unit: 'fr' } : null;
  }
  const col = /^((?:2[2-9]|3\d|4[0-8])(?:\.\d+)?)(%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)$/i
    .exec(compact);
  if (!col) return null;
  const value = Number.parseFloat(col[1] ?? '');
  const unit = (col[2] ?? '').toLowerCase();
  if (!Number.isFinite(value) || !unit) return null;
  return { value, unit };
}

function leftoverSharesLookNearEqual(keys: Array<string | null>): boolean {
  if (keys.length < 2 || keys.length > 6) return false;
  const measures = keys.map((key) => (key ? leftoverShareMeasure(key) : null));
  if (measures.some((item) => item == null)) return false;
  const unit = measures[0]!.unit;
  if (!measures.every((item) => item!.unit === unit)) return false;
  const values = measures.map((item) => item!.value);
  const delta = unit === 'fr' ? NEAR_EQUAL_FR_DELTA : NEAR_EQUAL_SHARE_DELTA;
  return Math.max(...values) - Math.min(...values) <= delta;
}

function splitCssGridTracks(value: string): string[] {
  const tracks: string[] = [];
  let buf = '';
  let depth = 0;
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(ch)) {
      if (buf.trim()) tracks.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) tracks.push(buf.trim());
  return tracks;
}

function parseRepeatEqualColumns(cleaned: string): { count: number; unit: string } | null {
  if (!/^repeat\s*\(/i.test(cleaned)) return null;
  const open = cleaned.indexOf('(');
  if (open < 0) return null;
  let depth = 1;
  let close = -1;
  for (let i = open + 1; i < cleaned.length; i += 1) {
    const ch = cleaned[i]!;
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0 || close !== cleaned.length - 1) return null;
  const inner = cleaned.slice(open + 1, close);
  const comma = inner.indexOf(',');
  if (comma < 0) return null;
  const count = Number.parseInt(inner.slice(0, comma).trim(), 10);
  const unit = inner.slice(comma + 1).trim();
  if (!Number.isFinite(count) || count < 2 || !unit) return null;
  return { count, unit };
}

function parseRepeatAutoShare(
  cleaned: string,
): { mode: 'auto-fill' | 'auto-fit'; unit: string } | null {
  if (!/^repeat\s*\(\s*auto-(?:fill|fit)\s*,/i.test(cleaned)) return null;
  const open = cleaned.indexOf('(');
  if (open < 0) return null;
  let depth = 1;
  let close = -1;
  for (let i = open + 1; i < cleaned.length; i += 1) {
    const ch = cleaned[i]!;
    if (ch === '(') depth += 1;
    if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0 || close !== cleaned.length - 1) return null;
  const inner = cleaned.slice(open + 1, close);
  const comma = inner.indexOf(',');
  if (comma < 0) return null;
  const mode = inner.slice(0, comma).trim().toLowerCase();
  const unit = inner.slice(comma + 1).trim();
  if ((mode !== 'auto-fill' && mode !== 'auto-fit') || !unit) return null;
  return { mode: mode as 'auto-fill' | 'auto-fit', unit };
}

function unitLooksLikeLeftoverShare(unit: string): boolean {
  const compact = String(unit ?? '').replace(/\s+/g, '');
  if (!compact) return false;
  if (unwrapShareValue(compact) != null) return true;
  return minmaxUnitForEqualFr({
    kind: 'list',
    count: 3,
    unit: compact,
    important: false,
  }) != null;
}

function countDirectBlockChildren(inner: string): number {
  const tokenRe = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*(\/)?>/gi;
  let depth = 0;
  let directChildren = 0;
  let tok: RegExpExecArray | null;
  while ((tok = tokenRe.exec(inner)) !== null) {
    const closing = tok[1] === '/';
    const tagName = (tok[2] ?? '').toLowerCase();
    const selfClose = tok[3] === '/' || HTML_VOID_ELEMENTS.has(tagName);
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
 * `1.0fr 1.0fr 1.0fr`, `minmax(0,1fr)…`). 루프210 — also identical
 * 22–48% / vw / vh shares (`33% 33% 33%`, `33vw 33vw 33vw`,
 * `33vh 33vh 33vh`). 루프289 — same shares wrapped as
 * `minmax(0,33%)` / `minmax(0,30vw)` / `minmax(0,0.33fr)`. Mixed tracks
 * such as `1.3fr 1fr` or `220px 1fr` or `50% 50%` splits stay.
 * 루프292 — `minmax(0,calc(100%/3))` / `repeat(3, minmax(0, calc(33%)))`.
 * 루프299 — `var(--col,33%)` / `minmax(0, var(--col, calc(100%/3)))`.
 */
function parseDeclaredEqualColumns(value: string): EqualColumnDecl | null {
  const important = /!important/i.test(value);
  const cleaned = value.replace(/!important/gi, '').trim();
  if (!cleaned) return null;
  const repeat = parseRepeatEqualColumns(cleaned);
  if (repeat) {
    return { kind: 'repeat', count: repeat.count, unit: repeat.unit, important };
  }
  const tracks = splitCssGridTracks(cleaned);
  if (tracks.length < 2) return null;
  if (tracks.every((t) => EQUAL_FR_TRACK_RE.test(t.replace(/\s+/g, '')))) {
    return {
      kind: 'list',
      count: tracks.length,
      unit: tracks[0]!.replace(/\s+/g, ''),
      important,
    };
  }
  const shareKeys = tracks.map((t) => equalShareTrackKey(t));
  if (
    shareKeys.every((key) => key != null && key === shareKeys[0])
    || leftoverSharesLookNearEqual(shareKeys)
  ) {
    return {
      kind: 'list',
      count: tracks.length,
      unit: tracks[0]!.replace(/\s+/g, ''),
      important,
    };
  }
  return null;
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
    const rawCols = (colsMatch[1] ?? '').trim();
    const decl = parseDeclaredEqualColumns(rawCols);
    const autoShare = decl ? null : parseRepeatAutoShare(rawCols.replace(/!important/gi, '').trim());
    if (!decl && (!autoShare || !unitLooksLikeLeftoverShare(autoShare.unit))) continue;
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const start = match.index;
    const openEnd = start + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const inner = out.slice(openEnd, close.closeStart);
    const directChildren = countDirectBlockChildren(inner);
    if (directChildren === 0 || directChildren > 6) continue;
    if (decl && directChildren >= decl.count) continue;
    if (!decl && directChildren < 2) continue;
    const nextDecl = decl ?? {
      kind: 'repeat' as const,
      count: directChildren,
      unit: autoShare!.unit,
      important: /!important/i.test(rawCols),
    };
    const nextOpen = openTag.replace(
      /grid-template-columns\s*:\s*[^;"']+/i,
      `grid-template-columns:${formatEqualColumns(nextDecl, directChildren)}`,
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
  // 루프220 — `1.0fr` / `minmax(0,1.0fr)` are the same leftover as `1fr`.
  // 루프289 — `minmax(0,33%)` / `minmax(0,0.33fr)` share wrappers too.
  // 루프292 — `minmax(0,calc(33%))` / `minmax(0,calc(100%/3))`.
  // 루프300 — `minmax(0px,1fr)` / `minmax(0%,33%)`.
  if (
    /^1(?:\.0+)?fr$/i.test(unit)
    || new RegExp(`^minmax\\(${SOFT_MINMAX_FLOOR},1(?:\\.0+)?fr\\)$`, 'i').test(unit)
    || EQUAL_FR_SHARE_TRACK_RE.test(unit)
    || EQUAL_COLUMN_SHARE_TRACK_RE.test(unit)
    || unwrapEqualShareTrack(unit) != null
  ) {
    return { ...decl, unit: 'minmax(0,1fr)' };
  }
  return null;
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
    const rawCols = (colsMatch[1] ?? '').trim();
    const decl = parseDeclaredEqualColumns(rawCols);
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    if (decl) {
      const next = minmaxUnitForEqualFr(decl);
      if (!next) continue;
      patches.push({
        start: match.index,
        end: match.index + openTag.length,
        replacement: replaceStyleDecl(
          openTag,
          'grid-template-columns',
          formatEqualColumns(next, decl.count),
        ),
      });
      continue;
    }
    const autoShare = parseRepeatAutoShare(rawCols.replace(/!important/gi, '').trim());
    if (!autoShare || !unitLooksLikeLeftoverShare(autoShare.unit)) continue;
    const openEnd = match.index + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const directChildren = countDirectBlockChildren(out.slice(openEnd, close.closeStart));
    if (directChildren < 2 || directChildren > 6) continue;
    patches.push({
      start: match.index,
      end: match.index + openTag.length,
      replacement: replaceStyleDecl(
        openTag,
        'grid-template-columns',
        formatEqualColumns({
          kind: 'repeat',
          count: directChildren,
          unit: 'minmax(0,1fr)',
          important: /!important/i.test(rawCols),
        }, directChildren),
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
 * 루프309 — `grid-auto-columns:33%` implicit leftover tracks.
 * No (or none/auto) template-columns, 2–6 children, leftover share only.
 * Rewrite auto-columns to minmax(0,1fr). `50%` / px sidebar 유지.
 */
export function normalizeGridAutoColumnShares(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b([^>]*\bstyle\s*=\s*(["'])([^"']*)\3[^>]*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const style = match[4] ?? '';
    const autoRaw = /grid-auto-columns\s*:\s*([^;]+)/i.exec(style)?.[1];
    if (!autoRaw) continue;
    const template = /grid-template-columns\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
    if (template && !/^(?:none|auto)$/i.test(template)) continue;
    if (!unitLooksLikeLeftoverShare(autoRaw.replace(/!important/gi, '').trim())) continue;
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const directChildren = countDirectBlockChildren(out.slice(openEnd, close.closeStart));
    if (directChildren < 2 || directChildren > 6) continue;
    patches.push({
      start: match.index,
      end: match.index + openTag.length,
      replacement: replaceStyleDecl(openTag, 'grid-auto-columns', 'minmax(0,1fr)'),
    });
  }
  if (patches.length === 0) return out;
  patches.sort((a, b) => b.start - a.start);
  for (const patch of patches) {
    out = `${out.slice(0, patch.start)}${patch.replacement}${out.slice(patch.end)}`;
  }
  return out;
}

/**
 * 루프316 — `grid-auto-rows:33%` implicit leftover bands.
 * No (or none/auto) template-rows, 2–6 children, leftover share only.
 * Rewrite auto-rows to minmax(0,1fr). `50%` / px 유지.
 */
export function normalizeGridAutoRowShares(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b([^>]*\bstyle\s*=\s*(["'])([^"']*)\3[^>]*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const style = match[4] ?? '';
    const autoRaw = /grid-auto-rows\s*:\s*([^;]+)/i.exec(style)?.[1];
    if (!autoRaw) continue;
    const template = /grid-template-rows\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim();
    if (template && !/^(?:none|auto)$/i.test(template)) continue;
    if (!unitLooksLikeLeftoverShare(autoRaw.replace(/!important/gi, '').trim())) continue;
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const directChildren = countDirectBlockChildren(out.slice(openEnd, close.closeStart));
    if (directChildren < 2 || directChildren > 6) continue;
    patches.push({
      start: match.index,
      end: match.index + openTag.length,
      replacement: replaceStyleDecl(openTag, 'grid-auto-rows', 'minmax(0,1fr)'),
    });
  }
  if (patches.length === 0) return out;
  patches.sort((a, b) => b.start - a.start);
  for (const patch of patches) {
    out = `${out.slice(0, patch.start)}${patch.replacement}${out.slice(patch.end)}`;
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
      const decl: ClassEqualTrackDecl = {};
      if (cols) decl.cols = cols;
      if (rows) decl.rows = rows;
      found.set(className, decl);
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
 * 루프194 / 루프252 — Compact fills reuse leftover `.grid` / `.cards-grid` rules
 * (`1fr 1fr 1fr` or 2×2) without inline tracks. Heal AI-shaped decks
 * (Hangul/brief/`data-od-slide-flow`/multi-slide cards); keep empty-brief
 * English catalog fragments untouched.
 */
export function shrinkClassBoundEqualTrackGrids(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
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
    const selfClose = tok[3] === '/'
      || /\/>\s*$/.test(tok[0] ?? '')
      || HTML_VOID_ELEMENTS.has(tagName);
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
  // 루프216 — planned-fill stubs MiniMax leaves on the missing pillar.
  '작성예정',
  '입력필요',
  '추후입력',
  '추가예정',
  '기재예정',
  '미작성',
  '미기재',
  // 루프214 — English absence stubs on the missing pillar.
  'unknown',
  'pending',
  'vacant',
  'unset',
  'empty',
  'blank',
  'none',
  'tbc',
  // 루프218 — dummy/sample shells MiniMax leaves on the missing pillar.
  'example',
  'sample',
  'dummy',
  '예시문',
  '예제',
  '예시',
  '샘플',
  '더미',
  // 루프223 — fill-instruction stubs MiniMax leaves on the missing pillar.
  'tobefilled',
  'filllater',
  'inserthere',
  'typetext',
  'fillme',
  // 루프224 — hold/defer stubs MiniMax leaves on the missing pillar.
  'soon',
  'later',
  '대기',
  '보류',
  '생략',
  // 루프227 — lorem-ipsum / placeholder shells MiniMax leaves on the missing pillar.
  // `lorem` alone already matches; `lorem ipsum` needs `ipsum` to consume the rest.
  'placeholder',
  'ipsum',
  'filler',
  // 루프228 — "no data" compounds. `없음` alone does not match `자료없음`
  // because the token must sit at the start of the compact string.
  '자료없음',
  '정보없음',
  '데이터없음',
  // 루프231 — temp/fake shells MiniMax leaves on the missing pillar.
  '가데이터',
  '임시',
  '가짜',
  'temp',
  'fake',
  // 루프241 — keyboard-mash shells MiniMax leaves on the missing pillar.
  'qwerty',
  'asdf',
  'xxx',
  'xx',
  // 루프243 — nullish shells MiniMax leaves on the missing pillar.
  'undefined',
  'null',
  'nil',
  '널',
  // 루프244 — skip/pass shells MiniMax leaves on the missing pillar.
  'skip',
  'pass',
  '스킵',
  '패스',
  // 루프247 — foo/bar/baz shells MiniMax leaves on the missing pillar.
  // Extra visible text of any topic keeps the card; a lone token is leftover.
  'foo',
  'bar',
  'baz',
  // 루프249 — FIXME/HACK shells MiniMax leaves on the missing pillar.
  'fixme',
  'hack',
  '고쳐야함',
  // 루프257 — etc/misc shells MiniMax leaves on the missing pillar.
  'etcetera',
  '등등',
  '기타',
  'etc',
  // 루프258 — ok/done shells MiniMax leaves on the missing pillar.
  'okay',
  'done',
  '완료',
  'ok',
  // 루프264 — misc compounds. `기타` alone does not match `기타사항`
  // because the remainder is not a leftover token.
  'miscellaneous',
  '기타사항',
  'misc',
  // 루프265 — "the rest" leftover shells. Topic words are never leftover
  // vocabulary; extra visible text of any topic still keeps the card.
  'another',
  'others',
  'other',
  '나머지',
  '여타',
  '그외',
  'rest',
].sort((a, b) => b.length - a.length);

const LEFTOVER_PEER_PLACEHOLDER_PUNCT_RE = /^(?:[.…·•\-–—]{1,3})/u;

function compactLeftoverPeerPlaceholder(text: string): string {
  return visibleText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.…·•\-–—]+/gu, '')
    // 루프211 — `n.a.` / `t.b.d.` keep dots so they miss `na`/`tbd`.
    .replace(/\./g, '');
}

function leftoverPlaceholderTokenLength(compact: string): number | null {
  const punct = LEFTOVER_PEER_PLACEHOLDER_PUNCT_RE.exec(compact);
  if (punct) return punct[0].length;
  const hit = LEFTOVER_PEER_PLACEHOLDER_TOKENS.find((token) => compact.startsWith(token));
  return hit ? hit.length : null;
}

/**
 * A leftover stub card is only leftover when compact text is entirely
 * leftover tokens. Any remaining text of any topic — never a brief-word
 * list such as one lecture term — means the card has real copy and must stay.
 */
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
 * Empty column-number card (code name leftover): the whole card is
 * only a column label (`PILLAR 03`, `기둥 카`, `열네째`). Product
 * slides should not use these as titles. Drop the card. Keep it when
 * a number is followed by real body copy.
 *
 * 루프205 — A third card that is only `PILLAR 03` / `COLUMN 3` / `03`
 * is an empty column-number card, not a pillar. Keep cards that still
 * have extra visible text, and numbered step rows where every peer
 * is an index.
 * 루프209 — same for `PILLAR III` / `기둥 Ⅲ` roman leftovers.
 * 루프212 — `No. 3` / `번호 3` / `포인트 3` index leftovers.
 * 루프217 — `KEY 3` / `테마 3` / `블록 3` index leftovers.
 * 루프219 — circled `③` / fullwidth `３` leftovers.
 * 루프222 — `Phase 3` / `축 3` / `레이어 3` index leftovers.
 * 루프225 — `00` / `PILLAR 0` / `기둥 0` zero-index leftovers.
 * Keep `0%` KPI copy — `%` is not leftover punctuation.
 * 루프226 — circled / fullwidth zero leftovers (`⓪` / `０` / `⓿`).
 * 루프229 — `Module 3` / `트랙 3` / `섹션 3` index leftovers.
 * `UNIT 3` stays because that prefix is not leftover vocabulary.
 * 루프230 — `10` / `PILLAR 10` two-digit leftovers. Keep `10%` KPI copy.
 * 루프237 — letter `C` / `기둥 다` / `(3)` / `3번` leftovers.
 * 루프239 — letter `D` / `기둥 마` / `첫째`/`둘째`/`셋째` leftovers.
 * 루프242 — `Group 3` / `Lane 3` / `행 3` index leftovers.
 * `UNIT 3` stays because that prefix is not leftover vocabulary.
 * 루프248 — `Chapter 3` / `Panel 3` / `장 3` index leftovers.
 * 루프256 — `Lesson 3` / `Lecture 3` / `강 3` index leftovers.
 * `UNIT 3` stays because that prefix is not leftover vocabulary.
 * 루프261 — letter `E` / `기둥 바` / `여섯째` leftovers.
 * 루프266 — letter `G` / `기둥 아` / `열한째` leftovers. Keep `H`–`Z`,
 * `열두째`, `기둥 자`, and leftover-index cards that still have extra text.
 * 루프272 — letter `H` / `기둥 자` / `열두째` leftovers. Keep `J`–`Z`
 * (not roman `I`/`V`/`X`), `열세째`, `기둥 차`, and leftover-index cards
 * that still have extra text.
 * 루프274 — letter `J` / `기둥 차` / `열세째` leftovers. Keep `K`–`Z`
 * (not roman `I`/`V`/`X`), `열네째`, `기둥 카`, and leftover-index cards
 * that still have extra text.
 * 루프278 — drop empty column-number cards titled only `K` /
 * `기둥 카` / `열네째`. Keep real copy after a number (`열네째 실카피`),
 * KPI/unit titles (`10%`, `UNIT 3`), and titles not yet treated as
 * column numbers: `기둥 L`, `기둥 타`, `스무 번째`.
 * 루프285 — drop empty column-number cards titled only `L` /
 * `기둥 타` / `열다섯째`. Keep `기둥 M`, `기둥 파`, `스무 번째`,
 * and number+body (`열다섯째 실카피`).
 * 루프286 — drop empty column-number cards titled only `M` /
 * `기둥 파` / `열여섯째`. Keep `기둥 N`, `기둥 하`, `스무 번째`,
 * and number+body (`열여섯째 실카피`).
 * 루프288 — drop empty column-number cards titled only `N` /
 * `기둥 하` / `열일곱째`. Keep `기둥 O`, `스무 번째`, and
 * number+body (`열일곱째 실카피`). Hangul column letters end at `하`.
 * 루프291 — drop empty column-number cards titled only `O` /
 * `열여덟째`. Keep `기둥 P`, `스무 번째`, and number+body
 * (`열여덟째 실카피`).
 * 루프322 — drop empty column-number cards titled only `P` /
 * `열아홉째`. Keep `기둥 Q`, `스무 번째`, and number+body
 * (`열아홉째 실카피`).
 * 루프324 — drop empty column-number cards titled only `Q`.
 * Keep `기둥 R`, `스무 번째`, and number+body (`기둥 Q 실카피`).
 * Hangul column letters still end at `하`.
 * 루프325 — drop empty column-number cards titled only `스무째`.
 * Keep spaced `스무 번째`, `기둥 R`, and number+body (`스무째 실카피`).
 * 루프326 — drop empty column-number cards titled only `R`.
 * Keep `기둥 S`, spaced `스무 번째`, and number+body (`기둥 R 실카피`).
 * 루프327 — drop empty column-number cards titled only `S`.
 * Keep `기둥 T`, spaced `스무 번째`, and number+body (`기둥 S 실카피`).
 * 루프336 — drop empty column-number cards titled only `T`.
 * Keep `기둥 U`, spaced `스무 번째`, and number+body (`기둥 T 실카피`).
 * 루프337 — drop empty column-number cards titled only `U`.
 * Keep `기둥 W` (skip roman `V`), spaced `스무 번째`, and number+body
 * (`기둥 U 실카피`).
 * 루프338 — drop empty column-number cards titled only `W`.
 * Keep `기둥 Y` (skip roman `X`), spaced `스무 번째`, and number+body
 * (`기둥 W 실카피`).
 * 루프339 — drop empty column-number cards titled only `Y`.
 * Keep `기둥 Z` (skip roman `X`), spaced `스무 번째`, and number+body
 * (`기둥 Y 실카피`).
 * 루프351 — drop empty column-number cards titled only `Z`.
 * Keep spaced `스무 번째` and number+body (`기둥 Z 실카피`).
 * 루프355 — drop empty column-number cards titled only spaced
 * `스무 번째`. Keep number+body (`스무 번째 실카피`). Letter/ordinal
 * leftover titles A–Z / 가…하 / 첫째…스무 번째는 여기서 닫힘.
 * These tokens are model-emitted column
 * numbers, not product copy.
 */
const LEFTOVER_INDEX_ROMAN =
  '(?:viii|vii|iii|xii|xi|ix|iv|vi|ii|[xv]|i|[Ⅰ-Ⅻⅰ-ⅻ])';
/** 루프219/226 — circled / dingbat / fullwidth 0–9 leftover indexes. */
const LEFTOVER_INDEX_MARK = '[⓪①-⑨❶-❾⓿０-９⑴-⑼㉠-㉥]';
/** 루프225/230 — 0 / 00 / 01–09 / 10 leftover shells. */
const LEFTOVER_INDEX_DIGIT = '(?:0?[0-9]|10)';
/** Latin A–U + W + Y + Z / 가…하. Not roman I/V/X. */
const LEFTOVER_INDEX_LETTER = '(?:[a-uwyz]|[가나다라마바사아자차카타파하])';
/** 첫째…스무째 / spaced `스무 번째` empty ordinal titles. Keep number+body. */
const LEFTOVER_INDEX_ORDINAL = '(?:스무|열아홉|열여덟|열일곱|열여섯|열다섯|열네|열세|열두|열한|첫|둘|셋|넷|다섯|여섯|일곱|여덟|아홉|열)\\s*(?:째|번째)';
const LEFTOVER_INDEX_CORE =
  `(?:${LEFTOVER_INDEX_DIGIT}|${LEFTOVER_INDEX_ROMAN}|${LEFTOVER_INDEX_MARK}|${LEFTOVER_INDEX_LETTER}|${LEFTOVER_INDEX_ORDINAL})`;
const LEFTOVER_INDEX_SUFFIX = '(?:\\s*(?:번|번째|st|nd|rd|th))?';
const LEFTOVER_INDEX_PREFIX =
  '(?:pillar|column|col|card|item|step|part|key|theme|block|slot|phase|axis|layer|module|track|section|group|lane|row|chapter|cluster|panel|lesson|lecture|no\\.?|num(?:ber)?|#|기둥|열|카드|항목|단계|파트|번호|넘버|포인트|키|테마|블록|슬롯|페이즈|축|레이어|모듈|트랙|섹션|그룹|레인|행|장|클러스터|패널|강|회|레슨)';

function textLooksLikeLeftoverIndexLabel(html: string): boolean {
  const text = visibleText(html).replace(/\s+/g, ' ').trim();
  if (!text) return false;
  return new RegExp(
    `^[\\[(\\s]*(?:${LEFTOVER_INDEX_PREFIX}\\s*)?${LEFTOVER_INDEX_CORE}${LEFTOVER_INDEX_SUFFIX}[\\])\\s]*[.\\u2026·•\\-–—]?$`,
    'iu',
  ).test(text);
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

/**
 * 루프335 — MiniMax often fills body copy blocks with `<br><br><br>` only.
 * Detect direct inner block children whose visible text is empty and whose
 * inner is br/whitespace only — treat them as unfilled body slots.
 * 루프343 — empty `<div></div>` / `&nbsp;` body slots are the same
 * leftover. An empty source is empty (not "has no placeholders").
 * 루프344 — empty wrapper tags (`<p></p>`, `<span></span>`,
 * `<p><br></p>`, `<p><span>&nbsp;</span></p>`) collapse across passes.
 * 루프356 — numeric `&nbsp;` (`&#160;` / `&#xA0;`), ZWSP/BOM/soft-hyphen,
 * and empty tags whose attrs still contain spaces (`<font color=red>`)
 * also collapse. Strip empty tags BEFORE collapsing all whitespace so
 * attribute spaces are not glued into the tag name. Media tags keep the
 * slot filled so image cards survive.
 * 루프357 — dash/ellipsis body slots are handled in
 * `chromeBodySlotLooksUnfilled` (not collapsed here) so real copy that
 * mentions "—" mid-sentence stays.
 */
function innerBlockContainsOnlyEmptyPlaceholders(html: string): boolean {
  let source = String(html ?? '');
  if (/<(?:img|svg|video|audio|canvas|iframe|picture|source)\b/i.test(source)) return false;
  let previous = '';
  while (source !== previous) {
    previous = source;
    source = source
      .replace(/<br\s*\/?>/gi, '')
      .replace(/&nbsp;/gi, '')
      .replace(/&#0*160;/gi, '')
      .replace(/&#x0*a0;/gi, '')
      .replace(/[\u00a0\u200b\u200c\u200d\u2060\ufeff\u00ad]/g, '')
      .replace(/>\s+</g, '><')
      .replace(/^\s+|\s+$/g, '')
      .replace(/<([a-z][\w-]*)\b[^>]*><\/\1>/gi, '');
  }
  return source.replace(/\s+/g, '') === '';
}

/**
 * 루프357 — Chrome body under a real label is often only `—` / `...` /
 * `&mdash;`. Whole-card leftover peer drop cannot see that because the
 * label adds substance. Count dash/ellipsis-only slots as unfilled.
 * 루프358 — Non-first body slots that are leftover tokens only (`TBD`,
 * `n/a`) are unfilled too. First slot stays label-safe so `TBD` + real
 * copy is kept.
 */
function chromeBodySlotLooksUnfilled(
  inner: string,
  opts: { allowLeftoverTokens?: boolean } = {},
): boolean {
  if (/<(?:img|svg|video|audio|canvas|iframe|picture|source)\b/i.test(inner)) return false;
  if (visibleText(inner).length === 0) {
    return innerBlockContainsOnlyEmptyPlaceholders(inner);
  }
  const compact = compactLeftoverPeerPlaceholder(inner);
  if (!compact) return true;
  const punct = LEFTOVER_PEER_PLACEHOLDER_PUNCT_RE.exec(compact);
  if (punct && punct[0].length === compact.length) return true;
  if (opts.allowLeftoverTokens) {
    return leftoverPlaceholderTokenCount(compact) != null;
  }
  return false;
}

/**
 * Body slots inside a chrome card — block children plus empty headings.
 * Headings are not in GRID_BLOCK_CHILD_RE (a grid-level h2 must not count
 * as a card column), but MiniMax often leaves `<h3></h3>` as the only
 * “body” under a chrome label.
 */
function listChromeCardBodySlots(
  html: string,
  innerStart: number,
  innerEnd: number,
): DirectChildSpan[] {
  const blocks = listDirectBlockChildSpans(html, innerStart, innerEnd);
  const headingOpens = listDirectBlockChildOpensWithExtra(
    html,
    innerStart,
    innerEnd,
    /^(?:h[1-6])$/i,
  );
  if (headingOpens.length === 0) return blocks;
  const spans: DirectChildSpan[] = [...blocks];
  for (const open of headingOpens) {
    const tag = tagNameFromOpen(open.open);
    if (!tag) continue;
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
  spans.sort((a, b) => a.absStart - b.absStart);
  return spans;
}

function listDirectBlockChildOpensWithExtra(
  html: string,
  innerStart: number,
  innerEnd: number,
  extraTagRe: RegExp,
): Array<{ open: string; absStart: number; absEnd: number; style: string; attrs: string }> {
  const opens: Array<{ open: string; absStart: number; absEnd: number; style: string; attrs: string }> = [];
  let i = innerStart;
  let depth = 0;
  while (i < innerEnd) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? innerEnd : Math.min(innerEnd, end + 3);
      continue;
    }
    const opaque = /^<(script|style)\b[^>]*>/i.exec(html.slice(i, innerEnd));
    if (opaque) {
      const tag = opaque[1]!;
      const close = new RegExp(`</${tag}\\s*>`, 'i').exec(html.slice(i, innerEnd));
      i = close ? i + close.index + close[0].length : innerEnd;
      continue;
    }
    const closeM = /^<\/([a-zA-Z][\w-]*)\s*>/i.exec(html.slice(i, innerEnd));
    if (closeM) {
      if (depth > 0) depth -= 1;
      i += closeM[0].length;
      continue;
    }
    const openM = /^<([a-zA-Z][\w-]*)(\b[^>]*)>/i.exec(html.slice(i, innerEnd));
    if (openM) {
      const tagName = (openM[1] ?? '').toLowerCase();
      const attrs = openM[2] ?? '';
      const open = openM[0]!;
      const selfClose = /\/\s*>$/.test(open) || HTML_VOID_ELEMENTS.has(tagName);
      if (depth === 0 && extraTagRe.test(tagName)) {
        opens.push({
          open,
          absStart: i,
          absEnd: i + open.length,
          style: extractInlineStyle(attrs),
          attrs,
        });
      }
      if (!selfClose) depth += 1;
      i += open.length;
      continue;
    }
    i += 1;
  }
  return opens;
}

function chromeCardBodyLooksUnfilled(
  html: string,
  child: DirectChildSpan,
): boolean {
  const innerRaw = html.slice(child.absEnd, child.absEnd + child.inner.length);
  // 루프335 — 스캐너가 `<br>` 을 open 으로 취급해 depth 가 흐려지지
  // 않도록 로컬에서 self-close 로 재작성해 자식 탐색을 안정화한다.
  const stripped = innerRaw.replace(/<br\b([^/>]*)>/gi, '<br$1/>');
  const stitched = `${html.slice(0, child.absEnd)}${stripped}${html.slice(child.absEnd + innerRaw.length)}`;
  // 루프356 — empty `<h3></h3>` body under a chrome label (headings are
  // not GRID_BLOCK_CHILD_RE so grid column counts stay intact).
  // 루프357 — dash / ellipsis-only body slots.
  // 루프358 — leftover-token body slots after the first (label-safe).
  // Drop only when every non-label body slot is unfilled — a middle stub
  // must not delete a later real-copy sibling (Bugbot 루프356–358).
  const slots = listChromeCardBodySlots(stitched, child.absEnd, child.absEnd + stripped.length)
    .filter((slot) => slot.tag !== 'br');
  if (slots.length < 1) return false;
  if (slots.length === 1) {
    return chromeBodySlotLooksUnfilled(slots[0]!.inner, { allowLeftoverTokens: true });
  }
  const bodySlots = slots.slice(1);
  return bodySlots.every((slot) =>
    chromeBodySlotLooksUnfilled(slot.inner, { allowLeftoverTokens: true }),
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
 * Loop 191 then gives that empty shell `flex:1`, which paints the leftover
 * blank band. Remove empty cardish peers only; never invent topic copy.
 * Hangul/brief-gated so official English catalogs stay intact.
 */
export function dropEmptyLeftoverPeerCardsInAllocatedRows(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
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
/** 루프240 — 400 vs 600 (1.5) still shares the row; 280 vs 900 sidebar stays. */
const PEER_FIXED_MAIN_SIZE_RATIO = 1.6;
/** 루프262 — 3+ peers: 400 vs 800 (2.0) is leftover. 2-card 400/800 split stays. */
const PEER_FIXED_MAIN_SIZE_TRIPLE_RATIO = 2.05;
/** 루프207 — 3-col leftover `%` shares (skip 100% stretch and 50% splits). */
const PEER_COLUMN_SHARE_PERCENT_MIN = 22;
const PEER_COLUMN_SHARE_PERCENT_MAX = 48;
const PEER_CANVAS_PX = 1920;

function cssLengthToPx(raw: string): number | null {
  const source = unwrapShareValue(String(raw ?? '').trim()) ?? String(raw ?? '').trim();
  const percent = /^(\d+(?:\.\d+)?)\s*%$/i.exec(source);
  if (percent) {
    const value = Number.parseFloat(percent[1] ?? '');
    if (!Number.isFinite(value)) return null;
    if (value < PEER_COLUMN_SHARE_PERCENT_MIN || value > PEER_COLUMN_SHARE_PERCENT_MAX) {
      return null;
    }
    return (PEER_CANVAS_PX * value) / 100;
  }
  // 루프213/238 — MiniMax locks cards with 30vw/30vh/30vmin as if the
  // canvas were the viewport. Same 22–48 band as % / vw; 50/100 stay.
  const viewport = /^(\d+(?:\.\d+)?)\s*(vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)$/i
    .exec(source);
  if (viewport) {
    const value = Number.parseFloat(viewport[1] ?? '');
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
  // 루프313 — MiniMax leftover often locks via `-webkit-flex` only.
  const decl = /(?:^|;)\s*(?:-webkit-flex|-moz-flex|flex)\s*:\s*([^;]+)/i.exec(style);
  if (!decl) return null;
  const raw = String(decl[1] ?? '').trim();
  if (/^0\s+0\s+/i.test(raw) || /^none\b/i.test(raw)) {
    // `%` is not a word char, so `\b` after it fails at end-of-decl (`33%`).
    const length = /(\d+(?:\.\d+)?)\s*(px|rem|em|ch|%|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw|dvmin|svmin|lvmin|dvmax|svmax|lvmax|vi|vb|svi|svb|lvi|lvb|dvi|dvb|cqw|cqi|cqh|cqb|cqmin|cqmax)/i
      .exec(raw);
    if (!length) return null;
    return cssLengthToPx(`${length[1]}${length[2]}`);
  }
  // 루프302 — `flex:1 1 33%` / `flex:1 1 calc(33%)` leftover basis.
  const growShare = /^(?:1(?:\.0+)?)\s+(?:1(?:\.0+)?|0)\s+(.+)$/i.exec(raw);
  if (growShare) return cssLengthToPx((growShare[1] ?? '').trim());
  // 루프304 — `flex:0 1 33%` / `flex:0 1 calc(33%)` leftover basis.
  const shrinkShare = /^0\s+(?:1(?:\.0+)?)\s+(.+)$/i.exec(raw);
  if (shrinkShare) return cssLengthToPx((shrinkShare[1] ?? '').trim());
  // 루프308 — `flex:2 1 33%` / `flex:3 2 calc(33%)` leftover basis.
  const anyShare = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(.+)$/i.exec(raw);
  if (anyShare) return cssLengthToPx((anyShare[3] ?? '').trim());
  // 루프305 — `flex:33%` / `flex:calc(33%)` one-value basis (= 1 1 <share>).
  const lone = splitCssGridTracks(raw);
  if (lone.length === 1) return cssLengthToPx(lone[0]!);
  return null;
}

function peerFixedMainSizePx(style: string): number | null {
  // 루프290 — logical size locks (`inline-size` / `max-inline-size`) clip
  // the same way as width/max-width leftover pillars.
  for (const prop of [
    'width',
    'flex-basis',
    '-webkit-flex-basis',
    'min-width',
    'max-width',
    'inline-size',
    'min-inline-size',
    'max-inline-size',
  ]) {
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
  if (max <= min * PEER_FIXED_MAIN_SIZE_RATIO) return true;
  // 루프262 — MiniMax dodges 1.6 with 400 vs 800 on a 3-card leftover row.
  // Two-card 400/800 sidebar stays.
  return styles.length >= 3 && max <= min * PEER_FIXED_MAIN_SIZE_TRIPLE_RATIO;
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
    .replace(/(?:^|;)\s*inline-size\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*min-inline-size\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*max-inline-size\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*(?:-webkit-)?flex-basis\s*:[^;]*/gi, '')
    .replace(/(?:^|;)\s*(?:-webkit-flex|-moz-flex|flex)\s*:\s*(?:0\s+0|none)\s+[^;]*/gi, '')
    .replace(/(?:^|;)\s*(?:-webkit-flex|-moz-flex|flex)\s*:\s*1(?:\.0+)?\s+(?:1(?:\.0+)?|0)\s+[^;]*/gi, ';flex:1 1 0')
    .replace(/(?:^|;)\s*(?:-webkit-flex|-moz-flex|flex)\s*:\s*0\s+1(?:\.0+)?\s+[^;]*/gi, ';flex:1 1 0')
    .replace(/(?:^|;)\s*(?:-webkit-flex|-moz-flex|flex)\s*:\s*\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+[^;]*/gi, ';flex:1 1 0')
    .replace(/(?:^|;)\s*(?:-webkit-flex|-moz-flex|flex)\s*:\s*([^;]+)/gi, (full, value) => {
      const tokens = splitCssGridTracks(String(value ?? '').trim());
      if (tokens.length === 1 && cssLengthToPx(tokens[0]!) != null) return ';flex:1 1 0';
      return full;
    })
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
 * (or 280 vs 900) stays. 루프240 — MiniMax dodges 1.35 with 400 vs 600
 * max-width; treat ≤1.6 as the same leftover lock. 루프262 — 3+ peers
 * also treat ≤2.05 (400 vs 800) as leftover; 2-card splits stay.
 * Hangul/brief-gated. Never invent missing cards.
 * 루프201 — max-width / flex:0 0 still cap the row after 198 width strip.
 * 루프207 — uniform 22–48% column-share widths (and flex:0 0 32%) also lock
 * the row. 100% stretch and 50% splits stay.
 * 루프213 — same for 22–48vw leftovers (`width:30vw`, `flex:0 0 30vw`).
 * 루프238 — same for vh/vmin/cq* leftovers (`width:30vmin`, `33vh 33vh 33vh`).
 * 루프245 — same for dynamic/large/small viewport width leftovers
 * (`width:30lvw`, `33dvw 33dvw 33dvw`).
 * 루프246 — same for container min/max leftovers
 * (`width:30cqmax`, `33cqmin 33cqmin 33cqmin`).
 * 루프250 — same for dynamic viewport min/max leftovers
 * (`width:30svmin`, `33dvmin 33dvmin 33dvmin`).
 * 루프251 — same for logical viewport leftovers
 * (`width:30vb`, `33vi 33vi 33vi`).
 * 루프290 — same for logical size leftovers
 * (`max-inline-size:560px`, `inline-size:30vw`).
 * 루프296 — same for `calc(33%)` / `calc(100%/3)` leftover shares.
 * 루프302 — same for `flex:1 1 33%` / `flex:1 1 calc(33%)` leftover basis.
 * 루프304 — same for `flex:0 1 33%` / `flex:0 1 calc(33%)`.
 * 루프305 — same for one-value `flex:33%` / `flex:calc(33%)`.
 * 루프308 — same for `flex:2 1 33%` / `flex:3 2 calc(33%)`.
 * 루프312 — same for gap-adjusted `calc(33% - 16px)` / `calc((100% - 48px)/3)`.
 * 루프313 — same for `-webkit-flex` / `-moz-flex` leftover shorthand.
 */
export function relaxUniformPeerCardFixedMainSize(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
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
 * 루프204 / 루프252 — Same leftover as 191, but the flex row lives on a class
 * rule (`.cards { display:flex }`) with no inline display. 191 never sees it.
 * AI-shaped decks only (Hangul/brief/markers). Skip inline-flex rows (191)
 * and flex columns.
 */
export function balanceClassBoundFlexCardRow(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
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
  if (CARDISH_CLASS_RE.test(classAttrValue(attrs))) return true;
  // 루프349 — MiniMax retro win-body cards often have no class token but
  // share the same padded chrome inline style as grid cards. Treat them as
  // cardish so loop194 inserts sibling closes before the next card opens.
  return looksLikeChromeCardStyle(extractInlineStyle(attrs));
}

function isFlexColumnContainerStyle(style: string): boolean {
  if (!/(?:^|;)\s*display\s*:\s*(?:inline-)?flex\b/i.test(style)) return false;
  if (/(?:^|;)\s*flex-direction\s*:\s*row(?:-reverse)?\b/i.test(style)) return false;
  return true;
}

function looksLikeMainContentGrid(style: string): boolean {
  if (!/(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(style)) return false;
  if (/(?:^|;)\s*flex\s*:\s*1\b/i.test(style)) return true;
  return /grid-template-columns\s*:/i.test(style);
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
      if (idx < 0) {
        // 루프287 — orphan close with no matching open in this slide
        // fragment. MiniMax nested-card soup often emits extra `</div>`
        // that then close the slide flow / section host.
        i += closeM[0]!.length;
        continue;
      }
      stack.length = idx;
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

/**
 * 루프270 — Flatten `<div class="card"><div class="card">…</div>…</div>`
 * emitted by MiniMax fill.
 *
 * Loop194 splits the two opens into peer siblings, which pushes the outer
 * card's own body (formula / caption / note) out of the card. Loop199 only
 * unwraps a fully-empty outer with exactly one child. The wild case in
 * slide 4 / 5 has: outer text = "" between the two opens, but the outer
 * ALSO contains formula/caption divs AFTER the inner closes. Neither loop
 * 194 nor 199 covers it.
 *
 * Rule: when two consecutive `<div>` opens share an exact cardish token
 * (`card`, `pillar`, `tile`, `panel`, `cell`, `box`, `metric`, `stat`,
 * `kpi`) and only whitespace sits between them, strip the INNER open and
 * its matching close. Content between the inner close and the outer close
 * (formula / caption / note) is preserved and now sits inside the outer
 * flat card. Motif-only decorative shells are skipped.
 */
function findOpenedTagCloseEnd(
  source: string,
  tag: string,
  afterOpen: number,
): number | null {
  const openRe = new RegExp(`^<${tag}\\b[^>]*>`, 'i');
  const closeRe = new RegExp(`^</${tag}\\s*>`, 'i');
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
      const opaqueTag = opaque[1]!;
      const close = new RegExp(`</${opaqueTag}\\s*>`, 'i').exec(source.slice(i));
      i = close ? i + close.index + close[0].length : source.length;
      continue;
    }
    const closeM = closeRe.exec(source.slice(i));
    if (closeM) {
      depth -= 1;
      i += closeM[0].length;
      continue;
    }
    const openM = openRe.exec(source.slice(i));
    if (openM) {
      if (!/\/\s*>$/.test(openM[0]!)) depth += 1;
      i += openM[0]!.length;
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

function compactInlineStyle(style: string): string {
  return String(style ?? '').replace(/\s+/g, '').toLowerCase();
}

/**
 * 루프293 — class 없는 MiniMax 카드. padding + (background|border) 크롬.
 * `position:absolute` 풋터·라벨은 카드가 아니다.
 */
function looksLikeChromeCardStyle(style: string): boolean {
  const compact = compactInlineStyle(style);
  if (!compact) return false;
  if (/(?:^|;)position:absolute(?:;|$)/.test(compact)) return false;
  // 루프381 — Inline-block pills / badges are NOT layout cards. MiniMax
  // pill labels (`background:#F7CB46;border:3px solid #000;display:inline-
  // block;padding:4px 14px`) share the same padding + background + border
  // triple as chrome cards, so they were flagged cardish and
  // `closeUnclosedSiblingCardsInSlides` would close a preceding chrome
  // shell whenever a pill opened inside it — orphaning the shell's real
  // content. Real cards flow as block/flex/grid children, never inline.
  if (/(?:^|;)display:inline(?:-block|-flex|-grid)?(?:;|$)/.test(compact)) return false;
  const hasPad = /(?:^|;)padding(?:-?(?:block|inline|top|right|bottom|left))?:/.test(compact);
  const hasBg = /(?:^|;)background(?:-color)?:(?!transparent|none|inherit|initial|unset)/.test(
    compact,
  );
  const hasBorder = /(?:^|;)border(?:-?(?:width|color|style))?:(?!none|0(?:px|em|rem)?(?:;|$))/
    .test(compact);
  return hasPad && (hasBg || hasBorder);
}

function sameChromeCardStyle(a: string, b: string): boolean {
  if (!looksLikeChromeCardStyle(a) || !looksLikeChromeCardStyle(b)) return false;
  return compactInlineStyle(a) === compactInlineStyle(b);
}

function nestedCardOpensMatch(
  outerAttrs: string,
  innerAttrs: string,
): boolean {
  const outerTokens = exactCardishTokens(outerAttrs);
  const innerTokens = exactCardishTokens(innerAttrs);
  if (outerTokens.length > 0) {
    return innerTokens.some((token) => outerTokens.includes(token));
  }
  return sameChromeCardStyle(
    extractInlineStyle(outerAttrs),
    extractInlineStyle(innerAttrs),
  );
}

export function flattenNestedDuplicateCardOpens(html: string): string {
  const source = String(html ?? '');
  if (!source || !/<(?:div|section|article|aside)\b/i.test(source)) return source;
  // 루프277 — MiniMax also nests `<section|article|aside class="card">` the
  // same way as `<div class="card">`. Same-tag flatten only (cross-tag stays
  // for unwrapRedundantNestedPeerCards).
  // 루프293 — class 없이 같은 inline 크롬을 한 번 더 연 TAN 카드도 동일.
  const openRe = /<(div|section|article|aside)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  type Patch = { start: number; end: number };
  const patches: Patch[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(source)) !== null) {
    const tag = (match[1] ?? 'div').toLowerCase();
    const outerAttrs = match[2] ?? '';
    if (/\bdata-od-official-motif-html\b/i.test(outerAttrs)) continue;
    if (
      exactCardishTokens(outerAttrs).length === 0
      && !looksLikeChromeCardStyle(extractInlineStyle(outerAttrs))
    ) {
      continue;
    }
    const outerOpenEnd = match.index + match[0].length;
    let i = outerOpenEnd;
    while (i < source.length && /\s/.test(source[i]!)) i += 1;
    const innerOpen = new RegExp(
      `^<${tag}\\b((?:[^>"']|"[^"]*"|'[^']*')*)>`,
      'i',
    ).exec(source.slice(i));
    if (!innerOpen) continue;
    const innerAttrs = innerOpen[1] ?? '';
    if (/\bdata-od-official-motif-html\b/i.test(innerAttrs)) continue;
    if (!nestedCardOpensMatch(outerAttrs, innerAttrs)) continue;
    const innerOpenStart = i;
    const innerOpenEnd = i + innerOpen[0].length;
    const innerCloseEnd = findOpenedTagCloseEnd(source, tag, innerOpenEnd);
    if (innerCloseEnd == null) continue;
    const closeMatch = source.slice(0, innerCloseEnd).match(new RegExp(`</${tag}\\s*>$`, 'i'));
    if (!closeMatch) continue;
    const innerCloseStart = innerCloseEnd - closeMatch[0].length;
    patches.push({ start: innerOpenStart, end: innerOpenEnd });
    patches.push({ start: innerCloseStart, end: innerCloseEnd });
  }
  if (patches.length === 0) return source;
  patches.sort((a, b) => b.start - a.start);
  let out = source;
  for (const patch of patches) {
    out = `${out.slice(0, patch.start)}${out.slice(patch.end)}`;
  }
  return out;
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
 * double padding / nested chrome (the leftover 4/5 residual after close).
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
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  if (!/<div\b/i.test(out)) return out;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = unwrapRedundantNestedPeerCardsOnce(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

const SPILLED_CHROME_LABEL_MAX = 48;
const SPILLED_BODY_MIN = 4;
const SPILLED_BODY_MAX = 320;
/** 루프346 — pricing cards can spill title + price + list (3+) after early close. */
const SPILLED_SIBLING_MAX = 4;

function looksLikeSpilledCardBody(child: DirectChildSpan): boolean {
  if (child.tag === 'ul' || child.tag === 'ol') {
    const text = visibleText(child.inner);
    return text.length >= SPILLED_BODY_MIN && text.length <= SPILLED_BODY_MAX;
  }
  if (child.tag !== 'div') return false;
  if (exactCardishTokens(child.attrs).length > 0) return false;
  if (looksLikeChromeCardStyle(child.style)) return false;
  if (/(?:^|;)\s*display\s*:\s*(?:inline-)?(?:grid|flex)\b/i.test(child.style)) return false;
  if (/(?:^|;)\s*position\s*:\s*absolute\b/i.test(child.style)) return false;
  if (/(?:^|;)\s*width\s*:\s*100%/i.test(child.style)) return false;
  const text = visibleText(child.inner);
  return text.length >= SPILLED_BODY_MIN && text.length <= SPILLED_BODY_MAX;
}

function rowAllowsSpilledChromeAbsorb(
  style: string,
  children: DirectChildSpan[],
): boolean {
  const colsRaw = /grid-template-columns\s*:\s*([^;]+)/i.exec(style)?.[1];
  if (/(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(style) && colsRaw) {
    const decl = parseDeclaredEqualColumns(colsRaw.trim());
    return Boolean(decl && decl.count >= 2 && children.length > decl.count);
  }
  if (!isFlexRowContainerStyle(style)) return false;
  if (children.some((child) => styleLooksLikeFixedSidebar(child.style))) return false;
  const chromeCount = children.filter((child) => looksLikeChromeCardStyle(child.style)).length;
  // 루프294 — 크롬 카드가 2개 미만이면 라벨+본문 2열 스플릿으로 본다.
  return chromeCount >= 2 && children.length > chromeCount;
}

/**
 * 루프293 — class 없는 크롬 카드가 라벨만 닫히고 제목·본문이 그리드
 * 형제로 새면, shrink가 그 조각을 열로 승격한다. 선언 열보다 자식이
 * 많을 때만 라벨 카드(≤48자) 뒤에 오는 맨몸 조각(1–2개)을 카드 안으로
 * 되돌린다.
 * 루프294 — 같은 조기 close를 `display:flex` 카드 행에도 적용. 크롬
 * 카드가 2개 이상일 때만 (2열 스플릿·사이드바 유지).
 * 루프298 — inline display 없이 `.cards { display:flex }` /
 * `.grid { grid-template-columns:repeat(3,1fr) }` 클래스 바인딩도 동일.
 * 루프307 — `display:inline-grid` 행도 동일 (`display:grid`만 보면 놓침).
 * 카피 발명 없음.
 */
export function absorbSpilledChromeCardSiblings(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const flexNames = collectClassFlexRowNames(out);
  const gridDecls = collectClassEqualTrackDecls(out);
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    const tokens = classTokensFromAttrs(attrs);
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + openTag.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildSpans(out, openEnd, close.closeStart);
    let allow = rowAllowsSpilledChromeAbsorb(style, children);
    if (!allow) {
      const flexBound = tokens.some((token) => flexNames.has(token));
      let gridCols: EqualColumnDecl | undefined;
      for (const token of tokens) {
        const hit = gridDecls.get(token)?.cols;
        if (hit) {
          gridCols = hit;
          break;
        }
      }
      if (flexBound) {
        allow = rowAllowsSpilledChromeAbsorb('display:flex', children);
      } else if (gridCols && children.length > gridCols.count) {
        allow = true;
      }
    }
    if (!allow) continue;
    const absorbed = new Set<DirectChildSpan>();
    const extras = new Map<DirectChildSpan, DirectChildSpan[]>();
    for (let i = 0; i < children.length; i += 1) {
      const host = children[i]!;
      if (absorbed.has(host)) continue;
      if (host.tag !== 'div') continue;
      if (!looksLikeChromeCardStyle(host.style)) continue;
      const hostText = visibleText(host.inner);
      if (hostText.length === 0 || hostText.length > SPILLED_CHROME_LABEL_MAX) continue;
      const spilled: DirectChildSpan[] = [];
      for (let j = i + 1; j < children.length && spilled.length < SPILLED_SIBLING_MAX; j += 1) {
        const next = children[j]!;
        if (!looksLikeSpilledCardBody(next)) break;
        spilled.push(next);
      }
      if (spilled.length === 0) continue;
      extras.set(host, spilled);
      for (const item of spilled) absorbed.add(item);
      i += spilled.length;
    }
    if (extras.size === 0) continue;
    const pieces: string[] = [];
    let cursor = openEnd;
    for (const child of children) {
      pieces.push(out.slice(cursor, child.absStart));
      if (absorbed.has(child)) {
        cursor = child.absCloseEnd;
        continue;
      }
      const extra = extras.get(child);
      if (extra && extra.length > 0) {
        const insert = extra.map((item) => out.slice(item.absStart, item.absCloseEnd)).join('');
        const closeStart = child.absEnd + child.inner.length;
        pieces.push(`${out.slice(child.absStart, closeStart)}${insert}${out.slice(closeStart, child.absCloseEnd)}`);
      } else {
        pieces.push(out.slice(child.absStart, child.absCloseEnd));
      }
      cursor = child.absCloseEnd;
    }
    pieces.push(out.slice(cursor, close.closeStart));
    patches.push({
      start: openEnd,
      end: close.closeStart,
      replacement: pieces.join(''),
    });
  }
  if (patches.length === 0) return out;
  patches.sort((a, b) => b.start - a.start);
  for (const patch of patches) {
    out = `${out.slice(0, patch.start)}${patch.replacement}${out.slice(patch.end)}`;
  }
  return out;
}

const HEADING_TAIL_DUP_MIN = 4;
const HEADING_TAIL_DUP_MAX = 160;
/**
 * 루프331 — MiniMax sometimes repeats the trailing phrase of a heading as
 * bare text right after `</h1..6>` (e.g. `<h2>...AI 파트너,<br>domain</h2>
 * AI 파트너,<br>domain <div>lede...`). Strip the bare tail (text + `<br>`)
 * when it exactly matches a suffix of the heading's inner visible text and
 * is followed by a block-level open. Cover copy · standalone runs stay.
 * 카피 발명 없음.
 */
export function stripDuplicatedHeadingTailAfterClose(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  const headingRe = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const nextBlockRe = /^\s*(?:<\/(?:section|main|article|div)\b|<(?:div|section|article|main|aside|ul|ol|p|h[1-6]|figure|table|blockquote|header|footer|nav)\b|$)/i;
  const patches: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(source)) !== null) {
    const headingText = normalizeVisibleTextForDedup(match[2] ?? '');
    if (headingText.length < HEADING_TAIL_DUP_MIN) continue;
    const tailStart = match.index + match[0].length;
    let cursor = tailStart;
    while (cursor < source.length) {
      const ch = source[cursor]!;
      if (ch === '<') {
        const br = /^<br\s*\/?>/i.exec(source.slice(cursor));
        if (br) {
          cursor += br[0].length;
          continue;
        }
        break;
      }
      cursor += 1;
    }
    if (cursor === tailStart) continue;
    const tailStr = source.slice(tailStart, cursor);
    if (tailStr.length > HEADING_TAIL_DUP_MAX) continue;
    const tailText = normalizeVisibleTextForDedup(tailStr);
    if (tailText.length < HEADING_TAIL_DUP_MIN) continue;
    if (!headingText.endsWith(tailText)) continue;
    if (headingText === tailText) continue;
    const after = source.slice(cursor);
    if (!nextBlockRe.test(after)) continue;
    patches.push({ start: tailStart, end: cursor });
  }
  if (patches.length === 0) return source;
  let out = source;
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${out.slice(p.end)}`;
  }
  return out;
}

const CROSS_GRID_SPILL_BODY_MIN = 4;
const CROSS_GRID_SPILL_BODY_MAX = 200;
/**
 * 루프382 — Max chrome-card orphans to reparent into an empty grid.
 * Cap at 8 so a truly runaway modify-turn cannot chain a full slide of
 * chrome content into a single grid; typical broken decks hit 3–4.
 */
const PULL_ORPHAN_EMPTY_GRID_CARD_CAP = 8;

function looksLikeCrossGridSpillBody(
  html: string,
  child: DirectChildSpan,
): boolean {
  if (child.tag === 'ul' || child.tag === 'ol') {
    const text = visibleText(child.inner);
    return text.length >= CROSS_GRID_SPILL_BODY_MIN
      && text.length <= CROSS_GRID_SPILL_BODY_MAX;
  }
  if (child.tag !== 'div') return false;
  if (exactCardishTokens(child.attrs).length > 0) return false;
  if (looksLikeChromeCardStyle(child.style)) return false;
  if (/(?:^|;)\s*display\s*:\s*(?:inline-)?(?:grid|flex)\b/i.test(child.style)) return false;
  if (/(?:^|;)\s*position\s*:\s*absolute\b/i.test(child.style)) return false;
  const spillText = visibleText(child.inner);
  if (spillText.length < CROSS_GRID_SPILL_BODY_MIN
    || spillText.length > CROSS_GRID_SPILL_BODY_MAX) {
    return false;
  }
  return listDirectBlockChildSpans(html, child.absEnd, child.absEnd + child.inner.length).length === 0;
}

/**
 * 루프345 — MiniMax closes a flex column win-body host after the heading
 * block but leaves the main card grid as the next sibling (Process slide).
 * When a column flex host is immediately followed by a `flex:1` / declared
 * column grid, move that grid inside the host before its close. Footers with
 * `margin-top` stay outside. 카피 발명 없음.
 */
export function absorbOrphanContentGridIntoFlexColumnHost(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const openRe =
    /<(div|section|article|main|aside)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  type Patch = {
    hostCloseStart: number;
    gridStart: number;
    gridEnd: number;
  };
  const patches: Patch[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + match[0].length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildSpans(out, openEnd, close.closeStart);
    for (let i = 0; i < children.length - 1; i += 1) {
      const host = children[i]!;
      const grid = children[i + 1]!;
      if (host.tag !== 'div' || grid.tag !== 'div') continue;
      if (!isFlexColumnContainerStyle(host.style)) continue;
      if (!looksLikeMainContentGrid(grid.style)) continue;
      if (/(?:^|;)\s*margin-top\s*:/i.test(grid.style)) continue;
      patches.push({
        hostCloseStart: host.absEnd + host.inner.length,
        gridStart: grid.absStart,
        gridEnd: grid.absCloseEnd,
      });
      break;
    }
  }
  if (patches.length === 0) return out;
  patches.sort((a, b) => b.gridStart - a.gridStart);
  for (const patch of patches) {
    const gridHtml = out.slice(patch.gridStart, patch.gridEnd);
    out = `${out.slice(0, patch.gridStart)}${out.slice(patch.gridEnd)}`;
    out = `${out.slice(0, patch.hostCloseStart)}${gridHtml}${out.slice(patch.hostCloseStart)}`;
  }
  return out;
}

/**
 * 루프332 — 그리드 안에서 마지막 크롬 카드가 조기 종료되어 본문 조각이
 * 그리드 다음 형제로 새는 경우가 있다. 예:
 *   `<grid> <cardA 3 children> <cardB 3 children> <cardC 2 children> </grid>
 *    <div style="VT323...">본문</div> ...`
 * 그리드 내부 마지막 카드의 직접 블록 자식 수가 앞선 크롬 카드들의 최소값
 * 미만이고, 그리드 바로 다음 형제가 카드 없는 짧은 본문 div면 그 조각을
 * 마지막 카드 안으로 되돌린다. 다른 그리드 · 그림 · 넓은 본문은 유지.
 * 루프347 — `<ul>/<ol>` 짧은 리스트 spill · 2열 로드맵(크롬 2장)도 동일.
 * 루프347 — 최대 3패스 multi-pass.
 * 카피 발명 없음.
 */
function absorbSpilledBodyAcrossGridBoundaryOnce(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const openRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  type Patch = {
    parentStart: number;
    parentEnd: number;
    cardStart: number;
    cardEnd: number;
    spillStart: number;
    spillEnd: number;
    cardCloseStart: number;
    cardCloseEnd: number;
  };
  const patches: Patch[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const parentTag = (match[1] ?? '').toLowerCase();
    const parentOpenEnd = match.index + match[0].length;
    const parentClose = findSameTagClose(out, parentTag, parentOpenEnd);
    if (!parentClose) continue;
    const parentChildren = listDirectBlockChildSpans(out, parentOpenEnd, parentClose.closeStart);
    if (parentChildren.length < 2) continue;
    for (let i = 0; i < parentChildren.length - 1; i += 1) {
      const gridChild = parentChildren[i]!;
      if (gridChild.tag !== 'div') continue;
      const gridStyle = gridChild.style;
      const isInlineGrid = /(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(gridStyle);
      if (!isInlineGrid) continue;
      const gridInnerChildren = listDirectBlockChildSpans(out, gridChild.absEnd, gridChild.absEnd + gridChild.inner.length);
      const chromeChildren = gridInnerChildren.filter((c) => c.tag === 'div' && looksLikeChromeCardStyle(c.style));
      if (chromeChildren.length < 2 || chromeChildren.length > 6) continue;
      const lastChrome = chromeChildren[chromeChildren.length - 1]!;
      const otherChromeSlotCounts = chromeChildren
        .slice(0, -1)
        .map((c) => listDirectBlockChildSpans(out, c.absEnd, c.absEnd + c.inner.length).length);
      if (otherChromeSlotCounts.some((count) => count < 2)) continue;
      const minOther = Math.min(...otherChromeSlotCounts);
      const lastSlots = listDirectBlockChildSpans(out, lastChrome.absEnd, lastChrome.absEnd + lastChrome.inner.length);
      if (lastSlots.length >= minOther) continue;
      const spill = parentChildren[i + 1]!;
      if (!looksLikeCrossGridSpillBody(out, spill)) continue;
      patches.push({
        parentStart: parentOpenEnd,
        parentEnd: parentClose.closeStart,
        cardStart: lastChrome.absStart,
        cardEnd: lastChrome.absCloseEnd,
        spillStart: spill.absStart,
        spillEnd: spill.absCloseEnd,
        cardCloseStart: lastChrome.absEnd + lastChrome.inner.length,
        cardCloseEnd: lastChrome.absCloseEnd,
      });
    }
  }
  if (patches.length === 0) return out;
  patches.sort((a, b) => b.spillStart - a.spillStart);
  for (const patch of patches) {
    const spillHtml = out.slice(patch.spillStart, patch.spillEnd);
    out = `${out.slice(0, patch.spillStart)}${out.slice(patch.spillEnd)}`;
    out = `${out.slice(0, patch.cardCloseStart)}${spillHtml}${out.slice(patch.cardCloseStart)}`;
  }
  return out;
}

export function absorbSpilledBodyAcrossGridBoundary(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  for (let pass = 0; pass < 3; pass += 1) {
    const next = absorbSpilledBodyAcrossGridBoundaryOnce(out, brief);
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * 루프348 — 3열 로드맵 등에서 그리드가 N-1장만 닫고 마지막 카드가 그리드
 * 다음 형제로 남는다. 선언 열 수보다 그리드 안 크롬 카드가 적을 때, 바로
 * 뒤의 크롬 카드 형제( `margin-top` 푸터 제외 )를 그리드 안으로 되돌린다.
 * 카피 발명 없음.
 */
export function pullOrphanChromeCardsIntoPrecedingGrid(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const openRe =
    /<(div|section|article|main|aside)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  type Patch = {
    gridCloseStart: number;
    orphanStart: number;
    orphanEnd: number;
  };
  const patches: Patch[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const parentTag = (match[1] ?? '').toLowerCase();
    const parentOpenEnd = match.index + match[0].length;
    const parentClose = findSameTagClose(out, parentTag, parentOpenEnd);
    if (!parentClose) continue;
    const parentChildren = listDirectBlockChildSpans(out, parentOpenEnd, parentClose.closeStart);
    for (let i = 0; i < parentChildren.length; i += 1) {
      const gridChild = parentChildren[i]!;
      if (gridChild.tag !== 'div') continue;
      const gridStyle = gridChild.style;
      if (!/(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(gridStyle)) continue;
      const colsRaw = /grid-template-columns\s*:\s*([^;]+)/i.exec(gridStyle)?.[1];
      if (!colsRaw) continue;
      const decl = parseDeclaredEqualColumns(colsRaw.trim());
      if (!decl || decl.count < 2) continue;
      const gridInnerChildren = listDirectBlockChildSpans(
        out,
        gridChild.absEnd,
        gridChild.absEnd + gridChild.inner.length,
      );
      const chromeInside = gridInnerChildren.filter(
        (c) => c.tag === 'div' && looksLikeChromeCardStyle(c.style),
      ).length;
      if (chromeInside >= decl.count) continue;
      // 루프382 — When the grid has ZERO chrome cards inside (a
      // modify-turn broken pattern where every card leaked out as a
      // loose sibling), lift the per-row cap to a full-slide cap so
      // all subsequent orphan chrome cards land inside the grid, not
      // just enough to fill one row. Existing chrome siblings inside
      // the grid keep the original per-column cap so authored fills
      // that intentionally left a spare column stay intact.
      const cap = chromeInside === 0
        ? PULL_ORPHAN_EMPTY_GRID_CARD_CAP
        : decl.count - chromeInside;
      let slotsLeft = cap;
      for (let j = i + 1; j < parentChildren.length && slotsLeft > 0; j += 1) {
        const orphan = parentChildren[j]!;
        if (orphan.tag !== 'div') break;
        if (!looksLikeChromeCardStyle(orphan.style)) break;
        if (/(?:^|;)\s*margin-top\s*:/i.test(orphan.style)) break;
        if (/(?:^|;)\s*display\s*:\s*(?:inline-)?(?:grid|flex)\b/i.test(orphan.style)) break;
        const orphanText = visibleText(orphan.inner);
        if (orphanText.length > CROSS_GRID_SPILL_BODY_MAX) break;
        patches.push({
          gridCloseStart: gridChild.absEnd + gridChild.inner.length,
          orphanStart: orphan.absStart,
          orphanEnd: orphan.absCloseEnd,
        });
        slotsLeft -= 1;
      }
    }
  }
  if (patches.length === 0) return out;
  // 루프381 — Prior code used original offsets after each splice. When a grid
  // had multiple orphan siblings and we processed patches tail-first, each
  // insertion at `gridCloseStart` shifted the remaining patches' orphanStart
  // values by +orphanHtml.length (both orphanStart and orphanEnd are AFTER
  // gridCloseStart), which the loop never accounted for. The second orphan
  // then sliced from the wrong offset — mid-tag inside a preceding `<h2>` —
  // and corrupted the HTML. Track the per-grid cumulative insertion shift so
  // the second orphan's slice reflects its position in the mutated string.
  patches.sort((a, b) => b.orphanStart - a.orphanStart);
  const perGridInsertions = new Map<number, number>();
  for (const patch of patches) {
    const shift = perGridInsertions.get(patch.gridCloseStart) ?? 0;
    const orphanStart = patch.orphanStart + shift;
    const orphanEnd = patch.orphanEnd + shift;
    const orphanHtml = out.slice(orphanStart, orphanEnd);
    out = `${out.slice(0, orphanStart)}${out.slice(orphanEnd)}`;
    out = `${out.slice(0, patch.gridCloseStart)}${orphanHtml}${out.slice(patch.gridCloseStart)}`;
    perGridInsertions.set(patch.gridCloseStart, shift + orphanHtml.length);
  }
  return out;
}

const INLINE_TAIL_DUP_MIN_TEXT = 1;
const INLINE_TAIL_DUP_MAX_TEXT = 20;

/**
 * 루프333 — MiniMax sometimes duplicates the trailing emphasis of a sibling
 * as an orphan fragment, e.g.
 *   `<div>...<b>30%</b></div>` `<b>30%</b></div>` `<div>...`
 * Strip the orphan `<b>...</b></div>` when the previous div's visible tail
 * ends with the identical `<b>text</b>` and the duplicate is followed by
 * another block-level open. Handles `<b>`, `<strong>`, `<em>` inline.
 * 카피 발명 없음.
 */
export function stripDuplicatedInlineTailAfterSiblingClose(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  const orphanRe = /<\/div>\s*(<(b|strong|em)\b[^>]*>([^<]+)<\/\2>\s*<\/div>)\s*/gi;
  const patches: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = orphanRe.exec(source)) !== null) {
    const fullFragmentStart = match.index + match[0].indexOf(match[1]!);
    const fullFragmentEnd = fullFragmentStart + match[1]!.length;
    const inlineText = (match[3] ?? '').trim();
    if (inlineText.length < INLINE_TAIL_DUP_MIN_TEXT) continue;
    if (inlineText.length > INLINE_TAIL_DUP_MAX_TEXT) continue;
    const prevSlice = source.slice(0, match.index);
    const prevDivOpen = /<div\b[^>]*>[\s\S]*$/i.exec(prevSlice);
    if (!prevDivOpen) continue;
    const prevOpen = prevDivOpen.index;
    const prevInner = source.slice(prevOpen, match.index);
    const escaped = inlineText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prevTailRe = new RegExp(
      `<(b|strong|em)\\b[^>]*>\\s*${escaped}\\s*<\\/\\1>\\s*$`,
      'i',
    );
    if (!prevTailRe.test(prevInner)) continue;
    const after = source.slice(fullFragmentEnd);
    if (!/^\s*<(?:div|section|article|main|aside|ul|ol|p|h[1-6]|figure|table|blockquote|header|footer|nav|\/(?:div|section|main|article))\b/i.test(after)) continue;
    patches.push({ start: fullFragmentStart, end: fullFragmentEnd });
  }
  if (patches.length === 0) return source;
  patches.sort((a, b) => b.start - a.start);
  let out = source;
  for (const patch of patches) {
    out = `${out.slice(0, patch.start)}${out.slice(patch.end)}`;
  }
  return out;
}

/**
 * 루프334 — MiniMax 실패 시 4개 크롬 카드 전체 본문이 `<br><br><br>` 만
 * 남는다(예: Tech Stack). 라벨은 유지하지만 본문은 텅 빈 상태. 카드
 * 그리드의 모든 크롬 카드가 본문 슬롯이 완전히 비면 그 그리드만 제거
 * (슬라이드의 제목·꼬리 카피는 유지). 다른 카드가 하나라도 채워졌으면
 * 유지. 카피 발명 없음.
 * 루프340 — 같은 실패가 `display:flex` 행에도 남음. inline flex 행도
 * 동일 조건으로 제거. `flex-direction:column` · 혼합 비크롬 자식 유지.
 * 루프341 — `.cards { display:flex }` / `.grid { … }` class-bound 행도
 * 동일. 영문 empty-brief 카탈로그는 AI gate로 유지.
 * 루프342 — 한 장이라도 본문이 있으면 그리드 전체를 유지하던 잔여.
 * 채워진 크롬 카드는 두고, `<br>`-only 본문 슬롯인 형제만 제거.
 * 루프343 — 빈 `<div></div>` / `&nbsp;` 본문 슬롯도 동일.
 * 루프344 — 빈 `<p>` / `<span>` 래퍼 본문 슬롯도 동일.
 * `flex-direction:column` · 영문 empty-brief 카탈로그 유지.
 * 루프352 — 전체 행 drop은 여전히 크롬-only. 혼합 비크롬 행은 342가
 * 빈 크롬만 제거한다.
 * 루프356 — `&#160;` / ZWSP / 속성 공백 있는 empty tag / empty heading.
 */
export function dropChromeCardGridsWithAllEmptyBodies(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const flexNames = collectClassFlexRowNames(out);
  const gridDecls = collectClassEqualTrackDecls(out);
  const openRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const removals: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    const tokens = classTokensFromAttrs(attrs);
    const classBound = tokens.some((token) => flexNames.has(token) || gridDecls.get(token)?.cols);
    const isGrid = /(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(style);
    const isFlexRow = isFlexRowContainerStyle(style);
    if (!isGrid && !isFlexRow && !classBound) continue;
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + match[0].length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildSpans(out, openEnd, close.closeStart);
    if (children.length < 2 || children.length > 6) continue;
    const chromeChildren = children.filter((c) => c.tag === 'div' && looksLikeChromeCardStyle(c.style));
    if (chromeChildren.length !== children.length) continue;
    if (!chromeChildren.every((c) => chromeCardBodyLooksUnfilled(out, c))) continue;
    const closeTok = out.slice(close.closeStart).match(new RegExp(`^</${tag}\\s*>`, 'i'));
    const removalEnd = close.closeStart + (closeTok?.[0].length ?? 0);
    removals.push({ start: match.index, end: removalEnd });
    openRe.lastIndex = removalEnd;
  }
  if (removals.length === 0) return out;
  removals.sort((a, b) => b.start - a.start);
  for (const removal of removals) {
    out = `${out.slice(0, removal.start)}${out.slice(removal.end)}`;
  }
  return out;
}

function childLooksLikeChromeCard(child: DirectChildSpan): boolean {
  return child.tag === 'div' && looksLikeChromeCardStyle(child.style);
}

/**
 * True when an allocated-row peer can keep the row after empty chrome
 * drops. Chrome cards use the 343/344 unfilled-body walk. Non-chrome
 * peers (`.card`, `<ul>`, title chips) count as filled when they have
 * visible copy or media (루프352).
 */
function allocatedRowPeerLooksFilled(html: string, child: DirectChildSpan): boolean {
  if (childLooksLikeChromeCard(child)) {
    return !chromeCardBodyLooksUnfilled(html, child);
  }
  if (visibleText(child.inner).replace(/\s+/g, '').length >= 2) return true;
  return /<(?:img|svg|video|audio|canvas|iframe|picture|source)\b/i.test(child.inner);
}

function allocatedRowPeerLooksEmptySpacer(html: string, child: DirectChildSpan): boolean {
  if (childLooksLikeChromeCard(child)) return false;
  if (/<(?:img|svg|video|audio|canvas|iframe|picture|source)\b/i.test(child.inner)) return false;
  return innerBlockContainsOnlyEmptyPlaceholders(child.inner);
}

/**
 * Heading-only card leftover: `<h3>DATA / MLOps</h3>` or heading + empty
 * `<p></p>`. Chrome label chips (no heading) stay filled. Media/lists stay
 * filled (루프354).
 */
function allocatedRowPeerLooksTitleOnly(html: string, child: DirectChildSpan): boolean {
  if (!childLooksLikeChromeCard(child) && !childLooksLikePeerCard(child.attrs, child.style)) {
    return false;
  }
  if (childLooksLikeChromeCard(child) && chromeCardBodyLooksUnfilled(html, child)) {
    return false;
  }
  if (!/<h[1-6]\b/i.test(child.inner)) return false;
  const withoutHeadings = child.inner.replace(/<h[1-6]\b[\s\S]*?<\/h[1-6]>/gi, '');
  if (/<(?:img|svg|video|audio|canvas|iframe|picture|source)\b/i.test(withoutHeadings)) return false;
  if (visibleText(withoutHeadings).replace(/\s+/g, '').length >= 2) return false;
  return innerBlockContainsOnlyEmptyPlaceholders(withoutHeadings);
}

function allocatedRowPeerLooksBodyFilled(html: string, child: DirectChildSpan): boolean {
  if (allocatedRowPeerLooksEmptySpacer(html, child)) return false;
  if (allocatedRowPeerLooksTitleOnly(html, child)) return false;
  return allocatedRowPeerLooksFilled(html, child);
}

/**
 * 루프342 — Mixed chrome rows: keep filled cards, drop siblings whose
 * body slots are only `<br>` / whitespace. Placement leftover of 334/340/341,
 * which only removed a row when every chrome card was empty.
 * 루프343 — empty `<div></div>` / `&nbsp;` body slots count as unfilled
 * too. 루프344 — empty `<p>` / `<span>` wrappers also count as unfilled.
 * 루프352 — `.card` / `<ul>` 같은 비크롬 형제가 있어도 빈 크롬만 제거.
 * 루프353 — 빈 스페이서 형제도 같이 제거. 채워진 앵커가 없고 전부가
 * 빈 크롬/스페이서면 행 전체를 제거.
 * 루프356–358 — numeric nbsp / dash·ellipsis / leftover-token body slots.
 * Never invent copy. Column stacks and official English catalogs stay intact.
 */
export function dropUnfilledChromeCardPeersInAllocatedRows(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const flexNames = collectClassFlexRowNames(out);
  const gridDecls = collectClassEqualTrackDecls(out);
  const openRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const removals: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    const tokens = classTokensFromAttrs(attrs);
    const classBound = tokens.some((token) => flexNames.has(token) || gridDecls.get(token)?.cols);
    const isGrid = /(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(style);
    const isFlexRow = isFlexRowContainerStyle(style);
    if (!isGrid && !isFlexRow && !classBound) continue;
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + match[0].length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildSpans(out, openEnd, close.closeStart);
    if (children.length < 2 || children.length > 6) continue;
    const chromeChildren = children.filter(childLooksLikeChromeCard);
    if (chromeChildren.length < 1) continue;
    const emptyChrome = chromeChildren.filter((c) => chromeCardBodyLooksUnfilled(out, c));
    const emptySpacers = children.filter((c) => allocatedRowPeerLooksEmptySpacer(out, c));
    const hasFilledAnchor = children.some((c) => allocatedRowPeerLooksFilled(out, c));
    if (!hasFilledAnchor) {
      if (
        emptyChrome.length >= 1
        && emptyChrome.length + emptySpacers.length === children.length
      ) {
        const closeTok = out.slice(close.closeStart).match(new RegExp(`^</${tag}\\s*>`, 'i'));
        const removalEnd = close.closeStart + (closeTok?.[0].length ?? 0);
        removals.push({ start: match.index, end: removalEnd });
        openRe.lastIndex = removalEnd;
      }
      continue;
    }
    const emptyPeers = [...emptyChrome, ...emptySpacers];
    if (emptyPeers.length === 0) continue;
    for (const empty of emptyPeers) {
      removals.push({ start: empty.absStart, end: empty.absCloseEnd });
    }
  }
  if (removals.length === 0) return out;
  removals.sort((a, b) => b.start - a.start);
  let lastKeptStart = Number.POSITIVE_INFINITY;
  for (const removal of removals) {
    if (removal.end > lastKeptStart) continue;
    out = `${out.slice(0, removal.start)}${out.slice(removal.end)}`;
    lastKeptStart = removal.start;
  }
  return out;
}

/**
 * 루프354 — Heading-only `.card` peers pad a filled row (`<h3>DATA</h3>`
 * next to a body card). Drop those title-only cards when a sibling has
 * real body. Keep all-heading chip rows, 2-col title+body pairs, chrome
 * label chips, column stacks, and official English catalogs. Never invent copy.
 */
export function dropTitleOnlyCardPeersInAllocatedRows(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const flexNames = collectClassFlexRowNames(out);
  const gridDecls = collectClassEqualTrackDecls(out);
  const openRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const removals: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    const tokens = classTokensFromAttrs(attrs);
    const classBound = tokens.some((token) => flexNames.has(token) || gridDecls.get(token)?.cols);
    const isGrid = /(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(style);
    const isFlexRow = isFlexRowContainerStyle(style);
    if (!isGrid && !isFlexRow && !classBound) continue;
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + match[0].length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildSpans(out, openEnd, close.closeStart);
    if (children.length < 3 || children.length > 6) continue;
    const titleOnly = children.filter((c) => allocatedRowPeerLooksTitleOnly(out, c));
    const bodyFilled = children.filter((c) => allocatedRowPeerLooksBodyFilled(out, c));
    if (titleOnly.length === 0 || bodyFilled.length === 0) continue;
    for (const empty of titleOnly) {
      removals.push({ start: empty.absStart, end: empty.absCloseEnd });
    }
  }
  if (removals.length === 0) return out;
  removals.sort((a, b) => b.start - a.start);
  let lastKeptStart = Number.POSITIVE_INFINITY;
  for (const removal of removals) {
    if (removal.end > lastKeptStart) continue;
    out = `${out.slice(0, removal.start)}${out.slice(removal.end)}`;
    lastKeptStart = removal.start;
  }
  return out;
}

const ADJACENT_DUPLICATE_CARD_MIN = 12;

function childLooksLikeDedupPeerCard(child: DirectChildSpan): boolean {
  if (child.tag !== 'div' && child.tag !== 'article' && child.tag !== 'li') return false;
  if (exactCardishTokens(child.attrs).length > 0) return true;
  return looksLikeChromeCardStyle(child.style);
}

function parentLooksLikeCardRow(style: string): boolean {
  if (/(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(style)) return true;
  return isFlexRowContainerStyle(style);
}

/**
 * 루프297 — 같은 행에서 인접한 카드의 정규화 텍스트가 완전히 같으면
 * 뒤 카드를 제거. MiniMax가 같은 공식을 두 칸에 붙여 3열이 4열처럼
 * 보이는 잔여. 12자 미만·다른 본문·세로 스택은 유지.
 * 루프301 — `.cards` / `.grid` class-bound 행도 동일. 카피 발명 없음.
 */
export function dropAdjacentDuplicatePeerCards(
  html: string,
  brief?: string | null,
): string {
  let out = String(html ?? '');
  if (!out) return out;
  if (!sourceLooksLikeAiGeneratedDeck(out, brief)) return out;
  const flexNames = collectClassFlexRowNames(out);
  const gridDecls = collectClassEqualTrackDecls(out);
  const openRe =
    /<(div|section|article|main|aside|ul|ol)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const patches: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(out)) !== null) {
    const attrs = match[2] ?? '';
    const style = extractInlineStyle(attrs);
    const tokens = classTokensFromAttrs(attrs);
    const classBound = tokens.some((token) => flexNames.has(token) || gridDecls.get(token)?.cols);
    if (!parentLooksLikeCardRow(style) && !classBound) continue;
    const tag = (match[1] ?? '').toLowerCase();
    const openEnd = match.index + match[0]!.length;
    const close = findSameTagClose(out, tag, openEnd);
    if (!close) continue;
    const children = listDirectBlockChildSpans(out, openEnd, close.closeStart);
    if (children.length < 2) continue;
    for (let i = 1; i < children.length; i += 1) {
      const prev = children[i - 1]!;
      const curr = children[i]!;
      if (!childLooksLikeDedupPeerCard(prev) || !childLooksLikeDedupPeerCard(curr)) continue;
      const prevText = normalizeVisibleTextForDedup(prev.inner);
      const currText = normalizeVisibleTextForDedup(curr.inner);
      if (currText.length < ADJACENT_DUPLICATE_CARD_MIN || currText !== prevText) continue;
      patches.push({ start: curr.absStart, end: curr.absCloseEnd });
    }
  }
  if (patches.length === 0) return out;
  patches.sort((a, b) => b.start - a.start);
  let lastKept = Number.POSITIVE_INFINITY;
  for (const patch of patches) {
    if (patch.end > lastKept) continue;
    out = `${out.slice(0, patch.start)}${out.slice(patch.end)}`;
    lastKept = patch.start;
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

const UNANCHORED_CENTER_TRANSLATE_RE =
  /translateY\s*\(\s*-50%\s*\)|translate\s*\(\s*-50%\s*,\s*-50%\s*\)|translate3d\s*\(\s*-50%\s*,\s*-50%\s*,\s*0(?:px|%)?\s*\)/i;

function styleHasUnanchoredCenterTranslate(style: string): boolean {
  return UNANCHORED_CENTER_TRANSLATE_RE.test(style);
}

function styleLooksAnchoredForCenterTranslate(style: string): boolean {
  const positioned = /position\s*:\s*(?:absolute|fixed)/i.test(style);
  if (!positioned) return false;
  if (/\btop\s*:\s*50%/i.test(style) && /translateY\s*\(\s*-50%\s*\)/i.test(style)) {
    return true;
  }
  // translate(-50%,-50%) / translate3d needs both axes anchored.
  if (
    /\btop\s*:\s*50%/i.test(style)
    && /\bleft\s*:\s*50%/i.test(style)
    && /translate(?:3d)?\s*\(\s*-50%\s*,\s*-50%/i.test(style)
  ) {
    return true;
  }
  if (/\btop\s*:\s*50%/i.test(style) || /\bbottom\s*:/i.test(style)) return true;
  return false;
}

/**
 * 루프183-b / 루프232 — Remove unanchored centering transforms inside slides.
 *
 * `translateY(-50%)` and `translate(-50%,-50%)` / `translate3d(-50%,-50%,0)` are
 * valid only with an explicit positioning anchor. Generated decks often copy
 * the transform without the anchor, so flow content clips at the 1920×1080
 * canvas edge. Scope to slide markup and inline styles only.
 */
export function neutralizeUnanchoredTranslateYInSlideContent(html: string): string {
  const source = String(html ?? '');
  if (!source || !UNANCHORED_CENTER_TRANSLATE_RE.test(source)) return source;
  let out = source;
  const slides = listAiSlideSpans(source);
  for (let i = slides.length - 1; i >= 0; i -= 1) {
    const slide = slides[i]!;
    const body = out.slice(slide.openEnd, slide.bodyEnd);
    const nextBody = body.replace(
      /<([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*\bstyle\s*=\s*(['"])([\s\S]*?)\3(?:[^>"']|"[^"]*"|'[^']*')*)>/g,
      (open, _tag: string, _attrs: string, q: string, style: string) => {
        if (!styleHasUnanchoredCenterTranslate(style)) return open;
        if (styleLooksAnchoredForCenterTranslate(style)) return open;
        const nextStyle = style
          .replace(
            /(?:^|;)\s*transform\s*:\s*(?:translateY\s*\(\s*-50%\s*\)|translate\s*\(\s*-50%\s*,\s*-50%\s*\)|translate3d\s*\(\s*-50%\s*,\s*-50%\s*,\s*0(?:px|%)?\s*\))\s*(?=;|$)/gi,
            ';',
          )
          .replace(/translateY\s*\(\s*-50%\s*\)/gi, '')
          .replace(/translate\s*\(\s*-50%\s*,\s*-50%\s*\)/gi, '')
          .replace(/translate3d\s*\(\s*-50%\s*,\s*-50%\s*,\s*0(?:px|%)?\s*\)/gi, '')
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
 * 루프350 — title-only cover (`slide-title`) with a lone `<h1>` reads left-
 * pinned inside a vertically centered flow. When the slide body is only that
 * heading (≤ 80 visible chars, no lists/media), add `text-align:center` on
 * `[data-od-slide-flow]` (or the `<h1>` when no flow wrapper) if not already
 * set. Keeps bare `<h1>text</h1>` intact for dedup heals. 카피 발명 없음.
 */
export function centerSparseTitleSlideHeading(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  const slides = listAiSlideSpans(source);
  if (slides.length === 0) return source;
  let out = source;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  for (const slide of slides) {
    if (!/\bslide-title\b/i.test(slide.attrs)) continue;
    const inner = out.slice(slide.openEnd, slide.bodyEnd);
    if (/<(?:ul|ol|figure|table|img|svg|video)\b/i.test(inner)) continue;
    const h1Re = /<h1\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/h1>/i;
    const h1Match = h1Re.exec(inner);
    if (!h1Match) continue;
    const before = visibleText(inner.slice(0, h1Match.index));
    const after = visibleText(inner.slice(h1Match.index + h1Match[0].length));
    if (before.length > 2 || after.length > 2) continue;
    const headingText = visibleText(h1Match[2] ?? '');
    if (headingText.length === 0 || headingText.length > 80) continue;
    const flowRe = /<div\b((?:[^>"']|"[^"]*"|'[^']*')*\bdata-od-slide-flow\b[^>]*)>/i;
    const flowMatch = flowRe.exec(inner);
    if (flowMatch) {
      const flowAttrs = flowMatch[1] ?? '';
      if (/(?:^|\s)style\s*=\s*["'][^"']*text-align\s*:/i.test(flowAttrs)) continue;
      const absStart = slide.openEnd + flowMatch.index;
      const absEnd = absStart + flowMatch[0].length;
      const styleMatch = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(flowAttrs);
      if (styleMatch) {
        const quote = styleMatch[1]!;
        const styleBody = styleMatch[2] ?? '';
        const newAttrs = flowAttrs.replace(
          styleMatch[0],
          `style=${quote}${styleBody}${styleBody.trim().endsWith(';') ? '' : ';'}text-align:center${quote}`,
        );
        patches.push({ start: absStart, end: absEnd, replacement: `<div${newAttrs}>` });
      } else {
        patches.push({
          start: absStart,
          end: absEnd,
          replacement: `<div${flowAttrs} style="text-align:center">`,
        });
      }
      continue;
    }
    const attrs = h1Match[1] ?? '';
    if (/(?:^|\s)style\s*=\s*["'][^"']*text-align\s*:/i.test(attrs)) continue;
    const styleMatch = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(attrs);
    const absStart = slide.openEnd + h1Match.index;
    const absEnd = absStart + h1Match[0].length;
    if (styleMatch) {
      const quote = styleMatch[1]!;
      const styleBody = styleMatch[2] ?? '';
      const newAttrs = attrs.replace(
        styleMatch[0],
        `style=${quote}${styleBody}${styleBody.trim().endsWith(';') ? '' : ';'}text-align:center${quote}`,
      );
      patches.push({
        start: absStart,
        end: absEnd,
        replacement: `<h1${newAttrs}>${h1Match[2] ?? ''}</h1>`,
      });
    } else {
      patches.push({
        start: absStart,
        end: absEnd,
        replacement: `<h1${attrs} style="text-align:center">${h1Match[2] ?? ''}</h1>`,
      });
    }
  }
  if (patches.length === 0) return source;
  patches.sort((a, b) => b.start - a.start);
  for (const patch of patches) {
    out = `${out.slice(0, patch.start)}${patch.replacement}${out.slice(patch.end)}`;
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

/**
 * 루프386 — Key Numbers slides emit `.stat-number` + `.stat-label` as loose
 * siblings (sometimes after an early-closed 2-col grid), plus empty
 * `.stat-card` shells. Rebuild one equal-column grid of filled cards.
 * 카피 발명 없음.
 */
const STAT_CARD_SHELL_STYLE =
  'border:4px solid var(--black,#000);background:var(--white,#fff);'
  + 'box-shadow:8px 8px 0 var(--black,#000);padding:32px;text-align:center;position:relative';

function childHasExactClass(child: DirectChildSpan, name: string): boolean {
  return classAttrValue(child.attrs)
    .trim()
    .split(/\s+/)
    .some((token) => token.toLowerCase() === name.toLowerCase());
}

function isLooseStatNumberChild(child: DirectChildSpan): boolean {
  if (child.tag !== 'div') return false;
  if (childHasExactClass(child, 'stat-number')) return true;
  const font = /font-size\s*:\s*(\d+)px/i.exec(child.style)?.[1];
  const size = font ? Number(font) : 0;
  if (!(size >= 56)) return false;
  const text = visibleText(child.inner);
  return /[\d,]/.test(text) && text.length <= 24;
}

function isLooseStatLabelChild(child: DirectChildSpan): boolean {
  if (child.tag !== 'div') return false;
  if (childHasExactClass(child, 'stat-label')) return true;
  const text = visibleText(child.inner);
  return text.length >= 2 && text.length <= 40 && !/[\d,]{3,}/.test(text)
    && /font-size\s*:\s*(1[2-8]|20)px/i.test(child.style);
}

function isEmptyStatCardShell(child: DirectChildSpan): boolean {
  if (child.tag !== 'div') return false;
  if (!childHasExactClass(child, 'stat-card')) return false;
  return visibleText(child.inner).length < 2;
}

function wrapStatPairHtml(numberHtml: string, labelHtml: string): string {
  return `<div class="stat-card" style="${STAT_CARD_SHELL_STYLE}">${numberHtml}${labelHtml}</div>`;
}

function rewriteLooseStatMetricsInContainer(
  html: string,
  openEnd: number,
  closeStart: number,
): string | null {
  const children = listDirectBlockChildSpans(html, openEnd, closeStart);
  if (children.length < 2) return null;
  type Pair = { numberHtml: string; labelHtml: string; start: number; end: number };
  const pairs: Pair[] = [];
  let i = 0;
  while (i < children.length) {
    const first = children[i]!;
    if (
      first.tag === 'div'
      && /(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(first.style)
    ) {
      const gridKids = listDirectBlockChildSpans(
        html,
        first.absEnd,
        first.absEnd + first.inner.length,
      );
      if (
        gridKids.length === 2
        && isLooseStatNumberChild(gridKids[0]!)
        && isLooseStatLabelChild(gridKids[1]!)
      ) {
        pairs.push({
          numberHtml: html.slice(gridKids[0]!.absStart, gridKids[0]!.absCloseEnd),
          labelHtml: html.slice(gridKids[1]!.absStart, gridKids[1]!.absCloseEnd),
          start: first.absStart,
          end: first.absCloseEnd,
        });
        i += 1;
        continue;
      }
    }
    let cursor = i;
    if (isEmptyStatCardShell(first)) {
      cursor += 1;
      if (cursor >= children.length) break;
    }
    const num = children[cursor];
    const label = children[cursor + 1];
    if (!num || !label || !isLooseStatNumberChild(num) || !isLooseStatLabelChild(label)) {
      if (pairs.length > 0) break;
      i += 1;
      continue;
    }
    const start = isEmptyStatCardShell(first) ? first.absStart : num.absStart;
    pairs.push({
      numberHtml: html.slice(num.absStart, num.absCloseEnd),
      labelHtml: html.slice(label.absStart, label.absCloseEnd),
      start,
      end: label.absCloseEnd,
    });
    i = cursor + 2;
  }
  if (pairs.length < 2) return null;
  const alreadyCards = children.filter(
    (c) => c.tag === 'div' && childHasExactClass(c, 'stat-card') && visibleText(c.inner).length >= 2,
  ).length;
  if (alreadyCards >= pairs.length) return null;
  const cols = pairs.length === 3 ? 3 : pairs.length >= 4 ? 2 : pairs.length;
  const gridOpen =
    `<div class="stats-grid" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:24px;width:100%">`;
  const cards = pairs.map((p) => wrapStatPairHtml(p.numberHtml, p.labelHtml)).join('');
  const grid = `${gridOpen}${cards}</div>`;
  const runStart = pairs[0]!.start;
  const runEnd = pairs[pairs.length - 1]!.end;
  return `${html.slice(openEnd, runStart)}${grid}${html.slice(runEnd, closeStart)}`;
}

export function wrapLooseStatMetricPairsIntoCards(html: string): string {
  const source = String(html ?? '');
  if (!source || !/\bstat-number\b|\bstat-label\b/i.test(source)) return source;
  const slideRe =
    /<(section|div)\b([^>]*\b(?:slide|data-screen-label)\b[^>]*)>([\s\S]*?)<\/\1>/gi;
  let out = source;
  const blocks: Array<{
    start: number;
    end: number;
    tag: string;
    attrs: string;
    inner: string;
  }> = [];
  let match: RegExpExecArray | null;
  while ((match = slideRe.exec(source)) !== null) {
    blocks.push({
      start: match.index,
      end: match.index + match[0]!.length,
      tag: match[1]!,
      attrs: match[2]!,
      inner: match[3]!,
    });
  }
  for (let b = blocks.length - 1; b >= 0; b -= 1) {
    const block = blocks[b]!;
    if (!/\bstat-number\b|\bstat-label\b/i.test(block.inner)) continue;
    let rewrittenInner: string | null = null;
    const flowOpen = /<div\b([^>]*\bdata-od-slide-flow\b[^>]*)>/i.exec(block.inner);
    if (flowOpen && flowOpen.index != null) {
      const flowOpenEnd = flowOpen.index + flowOpen[0].length;
      const flowClose = findSameTagClose(block.inner, 'div', flowOpenEnd);
      if (flowClose) {
        const nextFlow = rewriteLooseStatMetricsInContainer(
          block.inner,
          flowOpenEnd,
          flowClose.closeStart,
        );
        if (nextFlow != null) {
          rewrittenInner =
            block.inner.slice(0, flowOpenEnd)
            + nextFlow
            + block.inner.slice(flowClose.closeStart);
        }
      }
    }
    if (rewrittenInner == null) {
      const wrapped = `<x>${block.inner}</x>`;
      const nextBody = rewriteLooseStatMetricsInContainer(
        wrapped,
        3,
        3 + block.inner.length,
      );
      if (nextBody != null) rewrittenInner = nextBody;
    }
    if (rewrittenInner == null || rewrittenInner === block.inner) continue;
    out =
      `${out.slice(0, block.start)}<${block.tag}${block.attrs}>${rewrittenInner}</${block.tag}>`
      + out.slice(block.end);
  }
  return out;
}

const NEO_BRUTAL_VAR_FALLBACK_ATTR = 'data-od-neobrutal-var-fallback';
const NEO_BRUTAL_ROOT_VARS =
  ':root{--pink:#FE90E8;--blue:#C0F7FE;--green:#99E885;--yellow:#F7CB46;'
  + '--cream:#FFDC8B;--black:#000000;--white:#FFFFFF;--offwhite:#FFFDF5;'
  + '--ink:#2D2D2D;--paper:var(--cream);--rule:var(--black)}';

/**
 * 루프386/387 — MiniMax body-first fill drops official look CSS but still uses
 * kit tokens. Inject minimal :root so slides are not unstyled. Also alias
 * magazine `--paper`/`--rule` when neo-brutal kits are present (foreign IB
 * chrome leftovers).
 */
export function ensureNeoBrutalCssVariableFallback(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  // 루프390/395 — IB magazine leftovers use var(--ink)/var(--paper) on
  // 8-bit / Capsule decks; do not inject cream neo :root that fights kit wash.
  if (officialLookIsEightBitOrbit(source) || officialLookIsCapsule(source)) return source;
  // Do not treat bare magazine `--ink` alone as a neo kit token.
  const usesNeoToken = /var\(\s*--(?:pink|blue|green|yellow|cream|offwhite)\b/i.test(source);
  const usesMagazineOnNeo =
    /var\(\s*--(?:paper|rule|ink)\b/i.test(source)
    && /(?:--pink\s*:|#FE90E8|var\(\s*--pink\b)/i.test(source);
  if (!usesNeoToken && !usesMagazineOnNeo) return source;
  if (new RegExp(`\\b${NEO_BRUTAL_VAR_FALLBACK_ATTR}\\b`, 'i').test(source)) {
    return source;
  }
  const hasPaperDef = /--paper\s*:/i.test(source);
  const hasPinkDef =
    /:root\s*\{[^}]{0,1200}--(?:pink|offwhite|cream)\s*:/i.test(source)
    || (
      /\bdata-od-official-look-css\b/i.test(source)
      && /--(?:pink|offwhite|cream)\s*:/i.test(source)
    );
  if (hasPinkDef && (!usesMagazineOnNeo || hasPaperDef)) {
    return source;
  }
  if (hasPinkDef && usesMagazineOnNeo && !hasPaperDef) {
    const alias =
      `<style ${NEO_BRUTAL_VAR_FALLBACK_ATTR}>:root{--paper:var(--cream);--ink:var(--black);--rule:var(--black)}</style>`;
    if (/<\/head\s*>/i.test(source)) {
      return source.replace(/<\/head\s*>/i, `${alias}</head>`);
    }
    if (/<body\b/i.test(source)) {
      return source.replace(/<body\b([^>]*)>/i, `${alias}<body$1>`);
    }
    return `${alias}${source}`;
  }
  const style =
    `<style ${NEO_BRUTAL_VAR_FALLBACK_ATTR}>${NEO_BRUTAL_ROOT_VARS}</style>`;
  if (/<\/head\s*>/i.test(source)) {
    return source.replace(/<\/head\s*>/i, `${style}</head>`);
  }
  if (/<body\b/i.test(source)) {
    return source.replace(/<body\b([^>]*)>/i, `${style}<body$1>`);
  }
  return `${style}${source}`;
}

/**
 * 루프385 — Inside a grid whose direct children are a mix of proper chrome
 * shells (`<div style="border+padding+background">…</div>` wrapping pill +
 * heading + paragraph) and LOOSE pill / heading / paragraph siblings without
 * a wrapper, gather each loose `pill + heading + paragraph?` triple into a
 * chrome shell that mirrors the STYLE of the grid's existing chrome peer.
 *
 * User fixture 2026-09-02 slide 4: the model wrapped 3 of 4 product cards in
 * matching neubrutalism chrome shells and emitted the 4th (Channels & DM) as
 * bare pill + h3 + p directly under the grid — the missing wrapper made that
 * card render as 3 disjoint grid cells instead of a single card. Wrapping
 * copies the same author-emitted chrome style (background/border/box-shadow/
 * padding) — pure structural mirror, never invents novel styling.
 *
 * Guards:
 *   - Grid must have `display:grid` (inline or inline-grid) with 2+ tracks.
 *   - Grid must contain at least one chrome shell that itself holds a
 *     pill + heading pair (proof of the template's card format).
 *   - Only wrap consecutive `pill, heading, paragraph?` triples where the
 *     pill is inline-block + padding + short text and the heading has real
 *     text — same detector as loop381 chrome shell absorb.
 *   - Skip if all children are already chrome shells (nothing to fix).
 */
export function wrapLoosePillHeadingTriplesInsideMixedGrid(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  const openRe = /<div\b([^>]*)>/gi;
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(source)) !== null) {
    const attrs = match[1] ?? '';
    const style = extractInlineStyle(attrs);
    if (!/(?:^|;)\s*display\s*:\s*(?:inline-)?grid\b/i.test(style)) continue;
    const colsRaw = /grid-template-columns\s*:\s*([^;]+)/i.exec(style)?.[1];
    if (!colsRaw) continue;
    const decl = parseDeclaredEqualColumns(colsRaw.trim());
    if (!decl || decl.count < 2) continue;
    const openStart = match.index;
    const openEnd = openStart + match[0]!.length;
    const closeInfo = findSameTagClose(source, 'div', openEnd);
    if (!closeInfo) continue;
    const gridInnerStart = openEnd;
    const gridInnerEnd = closeInfo.closeStart;
    // Loop385 needs headings among direct children — GRID_BLOCK_CHILD_RE
    // used by `listDirectBlockChildOpens` skips h1–h6. Use a widened
    // scanner scoped to this pass so grid heals that rely on the block-
    // only list are unaffected.
    const children = listDirectHeadingAwareChildOpens(source, gridInnerStart, gridInnerEnd);
    if (children.length === 0) continue;
    const shellStyleHint = detectChromeShellPeerStyle(source, children, gridInnerEnd);
    if (!shellStyleHint) continue;
    const rewritten = wrapLoosePillHeadingTriplesInGridInner(
      source,
      children,
      gridInnerStart,
      gridInnerEnd,
      shellStyleHint,
    );
    if (rewritten == null) continue;
    edits.push({ start: gridInnerStart, end: gridInnerEnd, replacement: rewritten });
  }
  if (edits.length === 0) return source;
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.replacement + out.slice(edit.end);
  }
  return out;
}

const HEADING_AWARE_CHILD_RE =
  /^(div|section|article|li|figure|aside|header|footer|main|nav|ul|ol|p|table|h1|h2|h3|h4|h5|h6|blockquote)$/;

function listDirectHeadingAwareChildOpens(
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
    const selfClose = tok[3] === '/'
      || /\/>\s*$/.test(tok[0] ?? '')
      || HTML_VOID_ELEMENTS.has(tagName);
    if (closing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && HEADING_AWARE_CHILD_RE.test(tagName)) {
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

function detectChromeShellPeerStyle(
  html: string,
  children: DirectChildOpen[],
  gridInnerEnd: number,
): string | null {
  for (const child of children) {
    if (!looksLikeChromeCardStyle(child.style)) continue;
    // Verify the chrome shell holds a pill + heading pair (matches loop381's
    // triple detector) so this is a template-emitted card, not a stray box.
    const shellClose = findSameTagClose(html, 'div', child.absEnd);
    if (!shellClose || shellClose.closeStart > gridInnerEnd) continue;
    const inner = html.slice(child.absEnd, shellClose.closeStart);
    if (!chromeShellInnerHoldsPillAndHeading(inner)) continue;
    return child.style;
  }
  return null;
}

function chromeShellInnerHoldsPillAndHeading(inner: string): boolean {
  const openRe = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let sawPill = false;
  let sawHeading = false;
  let tok: RegExpExecArray | null;
  while ((tok = openRe.exec(inner)) !== null) {
    const tag = (tok[1] ?? '').toLowerCase();
    const attrs = tok[2] ?? '';
    if (/^h[1-6]$/.test(tag)) sawHeading = true;
    else if (tag === 'div') {
      const style = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
      const value = (style?.[1] ?? style?.[2] ?? '').trim();
      if (/(?:^|;)\s*display\s*:\s*inline-block\b/i.test(value)) sawPill = true;
    }
    if (sawPill && sawHeading) return true;
  }
  return false;
}

type LooseTriple = {
  pillIdx: number;
  headingIdx: number;
  paragraphIdx: number | null;
  absStart: number;
  absCloseEnd: number;
};

function wrapLoosePillHeadingTriplesInGridInner(
  html: string,
  children: DirectChildOpen[],
  gridInnerStart: number,
  gridInnerEnd: number,
  shellStyle: string,
): string | null {
  const spans = childOpensToSpans(html, children, gridInnerEnd);
  const triples: LooseTriple[] = [];
  const consumed = new Set<number>();
  for (let i = 0; i < spans.length; i += 1) {
    if (consumed.has(i)) continue;
    const pill = spans[i]!;
    if (!spanLooksLikeLoosePill(html, pill)) continue;
    const heading = spans[i + 1];
    if (!heading || !isHeadingSpan(heading)) continue;
    const paragraph = spans[i + 2];
    const hasParagraph = paragraph && paragraph.tag === 'p' && spanHasVisibleText(html, paragraph);
    triples.push({
      pillIdx: i,
      headingIdx: i + 1,
      paragraphIdx: hasParagraph ? i + 2 : null,
      absStart: pill.absStart,
      absCloseEnd: hasParagraph ? paragraph!.absCloseEnd : heading.absCloseEnd,
    });
    consumed.add(i);
    consumed.add(i + 1);
    if (hasParagraph) consumed.add(i + 2);
  }
  if (triples.length === 0) return null;
  const pieces: string[] = [];
  let cursor = gridInnerStart;
  for (const triple of triples) {
    pieces.push(html.slice(cursor, triple.absStart));
    const wrapped = `<div style="${shellStyle}">${html.slice(triple.absStart, triple.absCloseEnd)}</div>`;
    pieces.push(wrapped);
    cursor = triple.absCloseEnd;
  }
  pieces.push(html.slice(cursor, gridInnerEnd));
  return pieces.join('');
}

function childOpensToSpans(
  html: string,
  children: DirectChildOpen[],
  parentEnd: number,
): DirectChildSpan[] {
  const spans: DirectChildSpan[] = [];
  for (const open of children) {
    const tag = tagNameFromOpen(open.open);
    if (!tag) continue;
    if (/\/\s*>$/.test(open.open)) {
      spans.push({ ...open, tag, inner: '', absCloseEnd: open.absEnd });
      continue;
    }
    const close = findSameTagClose(html, tag, open.absEnd);
    if (!close || close.closeStart > parentEnd) continue;
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

function spanLooksLikeLoosePill(html: string, span: DirectChildSpan): boolean {
  if (span.tag !== 'div') return false;
  const style = span.style;
  if (!/(?:^|;)\s*display\s*:\s*inline-block\b/i.test(style)) return false;
  if (!/(?:^|;)\s*padding\s*:/i.test(style)) return false;
  const text = visibleText(html.slice(span.absEnd, span.absCloseEnd));
  return text.length > 0 && text.length <= 40;
}

function isHeadingSpan(span: DirectChildSpan): boolean {
  return /^h[1-6]$/i.test(span.tag);
}

function spanHasVisibleText(html: string, span: DirectChildSpan): boolean {
  return visibleText(html.slice(span.absEnd, span.absCloseEnd)).length > 0;
}

/**
 * 루프383 — Unwrap slide-body layout wrappers (`.split-content`, `.hero-frame`,
 * `.split-pane`, `.card`, `.slide-inner`, etc.) that hold only a heading with
 * no accompanying body block. The wrapper's padding / border / half-width flex
 * bleed makes the lone heading look like an empty box; unwrapping lets the
 * slide-flow centering CSS present the heading full-slide as a proper hero.
 *
 * Only unwraps when the wrapper's ONLY visible child is a single heading
 * (h1–h6) with real text; skips wrappers that also carry a list, paragraph,
 * grid, or any other body content. Never invents copy.
 */
const HEADING_ONLY_LAYOUT_WRAPPER_CLASSES = new Set<string>([
  'split-content',
  'split-visual',
  'split-pane',
  'hero-frame',
  'quote-frame',
  'close-frame',
  'feature-card',
  'info-card',
  'intro-card',
  'stat-card',
  'team-card',
  'timeline-step',
  'card',
  'slide-inner',
  'slide-body',
]);

export function unwrapHeadingOnlyLayoutWrappers(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  const openRe = /<div\b([^>]*)>/gi;
  const edits: Array<{ openStart: number; openEnd: number; closeStart: number; closeEnd: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(source)) !== null) {
    const attrs = match[1] ?? '';
    const cls = classAttrValue(attrs).trim().split(/\s+/).filter(Boolean);
    if (cls.length === 0) continue;
    const hasHeadingOnlyClass = cls.some(
      (token) => HEADING_ONLY_LAYOUT_WRAPPER_CLASSES.has(token.toLowerCase()),
    );
    if (!hasHeadingOnlyClass) continue;
    const openStart = match.index;
    const openEnd = openStart + match[0]!.length;
    const closeInfo = findSameTagClose(source, 'div', openEnd);
    if (!closeInfo) continue;
    const closeStart = closeInfo.closeStart;
    const innerHtml = source.slice(openEnd, closeStart);
    if (!wrapperHoldsOnlyHeading(innerHtml)) continue;
    const closeEnd = closeStart + closeTagLength(source, closeStart);
    edits.push({ openStart, openEnd, closeStart, closeEnd });
  }
  if (edits.length === 0) return source;
  const outer: typeof edits = [];
  let cursor = -1;
  const sorted = [...edits].sort((a, b) => a.openStart - b.openStart);
  for (const edit of sorted) {
    if (edit.openStart < cursor) continue;
    outer.push(edit);
    cursor = edit.closeEnd;
  }
  let out = source;
  for (let i = outer.length - 1; i >= 0; i -= 1) {
    const edit = outer[i]!;
    out = out.slice(0, edit.closeStart) + out.slice(edit.closeEnd);
    out = out.slice(0, edit.openStart) + out.slice(edit.openEnd);
  }
  return out;
}

function wrapperHoldsOnlyHeading(inner: string): boolean {
  const stripped = String(inner ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  if (!stripped) return false;
  const headingMatch = /^<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>\s*$/i.exec(stripped);
  if (!headingMatch) return false;
  const headingText = String(headingMatch[2] ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return headingText.length > 0;
}

/**
 * 루프379 — Unwrap trivial single-child `display:flex`/`display:grid`
 * `<div>` wrappers.
 *
 * MiniMax edit-turn output for slot-fill decks often wraps a real grid inside
 * a flex `<div>` that has only `display:flex` + `gap` + `align-items` +
 * `margin-bottom` and holds exactly one grid child. The wrapper adds bottom
 * spacing but no meaningful layout — its removal restores the intended card
 * row position.
 *
 * Safe to run because the guard rejects any wrapper that carries width /
 * height / padding / border / background / box-shadow / grid-template /
 * flex-basis, has more than one direct block child, or contains text between
 * its child and its close. Authored templates that use flex meaningfully
 * (padding, borders, multiple children) are untouched.
 */
export function unwrapTrivialSingleChildLayoutWrappers(html: string): string {
  const source = String(html ?? '');
  if (!source) return source;
  let out = source;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = unwrapTrivialSingleChildLayoutWrappersOnce(out);
    if (next === out) return out;
    out = next;
  }
  return out;
}

const TRIVIAL_LAYOUT_REJECT_PROPS = new Set<string>([
  'width', 'min-width', 'max-width', 'inline-size', 'min-inline-size', 'max-inline-size',
  'height', 'min-height', 'max-height', 'block-size', 'min-block-size', 'max-block-size',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-inline', 'padding-inline-start', 'padding-inline-end',
  'padding-block', 'padding-block-start', 'padding-block-end',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-inline', 'border-inline-start', 'border-inline-end',
  'border-block', 'border-block-start', 'border-block-end',
  'border-width', 'border-style', 'border-color', 'border-image',
  'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat', 'background-clip', 'background-origin',
  'box-shadow', 'outline', 'outline-width', 'outline-style', 'outline-color',
  'filter', 'backdrop-filter', 'transform', 'clip-path', 'mask', 'mask-image',
  'position', 'inset', 'top', 'right', 'bottom', 'left', 'z-index',
  'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
  'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
  'grid-column', 'grid-row', 'grid-area',
  'flex', 'flex-basis', 'flex-grow', 'flex-shrink', 'flex-flow',
]);

function parseStyleDeclarations(style: string): { property: string; value: string }[] {
  return String(style ?? '')
    .split(';')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((decl) => {
      const idx = decl.indexOf(':');
      if (idx < 0) return { property: '', value: '' };
      return {
        property: decl.slice(0, idx).trim().toLowerCase(),
        value: decl.slice(idx + 1).trim(),
      };
    })
    .filter((decl) => decl.property);
}

function trivialLayoutWrapperStyle(style: string): boolean {
  const decls = parseStyleDeclarations(style);
  if (decls.length === 0) return false;
  const hasLayout = decls.some(
    (d) => d.property === 'display' && /^(?:flex|grid|inline-flex|inline-grid)$/i.test(d.value),
  );
  if (!hasLayout) return false;
  for (const decl of decls) {
    if (TRIVIAL_LAYOUT_REJECT_PROPS.has(decl.property)) return false;
  }
  return true;
}

function inlineTextBetween(html: string, from: number, to: number): boolean {
  if (to <= from) return false;
  const slice = html.slice(from, to)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ');
  return /\S/.test(slice);
}

function closeTagLength(html: string, closeStart: number): number {
  const match = /^<\/[a-zA-Z][\w-]*\s*>/.exec(html.slice(closeStart));
  return match ? match[0].length : '</div>'.length;
}

function unwrapTrivialSingleChildLayoutWrappersOnce(html: string): string {
  const openRe = /<div\b([^>]*)>/gi;
  const edits: Array<{ openStart: number; openEnd: number; closeStart: number; closeEnd: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const style = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    const styleValue = (style?.[1] ?? style?.[2] ?? '').trim();
    if (!styleValue) continue;
    if (!trivialLayoutWrapperStyle(styleValue)) continue;
    // Reject wrappers with `class` — a class may carry non-inline layout.
    if (/\bclass\s*=/i.test(attrs)) continue;
    const openStart = match.index;
    const openEnd = openStart + match[0]!.length;
    const closeInfo = findSameTagClose(html, 'div', openEnd);
    if (!closeInfo) continue;
    const closeStart = closeInfo.closeStart;
    const innerStart = openEnd;
    const innerEnd = closeStart;
    const children = listDirectBlockChildOpens(html, innerStart, innerEnd);
    if (children.length !== 1) continue;
    const only = children[0]!;
    // Text between wrapper open and only-child open, or between only-child
    // close and wrapper close, means the wrapper is not trivially single-child.
    if (inlineTextBetween(html, innerStart, only.absStart)) continue;
    const onlyTag = tagNameFromOpen(only.open);
    if (!onlyTag) continue;
    const selfClose = /\/\s*>$/.test(only.open);
    let onlyEnd: number;
    if (selfClose) {
      onlyEnd = only.absEnd;
    } else {
      const onlyCloseInfo = findSameTagClose(html, onlyTag, only.absEnd);
      if (!onlyCloseInfo) continue;
      const closeMatch = new RegExp(`^</${onlyTag}\\s*>`, 'i').exec(html.slice(onlyCloseInfo.closeStart));
      onlyEnd = closeMatch ? onlyCloseInfo.closeStart + closeMatch[0].length : onlyCloseInfo.closeStart;
    }
    if (inlineTextBetween(html, onlyEnd, innerEnd)) continue;
    const closeEnd = closeStart + closeTagLength(html, closeStart);
    edits.push({ openStart, openEnd, closeStart, closeEnd });
  }
  if (edits.length === 0) return html;
  // Keep only outermost, non-overlapping edits in this pass — nested edits
  // corrupt each other's offsets after the first splice. The multi-pass
  // outer loop picks up the newly-outermost wrappers on the next call.
  const outer: typeof edits = [];
  let cursor = -1;
  const sorted = [...edits].sort((a, b) => a.openStart - b.openStart);
  for (const edit of sorted) {
    if (edit.openStart < cursor) continue;
    outer.push(edit);
    cursor = edit.closeEnd;
  }
  // Rewrite from the tail so earlier offsets stay valid.
  let out = html;
  for (let i = outer.length - 1; i >= 0; i -= 1) {
    const edit = outer[i]!;
    out = out.slice(0, edit.closeStart) + out.slice(edit.closeEnd);
    out = out.slice(0, edit.openStart) + out.slice(edit.openEnd);
  }
  return out;
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
  // 루프270 — Flatten the wild `<div class="card"><div class="card">…</div>…</div>`
  // shape (slide 4 / 5 항등식·그래프). Loop194 peer-splits the two opens
  // and pushes the outer body out of the card; loop199 only unwraps a
  // fully-empty outer. Strip the inner open + its matching close so the
  // outer flat card keeps every child in the right z-order.
  out = flattenNestedDuplicateCardOpens(out);
  // 루프199 — unwrap balanced card-in-card BEFORE 194. 194 assumes
  // cards are never nested and would insert a sibling close, leaving
  // an empty outer shell plus a leftover </div>.
  out = unwrapRedundantNestedPeerCards(out, brief);
  out = closeUnclosedSiblingCardsInSlides(out);
  // 루프379 — Unwrap trivial single-child flex/grid wrappers BEFORE the
  // orphan / spill pulls. The wrapper hides the real grid one level deeper
  // and prevents `pullOrphanChromeCardsIntoPrecedingGrid` from seeing a
  // sibling badge as an orphan on the first pass, breaking idempotency.
  // Loop380 (leaf-empty strip) then runs late so mid-pipeline temporary
  // empty leaves are cleaned up after the pulls finish.
  out = unwrapTrivialSingleChildLayoutWrappers(out);
  // 루프293 — class 없는 크롬 카드의 조기 close가 제목·본문을 그리드
  // 형제로 남기면 shrink가 열을 늘린다. shrink 전에 카드 안으로 되돌린다.
  out = absorbSpilledChromeCardSiblings(out, brief);
  // 루프345 — flex column win-body가 heading 뒤에서 조기 종료되고 main grid가
  // 형제로 남으면 그리드를 column host 안으로 되돌린다.
  out = absorbOrphanContentGridIntoFlexColumnHost(out, brief);
  // 루프332 / 347 — 그리드 바로 다음 형제로 새어나간 본문·리스트 조각을
  // 마지막 크롬 카드 안으로 되돌린다. absorb 다음, dup drop 이전.
  out = absorbSpilledBodyAcrossGridBoundary(out, brief);
  // 루프348 — 선언 열 수보다 그리드 안 카드가 적을 때 바로 뒤 orphan 카드를
  // 그리드 안으로 되돌린다 (로드맵 3열 등).
  out = pullOrphanChromeCardsIntoPrecedingGrid(out, brief);
  // 루프385 — Grid 안에 pill+h3+p 삼중항이 wrapper 없이 loose로 남아
  // 다른 자매 카드는 chrome shell로 감싸져 있으면 그 shell 스타일을
  // 그대로 복사해 loose 삼중항을 카드로 승격. 완성된 grid는 4장이
  // uniform하게 보임.
  out = wrapLoosePillHeadingTriplesInsideMixedGrid(out);
  // 루프386 — Key Numbers: early-closed grid leaves .stat-number/.stat-label
  // (and empty .stat-card shells) as loose siblings. Wrap pairs into
  // .stat-card cells inside one equal-column grid.
  out = wrapLooseStatMetricPairsIntoCards(out);
  // 루프333 — 조기 종료된 카드 뒤에 남은 orphan `<b>tail</b></div>` 제거.
  out = stripDuplicatedInlineTailAfterSiblingClose(out);
  // 루프331 — `</h1..6>` 다음 heading 꼬리 텍스트가 그대로 중복된 경우 제거.
  out = stripDuplicatedHeadingTailAfterClose(out);
  // 루프297 — 같은 행의 완전 동일 인접 카드 한 장만 남긴다.
  out = dropAdjacentDuplicatePeerCards(out, brief);
  // 루프334 — 크롬 카드 그리드의 본문 슬롯이 전부 <br>만 남은 경우
  // (Tech Stack 등) 그 그리드만 제거. 슬라이드 제목·꼬리 카피는 유지.
  // 루프340 — display:flex 행도 동일. 루프341 — class-bound flex/grid도 동일.
  // 루프335 void depth 안정화 후 자식 정확.
  out = dropChromeCardGridsWithAllEmptyBodies(out, brief);
  // 루프342 — 본문 있는 행에서 빈 본문 크롬 카드만 제거. 전체 행
  // drop(334) 다음, leftover shrink 이전에 실행해 빈 띠 트랙을 줄인다.
  // 루프343 — 빈 div / `&nbsp;`. 루프344 — 빈 `<p>` / `<span>` 래퍼.
  // 루프352 — `.card` / `<ul>` 혼합 행도 빈 크롬만 제거.
  // 루프353 — 빈 스페이서 형제 · 전부 빈 혼합 행 제거.
  // 루프356–358 — nbsp/ZWSP/empty heading · dash body · TBD body.
  out = dropUnfilledChromeCardPeersInAllocatedRows(out, brief);
  // 루프354 — 본문 있는 행에서 heading-only 카드만 제거.
  out = dropTitleOnlyCardPeersInAllocatedRows(out, brief);
  out = unnestHeadingBlockChildren(out);
  // 루프380 — Edit-turn output also leaves leaf `<ul>` / `<ol>` shells
  // whose `<li>` children are all empty (`content-list` on split-content
  // slides) and empty `<p class="hero-subtitle"></p>` shells. The
  // template's list-num counter still paints orphan numbered pills, and
  // the subtitle gap pushes hero decorations. Same helper as slot-fill
  // (loop376), now applied in the general heal pipeline so modify-turn
  // HTML gets the same cleanup.
  out = stripLeafEmptyListAndParagraphShells(out);
  // 루프383 — heading-only 슬라이드에서 layout wrapper (.split-content,
  // .hero-frame, .card 등)가 heading을 감싸 slide-flow의 hero-centering을
  // 못 받게 만든다. leaf-empty strip 이후에 실행해 방금 빈 <ul>/<p>를 걷어낸
  // wrapper도 잡을 수 있게 한다.
  out = unwrapHeadingOnlyLayoutWrappers(out);
  // Second unwrap pass — earlier peer trims may collapse a grid down to
  // a single card, leaving another trivial wrapper. Idempotent.
  out = unwrapTrivialSingleChildLayoutWrappers(out);
  out = polishTruncatedInstructionTitles(out);
  // 루프197 — empty leftover card shells keep 3-track rows alive so
  // 190/195 cannot shrink and 191 grows the blank column. Drop first.
  out = dropEmptyLeftoverPeerCardsInAllocatedRows(out, brief);
  // 루프198 — uniform px/rem card widths fight minmax/flex shrink and
  // make 191 treat the whole row as a sidebar. Strip first.
  out = relaxUniformPeerCardFixedMainSize(out, brief);
  out = shrinkOverAllocatedRepeatGrid(out);
  out = normalizeEqualFrTracksToMinmax(out);
  out = normalizeGridAutoColumnShares(out, brief);
  out = normalizeGridAutoRowShares(out, brief);
  out = shrinkOverAllocatedEqualTrackRows(out);
  out = shrinkClassBoundEqualTrackGrids(out, brief);
  out = balanceUnderfilledFlexCardRow(out);
  out = balanceClassBoundFlexCardRow(out, brief);
  out = normalizeHangulParticleGaps(out);
  out = neutralizeUnanchoredTranslateYInSlideContent(out);
  // 루프350 — title-only cover의 lone h1을 flow wrapper 기준 가운데 정렬.
  out = centerSparseTitleSlideHeading(out);
  out = scrubBriefLeakFromMetaSlots(out, brief);
  out = dropLeadingTitleOnlyIntroBeforeRealCover(out, brief);
  out = dropEmptyLikelyDeckSlides(out);
  out = dropTitleOnlyNumberedLeftoverSlides(out, brief);
  // 루프182 — MiniMax body-fill failure ships the same title-only slide
  // twice. Collapse consecutive duplicates so preview does not read as
  // "content missing + template not applied" for artifacts that bypassed
  // the upstream 루프181 persist gate.
  out = dropDuplicateConsecutiveTitleOnlyLeftoverSlides(out);
  // 루프295 — title-only가 아닌 연속 동일 본문 장.
  out = dropDuplicateConsecutiveSubstanceSlides(out);
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
  // 루프386 — prompt-fill often drops official look CSS but still paints with
  // var(--pink)/var(--offwhite). Without :root the slides render unstyled.
  out = ensureNeoBrutalCssVariableFallback(out);
  return out;
}

// silence unused import when the module is bundled without callers
void escapeHtml;
