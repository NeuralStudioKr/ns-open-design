/**
 * `<artifact type="deck-patch">` — partial deck edit contract.
 *
 * Ships the model out of the "regenerate the whole deck for every one-word
 * text change" trap. On Teamver slide-only comment edits the previous flow
 * asked the model to emit a complete `<artifact type="deck"><!doctype html>
 * …6+ filled <section class="slide">…</html></artifact>` block every turn.
 * For a 10-slide deck at ~2–4KB per slide that is 20–40k output tokens which
 * streams for 60–120s — the source of user reports like "요소 텍스트 하나
 * 바꾸는데 2분 넘게 걸림".
 *
 * The patch contract is intentionally narrow:
 *
 *   <artifact type="deck-patch" identifier="deck">
 *     <section class="slide" data-slide-index="3">…replacement outer HTML…</section>
 *     <section class="slide" data-slide-index="7">…</section>
 *   </artifact>
 *
 * - `data-slide-index="N"` — 0-based index of the target `<section class="slide">`
 *   in the current deck body (top-to-bottom). The client swaps that section
 *   whole for the patch section.
 * - No `<head>`, `<html>`, `<body>`. No unchanged slides. No global chrome.
 * - `data-op` defaults to `replace`. `remove` drops the target slide;
 *   `append` / `prepend` splice the new section relative to it. Anything else
 *   is rejected and the patch falls back to the full-deck path.
 *
 * The parser here is deliberately string-based (no DOMParser) so it runs
 * inside vitest's `environment: 'node'` without a jsdom pragma and inside a
 * web worker if we ever move persist off the main thread. Deck bodies we
 * emit are flat — `<section class="slide">` never nests another
 * `<section class="slide">` inside itself in the framework — so a depth
 * counter over top-level `<section>` opens is enough.
 */

export type DeckPatchOp = 'replace' | 'remove' | 'append' | 'prepend';

export interface DeckPatchSectionOp {
  op: DeckPatchOp;
  /**
   * 0-based slide index to target in the CURRENT deck (top-to-bottom order of
   * `<section class="slide">` elements in the body).
   */
  slideIndex: number;
  /**
   * Full replacement `<section class="slide">…</section>` outer HTML. Empty
   * when `op === 'remove'`.
   */
  html: string;
}

export interface DeckPatch {
  ops: DeckPatchSectionOp[];
}

export interface ParseDeckPatchResult {
  ok: true;
  patch: DeckPatch;
}

export interface ParseDeckPatchFailure {
  ok: false;
  reason: string;
}

/**
 * True whenever the artifact `type` attribute (case-insensitive) matches the
 * deck-patch contract. Used by the persist layer to branch off the full-deck
 * write path before the incomplete-shell / validate gates run.
 */
export function isDeckPatchArtifactType(artifactType: string | null | undefined): boolean {
  const trimmed = String(artifactType ?? '').trim().toLowerCase();
  return trimmed === 'deck-patch' || trimmed === 'slide-patch';
}

/**
 * Parse the streamed deck-patch body into a sequence of ops. Ignores prose
 * between sections (models occasionally emit a one-line rationale) and
 * whitespace/comment nodes. Returns `ok: false` when the body has no valid
 * `<section class="slide" data-slide-index="…">` blocks.
 */
export function parseDeckPatch(body: string): ParseDeckPatchResult | ParseDeckPatchFailure {
  const sections = extractTopLevelSlideSections(body);
  if (sections.length === 0) {
    return { ok: false, reason: 'no <section class="slide"> blocks in deck-patch body' };
  }
  const ops: DeckPatchSectionOp[] = [];
  for (const section of sections) {
    const slideIndex = readSlideIndex(section.openTag);
    if (slideIndex == null) {
      return {
        ok: false,
        reason: `deck-patch section missing data-slide-index attribute (open tag: ${section.openTag.slice(0, 80)}…)`,
      };
    }
    const op = readOp(section.openTag);
    if (!op) {
      return {
        ok: false,
        reason: `deck-patch section uses unsupported data-op (open tag: ${section.openTag.slice(0, 80)}…)`,
      };
    }
    ops.push({
      op,
      slideIndex,
      html: op === 'remove' ? '' : section.outerHtml,
    });
  }
  return { ok: true, patch: { ops } };
}

export interface ApplyDeckPatchOptions {
  currentHtml: string;
  patch: DeckPatch;
}

export interface ApplyDeckPatchSuccess {
  ok: true;
  html: string;
  appliedOps: number;
}

export interface ApplyDeckPatchFailure {
  ok: false;
  reason: string;
}

/**
 * Apply the ordered ops from `parseDeckPatch` to the CURRENT deck HTML.
 *
 * Fails (returns `ok: false`) whenever any op targets a slide index outside
 * the current deck bounds — the caller falls back to the full-deck path so a
 * bad patch never writes a mangled deck. Ops are applied in the order they
 * appear in the patch, against the mutating slide list — an early `remove`
 * shifts subsequent indices as expected.
 *
 * Body-scoped: only replaces top-level `<section class="slide">` blocks
 * inside `<body>`. Non-slide siblings (scripts, styles, container `<div>`s)
 * are preserved verbatim in place.
 */
export function applyDeckPatch(options: ApplyDeckPatchOptions): ApplyDeckPatchSuccess | ApplyDeckPatchFailure {
  const bodyRange = findBodyContentRange(options.currentHtml);
  if (!bodyRange) {
    return { ok: false, reason: 'current deck HTML has no <body>…</body> to patch' };
  }
  const bodyContent = options.currentHtml.slice(bodyRange.start, bodyRange.end);
  const slides = extractTopLevelSlideSections(bodyContent);
  if (slides.length === 0) {
    return { ok: false, reason: 'current deck body has no <section class="slide"> to patch' };
  }
  const workingSlides = slides.map((slide) => ({
    outerHtml: slide.outerHtml,
    start: slide.start,
    end: slide.end,
  }));
  let appliedOps = 0;
  for (const op of options.patch.ops) {
    if (!Number.isInteger(op.slideIndex) || op.slideIndex < 0) {
      return { ok: false, reason: `deck-patch op has non-integer slideIndex: ${op.slideIndex}` };
    }
    if (op.op === 'append' || op.op === 'prepend') {
      if (op.slideIndex > workingSlides.length) {
        return {
          ok: false,
          reason: `deck-patch ${op.op} targets slideIndex ${op.slideIndex} but deck has ${workingSlides.length} slides`,
        };
      }
    } else if (op.slideIndex >= workingSlides.length) {
      return {
        ok: false,
        reason: `deck-patch ${op.op} targets slideIndex ${op.slideIndex} but deck has ${workingSlides.length} slides`,
      };
    }
    switch (op.op) {
      case 'replace': {
        workingSlides[op.slideIndex] = { outerHtml: op.html, start: -1, end: -1 };
        break;
      }
      case 'remove': {
        workingSlides.splice(op.slideIndex, 1);
        break;
      }
      case 'append': {
        workingSlides.splice(op.slideIndex + 1, 0, { outerHtml: op.html, start: -1, end: -1 });
        break;
      }
      case 'prepend': {
        workingSlides.splice(op.slideIndex, 0, { outerHtml: op.html, start: -1, end: -1 });
        break;
      }
      default:
        return { ok: false, reason: `deck-patch op unsupported: ${op.op}` };
    }
    appliedOps += 1;
  }

  const rewrittenBody = replaceSlidesInBody(bodyContent, slides, workingSlides);
  const mergedHtml =
    options.currentHtml.slice(0, bodyRange.start) +
    rewrittenBody +
    options.currentHtml.slice(bodyRange.end);
  return { ok: true, html: mergedHtml, appliedOps };
}

interface TopLevelSlideSection {
  openTag: string;
  outerHtml: string;
  /** Byte offset of the opening `<section` in the source string. */
  start: number;
  /** Byte offset just past the closing `</section>` in the source string. */
  end: number;
}

/**
 * Find every top-level `<section class="slide" …>…</section>` block in the
 * given HTML fragment. "Top-level" means the depth-0 `<section>` open, but
 * the matching close still counts nested `<section>` tags inside.
 *
 * Uses a tag-token scanner rather than DOMParser so it works without jsdom
 * (vitest runs `environment: 'node'`) and never mutates whitespace/comments.
 * Matches are case-insensitive and tolerate any attribute ordering.
 */
function extractTopLevelSlideSections(html: string): TopLevelSlideSection[] {
  const results: TopLevelSlideSection[] = [];
  const openRe = /<section\b([^>]*)>/gi;
  const closeRe = /<\/section\s*>/gi;

  let searchFrom = 0;
  while (searchFrom < html.length) {
    openRe.lastIndex = searchFrom;
    const openMatch = openRe.exec(html);
    if (!openMatch) break;
    const openStart = openMatch.index;
    const openEnd = openStart + openMatch[0].length;
    if (!isSlideClass(openMatch[1] ?? '')) {
      searchFrom = openEnd;
      continue;
    }
    // Walk forward, counting nested `<section>` opens vs closes, to find the
    // matching close for this top-level open.
    let depth = 1;
    let cursor = openEnd;
    let matchedCloseEnd = -1;
    while (cursor < html.length && depth > 0) {
      openRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen = openRe.exec(html);
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
      // Unbalanced — skip and keep scanning after the open so a single bad
      // section does not swallow the rest of the body.
      searchFrom = openEnd;
      continue;
    }
    results.push({
      openTag: openMatch[0],
      outerHtml: html.slice(openStart, matchedCloseEnd),
      start: openStart,
      end: matchedCloseEnd,
    });
    searchFrom = matchedCloseEnd;
  }
  return results;
}

function isSlideClass(attrString: string): boolean {
  const match = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(attrString);
  if (!match) return false;
  const value = match[1] ?? match[2] ?? match[3] ?? '';
  return /(^|\s)slide(\s|$)/i.test(value);
}

function readSlideIndex(openTag: string): number | null {
  const match = /\bdata-slide-index\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+?))(?=\s|\/|>)/i.exec(openTag);
  if (!match) return null;
  const raw = (match[1] ?? match[2] ?? match[3] ?? '').trim();
  const num = Number(raw);
  return Number.isInteger(num) && num >= 0 ? num : null;
}

function readOp(openTag: string): DeckPatchOp | null {
  const match = /\bdata-op\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+?))(?=\s|\/|>)/i.exec(openTag);
  const raw = ((match?.[1] ?? match?.[2] ?? match?.[3] ?? '') || 'replace').trim().toLowerCase();
  if (raw === 'replace' || raw === 'remove' || raw === 'append' || raw === 'prepend') return raw;
  return null;
}

/**
 * Locate the content range inside the first `<body …>` element, so patch
 * replacement can be sliced back into the surrounding `<head>` + closing
 * boilerplate without touching them.
 */
function findBodyContentRange(html: string): { start: number; end: number } | null {
  const openMatch = /<body\b[^>]*>/i.exec(html);
  if (!openMatch) return null;
  const start = openMatch.index + openMatch[0].length;
  const closeMatch = /<\/body\s*>/i.exec(html.slice(start));
  if (!closeMatch) return null;
  return { start, end: start + closeMatch.index };
}

/**
 * Rewrite the body content by replacing the original slide range with the
 * working (post-patch) slide list, preserving anything between/around slides.
 */
function replaceSlidesInBody(
  bodyContent: string,
  originalSlides: TopLevelSlideSection[],
  workingSlides: Array<{ outerHtml: string; start: number; end: number }>,
): string {
  if (originalSlides.length === 0) return bodyContent;
  const firstStart = originalSlides[0]!.start;
  const lastEnd = originalSlides[originalSlides.length - 1]!.end;

  // Preserve any inter-slide separator whitespace that was between original
  // slides — model output doesn't include it, and stripping every newline
  // makes the resulting file a single mile-long line that is impossible to
  // git-diff review.
  const separator = pickInterSlideSeparator(bodyContent, originalSlides);
  const rebuilt = workingSlides.map((slide) => slide.outerHtml).join(separator);
  return (
    bodyContent.slice(0, firstStart) +
    rebuilt +
    bodyContent.slice(lastEnd)
  );
}

function pickInterSlideSeparator(
  bodyContent: string,
  slides: TopLevelSlideSection[],
): string {
  if (slides.length < 2) return '\n';
  const between = bodyContent.slice(slides[0]!.end, slides[1]!.start);
  return /^\s+$/.test(between) ? between : '\n';
}
