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

/**
 * Q3 — Shrink `repeat(N, 1fr)` grids when far fewer children were emitted.
 *
 * AI outlines "네 가지 리츄얼" and picks a 4-column grid, then only fills
 * the first card. The remaining 75% width becomes an empty band. Shrink
 * columns to match the actual child count so the visible cards fill the
 * row instead. Never grow — filling missing content is not our job.
 *
 * Only shrinks when count of block children (`div`/`section`/`article`)
 * inside the grid is ≥1 and strictly less than the declared column count.
 */
export function shrinkOverAllocatedRepeatGrid(html: string): string {
  let out = String(html ?? '');
  if (!out) return out;
  const gridOpenRe =
    /<(div|section|article|main|aside|ul|ol)\b([^>]*\bstyle\s*=\s*["'][^"']*grid-template-columns\s*:\s*repeat\s*\(\s*(\d+)\s*,[^)]+\)[^"']*["'][^>]*)>/gi;
  const patches: Array<{ start: number; end: number; replacement: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = gridOpenRe.exec(out)) !== null) {
    const openTag = match[0] ?? '';
    const tag = (match[1] ?? '').toLowerCase();
    const declared = Number.parseInt(match[3] ?? '0', 10);
    if (!Number.isFinite(declared) || declared < 2) continue;
    const start = match.index;
    const openEnd = start + openTag.length;
    // Find matching close for this tag to bound the grid children.
    const scanRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
    scanRe.lastIndex = openEnd;
    let depth = 1;
    let closeStart = -1;
    let closeEnd = -1;
    let tok: RegExpExecArray | null;
    while ((tok = scanRe.exec(out)) !== null) {
      if (tok[0]!.startsWith('</')) {
        depth -= 1;
        if (depth === 0) {
          closeStart = tok.index;
          closeEnd = tok.index + tok[0].length;
          break;
        }
      } else if (!tok[0]!.endsWith('/>')) {
        depth += 1;
      }
    }
    if (closeStart < 0) continue;
    const inner = out.slice(openEnd, closeStart);
    // Count DIRECT (depth-1) block children only — a card whose body
    // contains its own `<div>` rows must not inflate the child count.
    const tokenRe = /<(\/?)([a-zA-Z][\w-]*)\b[^>]*(\/)?>/gi;
    let d = 0;
    let directChildren = 0;
    let tokChild: RegExpExecArray | null;
    while ((tokChild = tokenRe.exec(inner)) !== null) {
      const closing = tokChild[1] === '/';
      const tagName = (tokChild[2] ?? '').toLowerCase();
      const selfClose = tokChild[3] === '/';
      const isBlock = /^(div|section|article|li|figure|aside|header|footer|main|nav|ul|ol|p|table)$/.test(
        tagName,
      );
      if (closing) {
        d = Math.max(0, d - 1);
        continue;
      }
      if (d === 0 && isBlock) directChildren += 1;
      if (!selfClose) d += 1;
    }
    if (directChildren === 0 || directChildren >= declared) continue;
    const nextOpen = openTag.replace(
      /(grid-template-columns\s*:\s*repeat\s*\(\s*)(\d+)(\s*,[^)]+\))/i,
      (_m, head: string, _n: string, tail: string) => `${head}${directChildren}${tail}`,
    );
    patches.push({ start, end: openEnd, replacement: nextOpen });
  }
  for (let i = patches.length - 1; i >= 0; i -= 1) {
    const p = patches[i]!;
    out = `${out.slice(0, p.start)}${p.replacement}${out.slice(p.end)}`;
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
  out = unnestHeadingBlockChildren(out);
  out = polishTruncatedInstructionTitles(out);
  out = shrinkOverAllocatedRepeatGrid(out);
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
