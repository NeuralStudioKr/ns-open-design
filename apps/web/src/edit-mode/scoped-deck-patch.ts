/**
 * Scoped comment deck-patch merge pipeline.
 *
 * Comment edits attach a slideIndex + element ids that may be stale by
 * persist time. This module normalizes deck-patch ops, applies relaxed
 * scope retries, and narrows merged HTML back to the user's target via
 * element merge + slide-level fallbacks.
 */

import {
  applyDeckPatch,
  extractDeckBodyContent,
  extractTopLevelSlideSections,
  parseDeckPatchWithSalvage,
  type DeckPatch,
} from '../artifacts/deck-patch';
import type { ChatCommentAttachment } from '../types';
import {
  isScreenshotOnlyVisualCommentTarget,
  formatVisualMarkPlacementStyle,
  buildClientVisualMarkFallbackInnerMarkup,
  buildVisualMarkDeckPatchInnerMarkup,
} from '../comments';
import { validateCommentEditIntentRespected, targetTextContentPreserved } from './comment-edit-intent';
import {
  graftPatchedTargetElementFromSource,
  mergeManualEditTargetByHint,
  mergeManualEditTargetsFromSource,
  parseManualEditSource,
  readScopedCommentTargetText,
  resolveManualEditTargetReference,
  sanitizeManualEditDocumentInPlace,
  sanitizeManualEditFullSource,
  sanitizeManualEditHtmlFragment,
  serializeManualEditSource,
} from './source-patches';
import { devLog } from '../lib/devLog';

export type ScopedDeckPersistFailureCode =
  | 'deck_patch_parse_failed'
  | 'deck_patch_current_unreadable'
  | 'deck_patch_merge_failed'
  | 'comment_edit_intent_violated'
  | 'full_deck_current_unreadable'
  | 'full_deck_diff_failed'
  | 'full_deck_outside_slide_scope'
  | 'full_deck_outside_element_scope'
  | 'full_deck_comment_target_unresolved'
  | 'comment_scope_missing_slide';

export type DeckPatchMergeResult =
  | { ok: true; html: string; sanitized?: boolean }
  | { ok: false; code: ScopedDeckPersistFailureCode; reason: string };

/** Visual marks (draw/memo screenshot) are slide-scoped, not element-id scoped. */
export function isVisualCommentAttachment(attachment: ChatCommentAttachment): boolean {
  if (attachment.selectionKind === 'visual') return true;
  // Defensive: selectionKind can be dropped by stale merges; markKind/screenshotPath
  // still identify draw-annotation attachments.
  if (attachment.markKind) return true;
  if (String(attachment.screenshotPath || '').trim()) return true;
  const elementId = String(attachment.elementId || '').trim();
  if (elementId.startsWith('visual-mark-')) return true;
  return false;
}

/**
 * Ensure a `<section class="slide" …>` root has `position:relative` so an
 * absolute-positioned visual-mark child anchors to the slide instead of a
 * further-up positioned ancestor (viewport in the worst case). Preserves
 * any pre-existing style; skips modification when the tag already declares
 * any explicit `position:` value.
 */
export function ensureSectionRelativePositioning(sectionHtml: string): string {
  const tagMatch = sectionHtml.match(/^<section\b([^>]*)>/i);
  if (!tagMatch) return sectionHtml;
  const attrs = tagMatch[1] ?? '';
  const styleMatch = attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const currentStyle = styleMatch ? (styleMatch[1] ?? styleMatch[2] ?? '') : '';
  if (/(^|;|\s)position\s*:/i.test(currentStyle)) return sectionHtml;
  const nextStyle = currentStyle
    ? `${currentStyle.replace(/;\s*$/, '')};position:relative`
    : 'position:relative';
  let nextAttrs: string;
  if (styleMatch) {
    nextAttrs = attrs.replace(
      styleMatch[0],
      `style="${nextStyle}"`,
    );
  } else {
    nextAttrs = `${attrs} style="${nextStyle}"`;
  }
  return `<section${nextAttrs}>${sectionHtml.slice(tagMatch[0].length)}`;
}

/**
 * True for draw-annotation attachments: the user drew ink or a box on the
 * screenshot. These are always slide-scoped adds ("stick a heart here"),
 * regardless of whether the reconciler later mapped their bounds to a real
 * DOM element id — the user's intent was to ADD a shape at that location,
 * not modify the underlying element.
 */
export function isDrawnVisualMarkAttachment(attachment: ChatCommentAttachment): boolean {
  if (!isVisualCommentAttachment(attachment)) return false;
  if (attachment.markKind === 'stroke' || attachment.markKind === 'click+stroke'
    || attachment.markKind === 'box' || attachment.markKind === 'click+box') return true;
  if (attachment.selectionKind === 'visual' && Boolean(String(attachment.screenshotPath || '').trim())) {
    return true;
  }
  return false;
}

export function graftVisualMarksIntoDeckHtml(
  currentHtml: string,
  commentAttachments: readonly ChatCommentAttachment[],
  options?: {
    sanitize?: boolean;
    /** Pre-materialized current sections — skip body extract when stabilize shares them. */
    currentSlides?: readonly { outerHtml: string }[];
  },
): string | null {
  const ops: Array<{ op: 'replace'; slideIndex: number; html: string }> = [];
  // One empty host Document for all mark fragment scrubs in this graft pass.
  const fragmentHost = parseManualEditSource('<!doctype html><html><body></body></html>');
  // One section materialization (was extractSlideByIndex × marks).
  // Work from the original slides so multi-mark grafts stay O(sections), not
  // O(marks × sections) via repeated applyDeckPatch scans.
  const currentSlides = options?.currentSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(currentHtml));
  for (const attachment of commentAttachments) {
    // Accept any drawn visual mark — the reconciler may have assigned a real
    // element id from bounds overlap, but the user's intent is still to ADD
    // a shape at that location, so we still want the client graft.
    if (!isDrawnVisualMarkAttachment(attachment) && !isScreenshotOnlyVisualCommentTarget(attachment)) continue;
    if (!hasValidDeckSlideIndex(attachment)) continue;
    const slideIndex = Math.floor(attachment.slideIndex as number);
    const existing = ops.find((op) => op.slideIndex === slideIndex);
    const slide = existing?.html ?? currentSlides[slideIndex]?.outerHtml ?? null;
    if (!slide) continue;
    const closingTag = '</section>';
    const closingIndex = slide.lastIndexOf(closingTag);
    if (closingIndex < 0) continue;
    const placementStyle = formatVisualMarkPlacementStyle(attachment.pagePosition);
    const shapeMarkup = buildVisualMarkDeckPatchInnerMarkup(attachment.comment || '');
    // Fallback to a visible dashed-rect marker when no shape keyword matches —
    // the raw template returns an HTML comment placeholder, which the client
    // graft would embed as an invisible empty box.
    const innerMarkup = shapeMarkup.trim().startsWith('<!--')
      ? buildClientVisualMarkFallbackInnerMarkup()
      : shapeMarkup;
    let markHtml =
      `<div class="od-visual-mark-target" style="${placementStyle};display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9999">${innerMarkup}</div>`;
    // Match repairWipedSlidesForVisualMarks — sanitize mark fragment before splice.
    markHtml = sanitizeManualEditHtmlFragment(markHtml, fragmentHost);
    if (!markHtml.trim()) continue;
    // Ensure the slide root is `position:relative` so the absolute mark div
    // anchors to the slide instead of a distant ancestor. Skip when the
    // opening tag already declares any explicit `position:`.
    const slideWithRelative = ensureSectionRelativePositioning(slide);
    const withRelativeClosingIndex = slideWithRelative.lastIndexOf(closingTag);
    if (withRelativeClosingIndex < 0) continue;
    const patchedSlide =
      slideWithRelative.slice(0, withRelativeClosingIndex)
      + markHtml
      + slideWithRelative.slice(withRelativeClosingIndex);
    if (patchedSlide === slide) continue;
    if (existing) existing.html = patchedSlide;
    else ops.push({ op: 'replace', slideIndex, html: patchedSlide });
  }
  if (ops.length === 0) return null;
  const merged = applyDeckPatch({
    currentHtml,
    patch: { ops },
  });
  if (!merged.ok) return null;
  // Default full-source scrub — client visual-mark persist can skip a second parse.
  // Callers that own a terminal sanitize (stabilize → applyScoped / salvage) pass
  // `{ sanitize: false }` so graft does not double-parse the full deck.
  if (options?.sanitize === false) return merged.html;
  return sanitizeManualEditFullSource(merged.html);
}

export function scopedCommentElementIds(attachment: ChatCommentAttachment): string[] {
  // Screenshot-only visuals have no DOM id. Visual marks that still carry a
  // concrete picked element (selector/htmlHint/real elementId) stay element-scoped.
  if (isScreenshotOnlyVisualCommentTarget(attachment)) return [];
  const ids = [
    attachment.elementId,
    ...selectorCommentElementIds(attachment.selector),
    domSelectorCommentElementId(attachment.selector),
    ...(attachment.podMembers ?? []).flatMap((member) => [
      member.elementId,
      ...selectorCommentElementIds(member.selector),
      domSelectorCommentElementId(member.selector),
    ]),
  ];
  return [...new Set(
    ids
      .map((id) => String(id || '').trim())
      .filter((id) => id && !id.startsWith('pin-') && !id.startsWith('file-comment-'))
      .filter((id) => !id.startsWith('visual-mark-'))
      .filter((id) => !isUnsafeCommentElementTargetId(id)),
  )];
}

/** True when at least one attachment needs a concrete DOM/element target id. */
export function hasElementScopedCommentAttachments(
  commentAttachments: readonly ChatCommentAttachment[] | undefined,
): boolean {
  return (commentAttachments ?? []).some(
    (attachment) => !isScreenshotOnlyVisualCommentTarget(attachment)
      && scopedCommentElementIds(attachment).length > 0,
  );
}

export function isUnsafeCommentElementTargetId(targetId: string): boolean {
  const normalized = String(targetId || '').trim().toLowerCase();
  return (
    normalized === 'body'
    || normalized === 'html'
    || normalized === 'document'
    || normalized === 'dom:body'
    || normalized === 'dom:html'
    || normalized === 'dom:document'
    || normalized === 'dom:body > body'
  );
}

export function selectorCommentElementIds(selector: string | undefined): string[] {
  const trimmed = String(selector || '').trim();
  if (!trimmed) return [];
  const ids: string[] = [];
  for (const attr of ['data-od-id', 'data-screen-label', 'data-od-source-path', 'data-od-runtime-id']) {
    const re = new RegExp(`\\[${attr}=(?:"([^"]+)"|'([^']+)'|([^\\]\\s]+))\\]`, 'gi');
    for (const match of trimmed.matchAll(re)) {
      const value = match[1] || match[2] || match[3] || '';
      if (value.trim()) ids.push(value.trim());
    }
  }
  return ids;
}

function domSelectorCommentElementId(selector: string | undefined): string {
  const trimmed = String(selector || '').trim();
  if (!trimmed || /[<{}]/.test(trimmed)) return '';
  if (isUnsafeCommentElementTargetId(trimmed) || isUnsafeCommentElementTargetId(`dom:${trimmed}`)) {
    return '';
  }
  if (
    !trimmed.startsWith('body > ')
    && !/^(?:[a-z][a-z0-9-]*|\.[a-z0-9_-]+|\[[a-z0-9_-]+=)/i.test(trimmed)
  ) {
    return '';
  }
  return `dom:${trimmed}`;
}

export function coerceDeckPatchToAllowedScope(
  patch: DeckPatch,
  allowedSlideIndexes: readonly number[] | undefined,
  currentHtml?: string,
  commentAttachments?: readonly ChatCommentAttachment[],
  /** Pre-materialized sections — skip body extract when caller shares them. */
  precomputedSlides?: readonly { outerHtml: string; openTag: string }[] | null,
): DeckPatch {
  if (!allowedSlideIndexes || allowedSlideIndexes.length !== 1) return patch;
  const allowed = allowedSlideIndexes[0]!;
  if (!patch.ops.some((op) => op.slideIndex !== allowed)) return patch;
  // One section materialization for text-verify + label conflict (was
  // extractSlideByIndex × foreign ops + a second full section scan).
  const currentSlides = precomputedSlides
    ?? (currentHtml
      ? extractTopLevelSlideSections(extractDeckBodyContent(currentHtml))
      : null);
  if (currentSlides && commentAttachments?.length) {
    for (const op of patch.ops) {
      if (op.slideIndex === allowed) continue;
      const modelSlide = currentSlides[op.slideIndex]?.outerHtml ?? null;
      if (!modelSlide) continue;
      for (const attachment of commentAttachments) {
        if (targetTextPreservedInPatchedSlide(modelSlide, attachment)) {
          return patch;
        }
      }
    }
  }
  // Refuse remap when the patch HTML clearly identifies a different slide
  // (data-slide-index / data-screen-label). Blindly rewriting slideIndex in
  // that case pastes foreign slide content onto the allowed index.
  if (currentSlides) {
    const conflicts = patch.ops.some(
      (op) =>
        op.slideIndex !== allowed
        && op.op === 'replace'
        && deckPatchHtmlConflictsWithAllowedSlide(op.html, currentSlides, allowed),
    );
    if (conflicts) return patch;
  }
  return {
    ops: patch.ops.map((op) => ({ ...op, slideIndex: allowed })),
  };
}

function deckPatchHtmlConflictsWithAllowedSlide(
  html: string,
  currentSlides: readonly { outerHtml: string; openTag: string }[],
  allowedSlideIndex: number,
): boolean {
  const source = String(html || '');
  if (!source.trim()) return false;
  const openTag = /^<section\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(source)?.[0] ?? '';
  const declaredIndex = /\bdata-slide-index\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/i.exec(openTag);
  const declaredRaw = (declaredIndex?.[1] ?? declaredIndex?.[2] ?? declaredIndex?.[3] ?? '').trim();
  if (declaredRaw !== '') {
    const declared = Number(declaredRaw);
    if (Number.isInteger(declared) && declared >= 0 && declared !== allowedSlideIndex) {
      return true;
    }
  }
  const labelMatch = /\bdata-screen-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(openTag);
  const label = (labelMatch?.[1] ?? labelMatch?.[2] ?? '').trim();
  if (!label) return false;
  const allowedSlide = currentSlides[allowedSlideIndex]?.outerHtml ?? null;
  if (allowedSlide && allowedSlide.includes(`data-screen-label="${label}"`)) return false;
  for (let index = 0; index < currentSlides.length; index += 1) {
    if (index === allowedSlideIndex) continue;
    if (currentSlides[index]?.openTag.includes(`data-screen-label="${label}"`)) return true;
  }
  return false;
}

function targetElementTextPreservedAfterMerge(
  currentHtml: string,
  patchedHtml: string,
  attachment: ChatCommentAttachment,
  slideIndex: number,
  parsedDocs?: { current?: Document | null; patched?: Document | null },
): boolean {
  const hint = attachmentMergeHint(attachment);
  const scope = { slideIndex };
  const before = readScopedCommentTargetText(currentHtml, scope, {
    elementId: attachment.elementId,
    ...hint,
  }, parsedDocs?.current);
  const after = readScopedCommentTargetText(patchedHtml, scope, {
    elementId: attachment.elementId,
    ...hint,
  }, parsedDocs?.patched);
  if (!before?.trim()) return true;
  return targetTextContentPreserved(attachment, after ?? '');
}

function collapseSlideText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, '')
    .trim();
}

function isLikelySlideContentWipe(beforeSlide: string, afterSlide: string): boolean {
  const beforeText = collapseSlideText(beforeSlide);
  const afterText = collapseSlideText(afterSlide);
  const beforeTags = (beforeSlide.match(/<[^>]+>/g) ?? []).length;
  const afterTags = (afterSlide.match(/<[^>]+>/g) ?? []).length;
  const visualMarkAdded =
    afterSlide.includes('od-visual-mark-target')
    && !beforeSlide.includes('od-visual-mark-target');
  if (visualMarkAdded && beforeText.length >= 8 && afterText.length < beforeText.length * 0.75) {
    return true;
  }
  if (beforeText.length < 24) return false;
  if (afterText.length >= beforeText.length * 0.5) return false;
  if (beforeTags >= 4 && afterTags <= Math.max(2, Math.floor(beforeTags * 0.45))) return true;
  return afterText.length < beforeText.length * 0.5;
}

/**
 * Extract the first `.od-visual-mark-target` outerHTML from a slide fragment.
 * Prefer Document querySelector so nested markup (svg/img inside the mark)
 * is not truncated at the first `</div>` the way a shallow regex would.
 */
function extractVisualMarkTargetHtml(
  slideHtml: string,
  fragmentHost?: Document | null,
): string | null {
  const host = fragmentHost ?? parseManualEditSource('<!doctype html><html><body></body></html>');
  if (host) {
    try {
      host.body.innerHTML = slideHtml;
      const el = host.body.querySelector('.od-visual-mark-target');
      const html = el?.outerHTML ?? null;
      host.body.innerHTML = '';
      return html;
    } catch {
      host.body.innerHTML = '';
    }
  }
  // Parser-null / host failure — last-resort shallow match (may truncate nested divs).
  const match = slideHtml.match(/<div\s+class="od-visual-mark-target"[\s\S]*?<\/div>/i);
  return match?.[0] ?? null;
}

function graftVisualMarkIntoSlide(slideHtml: string, markHtml: string): string | null {
  const closingTag = '</section>';
  const closingIndex = slideHtml.lastIndexOf(closingTag);
  if (closingIndex < 0) return null;
  if (slideHtml.includes(markHtml)) return slideHtml;
  return slideHtml.slice(0, closingIndex) + markHtml + slideHtml.slice(closingIndex);
}

/**
 * When a visual-mark deck-patch replaces an entire slide with only the mark
 * overlay, restore the pre-patch slide and insert the mark before </section>.
 */
export function repairWipedSlidesForVisualMarks(
  currentHtml: string,
  mergedHtml: string,
  commentAttachments: readonly ChatCommentAttachment[],
  options?: {
    currentSlides?: readonly { outerHtml: string }[];
    mergedSlides?: readonly { outerHtml: string }[];
  },
): string {
  const ops: Array<{ op: 'replace'; slideIndex: number; html: string }> = [];
  const fragmentHost = parseManualEditSource('<!doctype html><html><body></body></html>');
  // One section materialization each (was extractSlideByIndex × attachments × 2).
  const currentSlides = options?.currentSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(currentHtml));
  const mergedSlides = options?.mergedSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(mergedHtml));
  for (const attachment of commentAttachments) {
    if (!isScreenshotOnlyVisualCommentTarget(attachment)) continue;
    if (!hasValidDeckSlideIndex(attachment)) continue;
    const slideIndex = Math.floor(attachment.slideIndex as number);
    const beforeSlide = currentSlides[slideIndex]?.outerHtml ?? null;
    const afterSlide = mergedSlides[slideIndex]?.outerHtml ?? null;
    if (!beforeSlide || !afterSlide || beforeSlide === afterSlide) continue;
    if (!isLikelySlideContentWipe(beforeSlide, afterSlide)) continue;

    let markHtml = extractVisualMarkTargetHtml(afterSlide, fragmentHost);
    const placementStyle = formatVisualMarkPlacementStyle(attachment.pagePosition);
    const innerMarkup = buildVisualMarkDeckPatchInnerMarkup(attachment.comment || '');
    if (!markHtml || !/<svg\b/i.test(markHtml)) {
      markHtml =
        `<div class="od-visual-mark-target" style="${placementStyle};display:flex;align-items:center;justify-content:center">${innerMarkup}</div>`;
    }
    // Model mark HTML can carry on*/img XSS — sanitize before grafting back.
    markHtml = sanitizeManualEditHtmlFragment(markHtml, fragmentHost);
    if (!markHtml.trim()) continue;
    const repairedSlide = graftVisualMarkIntoSlide(beforeSlide, markHtml);
    if (!repairedSlide || repairedSlide === beforeSlide) continue;
    if (!ops.some((op) => op.slideIndex === slideIndex)) {
      ops.push({ op: 'replace', slideIndex, html: repairedSlide });
      devLog.warn('[deck-patch] repaired slide content wipe for visual mark', {
        slideIndex,
        elementId: attachment.elementId,
      });
    }
  }
  if (ops.length === 0) return mergedHtml;
  const merged = applyDeckPatch({
    currentHtml: mergedHtml,
    patch: { ops },
  });
  return merged.ok ? merged.html : mergedHtml;
}

/**
 * Visual-mark edits must not collapse the deck or wipe slide bodies. When the
 * model returns fewer slides or hollow sections, graft marks into the current deck.
 */
export function stabilizeVisualMarkDeckHtml(
  currentHtml: string,
  nextHtml: string,
  commentAttachments: readonly ChatCommentAttachment[],
  options?: {
    /** Pre-materialized current sections — skip rematerialize when finalize/apply shares them. */
    currentSlides?: readonly { outerHtml: string }[];
    /** Pre-materialized next/merged sections. */
    mergedSlides?: readonly { outerHtml: string }[];
  },
): string {
  const visualMarks = commentAttachments.filter(isScreenshotOnlyVisualCommentTarget);
  if (visualMarks.length === 0) return nextHtml;

  const currentSlides = options?.currentSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(currentHtml));
  const nextSlides = options?.mergedSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(nextHtml));

  if (nextSlides.length < currentSlides.length) {
    devLog.warn('[deck-patch] visual-mark edit reduced slide count — grafting into current deck', {
      currentSlideCount: currentSlides.length,
      nextSlideCount: nextSlides.length,
    });
    // Caller owns terminal full-source scrub (applyScoped / element-patch /
    // salvage / ProjectView persist) — skip graft sanitize to avoid 2× parse.
    const grafted = graftVisualMarksIntoDeckHtml(currentHtml, commentAttachments, {
      sanitize: false,
      currentSlides,
    });
    return grafted ?? currentHtml;
  }

  return repairWipedSlidesForVisualMarks(currentHtml, nextHtml, commentAttachments, {
    currentSlides,
    mergedSlides: nextSlides,
  });
}

export function applyScopedDeckPatchToHtml(input: {
  currentHtml: string;
  patchBody?: string;
  patch?: DeckPatch;
  allowedSlideIndexes?: readonly number[];
  commentAttachments?: readonly ChatCommentAttachment[];
  instructionText?: string;
  /** Pre-materialized current sections from persist reconcile — skip rematerialize. */
  currentSlides?: readonly { outerHtml: string; openTag: string }[];
}): DeckPatchMergeResult {
  const parsed = input.patch
    ? { ok: true as const, patch: input.patch }
    : parseDeckPatchWithSalvage(input.patchBody ?? '', {
        fallbackSlideIndexes: input.allowedSlideIndexes,
        currentHtml: input.currentHtml,
      });
  if (!parsed.ok) {
    return { ok: false, code: 'deck_patch_parse_failed', reason: parsed.reason };
  }
  const currentHtml = input.currentHtml;
  // One section materialization shared by coerce + narrow merge + finalize
  // (any comment scope — not only when allowedSlideIndexes is pre-filled).
  const sharedCurrentSlides = input.currentSlides
    ?? (input.commentAttachments?.length
      ? extractTopLevelSlideSections(extractDeckBodyContent(currentHtml))
      : null);
  const patchForScope = coerceDeckPatchToAllowedScope(
    parsed.patch,
    input.allowedSlideIndexes,
    currentHtml,
    input.commentAttachments,
    sharedCurrentSlides,
  );
  const strictScopeApply = applyDeckPatch({
    currentHtml,
    patch: patchForScope,
    allowedSlideIndexes: input.allowedSlideIndexes,
  });
  let merged = strictScopeApply;
  let mergedScopeRelaxed = false;
  if (
    !strictScopeApply.ok &&
    input.allowedSlideIndexes &&
    input.commentAttachments?.length &&
    scopeRejectionCanRetry(strictScopeApply.reason)
  ) {
    const relaxed = applyDeckPatch({
      currentHtml,
      patch: parsed.patch,
    });
    if (relaxed.ok) {
      devLog.warn('[deck-patch] strict scope apply rejected — retrying without scope guard', {
        strictReason: strictScopeApply.reason,
        allowedSlideIndexes: input.allowedSlideIndexes,
      });
      merged = relaxed;
      mergedScopeRelaxed = true;
    }
  }
  if (!merged.ok) {
    return { ok: false, code: 'deck_patch_merge_failed', reason: merged.reason };
  }
  // One patched-section materialization shared by scoped merge + finalize stabilize.
  const sharedPatchedSlides = input.commentAttachments?.length
    ? extractTopLevelSlideSections(extractDeckBodyContent(merged.html))
    : undefined;
  if (input.allowedSlideIndexes && input.commentAttachments?.length) {
    const scoped = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml: merged.html,
      commentAttachments: input.commentAttachments,
      instructionText: input.instructionText,
      currentSlides: sharedCurrentSlides ?? undefined,
      patchedSlides: sharedPatchedSlides,
    });
    if (!scoped.ok) {
      return { ok: false, code: 'deck_patch_merge_failed', reason: scoped.reason };
    }
    if (scoped.narrowed) {
      // Merge returns final sections after last mutate — skip rematerialize.
      return finalizeScopedDeckMergeHtml({
        currentHtml,
        mergedHtml: scoped.html,
        commentAttachments: input.commentAttachments,
        instructionText: input.instructionText,
        currentSlides: sharedCurrentSlides ?? undefined,
        mergedSlides: scoped.sections,
      });
    }
    if (mergedScopeRelaxed) {
      devLog.warn('[deck-patch] scope-relaxed apply produced no narrowed match — rejecting', {
        allowedSlideIndexes: input.allowedSlideIndexes,
      });
      return {
        ok: false,
        code: 'deck_patch_merge_failed',
        reason: strictScopeApply.ok ? 'unexpected relaxed apply state' : strictScopeApply.reason,
      };
    }
  }
  return finalizeScopedDeckMergeHtml({
    currentHtml,
    mergedHtml: merged.html,
    commentAttachments: input.commentAttachments ?? [],
    instructionText: input.instructionText,
    requireIntent: Boolean(input.commentAttachments?.length),
    currentSlides: sharedCurrentSlides ?? undefined,
    mergedSlides: sharedPatchedSlides,
  });
}

/**
 * Intent validate + stabilize + sanitize with one Document when stabilize is a
 * no-op (common non-visual path). Avoids intent-parse then full-source re-parse.
 * Also used by ProjectView salvage so it does not reimplement the fold.
 */
export function finalizeScopedDeckMergeHtml(input: {
  currentHtml: string;
  mergedHtml: string;
  commentAttachments: readonly ChatCommentAttachment[];
  instructionText?: string;
  requireIntent?: boolean;
  /** Pre-materialized current sections for stabilize (applyScoped / element-patch). */
  currentSlides?: readonly { outerHtml: string }[];
  /** Pre-materialized merged/patched sections for stabilize. */
  mergedSlides?: readonly { outerHtml: string }[];
  /**
   * When true and stabilize is a no-op, skip re-scrub (element-patch already
   * sanitized in-place). Graft/repair paths still full-source sanitize.
   */
  alreadySanitized?: boolean;
}): DeckPatchMergeResult {
  const parsedDoc = parseManualEditSource(input.mergedHtml);
  const intent = validateCommentEditIntentRespected({
    mergedHtml: input.mergedHtml,
    commentAttachments: input.commentAttachments,
    instructionText: input.instructionText,
    parsedDoc,
  });
  if (!intent.ok && (input.requireIntent ?? true)) {
    return { ok: false, code: 'comment_edit_intent_violated', reason: intent.reason };
  }
  const repairedHtml = input.commentAttachments.length > 0
    ? stabilizeVisualMarkDeckHtml(
      input.currentHtml,
      input.mergedHtml,
      input.commentAttachments,
      {
        currentSlides: input.currentSlides,
        mergedSlides: input.mergedSlides,
      },
    )
    : input.mergedHtml;
  if (repairedHtml === input.mergedHtml) {
    if (input.alreadySanitized) {
      return { ok: true, html: input.mergedHtml, sanitized: true };
    }
    if (parsedDoc) {
      sanitizeManualEditDocumentInPlace(parsedDoc);
      return {
        ok: true,
        html: serializeManualEditSource(parsedDoc, input.mergedHtml),
        sanitized: true,
      };
    }
  }
  return { ok: true, html: sanitizeManualEditFullSource(repairedHtml), sanitized: true };
}

function scopeRejectionCanRetry(reason: string): boolean {
  return (
    reason.includes('outside attached comment scope') ||
    reason.includes('is not allowed for scoped comment edits') ||
    /targets slideIndex \d+ but deck has \d+ slides/.test(reason)
  );
}

function listChangedDeckSlideIndexesFromSections(
  currentSlides: readonly { outerHtml: string }[],
  patchedSlides: readonly { outerHtml: string }[],
): number[] {
  const changed: number[] = [];
  const pushUnique = (index: number) => {
    if (Number.isInteger(index) && index >= 0 && !changed.includes(index)) {
      changed.push(index);
    }
  };
  const maxLen = Math.max(currentSlides.length, patchedSlides.length);
  for (let index = 0; index < maxLen; index += 1) {
    const currentHtmlAt = currentSlides[index]?.outerHtml ?? '';
    const patchedHtmlAt = patchedSlides[index]?.outerHtml ?? '';
    if (currentHtmlAt !== patchedHtmlAt) {
      pushUnique(index);
    }
  }
  return changed;
}

export function attachmentMergeHint(
  attachment: ChatCommentAttachment,
  instructionText?: string,
): {
  currentText?: string;
  instructionText?: string;
  htmlHint?: string;
  selector?: string;
} {
  return {
    currentText: attachment.currentText,
    instructionText: scopedCommentInstructionText(attachment, instructionText),
    htmlHint: attachment.htmlHint,
    selector: attachment.selector,
  };
}

function tryHintOnlyScopedMerge(input: {
  nextHtml: string;
  patchedHtml: string;
  attachment: ChatCommentAttachment;
  slideIndex: number;
  instructionText?: string;
  parsedDocs?: { current?: Document | null; next?: Document | null };
}): { ok: true; html: string } | { ok: false; reason: string } {
  const hint = attachmentMergeHint(input.attachment, input.instructionText);
  if (
    !String(hint.currentText || '').trim()
    && !String(hint.htmlHint || '').trim()
    && !String(hint.selector || '').trim()
  ) {
    return { ok: false, reason: 'No matching targets found to merge.' };
  }
  const merged = mergeManualEditTargetByHint(
    input.nextHtml,
    input.patchedHtml,
    { slideIndex: input.slideIndex },
    hint,
    input.parsedDocs,
  );
  if (merged.ok) {
    devLog.info('[deck-patch] accepted hint-only target fallback', {
      slideIndex: input.slideIndex,
      selector: hint.selector,
    });
    return { ok: true, html: merged.source };
  }
  return { ok: false, reason: merged.reason };
}

/**
 * Visual / anchor-less comments have no DOM element id. When the model
 * still produced a slide diff, accept a slide-level replace for the
 * candidate slide instead of failing with "No matching targets…".
 */
function tryVisualOrAnchorlessSlideSwap(input: {
  nextHtml: string;
  patchedHtml: string;
  attachment: ChatCommentAttachment;
  slideIndex: number;
  /** Pre-extracted slide HTML — skip extractSlideByIndex ×2 when caller has sections. */
  nextSlide?: string | null;
  patchedSlide?: string | null;
}): { ok: true; html: string } | { ok: false; reason: string } {
  const nextSlide = input.nextSlide ?? extractSlideByIndex(input.nextHtml, input.slideIndex);
  const patchedSlide = input.patchedSlide ?? extractSlideByIndex(input.patchedHtml, input.slideIndex);
  if (!nextSlide || !patchedSlide || nextSlide === patchedSlide) {
    return { ok: false, reason: 'No matching targets found to merge.' };
  }
  const anchors = extractTargetIdentityAnchors(input.attachment);
  // Only screenshot-only / truly anchorless marks may slide-swap. Visual
  // selections that still name a concrete DOM target must merge by element.
  const allow =
    isScreenshotOnlyVisualCommentTarget(input.attachment)
    || anchors.length === 0;
  if (!allow) {
    return { ok: false, reason: 'No matching targets found to merge.' };
  }
  // Full-source sanitize is owned by ProjectView's terminal persist gate —
  // skip a second DOMParser on multi-KB slides here.
  if (!patchedSlide.trim()) {
    return { ok: false, reason: 'No matching targets found to merge.' };
  }
  const swapped = applyDeckPatch({
    currentHtml: input.nextHtml,
    patch: {
      ops: [{ op: 'replace', slideIndex: input.slideIndex, html: patchedSlide }],
    },
  });
  if (!swapped.ok) {
    return { ok: false, reason: swapped.reason || 'No matching targets found to merge.' };
  }
  devLog.warn('[deck-patch] accepted visual/anchorless slide-level swap', {
    slideIndex: input.slideIndex,
    visual: isScreenshotOnlyVisualCommentTarget(input.attachment),
    anchorCount: anchors.length,
  });
  return { ok: true, html: swapped.html };
}

function listDeckSlideIndexes(html: string): number[] {
  return extractTopLevelSlideSections(extractDeckBodyContent(html)).map((_, index) => index);
}

/**
 * Candidate slide indexes for a scoped comment merge. Text-verified
 * slides on the current deck are preferred over a stale attachment
 * slideIndex that no longer contains the captured target text.
 */
export function resolveScopedCommentSlideCandidates(input: {
  attachment: ChatCommentAttachment;
  currentHtml: string;
  patchedHtml: string;
  /** Pre-materialized current sections — skip body extract when caller shares them. */
  currentSlides?: readonly { outerHtml: string }[];
  /** Pre-materialized patched sections — skip body extract when caller shares them. */
  patchedSlides?: readonly { outerHtml: string }[];
}): number[] {
  const verified: number[] = [];
  const pushUnique = (list: number[], index: number) => {
    if (Number.isInteger(index) && index >= 0 && !list.includes(index)) {
      list.push(index);
    }
  };

  // One section materialization each (was list indexes + extractSlideByIndex × n).
  // When current === patched (reconcile / element-patch discovery), skip the
  // second materialize, changed-slide walk, and duplicate verify/infer passes.
  const sameHtml = input.currentHtml === input.patchedHtml;
  const currentSlides = input.currentSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(input.currentHtml));
  const patchedSlides = input.patchedSlides
    ?? (sameHtml
      ? currentSlides
      : extractTopLevelSlideSections(extractDeckBodyContent(input.patchedHtml)));
  for (let slideIndex = 0; slideIndex < currentSlides.length; slideIndex += 1) {
    const slide = currentSlides[slideIndex]?.outerHtml;
    if (slide && targetTextPreservedInPatchedSlide(slide, input.attachment)) {
      pushUnique(verified, slideIndex);
    }
  }
  if (!sameHtml) {
    for (let slideIndex = 0; slideIndex < patchedSlides.length; slideIndex += 1) {
      const slide = patchedSlides[slideIndex]?.outerHtml;
      if (slide && targetTextPreservedInPatchedSlide(slide, input.attachment)) {
        pushUnique(verified, slideIndex);
      }
    }
  }

  const candidates: number[] = [...verified];

  if (!sameHtml) {
    for (const slideIndex of listChangedDeckSlideIndexesFromSections(currentSlides, patchedSlides)) {
      pushUnique(candidates, slideIndex);
    }
  }

  if (hasValidDeckSlideIndex(input.attachment)) {
    const idx = Math.floor(input.attachment.slideIndex as number);
    if (verified.includes(idx)) {
      pushUnique(candidates, idx);
    }
  }

  if (candidates.length === 0) {
    const inferred = inferSlideIndexFromDeckHtml(input.currentHtml, input.attachment, currentSlides)
      ?? (sameHtml
        ? null
        : inferSlideIndexFromDeckHtml(input.patchedHtml, input.attachment, patchedSlides));
    if (inferred != null) {
      pushUnique(candidates, inferred);
    }
  }

  // Attachments with no identity anchor (empty currentText, htmlHint,
  // podMembers) can't be text-verified — none of the earlier passes
  // pushed anything into `verified`. Fall back to whatever slideIndex
  // the attachment recorded so the anchor-less last-resort swap in
  // `tryMergeScopedCommentAttachmentAtSlide` has a slide to work on.
  // Without this the whole merge silently returns [] and rejects
  // even though the model correctly targeted the attached slide.
  if (candidates.length === 0 && hasValidDeckSlideIndex(input.attachment)) {
    pushUnique(candidates, Math.floor(input.attachment.slideIndex as number));
  }

  return candidates;
}

function scopedCommentInstructionText(
  attachment: ChatCommentAttachment,
  instructionText?: string,
): string {
  return [attachment.comment, instructionText].filter(Boolean).join('\n');
}

function tryMergeScopedCommentAttachmentAtSlide(input: {
  nextHtml: string;
  patchedHtml: string;
  attachment: ChatCommentAttachment;
  slideIndex: number;
  instructionText?: string;
  /** When set, reuse Document pair across slide candidates for one attachment. */
  parsedDocs?: { current?: Document | null; next?: Document | null; patched?: Document | null };
  /** Pre-extracted slide HTML — skip extractSlideByIndex ×2 when caller has sections. */
  nextSlide?: string | null;
  patchedSlide?: string | null;
}): { ok: true; html: string } | { ok: false; reason: string } {
  const ids = scopedCommentElementIds(input.attachment);
  const hints = ids.map((id) => ({
    id,
    ...attachmentMergeHint(input.attachment, input.instructionText),
  }));
  // One Document pair for merge → graft → hint-only salvage (was up to ~6 parses).
  // Prefer caller-shared pair when trying multiple slide candidates.
  const parsedPair = input.parsedDocs?.current && (input.parsedDocs.next || input.parsedDocs.patched)
    ? {
        current: input.parsedDocs.current,
        next: input.parsedDocs.next ?? input.parsedDocs.patched!,
        patched: input.parsedDocs.patched ?? input.parsedDocs.next!,
      }
    : (() => {
        const currentDoc = parseManualEditSource(input.nextHtml);
        const patchedDoc = parseManualEditSource(input.patchedHtml);
        return currentDoc && patchedDoc
          ? { current: currentDoc, next: patchedDoc, patched: patchedDoc }
          : undefined;
      })();

  const merged = mergeManualEditTargetsFromSource(
    input.nextHtml,
    input.patchedHtml,
    ids,
    { slideIndex: input.slideIndex },
    hints,
    parsedPair,
  );
  if (merged.ok) {
    return { ok: true, html: merged.source };
  }

  if (
    merged.reason !== 'Selected targets were unchanged.' &&
    merged.reason !== 'No matching targets found to merge.'
  ) {
    return { ok: false, reason: merged.reason };
  }

  // Prefer caller-shared slides; fall back to extract once for style-only /
  // text-preserved / last-resort (avoid extractSlideByIndex × candidates × 2).
  const nextSlide = input.nextSlide ?? extractSlideByIndex(input.nextHtml, input.slideIndex);
  const patchedSlide = input.patchedSlide ?? extractSlideByIndex(input.patchedHtml, input.slideIndex);
  if (!nextSlide || !patchedSlide) {
    return { ok: false, reason: merged.reason };
  }

  const acceptSlideLevel = (kind: 'style-only' | 'text-preserved'): string | null => {
    // Slide-level swap bypasses finalizeManualEditReplacement — ProjectView
    // terminal sanitize scrubs sibling <script>/on* once at persist time.
    if (!patchedSlide.trim()) return null;
    const swapped = applyDeckPatch({
      currentHtml: input.nextHtml,
      patch: {
        ops: [{ op: 'replace', slideIndex: input.slideIndex, html: patchedSlide }],
      },
    });
    if (!swapped.ok) return null;
    devLog.info('[deck-patch] accepted slide-level fallback', {
      slideIndex: input.slideIndex,
      fallback: kind,
      reason: merged.reason,
    });
    return swapped.html;
  };

  if (
    merged.reason === 'Selected targets were unchanged.' &&
    nextSlide !== patchedSlide &&
    slideDiffIsStyleOnly(nextSlide, patchedSlide)
  ) {
    const html = acceptSlideLevel('style-only');
    if (html) return { ok: true, html };
  }

  if (
    nextSlide !== patchedSlide &&
    targetTextPreservedInPatchedSlide(patchedSlide, input.attachment) &&
    targetElementTextPreservedAfterMerge(
      input.nextHtml,
      input.patchedHtml,
      input.attachment,
      input.slideIndex,
      parsedPair,
    )
  ) {
    const html = acceptSlideLevel('text-preserved');
    if (html) return { ok: true, html };
  }

  for (const id of ids) {
    const hint = hints.find((candidate) => candidate.id === id);
    const graft = graftPatchedTargetElementFromSource(
      input.nextHtml,
      input.patchedHtml,
      id,
      { slideIndex: input.slideIndex },
      hint,
      parsedPair,
    );
    if (graft.ok && graft.source !== input.nextHtml) {
      devLog.info('[deck-patch] accepted grafted target fallback', {
        slideIndex: input.slideIndex,
        targetId: id,
        reason: merged.reason,
      });
      return { ok: true, html: graft.source };
    }
  }

  // Hint-only merge (from upstream): try to resolve the target
  // purely from the attachment's hint text/selector when structural
  // and graft lookups all missed. Wins over the anchor-less
  // slide-level swap below when the model kept a text/selector
  // signal in the patched slide, because it can still narrow to a
  // specific element.
  const hintOnly = tryHintOnlyScopedMerge({ ...input, parsedDocs: parsedPair });
  if (hintOnly.ok) return hintOnly;

  // Last-resort catch-all — apply the model's patched slide as a
  // slide-level swap only when the comment has no identity anchor at
  // all. Anchored element comments must never fall through to a whole
  // slide replacement: if the selected target stayed unchanged while
  // siblings changed, accepting the slide would mutate outside the
  // user's clicked element.
  //
  // Two acceptance paths:
  //
  //  (A) "No matching targets found to merge." + empty anchor +
  //      slide diff exists. The id could not be resolved anywhere
  //      and we have no identity signal to verify with. Accept the
  //      slide-level swap so an anchor-less pin/comment edit still
  //      lands.
  //
  // Safety rails:
  //   - Byte-identical slides never accept — no visible edit to
  //     ship, no reason to declare success on a no-op.
  //   - "Selected targets were unchanged" is NOT accepted here —
  //     the selected element resolved but the model edited something
  //     else. Persisting that would be the exact "selected element
  //     ignored" bug users are reporting.
  //   - "No matching targets" WITH anchor is NOT accepted here —
  //     the anchor exists but did not resolve in either doc AND
  //     text-preserved already rejected, meaning the model likely
  //     wrote a wholly-different slide.
  //   - Cross-slide safety comes from the outer applyDeckPatch's
  //     scope guard, so this branch cannot touch a slide other than
  //     the one the attachment is scoped to.
  const anchors = extractTargetIdentityAnchors(input.attachment);
  const acceptForAnchorlessNotFound =
    merged.reason === 'No matching targets found to merge.' &&
    nextSlide !== patchedSlide &&
    anchors.length === 0;
  if (acceptForAnchorlessNotFound && patchedSlide.trim()) {
    const swapped = applyDeckPatch({
      currentHtml: input.nextHtml,
      patch: {
        ops: [{ op: 'replace', slideIndex: input.slideIndex, html: patchedSlide }],
      },
    });
    if (swapped.ok) {
      devLog.warn('[deck-patch] accepted last-resort slide-level swap', {
        slideIndex: input.slideIndex,
        idCount: ids.length,
        reason: merged.reason,
        branch: 'anchor-less',
        anchorCount: anchors.length,
      });
      return { ok: true, html: swapped.html };
    }
  }

  return { ok: false, reason: merged.reason };
}

export function mergeScopedCommentTargetsFromPatchedDeck(input: {
  currentHtml: string;
  patchedHtml: string;
  commentAttachments: readonly ChatCommentAttachment[];
  instructionText?: string;
  /** Pre-materialized current sections — shared with applyScoped coerce when set. */
  currentSlides?: readonly { outerHtml: string; openTag?: string }[];
  /** Pre-materialized patched sections. */
  patchedSlides?: readonly { outerHtml: string; openTag?: string }[];
}): {
  ok: true;
  html: string;
  narrowed: boolean;
  /** Final nextHtml sections for finalize stabilize (refreshed after last mutate). */
  sections: readonly { outerHtml: string; openTag?: string }[];
} | { ok: false; reason: string } {
  let nextHtml = input.currentHtml;
  let narrowed = false;
  // Materialize once for candidates + slide swaps; refresh only when later
  // attachments remain (single-attachment persist is the common path).
  let nextSlides = input.currentSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(nextHtml));
  const patchedSlides = input.patchedSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(input.patchedHtml));
  const attachments = input.commentAttachments;
  for (let attachmentIndex = 0; attachmentIndex < attachments.length; attachmentIndex += 1) {
    const attachment = attachments[attachmentIndex]!;
    const refreshSectionsIfNeeded = () => {
      if (attachmentIndex < attachments.length - 1) {
        nextSlides = extractTopLevelSlideSections(extractDeckBodyContent(nextHtml));
      }
    };
    const ids = scopedCommentElementIds(attachment);
    if (ids.length === 0) {
      const slideCandidates = resolveScopedCommentSlideCandidates({
        attachment,
        currentHtml: nextHtml,
        patchedHtml: input.patchedHtml,
        currentSlides: nextSlides,
        patchedSlides,
      });
      if (slideCandidates.length === 0) {
        return {
          ok: false,
          reason: 'comment target slide could not be resolved from attachment or deck HTML',
        };
      }
      let hintMerged = false;
      let lastReason = 'No matching targets found to merge.';
      // One Document pair for id-less hint-only attempts across slide candidates.
      let idLessDocs = (() => {
        const current = parseManualEditSource(nextHtml);
        const patched = parseManualEditSource(input.patchedHtml);
        return current && patched ? { current, next: patched } : undefined;
      })();
      for (const slideIndex of slideCandidates) {
        const attempt = tryHintOnlyScopedMerge({
          nextHtml,
          patchedHtml: input.patchedHtml,
          attachment,
          slideIndex,
          instructionText: input.instructionText,
          parsedDocs: idLessDocs,
        });
        if (attempt.ok) {
          nextHtml = attempt.html;
          narrowed = true;
          hintMerged = true;
          idLessDocs = undefined;
          refreshSectionsIfNeeded();
          break;
        }
        lastReason = attempt.reason;
      }
      if (!hintMerged) {
        // Screenshot-only visual marks (and other id-less pins) cannot
        // resolve an element target — fall back to slide-level swap when
        // the model produced a real slide diff on a candidate slide.
        for (const slideIndex of slideCandidates) {
          const patchedOuter = patchedSlides[slideIndex]?.outerHtml ?? null;
          const swap = tryVisualOrAnchorlessSlideSwap({
            nextHtml,
            patchedHtml: input.patchedHtml,
            attachment,
            slideIndex,
            nextSlide: nextSlides[slideIndex]?.outerHtml ?? null,
            patchedSlide: patchedOuter,
          });
          if (swap.ok) {
            nextHtml = swap.html;
            narrowed = true;
            hintMerged = true;
            // Slide-level swap — patch local cache without full rematerialize.
            if (patchedOuter && nextSlides[slideIndex] && attachmentIndex < attachments.length - 1) {
              nextSlides = nextSlides.map((slide, index) =>
                index === slideIndex ? { ...slide, outerHtml: patchedOuter } : slide,
              );
            } else {
              refreshSectionsIfNeeded();
            }
            break;
          }
          lastReason = swap.reason;
        }
      }
      if (!hintMerged) {
        return { ok: false, reason: lastReason };
      }
      continue;
    }

    const slideCandidates = resolveScopedCommentSlideCandidates({
      attachment,
      currentHtml: nextHtml,
      patchedHtml: input.patchedHtml,
      currentSlides: nextSlides,
      patchedSlides,
    });
    if (slideCandidates.length === 0) {
      return {
        ok: false,
        reason: 'comment target slide could not be resolved from attachment or deck HTML',
      };
    }

    let lastReason = 'No matching targets found to merge.';
    let mergedForAttachment = false;
    // One Document pair across slide candidates (stale slideIndex often tries 2+).
    let idBearingDocs = (() => {
      const current = parseManualEditSource(nextHtml);
      const patched = parseManualEditSource(input.patchedHtml);
      return current && patched
        ? { current, next: patched, patched }
        : undefined;
    })();
    for (const slideIndex of slideCandidates) {
      const attempt = tryMergeScopedCommentAttachmentAtSlide({
        nextHtml,
        patchedHtml: input.patchedHtml,
        attachment,
        slideIndex,
        instructionText: input.instructionText,
        parsedDocs: idBearingDocs,
        nextSlide: nextSlides[slideIndex]?.outerHtml ?? null,
        patchedSlide: patchedSlides[slideIndex]?.outerHtml ?? null,
      });
      if (attempt.ok) {
        nextHtml = attempt.html;
        narrowed = true;
        mergedForAttachment = true;
        idBearingDocs = undefined;
        refreshSectionsIfNeeded();
        break;
      }
      lastReason = attempt.reason;
    }

    if (!mergedForAttachment) {
      // Do not log currentText/htmlHint — slide/comment body must not reach
      // the browser console in staging/production.
      devLog.warn('[deck-patch] scoped narrow merge failed', {
        slideCandidates,
        idCount: ids.length,
        reason: lastReason,
        currentTextLen: attachment.currentText?.length ?? 0,
        htmlHintLen: attachment.htmlHint?.length ?? 0,
      });
      return { ok: false, reason: lastReason };
    }
  }
  // Last mutate skips mid-loop refresh — refresh once for finalize stabilize.
  if (narrowed) {
    nextSlides = extractTopLevelSlideSections(extractDeckBodyContent(nextHtml));
  }
  return { ok: true, html: nextHtml, narrowed, sections: nextSlides };
}

export function targetTextPreservedInPatchedSlide(
  patchedSlideOuter: string,
  attachment: ChatCommentAttachment,
): boolean {
  const collapsedSlide = collapseTargetTextForMatch(
    patchedSlideOuter.replace(/<[^>]+>/g, ' '),
  );
  for (const candidate of extractTargetIdentityAnchors(attachment)) {
    if (candidate.length < 2) continue;
    if (collapsedSlide.includes(candidate)) return true;
  }
  return false;
}

export function extractTargetIdentityAnchors(attachment: ChatCommentAttachment): string[] {
  const seen = new Set<string>();
  const anchors: string[] = [];
  const push = (raw: string): void => {
    const text = String(raw ?? '').trim();
    // History serialize placeholders must not become merge anchors.
    if (/^\((?:none|empty|missing|unlabeled)\)$/i.test(text)) return;
    const collapsed = collapseTargetTextForMatch(text);
    if (!collapsed || seen.has(collapsed)) return;
    if (/^\((?:none|empty|missing|unlabeled)\)$/i.test(collapsed)) return;
    seen.add(collapsed);
    anchors.push(collapsed);
  };
  push(attachment.currentText || '');
  const hintText = (attachment.htmlHint || '').replace(/<[^>]+>/g, ' ');
  push(hintText);
  if (attachment.podMembers) {
    for (const member of attachment.podMembers) {
      push(member.text || '');
    }
  }
  return anchors;
}

function collapseTargetTextForMatch(value: string): string {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function normalizeForSlideLookup(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function hasValidDeckSlideIndex(attachment: ChatCommentAttachment): boolean {
  return (
    typeof attachment.slideIndex === 'number'
    && Number.isInteger(attachment.slideIndex)
    && attachment.slideIndex >= 0
  );
}

/**
 * Recover a 0-based slide index from deck HTML when the attachment is
 * missing `slideIndex` or carries a stale value from the deck bridge.
 */
export function inferSlideIndexFromDeckHtml(
  html: string,
  attachment: ChatCommentAttachment,
  /** Pre-materialized sections — skip a second body extract when caller has them. */
  precomputedSections?: readonly { outerHtml: string }[],
): number | null {
  // Always seed the shared section cache with body content (not full HTML).
  const sections = precomputedSections
    ?? extractTopLevelSlideSections(extractDeckBodyContent(html));
  if (sections.length === 0) return null;
  if (sections.length === 1) return 0;
  const elementId = normalizeForSlideLookup(attachment.elementId);
  const selector = normalizeForSlideLookup(attachment.selector);
  const slideNth = selector.match(/\b(?:section\s*)?\.?slide\b[^\n]*?:nth-of-type\((\d+)\)/i)
    ?? selector.match(/\b(?:section\s*)?\.?slide\b[^\n]*?:nth-child\((\d+)\)/i);
  if (slideNth?.[1]) {
    const index = Number(slideNth[1]) - 1;
    if (Number.isInteger(index) && index >= 0 && index < sections.length) return index;
  }
  const domSelectorSlide = elementId.startsWith('dom:')
    ? elementId.slice('dom:'.length).match(/\bbody\s*>\s*(?:[a-z0-9-]+\s*>\s*)*section:nth-of-type\((\d+)\)/i)
    : null;
  if (domSelectorSlide?.[1]) {
    const index = Number(domSelectorSlide[1]) - 1;
    if (Number.isInteger(index) && index >= 0 && index < sections.length) return index;
  }
  const currentText = normalizeForSlideLookup(attachment.currentText);
  const htmlHint = normalizeForSlideLookup(attachment.htmlHint);
  const candidates = sections.map((section, index) => ({
    index,
    text: normalizeForSlideLookup(section.outerHtml),
  }));
  const byNeedle = (needle: string): number | null => {
    if (!needle) return null;
    const matches = candidates.filter((candidate) => candidate.text.includes(needle));
    return matches.length === 1 ? matches[0]!.index : null;
  };
  const byElementId =
    byNeedle(`data-od-id="${elementId}"`)
    ?? byNeedle(`data-od-id='${elementId}'`)
    ?? byNeedle(`id="${elementId}"`)
    ?? byNeedle(`id='${elementId}'`)
    ?? byNeedle(elementId);
  if (byElementId != null) return byElementId;
  const selectorIds = selectorCommentElementIds(selector);
  const bySelectorId = selectorIds.reduce<number | null>((found, selectorId) => {
    if (found != null) return found;
    return (
      byNeedle(`data-od-id="${selectorId}"`)
      ?? byNeedle(`data-od-id='${selectorId}'`)
      ?? byNeedle(`data-od-source-path="${selectorId}"`)
      ?? byNeedle(`data-od-source-path='${selectorId}'`)
      ?? byNeedle(`data-od-runtime-id="${selectorId}"`)
      ?? byNeedle(`data-od-runtime-id='${selectorId}'`)
      ?? byNeedle(`data-screen-label="${selectorId}"`)
      ?? byNeedle(`data-screen-label='${selectorId}'`)
    );
  }, null);
  if (bySelectorId != null) return bySelectorId;
  return byNeedle(htmlHint) ?? byNeedle(currentText);
}

export type ReconcileCommentSlideOptions = {
  /** Precomputed candidates — skip a second resolveScopedCommentSlideCandidates walk. */
  candidates?: number[];
  /** Precomputed inference — skip a second inferSlideIndexFromDeckHtml walk. */
  inferred?: number | null;
  /** Pre-materialized sections — skip extractSlideByIndex body walks. */
  sections?: readonly { outerHtml: string }[];
};

/**
 * Verify or replace `attachment.slideIndex` against the current deck HTML.
 * Prefers text-verified slides, then structural inference.
 */
export function reconcileCommentAttachmentSlideIndex(
  deckHtml: string,
  attachment: ChatCommentAttachment,
  options?: ReconcileCommentSlideOptions,
): ChatCommentAttachment {
  if (!deckHtml.trim()) return attachment;

  const sections = options?.sections
    ?? extractTopLevelSlideSections(extractDeckBodyContent(deckHtml));
  const candidates = options?.candidates ?? resolveScopedCommentSlideCandidates({
    attachment,
    currentHtml: deckHtml,
    patchedHtml: deckHtml,
    currentSlides: sections,
    patchedSlides: sections,
  });

  const inferred = options && 'inferred' in options
    ? options.inferred ?? null
    : inferSlideIndexFromDeckHtml(deckHtml, attachment, sections);
  if (inferred != null) {
    const inferredSlide = sections[inferred]?.outerHtml ?? null;
    if (
      inferredSlide
      && targetTextPreservedInPatchedSlide(inferredSlide, attachment)
      && (!hasValidDeckSlideIndex(attachment) || attachment.slideIndex !== inferred)
    ) {
      return { ...attachment, slideIndex: inferred };
    }
  }

  if (hasValidDeckSlideIndex(attachment)) {
    const slide = sections[attachment.slideIndex!]?.outerHtml ?? null;
    if (slide && targetTextPreservedInPatchedSlide(slide, attachment)) {
      return attachment;
    }
  }

  if (candidates.length > 0) {
    const best = candidates[0]!;
    if (!hasValidDeckSlideIndex(attachment) || attachment.slideIndex !== best) {
      return { ...attachment, slideIndex: best };
    }
    return attachment;
  }

  if (inferred != null && (!hasValidDeckSlideIndex(attachment) || attachment.slideIndex !== inferred)) {
    return { ...attachment, slideIndex: inferred };
  }

  return attachment;
}

/**
 * Map preview-time element ids (often `dom:body > …` paths) to stable
 * `data-od-id` values on the saved deck so element-patch apply and model
 * templates agree with on-disk HTML on the first try.
 */
export function reconcileCommentAttachmentElementId(
  deckHtml: string,
  attachment: ChatCommentAttachment,
  parsedDoc?: Document | null,
  slideOptions?: ReconcileCommentSlideOptions,
): ChatCommentAttachment {
  if (!deckHtml.trim()) return attachment;
  const slideReconciled = reconcileCommentAttachmentSlideIndex(
    deckHtml,
    attachment,
    slideOptions,
  );
  const slideIndex = slideReconciled.slideIndex;
  if (!(typeof slideIndex === 'number' && Number.isInteger(slideIndex) && slideIndex >= 0)) {
    return slideReconciled;
  }
  const hint = {
    id: slideReconciled.elementId,
    currentText: slideReconciled.currentText,
    htmlHint: slideReconciled.htmlHint,
    selector: slideReconciled.selector,
    instructionText: slideReconciled.comment,
  };
  const candidates = [
    slideReconciled.elementId,
    ...scopedCommentElementIds(slideReconciled),
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  for (const candidate of [...new Set(candidates)]) {
    const resolved = resolveManualEditTargetReference(
      deckHtml,
      candidate,
      { slideIndex },
      hint,
      parsedDoc,
    );
    if (resolved && !resolved.startsWith('dom:') && resolved !== slideReconciled.elementId) {
      return { ...slideReconciled, elementId: resolved };
    }
    if (resolved && !resolved.startsWith('dom:')) {
      return slideReconciled;
    }
  }
  const hintOnly = resolveManualEditTargetReference(
    deckHtml,
    '',
    { slideIndex },
    hint,
    parsedDoc,
  );
  if (hintOnly && !hintOnly.startsWith('dom:')) {
    return { ...slideReconciled, elementId: hintOnly };
  }
  return slideReconciled;
}

export function reconcileCommentAttachmentForDeck(
  deckHtml: string,
  attachment: ChatCommentAttachment,
  parsedDoc?: Document | null,
  slideOptions?: ReconcileCommentSlideOptions,
): ChatCommentAttachment {
  return reconcileCommentAttachmentElementId(deckHtml, attachment, parsedDoc, slideOptions);
}

/**
 * Reconcile attachments and collect allowed slide indexes in one pass.
 * Persist used to call reconcile then `scopedCommentSlideIndexesFromDeck`
 * (duplicate candidate/infer walks per attachment).
 */
export function reconcileCommentScopeForPersist(
  deckHtml: string,
  attachments: readonly ChatCommentAttachment[],
): {
  attachments: ChatCommentAttachment[];
  allowedSlideIndexes?: number[];
  /** Shared section materialization for applyScoped / element-patch rediscovery. */
  sections?: ReturnType<typeof extractTopLevelSlideSections>;
} {
  if (attachments.length === 0) {
    return { attachments: [] };
  }
  if (!deckHtml.trim()) {
    return {
      attachments: [...attachments],
      allowedSlideIndexes: scopedCommentSlideIndexesFromAttachments(attachments),
    };
  }
  const parsedDoc = parseManualEditSource(deckHtml);
  // One section materialization for all attachments (was N× candidates + infer
  // + extractSlideByIndex; extractDeckBodyContent.slice broke the section cache).
  const sections = extractTopLevelSlideSections(extractDeckBodyContent(deckHtml));
  const maxSlideIndex = sections.length - 1;
  const indexes = new Set<number>();
  const reconciled = attachments.map((attachment) => {
    const candidates = resolveScopedCommentSlideCandidates({
      attachment,
      currentHtml: deckHtml,
      patchedHtml: deckHtml,
      currentSlides: sections,
      patchedSlides: sections,
    });
    for (const candidate of candidates) {
      if (candidate >= 0 && candidate <= maxSlideIndex) indexes.add(candidate);
    }
    const inferred = inferSlideIndexFromDeckHtml(deckHtml, attachment, sections);
    if (inferred != null && inferred >= 0 && inferred <= maxSlideIndex) {
      indexes.add(inferred);
    }
    const next = reconcileCommentAttachmentForDeck(deckHtml, attachment, parsedDoc, {
      candidates,
      inferred,
      sections,
    });
    if (
      hasValidDeckSlideIndex(next)
      && next.slideIndex! <= maxSlideIndex
    ) {
      indexes.add(next.slideIndex!);
    }
    return next;
  });
  return {
    attachments: reconciled,
    allowedSlideIndexes: indexes.size > 0 ? [...indexes] : undefined,
    sections,
  };
}

export function reconcileCommentAttachmentsForDeck(
  deckHtml: string,
  attachments: readonly ChatCommentAttachment[],
): ChatCommentAttachment[] {
  return reconcileCommentScopeForPersist(deckHtml, attachments).attachments;
}

export function scopedCommentSlideIndexesFromAttachments(
  commentAttachments: readonly ChatCommentAttachment[],
): number[] | undefined {
  if (commentAttachments.length === 0) return undefined;
  const indexes = commentAttachments
    .map((attachment) => attachment.slideIndex)
    .filter((slideIndex): slideIndex is number =>
      typeof slideIndex === 'number' && Number.isInteger(slideIndex) && slideIndex >= 0,
    );
  const unique = [...new Set(indexes)];
  return unique.length > 0 ? unique : undefined;
}

/**
 * Recover slide indexes from on-disk deck HTML when attachments carry stale
 * or missing `slideIndex` values from the preview bridge.
 */
export function scopedCommentSlideIndexesFromDeck(
  deckHtml: string,
  commentAttachments: readonly ChatCommentAttachment[],
): number[] | undefined {
  if (!deckHtml.trim() || commentAttachments.length === 0) return undefined;
  // One section materialization shared across attachments (was N× candidates rematerialize).
  const sections = extractTopLevelSlideSections(extractDeckBodyContent(deckHtml));
  const maxSlideIndex = sections.length - 1;
  const indexes = new Set<number>();
  for (const attachment of commentAttachments) {
    let resolved = false;
    for (const candidate of resolveScopedCommentSlideCandidates({
      attachment,
      currentHtml: deckHtml,
      patchedHtml: deckHtml,
      currentSlides: sections,
      patchedSlides: sections,
    })) {
      if (candidate >= 0 && candidate <= maxSlideIndex) {
        indexes.add(candidate);
        resolved = true;
      }
    }
    const inferred = inferSlideIndexFromDeckHtml(deckHtml, attachment, sections);
    if (inferred != null && inferred >= 0 && inferred <= maxSlideIndex) {
      indexes.add(inferred);
      resolved = true;
    }
    if (
      !resolved
      && hasValidDeckSlideIndex(attachment)
      && attachment.slideIndex! <= maxSlideIndex
    ) {
      const slide = sections[attachment.slideIndex!]?.outerHtml ?? null;
      if (slide && targetTextPreservedInPatchedSlide(slide, attachment)) {
        indexes.add(attachment.slideIndex!);
      }
    }
  }
  return indexes.size > 0 ? [...indexes] : undefined;
}

/**
 * Resolve allowed slide indexes for element-patch when the attachment
 * carried a stale slideIndex. Uses target-text signals on the model's
 * chosen slide before falling back to the attachment value.
 */
export function resolveElementPatchAllowedSlideIndexes(input: {
  currentHtml: string;
  patches: readonly { slideIndex: number }[];
  allowedSlideIndexes?: readonly number[];
  commentAttachments?: readonly ChatCommentAttachment[];
  /** Pre-materialized sections from persist/coerce — skip body extract. */
  currentSlides?: readonly { outerHtml: string }[];
}): number[] | undefined {
  if (!input.allowedSlideIndexes || input.allowedSlideIndexes.length === 0) {
    return input.allowedSlideIndexes ? [...input.allowedSlideIndexes] : undefined;
  }
  if (!input.commentAttachments?.length) {
    return [...input.allowedSlideIndexes];
  }

  // One section materialization shared by model-slide checks + candidates.
  const currentSlides = input.currentSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(input.currentHtml));
  const discovered = new Set<number>();
  const patchIndexes = new Set(input.patches.map((patch) => patch.slideIndex));
  for (const attachment of input.commentAttachments) {
    for (const patch of input.patches) {
      const modelSlide = currentSlides[patch.slideIndex]?.outerHtml ?? null;
      if (modelSlide && targetTextPreservedInPatchedSlide(modelSlide, attachment)) {
        discovered.add(patch.slideIndex);
      }
    }
  }
  // Skip candidates widen when every model patch slide was already text-verified
  // (common path after persist reconcile already set allowed indexes).
  const allPatchesVerified = [...patchIndexes].every((index) => discovered.has(index));
  if (!allPatchesVerified) {
    for (const attachment of input.commentAttachments) {
      const candidates = resolveScopedCommentSlideCandidates({
        attachment,
        currentHtml: input.currentHtml,
        patchedHtml: input.currentHtml,
        currentSlides,
        patchedSlides: currentSlides,
      });
      for (const candidate of candidates) {
        discovered.add(candidate);
      }
    }
  }

  if (discovered.size > 0) {
    return [...discovered];
  }
  return [...input.allowedSlideIndexes];
}

export function extractSlideByIndex(html: string, slideIndex: number): string | null {
  // extractTopLevelSlideSections owns the last-html cache shared with applyDeckPatch.
  const section = extractTopLevelSlideSections(extractDeckBodyContent(html))[slideIndex];
  return section ? section.outerHtml : null;
}

export function slideDiffIsStyleOnly(currentSlide: string, patchedSlide: string): boolean {
  return normalizeSlideStructure(currentSlide) === normalizeSlideStructure(patchedSlide);
}

function normalizeSlideStructure(slideHtml: string): string {
  return slideHtml
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(?:class|style)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    // Layout-only edits (remove <br>, nowrap) should still count as
    // presentation-only when the visible words are unchanged.
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
