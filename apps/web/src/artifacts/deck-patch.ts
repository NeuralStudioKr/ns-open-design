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

export interface ParseDeckPatchOptions {
  /**
   * Comment-scoped slide indexes. When the model omits `data-slide-index`
   * (common with `data-screen-label`-only Teamver slides) and exactly one
   * fallback is available, that index is used.
   */
  fallbackSlideIndexes?: readonly number[];
  /**
   * Current on-disk deck HTML. Used to resolve `data-screen-label` /
   * `data-od-id` on a patch section back to a 0-based slide index.
   */
  currentHtml?: string;
}

/**
 * Parse the streamed deck-patch body into a sequence of ops. Ignores prose
 * between sections (models occasionally emit a one-line rationale) and
 * whitespace/comment nodes. Returns `ok: false` when the body has no valid
 * `<section class="slide" data-slide-index="…">` blocks.
 *
 * When `data-slide-index` is missing, tries (in order):
 *   1. identity attrs (`data-screen-label` / `data-od-id`) against `currentHtml`
 *   2. a single `fallbackSlideIndexes` entry from the attached comment scope
 */
const DECK_PATCH_MISSING_SLIDE_SECTIONS =
  'no <section class="slide"> blocks in deck-patch body';

/**
 * Visual-mark / drawing edits often emit raw SVG or div markup inside a
 * deck-patch artifact without wrapping it in `<section class="slide">`.
 * When the run has exactly one scoped slide index, wrap the inner HTML so
 * persist can merge instead of burning an auto-continue slot.
 */
export function salvageDeckPatchBodyMissingSlideWrapper(
  body: string,
  options: ParseDeckPatchOptions = {},
): string | null {
  const trimmed = String(body ?? '').trim();
  if (!trimmed) return null;
  if (extractTopLevelSlideSections(trimmed).length > 0) return null;
  if (/<patch\b/i.test(trimmed)) return null;

  const fallbacks = [...new Set(
    (options.fallbackSlideIndexes ?? [])
      .filter((index) => Number.isInteger(index) && index >= 0)
      .map((index) => Math.floor(index)),
  )];
  if (fallbacks.length !== 1) return null;

  const inner = trimmed
    .replace(/^<artifact\b[^>]*>/i, '')
    .replace(/<\/artifact>\s*$/i, '')
    .trim();
  if (!inner || inner.length < 4) return null;
  if (!/<[a-z!?]/i.test(inner)) return null;

  const slideIndex = fallbacks[0]!;
  return [
    `<section class="slide" data-slide-index="${slideIndex}">`,
    inner,
    '</section>',
  ].join('\n');
}

export function parseDeckPatch(
  body: string,
  options: ParseDeckPatchOptions = {},
): ParseDeckPatchResult | ParseDeckPatchFailure {
  const sections = extractTopLevelSlideSections(body);
  if (sections.length === 0) {
    return { ok: false, reason: DECK_PATCH_MISSING_SLIDE_SECTIONS };
  }
  const ops: DeckPatchSectionOp[] = [];
  for (const section of sections) {
    let slideIndex = readSlideIndex(section.openTag);
    if (slideIndex == null) {
      slideIndex = resolveMissingDeckPatchSlideIndex(section.openTag, options);
    }
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
      html: op === 'remove' ? '' : ensureDataSlideIndexAttr(section.outerHtml, slideIndex),
    });
  }
  return { ok: true, patch: { ops } };
}

export function parseDeckPatchWithSalvage(
  body: string,
  options: ParseDeckPatchOptions = {},
): ParseDeckPatchResult | ParseDeckPatchFailure {
  const direct = parseDeckPatch(body, options);
  if (direct.ok) return direct;
  if (direct.reason !== DECK_PATCH_MISSING_SLIDE_SECTIONS) return direct;
  const salvagedBody = salvageDeckPatchBodyMissingSlideWrapper(body, options);
  if (!salvagedBody) return direct;
  const salvaged = parseDeckPatch(salvagedBody, options);
  return salvaged.ok ? salvaged : direct;
}

export interface ApplyDeckPatchOptions {
  currentHtml: string;
  patch: DeckPatch;
  /**
   * Optional safety rail for comment-driven edits. When present, every op must
   * be a same-slide replacement for one of these indexes.
   */
  allowedSlideIndexes?: readonly number[];
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

export interface DeckSlideDiffSuccess {
  ok: true;
  changedSlideIndexes: number[];
}

export interface DeckSlideDiffFailure {
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
  const allowedSlideIndexes = normalizeAllowedSlideIndexes(options.allowedSlideIndexes);
  let appliedOps = 0;
  for (const op of options.patch.ops) {
    if (!Number.isInteger(op.slideIndex) || op.slideIndex < 0) {
      return { ok: false, reason: `deck-patch op has non-integer slideIndex: ${op.slideIndex}` };
    }
    if (allowedSlideIndexes) {
      if (!allowedSlideIndexes.has(op.slideIndex)) {
        return {
          ok: false,
          reason: `deck-patch targets slideIndex ${op.slideIndex} outside attached comment scope`,
        };
      }
      if (op.op !== 'replace') {
        return {
          ok: false,
          reason: `deck-patch ${op.op} is not allowed for scoped comment edits`,
        };
      }
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

export type DeckStructureMutationSuccess = {
  ok: true;
  html: string;
  /** 0-based active index the preview should land on after the mutation. */
  activeIndex: number;
  slideCount: number;
};

export type DeckStructureMutationFailure = {
  ok: false;
  reason: string;
};

/**
 * Drop one top-level slide and restamp `data-slide-index`. Refuses to delete
 * the last remaining slide so the deck never becomes empty.
 */
export function deleteDeckSlideAt(
  currentHtml: string,
  slideIndex: number,
): DeckStructureMutationSuccess | DeckStructureMutationFailure {
  const bodyRange = findBodyContentRange(currentHtml);
  if (!bodyRange) {
    return { ok: false, reason: 'current deck HTML has no <body>…</body>' };
  }
  const bodyContent = currentHtml.slice(bodyRange.start, bodyRange.end);
  const slides = extractTopLevelSlideSections(bodyContent);
  if (slides.length <= 1) {
    return { ok: false, reason: 'cannot delete the last remaining slide' };
  }
  if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= slides.length) {
    return { ok: false, reason: `slideIndex ${slideIndex} out of range (0..${slides.length - 1})` };
  }
  const patched = applyDeckPatch({
    currentHtml,
    patch: { ops: [{ op: 'remove', slideIndex, html: '' }] },
  });
  if (!patched.ok) return patched;
  const slideCount = slides.length - 1;
  const activeIndex = Math.min(slideIndex, slideCount - 1);
  return {
    ok: true,
    html: restampDeckSlideIndexes(patched.html),
    activeIndex,
    slideCount,
  };
}

/**
 * Move the slide at `fromIndex` to `toIndex` (any distance). Used by filmstrip
 * drag reorder. Adjacent ±1 is `moveDeckSlideByDelta`.
 */
export function reorderDeckSlideToIndex(
  currentHtml: string,
  fromIndex: number,
  toIndex: number,
): DeckStructureMutationSuccess | DeckStructureMutationFailure {
  const bodyRange = findBodyContentRange(currentHtml);
  if (!bodyRange) {
    return { ok: false, reason: 'current deck HTML has no <body>…</body>' };
  }
  const bodyContent = currentHtml.slice(bodyRange.start, bodyRange.end);
  const slides = extractTopLevelSlideSections(bodyContent);
  if (slides.length < 2) {
    return { ok: false, reason: 'need at least two slides to reorder' };
  }
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= slides.length) {
    return { ok: false, reason: `fromIndex ${fromIndex} out of range (0..${slides.length - 1})` };
  }
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= slides.length) {
    return { ok: false, reason: `toIndex ${toIndex} out of range (0..${slides.length - 1})` };
  }
  if (fromIndex === toIndex) {
    return {
      ok: true,
      html: currentHtml,
      activeIndex: fromIndex,
      slideCount: slides.length,
    };
  }
  const working = slides.map((slide) => ({
    outerHtml: slide.outerHtml,
    start: slide.start,
    end: slide.end,
  }));
  const [moved] = working.splice(fromIndex, 1);
  if (!moved) {
    return { ok: false, reason: 'failed to splice slide' };
  }
  working.splice(toIndex, 0, moved);
  const rewrittenBody = replaceSlidesInBody(bodyContent, slides, working);
  const mergedHtml =
    currentHtml.slice(0, bodyRange.start) +
    rewrittenBody +
    currentHtml.slice(bodyRange.end);
  return {
    ok: true,
    html: restampDeckSlideIndexes(mergedHtml),
    activeIndex: toIndex,
    slideCount: working.length,
  };
}

/**
 * Move the slide at `slideIndex` by `delta` positions (−1 = earlier, +1 = later).
 */
export function moveDeckSlideByDelta(
  currentHtml: string,
  slideIndex: number,
  delta: -1 | 1,
): DeckStructureMutationSuccess | DeckStructureMutationFailure {
  if (delta !== -1 && delta !== 1) {
    return { ok: false, reason: 'delta must be −1 or +1' };
  }
  const slides = extractTopLevelSlideSections(currentHtml);
  if (slides.length < 2) {
    return { ok: false, reason: 'need at least two slides to reorder' };
  }
  const target = slideIndex + delta;
  if (target < 0 || target >= slides.length) {
    return { ok: false, reason: 'slide already at edge' };
  }
  return reorderDeckSlideToIndex(currentHtml, slideIndex, target);
}

/** Minimal empty slide — inherits `class` from a neighbor when available. */
export function buildBlankDeckSlideShell(referenceOuterHtml?: string): string {
  const ref = String(referenceOuterHtml ?? '').trim();
  const openMatch = /^<section\b([^>]*)>/i.exec(ref);
  let sectionOpen = '<section class="slide">';
  if (openMatch) {
    const attrs = openMatch[1] ?? '';
    const classMatch = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
    if (classMatch) {
      const cls = (classMatch[1] ?? classMatch[2] ?? 'slide').trim() || 'slide';
      sectionOpen = `<section class="${cls}">`;
    }
  }
  return `${sectionOpen}<div class="slide-inner"><h2></h2></div></section>`;
}

function cloneSlideOuterHtmlForDuplicate(outerHtml: string): string {
  return outerHtml
    .replace(/\s*\bdata-slide-index\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
    .replace(/\s*\bdata-od-id\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '')
    .replace(/\s*\bdata-screen-label\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '');
}

/**
 * Insert a blank slide immediately after `slideIndex`. Focus lands on the new
 * slide (`slideIndex + 1`).
 */
export function insertBlankDeckSlideAfter(
  currentHtml: string,
  slideIndex: number,
): DeckStructureMutationSuccess | DeckStructureMutationFailure {
  const bodyRange = findBodyContentRange(currentHtml);
  if (!bodyRange) {
    return { ok: false, reason: 'current deck HTML has no <body>…</body>' };
  }
  const bodyContent = currentHtml.slice(bodyRange.start, bodyRange.end);
  const slides = extractTopLevelSlideSections(bodyContent);
  if (slides.length === 0) {
    return { ok: false, reason: 'deck has no slides' };
  }
  if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= slides.length) {
    return { ok: false, reason: `slideIndex ${slideIndex} out of range (0..${slides.length - 1})` };
  }
  const blank = buildBlankDeckSlideShell(slides[slideIndex]!.outerHtml);
  const patched = applyDeckPatch({
    currentHtml,
    patch: { ops: [{ op: 'append', slideIndex, html: blank }] },
  });
  if (!patched.ok) return patched;
  return {
    ok: true,
    html: restampDeckSlideIndexes(patched.html),
    activeIndex: slideIndex + 1,
    slideCount: slides.length + 1,
  };
}

/**
 * Duplicate the slide at `slideIndex` and insert the copy immediately after it.
 * Identity attrs (`data-od-id`, `data-screen-label`) are stripped on the copy.
 */
export function duplicateDeckSlideAt(
  currentHtml: string,
  slideIndex: number,
): DeckStructureMutationSuccess | DeckStructureMutationFailure {
  const bodyRange = findBodyContentRange(currentHtml);
  if (!bodyRange) {
    return { ok: false, reason: 'current deck HTML has no <body>…</body>' };
  }
  const bodyContent = currentHtml.slice(bodyRange.start, bodyRange.end);
  const slides = extractTopLevelSlideSections(bodyContent);
  if (slides.length === 0) {
    return { ok: false, reason: 'deck has no slides' };
  }
  if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= slides.length) {
    return { ok: false, reason: `slideIndex ${slideIndex} out of range (0..${slides.length - 1})` };
  }
  const duplicateHtml = cloneSlideOuterHtmlForDuplicate(slides[slideIndex]!.outerHtml);
  const patched = applyDeckPatch({
    currentHtml,
    patch: { ops: [{ op: 'append', slideIndex, html: duplicateHtml }] },
  });
  if (!patched.ok) return patched;
  return {
    ok: true,
    html: restampDeckSlideIndexes(patched.html),
    activeIndex: slideIndex + 1,
    slideCount: slides.length + 1,
  };
}

/** Force sequential `data-slide-index="0..N-1"` on every top-level slide. */
export function restampDeckSlideIndexes(html: string): string {
  const bodyRange = findBodyContentRange(html);
  if (!bodyRange) return html;
  const bodyContent = html.slice(bodyRange.start, bodyRange.end);
  const slides = extractTopLevelSlideSections(bodyContent);
  if (slides.length === 0) return html;
  const working = slides.map((slide, index) => ({
    outerHtml: forceDataSlideIndexAttr(slide.outerHtml, index),
    start: slide.start,
    end: slide.end,
  }));
  const rewrittenBody = replaceSlidesInBody(bodyContent, slides, working);
  return html.slice(0, bodyRange.start) + rewrittenBody + html.slice(bodyRange.end);
}

function normalizeAllowedSlideIndexes(indexes: readonly number[] | undefined): Set<number> | null {
  if (!indexes) return null;
  const normalized = indexes
    .filter((index) => Number.isInteger(index) && index >= 0)
    .map((index) => Math.floor(index));
  return normalized.length > 0 ? new Set(normalized) : new Set();
}

export function diffDeckSlideIndexes(
  beforeHtml: string,
  afterHtml: string,
  options?: {
    /** Pre-materialized before sections (e.g. persist reconcile). */
    beforeSlides?: readonly { outerHtml: string }[];
    /** Pre-materialized after sections. */
    afterSlides?: readonly { outerHtml: string }[];
  },
): DeckSlideDiffSuccess | DeckSlideDiffFailure {
  let beforeSlides = options?.beforeSlides;
  let afterSlides = options?.afterSlides;
  if (!beforeSlides) {
    const beforeBody = findBodyContentRange(beforeHtml);
    if (!beforeBody) {
      return { ok: false, reason: 'deck diff requires <body>…</body> in both documents' };
    }
    beforeSlides = extractTopLevelSlideSections(beforeHtml.slice(beforeBody.start, beforeBody.end));
  }
  if (!afterSlides) {
    const afterBody = findBodyContentRange(afterHtml);
    if (!afterBody) {
      return { ok: false, reason: 'deck diff requires <body>…</body> in both documents' };
    }
    afterSlides = extractTopLevelSlideSections(afterHtml.slice(afterBody.start, afterBody.end));
  }
  if (beforeSlides.length === 0 || afterSlides.length === 0) {
    return { ok: false, reason: 'deck diff requires slide sections in both documents' };
  }
  if (beforeSlides.length !== afterSlides.length) {
    return {
      ok: false,
      reason: `deck diff slide count changed from ${beforeSlides.length} to ${afterSlides.length}`,
    };
  }
  const changedSlideIndexes: number[] = [];
  for (let index = 0; index < beforeSlides.length; index += 1) {
    if (beforeSlides[index]?.outerHtml !== afterSlides[index]?.outerHtml) {
      changedSlideIndexes.push(index);
    }
  }
  return { ok: true, changedSlideIndexes };
}

export interface TopLevelSlideSection {
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
/**
 * Opening-tag attr region that allows `>` inside quoted values (e.g. style
 * `calc()` / content). A naive `[^>]*` cut drops trailing attrs such as
 * `data-slide-index` and mis-reports them as missing.
 */
const SECTION_OPEN_ATTRS_RE = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const SECTION_OPEN_RE = new RegExp(String.raw`<section\b(${SECTION_OPEN_ATTRS_RE})>`, 'gi');

/** Last HTML → sections cache shared by applyDeckPatch and extractSlideByIndex. */
let topLevelSlideSectionCache: { html: string; sections: TopLevelSlideSection[] } | null = null;

export function slideFilmstripLabel(slideHtml: string, index: number): string {
  const screen = /\bdata-screen-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(slideHtml);
  const fromScreen = (screen?.[1] ?? screen?.[2] ?? '').trim();
  if (fromScreen) return fromScreen;
  const inner = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(slideHtml)?.[1] ?? '';
  const heading = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return heading || String(index + 1);
}

export function listDeckFilmstripItems(html: string): Array<{ index: number; label: string }> {
  return extractTopLevelSlideSections(html).map((slide, index) => ({
    index,
    label: slideFilmstripLabel(slide.outerHtml, index),
  }));
}

export function extractTopLevelSlideSections(html: string): TopLevelSlideSection[] {
  if (topLevelSlideSectionCache?.html === html) {
    return topLevelSlideSectionCache.sections;
  }
  const results: TopLevelSlideSection[] = [];
  const openRe = new RegExp(SECTION_OPEN_RE.source, 'gi');
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
  topLevelSlideSectionCache = { html, sections: results };
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

function readHtmlAttr(openTag: string, name: string): string {
  const re = new RegExp(
    String.raw`\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+?))(?=\s|\/|>)`,
    'i',
  );
  const match = re.exec(openTag);
  return ((match?.[1] ?? match?.[2] ?? match?.[3] ?? '') || '').trim();
}

function resolveMissingDeckPatchSlideIndex(
  openTag: string,
  options: ParseDeckPatchOptions,
): number | null {
  const fromIdentity = resolveSlideIndexBySectionIdentity(openTag, options.currentHtml);
  if (fromIdentity != null) return fromIdentity;

  const fallbacks = [...new Set(
    (options.fallbackSlideIndexes ?? [])
      .filter((index) => Number.isInteger(index) && index >= 0)
      .map((index) => Math.floor(index)),
  )];
  return fallbacks.length === 1 ? fallbacks[0]! : null;
}

/**
 * Map a patch section that carries Teamver identity attrs (but no
 * `data-slide-index`) onto the matching slide in the current deck.
 */
function resolveSlideIndexBySectionIdentity(
  openTag: string,
  currentHtml: string | undefined,
): number | null {
  const html = String(currentHtml ?? '');
  if (!html.trim()) return null;

  const screenLabel = readHtmlAttr(openTag, 'data-screen-label');
  const odId = readHtmlAttr(openTag, 'data-od-id');
  if (!screenLabel && !odId) return null;

  const bodyRange = findBodyContentRange(html);
  const scope = bodyRange ? html.slice(bodyRange.start, bodyRange.end) : html;
  const slides = extractTopLevelSlideSections(scope);
  if (slides.length === 0) return null;

  const matchBy = (attr: string, value: string): number | null => {
    if (!value) return null;
    const matches = slides.flatMap((slide, index) => {
      const slideValue = readHtmlAttr(slide.openTag, attr);
      return slideValue && slideValue === value ? [index] : [];
    });
    return matches.length === 1 ? matches[0]! : null;
  };

  return matchBy('data-screen-label', screenLabel) ?? matchBy('data-od-id', odId);
}

/** Stamp `data-slide-index` onto a replacement section when the model omitted it. */
function ensureDataSlideIndexAttr(outerHtml: string, slideIndex: number): string {
  return outerHtml.replace(
    new RegExp(String.raw`^<section\b(${SECTION_OPEN_ATTRS_RE})>`, 'i'),
    (full, attrs: string) => {
      if (/\bdata-slide-index\s*=/i.test(attrs)) return full;
      const rest = attrs.trimStart();
      return rest
        ? `<section data-slide-index="${slideIndex}" ${rest}>`
        : `<section data-slide-index="${slideIndex}">`;
    },
  );
}

/** Replace or insert `data-slide-index` so structural edits stay index-aligned. */
function forceDataSlideIndexAttr(outerHtml: string, slideIndex: number): string {
  return outerHtml.replace(
    new RegExp(String.raw`^<section\b(${SECTION_OPEN_ATTRS_RE})>`, 'i'),
    (_full, attrs: string) => {
      const without = attrs.replace(/\s*\bdata-slide-index\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '');
      const rest = without.trimStart();
      return rest
        ? `<section data-slide-index="${slideIndex}" ${rest}>`
        : `<section data-slide-index="${slideIndex}">`;
    },
  );
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
export function findBodyContentRange(html: string): { start: number; end: number } | null {
  // Allow `>` inside quoted body attrs (same class of bug as section/patch opens).
  const openMatch = /<body\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(html);
  if (!openMatch) return null;
  const start = openMatch.index + openMatch[0].length;
  const closeMatch = /<\/body\s*>/i.exec(html.slice(start));
  if (!closeMatch) return null;
  return { start, end: start + closeMatch.index };
}

/** Quote-aware body inner HTML — shared by applyDeckPatch / extractSlideByIndex. */
export function extractDeckBodyContent(html: string): string {
  const range = findBodyContentRange(html);
  if (!range) return html;
  return html.slice(range.start, range.end);
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

function incomingLooksLikeHeadedDocument(html: string): boolean {
  return /<head\b/i.test(html);
}

function firstSlideHeading(slideHtml: string): string {
  const inner = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(slideHtml)?.[1] ?? '';
  return inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * A real rewrite copies the saved deck (usually with `<head>`).
 * Persist salvage wraps body-only top-up slides as
 * `<!doctype html><html lang="ko"><body>…` — that is NOT a rewrite.
 */
function incomingLooksLikeFullDeckRewrite(
  existingSlides: readonly TopLevelSlideSection[],
  incomingSlides: readonly TopLevelSlideSection[],
  incomingHtml: string,
): boolean {
  if (incomingLooksLikeHeadedDocument(incomingHtml)) return true;
  const existingTitle = existingSlides[0] ? firstSlideHeading(existingSlides[0].outerHtml) : '';
  const incomingTitle = incomingSlides[0] ? firstSlideHeading(incomingSlides[0].outerHtml) : '';
  return Boolean(existingTitle && incomingTitle && incomingTitle === existingTitle);
}

/**
 * Slide-count top-up / "add next pages" persist.
 *
 * The model must emit only new `<section class="slide">` blocks (or a
 * longer deck whose tail is new). We splice those onto the saved deck so
 * official look/`<head>` never has to be rewritten — that rewrite is the
 * 2–3 minute hang after a 1-slide first fill.
 */
export function appendIncomingSlidesOntoExistingDeck(
  existingHtml: string,
  incomingHtml: string,
): string | null {
  const existing = String(existingHtml ?? "");
  const incomingRaw = String(incomingHtml ?? "");
  if (!existing.trim() || !incomingRaw.trim()) return null;

  // Top-up streams often truncate mid-slide; close hosts so we can still
  // append a titled fragment instead of failing as incomplete_output.
  const incoming = closeUnclosedSlideHostsForAppend(incomingRaw);

  const incomingSlides = extractAppendableSlideSections(extractDeckBodyContent(incoming));
  if (incomingSlides.length === 0) return null;

  const existingSlides = extractAppendableSlideSections(extractDeckBodyContent(existing));
  const existingCount = existingSlides.length;

  let toAppend = incomingSlides;
  if (existingCount > 0 && incomingLooksLikeFullDeckRewrite(existingSlides, incomingSlides, incoming)) {
    if (incomingSlides.length <= existingCount) return null;
    toAppend = incomingSlides.slice(existingCount);
  }

  if (toAppend.length === 0) return null;

  const range = findBodyContentRange(existing);
  const chunk = toAppend.map((slide) => slide.outerHtml).join("\n");
  if (!range) return `${existing.replace(/\s*$/, "\n")}${chunk}\n`;
  const insertAt = findSlideHostAppendOffset(existing, range, existingSlides);
  return `${existing.slice(0, insertAt)}\n${chunk}\n${existing.slice(insertAt)}`;
}

const SLIDE_WRAPPER_TAG_RE =
  /<\/?(div|main|section|article|deck-stage)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const SLIDE_WRAPPER_HOST_CLASS_RE =
  /\b(?:presentation|deck|slides-container|deck-shell|deck-stage)\b/i;

function attrsLookLikeSlideWrapperHost(tag: string, attrs: string): boolean {
  return tag === "deck-stage" || SLIDE_WRAPPER_HOST_CLASS_RE.test(attrs);
}

/**
 * Keep appended slides inside the saved host (`.presentation`, `.deck`,
 * `<deck-stage>`). Splicing at `</body>` leaves 1–3 inside the wrapper and
 * the rest as siblings — preview then blanks or only pages the first block.
 * Brand chrome (`<header>`) before the first slide must not hide the host.
 */
function findSlideHostAppendOffset(
  existing: string,
  range: { start: number; end: number },
  existingSlides: readonly TopLevelSlideSection[],
): number {
  if (existingSlides.length === 0) return range.end;
  const first = existingSlides[0]!;
  const last = existingSlides[existingSlides.length - 1]!;
  const absFirst = range.start + first.start;
  const absLast = range.start + last.end;
  const before = existing.slice(range.start, absFirst);
  const host = findInnermostOpenSlideWrapperHost(before);
  if (!host) return range.end;
  const after = existing.slice(absLast, range.end);
  if (findMatchingTagCloseIndex(after, host.tag) < 0) return range.end;
  // After the last existing slide, still inside the host, so a trailing
  // footer / pager stays after the new pages instead of between them.
  return absLast;
}

function findInnermostOpenSlideWrapperHost(
  before: string,
): { tag: string } | null {
  const stack: { tag: string; isHost: boolean }[] = [];
  SLIDE_WRAPPER_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLIDE_WRAPPER_TAG_RE.exec(before)) !== null) {
    const tag = (match[1] ?? "div").toLowerCase();
    const attrs = match[2] ?? "";
    if (/^<\//.test(match[0])) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]!.tag === tag) {
          stack.splice(i);
          break;
        }
      }
      continue;
    }
    stack.push({ tag, isHost: attrsLookLikeSlideWrapperHost(tag, attrs) });
  }
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i]!.isHost) return { tag: stack[i]!.tag };
  }
  return null;
}

function findMatchingTagCloseIndex(after: string, tag: string): number {
  const re = new RegExp(`<(\\/?)${tag}\\b[^>]*>`, "gi");
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = re.exec(after)) !== null) {
    if (match[1]) {
      depth -= 1;
      if (depth === 0) return match.index;
    } else {
      depth += 1;
    }
  }
  return -1;
}

/** Close truncated section|div.slide hosts so append can see titled fragments. */
function closeUnclosedSlideHostsForAppend(html: string): string {
  // Local close — mirrors deck-html-content salvage without a circular import.
  const openRe = /<(section|div)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const opens: { tag: string; contentStart: number; openStart: number }[] = [];
  let match: RegExpExecArray | null;
  const source = String(html ?? "");
  openRe.lastIndex = 0;
  while ((match = openRe.exec(source)) !== null) {
    if (!isSlideClass(match[2] ?? "")) continue;
    opens.push({
      tag: (match[1] ?? "section").toLowerCase(),
      openStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  if (opens.length === 0) return source;
  const insertions: { at: number; text: string }[] = [];
  for (let i = 0; i < opens.length; i += 1) {
    const tag = opens[i]!.tag;
    const contentStart = opens[i]!.contentStart;
    const contentEnd = i + 1 < opens.length ? opens[i + 1]!.openStart : source.length;
    const chunk = source.slice(contentStart, contentEnd);
    let depth = 1;
    const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRe.exec(chunk)) !== null) {
      if (new RegExp(`^<\\/${tag}`, "i").test(tagMatch[0])) {
        depth -= 1;
        if (depth === 0) break;
      } else if (!/^<\//.test(tagMatch[0])) {
        depth += 1;
      }
    }
    if (depth > 0) {
      insertions.push({ at: contentEnd, text: `</${tag}>`.repeat(depth) });
    }
  }
  if (insertions.length === 0) return source;
  let out = source;
  for (let i = insertions.length - 1; i >= 0; i -= 1) {
    const item = insertions[i]!;
    out = `${out.slice(0, item.at)}${item.text}${out.slice(item.at)}`;
  }
  return out;
}

/**
 * Top-up append accepts official catalog hosts (`section|div.slide`).
 * Deck-patch stays section-only via {@link extractTopLevelSlideSections}.
 */
export function extractAppendableSlideSections(html: string): TopLevelSlideSection[] {
  const sectionOnly = extractTopLevelSlideSections(html);
  if (sectionOnly.length > 0) return sectionOnly;
  return extractTopLevelDivSlideSections(html);
}

/** Same hosts as top-up append — Capsule `div.slide` must count or top-up never fires. */
export function countAppendableDeckSlides(html: string): number {
  return extractAppendableSlideSections(extractDeckBodyContent(html)).length;
}

function extractTopLevelDivSlideSections(html: string): TopLevelSlideSection[] {
  const results: TopLevelSlideSection[] = [];
  const openRe = /<div\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  const closeRe = /<\/div\s*>/gi;
  let searchFrom = 0;
  while (searchFrom < html.length) {
    openRe.lastIndex = searchFrom;
    const openMatch = openRe.exec(html);
    if (!openMatch) break;
    const openStart = openMatch.index;
    const openEnd = openStart + openMatch[0].length;
    if (!isSlideClass(openMatch[1] ?? "")) {
      searchFrom = openEnd;
      continue;
    }
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
