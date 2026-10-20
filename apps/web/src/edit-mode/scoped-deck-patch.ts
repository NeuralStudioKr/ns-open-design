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
  shouldClientGraftVisualMarkWithoutAi,
  hasUserTypedVisualAnnotationRequest,
} from '../comments';
import { validateCommentEditIntentRespected, targetTextContentPreserved } from './comment-edit-intent';
import {
  graftPatchedTargetElementFromSource,
  mergeManualEditTargetByHint,
  mergeManualEditTargetsFromSource,
  parseManualEditSource,
  readScopedCommentTargetText,
  readManualEditTargetSnapshot,
  resolveManualEditTargetReference,
  resolveManualEditTargetReferenceByPagePosition,
  isSyntheticVisualMarkTargetId,
  sanitizeManualEditDocumentInPlace,
  sanitizeManualEditFullSource,
  sanitizeManualEditHtmlFragment,
  serializeManualEditSource,
} from './source-patches';
import { devLog } from '../lib/devLog';

export {
  isDrawnVisualMarkAttachment,
  isVisualCommentAttachment,
  shouldClientGraftVisualMarkWithoutAi,
} from '../comments';

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
    if (!shouldClientGraftVisualMarkWithoutAi(attachment)) continue;
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

function isGenericTagSelector(selector: string): boolean {
  return /^[a-z][a-z0-9-]*$/i.test(selector.trim().replace(/^dom:/i, ''));
}

function isSlideSurfaceSelector(selector: string): boolean {
  const normalized = selector.trim().replace(/^dom:/i, '');
  return /^(?:html|body|section(?:\.slide)?)$/i.test(normalized);
}

function isSlideSurfaceHtmlHint(hint: string): boolean {
  return /^<\s*(?:html|body|section)\b/i.test(hint.trim());
}

function isPageLevelCommentId(id: string): boolean {
  return id.startsWith('pin-') || id.startsWith('file-comment-');
}

/**
 * True when the comment is pinned to a concrete node (chip, box, title),
 * not a slide/page pin. Selected-element color grafts must use this so
 * `--paper` / section.slide background is never the target.
 */
export function commentAttachmentHasElementTarget(
  attachment: ChatCommentAttachment,
): boolean {
  if (isScreenshotOnlyVisualCommentTarget(attachment)) return false;
  const id = String(attachment.elementId || '').trim();
  const hint = String(attachment.htmlHint || '').trim();
  if (isPageLevelCommentId(id)) {
    return Boolean(hint) && !isSlideSurfaceHtmlHint(hint);
  }
  if (id && !id.startsWith('visual-mark-') && !isUnsafeCommentElementTargetId(id)) {
    return true;
  }
  if (scopedCommentElementIds(attachment).length > 0) return true;
  if (hint && !isSlideSurfaceHtmlHint(hint)) return true;
  const selector = String(attachment.selector || '').trim();
  if (
    selector
    && !isGenericTagSelector(selector)
    && !isUnsafeCommentElementTargetId(selector)
    && !isSlideSurfaceSelector(selector)
  ) {
    return true;
  }
  const text = String(attachment.currentText || '').trim();
  return Boolean(
    text
    && (attachment.selectionKind === 'element' || attachment.selectionKind === 'pod')
    && !id.startsWith('visual-mark-'),
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
    if (!shouldClientGraftVisualMarkWithoutAi(attachment)) continue;
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
  const allowedSlideIndexes = resolveDeckPatchAllowedSlideIndexesFromInput(input);
  const parsed = input.patch
    ? { ok: true as const, patch: input.patch }
    : parseDeckPatchWithSalvage(input.patchBody ?? '', {
        fallbackSlideIndexes: allowedSlideIndexes,
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
    allowedSlideIndexes,
    currentHtml,
    input.commentAttachments,
    sharedCurrentSlides,
  );
  const strictScopeApply = applyDeckPatch({
    currentHtml,
    patch: patchForScope,
    allowedSlideIndexes,
  });
  let merged = strictScopeApply;
  let mergedScopeRelaxed = false;
  if (
    !strictScopeApply.ok &&
    allowedSlideIndexes &&
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
        allowedSlideIndexes,
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
  if (allowedSlideIndexes && input.commentAttachments?.length) {
    const scoped = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml: merged.html,
      commentAttachments: input.commentAttachments,
      instructionText: input.instructionText,
      currentSlides: sharedCurrentSlides ?? undefined,
      patchedSlides: sharedPatchedSlides,
    });
    if (!scoped.ok) {
      const grafted = tryLocalCommentStyleGraftInsteadOfModel({
        priorHtml: currentHtml,
        commentAttachments: input.commentAttachments,
        instructionText: input.instructionText,
      });
      if (grafted.ok) {
        devLog.warn('[deck-patch] merge miss — applied local comment style graft', {
          reason: scoped.reason,
          kind: grafted.kind,
        });
        return finalizeScopedDeckMergeHtml({
          currentHtml,
          mergedHtml: grafted.html,
          commentAttachments: input.commentAttachments,
          instructionText: input.instructionText,
          currentSlides: sharedCurrentSlides ?? undefined,
        });
      }
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
        allowedSlideIndexes,
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

function resolveDeckPatchAllowedSlideIndexesFromInput(input: {
  allowedSlideIndexes?: readonly number[];
  commentAttachments?: readonly ChatCommentAttachment[];
}): number[] | undefined {
  const explicit = input.allowedSlideIndexes
    ?.filter((index) => Number.isInteger(index) && index >= 0)
    .map((index) => Math.floor(index));
  const uniqueExplicit = explicit ? [...new Set(explicit)] : [];
  if (uniqueExplicit.length > 0) return uniqueExplicit;
  return input.commentAttachments?.length
    ? scopedCommentSlideIndexesFromAttachments(input.commentAttachments)
    : undefined;
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
  pagePosition?: { x: number; y: number; width: number; height: number };
} {
  return {
    currentText: attachment.currentText,
    instructionText: scopedCommentInstructionText(attachment, instructionText),
    htmlHint: attachment.htmlHint,
    selector: attachment.selector,
    pagePosition: attachment.pagePosition,
  };
}

function enrichVisualAnnotationFromResolvedTarget(
  deckHtml: string,
  attachment: ChatCommentAttachment,
  resolvedId: string,
  slideIndex: number,
  parsedDoc?: Document | null,
): ChatCommentAttachment {
  const snapshot = readManualEditTargetSnapshot(deckHtml, resolvedId, { slideIndex }, parsedDoc);
  const text = String(snapshot.fields.text || '').replace(/\s+/g, ' ').trim();
  const outer = snapshot.outerHtml.trim();
  return {
    ...attachment,
    elementId: resolvedId,
    selector: `[data-od-id="${resolvedId}"]`,
    label: attachment.label || resolvedId,
    currentText: text.length > 160 ? `${text.slice(0, 157)}...` : text,
    htmlHint: outer.length > 180 ? `${outer.slice(0, 177)}...` : outer,
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

const BACKGROUND_COMMENT_INSTRUCTION_RE =
  /배경\s*색|배경색|배경\s*만|배경을|(?:slide\s+)?background(?:-color)?|\bbg[\s-]*color/i;

const SURFACE_PRESENTATION_PROP_RE =
  /(?:^|[;\s{])((?:background(?:-color|-image|-size|-position|-repeat)?|--(?:paper|bg|shell|surface|fill)))\s*:\s*([^;}{]+)/gi;

const SURFACE_PRESENTATION_PROPS = new Set([
  'background',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  '--paper',
  '--bg',
  '--shell',
  '--surface',
  '--fill',
]);

/** True when the user asked a local color/background restyle, not a copy rewrite. */
export function isBackgroundColorCommentInstruction(
  text: string | null | undefined,
): boolean {
  return BACKGROUND_COMMENT_INSTRUCTION_RE.test(String(text ?? ''));
}

const FONT_DOUBLE_COMMENT_INSTRUCTION_RE =
  /(?:폰트|font)[\s\S]{0,16}(?:두\s*배|2\s*배|\+\s*100\s*%|200\s*%|×\s*2|x\s*2|\*\s*2)|(?:두\s*배|2\s*배).{0,12}(?:키우|크게|확대|늘)|(?:font[- ]?size|font).{0,16}(?:double|twice|×\s*2|x\s*2|\*\s*2|2x)|(?:double|twice).{0,12}font/i;

const COMMENT_STYLE_CHROME_RE =
  /\b(kicker|brand|speaker|eyebrow|chip|tag|meta|footer|nav|logo|byline|page-?num)\b/i;

const COMMENT_STYLE_CONTENT_SELECTOR =
  'h1, h2, h3, h4, h5, h6, p, li, blockquote, .title, .headline, .lede, .body, .copy';

const COMMENT_STYLE_KICKER_SELECTOR =
  '.kicker, .eyebrow, [data-role="kicker"], [data-role="eyebrow"]';

/** Marks a pinned slide that already received a local font×2 graft. */
export const COMMENT_FONT_SCALE_ATTR = 'data-od-comment-font-scale';
const COMMENT_FONT_SCALE_FACTOR = 2;

const COMMENT_BACKGROUND_COLOR_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/파란|파랑|블루|\bblue\b/i, '#2563eb'],
  [/빨간|빨강|레드|\bred\b/i, '#dc2626'],
  [/초록|그린|\bgreen\b/i, '#16a34a'],
  [/검은|검정|블랙|\bblack\b/i, '#111827'],
  [/회색|그레이|\bgr[ae]y\b/i, '#6b7280'],
  [/노란|노랑|옐로|\byellow\b/i, '#eab308'],
  [/주황|오렌지|\borange\b/i, '#ea580c'],
  [/보라|퍼플|\bpurple\b/i, '#7c3aed'],
  [/흰|하양|화이트|\bwhite\b/i, '#ffffff'],
];

export type LocalCommentStyleGraftKind = 'font-scale' | 'background' | 'text-color' | 'chip-fill';

const DEFAULT_NAMED_TOKEN_COLOR = '#dc2626';

const TEXT_COLOR_CUE_RE =
  /글자\s*색|글씨\s*색|텍스트\s*색|텍스트\s*컬러|text[- ]?color|font[- ]?color|color\s+(?:the\s+)?text/i;

const COLOR_AS_TEXT_RE =
  /(?:빨간|빨강|레드|파란|파랑|블루|초록|그린|검은|검정|블랙|회색|그레이|노란|노랑|옐로|주황|오렌지|보라|퍼플|흰|하양|화이트|red|blue|green|black|gr[ae]y|yellow|orange|purple|white)(?:색)?\s*(?:으로|로)/i;

const ELEMENT_CUE_RE = /요소/;

const TEXT_ONLY_COLOR_RE =
  /글자\s*만|텍스트\s*만|글씨\s*만|(?:text|color)\s+only/i;

const COMMENT_PAGE_INDEX_RE = /(\d{1,2})\s*페이지/;

const NAMED_TEXT_TOKEN_QUOTE_RE =
  /["'`“”‘’「」『』]([^"'`“”‘’「」『』]{1,64})["'`“”‘’「」『』]/;

const NAMED_TEXT_BOTTOM_RE =
  /맨\s*아래|제일\s*아래|가장\s*아래|하단|(?:bottom(?:-most)?)/i;

const NAMED_TEXT_SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'META', 'LINK', 'BR', 'HR', 'IMG', 'SVG',
]);

const NAMED_TEXT_SKIP_ANCESTOR_SELECTOR = 'svg, script, style, template, noscript';

/** Marks a node that already received a local named text-color graft. */
export const COMMENT_TEXT_COLOR_ATTR = 'data-od-comment-text-color';

/** Marks a filled chip/box whose background was painted by a named-token graft. */
export const COMMENT_CHIP_FILL_ATTR = 'data-od-comment-chip-fill';

export function parseCommentNamedTextToken(
  text: string | null | undefined,
): { token: string; bottomMost: boolean } | null {
  const source = String(text ?? '');
  const bottomMost = NAMED_TEXT_BOTTOM_RE.test(source);
  const quoted = source.match(NAMED_TEXT_TOKEN_QUOTE_RE)?.[1]?.trim();
  if (quoted) return { token: quoted, bottomMost };
  const named = source.match(/\bteamver\b/i)?.[0];
  if (named) return { token: named, bottomMost: true };
  if (bottomMost) return { token: 'teamver', bottomMost: true };
  // Bare `요소` is not Teamver — `요소 삭제` / move comments must stay with the model.
  if (
    ELEMENT_CUE_RE.test(source)
    && (parseCommentPageSlideIndex(source) != null || Boolean(parseCommentBackgroundColor(source)))
  ) {
    return { token: 'teamver', bottomMost: true };
  }
  return null;
}

/** `2페이지` → slide index 1. Used when the comment pin is missing. */
export function parseCommentPageSlideIndex(
  text: string | null | undefined,
): number | null {
  const match = String(text ?? '').match(COMMENT_PAGE_INDEX_RE);
  if (!match) return null;
  const page = Number(match[1]);
  if (!Number.isInteger(page) || page < 1) return null;
  return page - 1;
}

export function isTextOnlyNamedColorInstruction(
  text: string | null | undefined,
): boolean {
  return TEXT_ONLY_COLOR_RE.test(String(text ?? ''));
}

/**
 * True when the user asked to recolor a named word / bottom-most chip,
 * not the slide `--paper` background. `요소` / unnamed 빨간색 on a
 * filled Teamver chip paints the chip fill; `글자만` stays text-only.
 */
export function isNamedTextColorCommentInstruction(
  text: string | null | undefined,
): boolean {
  const source = String(text ?? '');
  if (!source.trim()) return false;
  if (isBackgroundColorCommentInstruction(source)) return false;
  const hasColor = Boolean(parseCommentBackgroundColor(source));
  const hasElementCue = ELEMENT_CUE_RE.test(source);
  const hasBottom = NAMED_TEXT_BOTTOM_RE.test(source);
  const hasPage = parseCommentPageSlideIndex(source) != null;
  // `요소` alone (`왼쪽 상단 요소 삭제`) must not steal MiniMax into chip-fill.
  if (!hasColor && !(hasElementCue && (hasBottom || hasPage))) {
    return false;
  }
  if (
    !TEXT_COLOR_CUE_RE.test(source)
    && !COLOR_AS_TEXT_RE.test(source)
    && !hasElementCue
    && !hasBottom
  ) {
    return false;
  }
  return Boolean(parseCommentNamedTextToken(source));
}

/** True when the user asked to double font size (×2 / +100%), not a vague "bigger". */
export function isFontScaleCommentInstruction(
  text: string | null | undefined,
): boolean {
  return FONT_DOUBLE_COMMENT_INSTRUCTION_RE.test(String(text ?? ''));
}

export function parseCommentBackgroundColor(
  text: string | null | undefined,
): string | null {
  const source = String(text ?? '');
  const hex = source.match(/#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/i);
  if (hex) return hex[0];
  const rgb = source.match(/\brgba?\(\s*[\d.]+(?:\s*,\s*[\d.]+){2,3}\s*\)/i);
  if (rgb) return rgb[0];
  for (const [pattern, color] of COMMENT_BACKGROUND_COLOR_WORDS) {
    if (pattern.test(source)) return color;
  }
  return null;
}

/**
 * Font-double, named text/chip color, selected-element fill, and named
 * background restyles can be applied to the pinned slide without a model
 * HTML body. Vague comments still need the model.
 */
export function canGraftLocalCommentStyleWithoutModel(
  text: string | null | undefined,
  commentAttachments?: readonly ChatCommentAttachment[],
): boolean {
  if (isFontScaleCommentInstruction(text)) return true;
  if (isNamedTextColorCommentInstruction(text)) return true;
  if (
    isBackgroundColorCommentInstruction(text)
    && Boolean(parseCommentBackgroundColor(text))
  ) {
    return true;
  }
  const source = String(text ?? '');
  return Boolean(
    commentAttachments?.some((attachment) => commentAttachmentHasElementTarget(attachment))
    && (parseCommentBackgroundColor(source) || COLOR_AS_TEXT_RE.test(source)),
  );
}

/**
 * EMPTY_RESPONSE is a chat fatal only when a local comment style graft
 * did not land. Successful font×2 / text-color / bg grafts must not surface it.
 */
export function shouldSurfaceEmptyApiResponseChatError(input: {
  commentScoped?: boolean;
  localStyleGraftSucceeded?: boolean;
}): boolean {
  return !(Boolean(input.commentScoped) && Boolean(input.localStyleGraftSucceeded));
}

function scaleCssLength(value: string, factor: number): string | null {
  const important = /\s*!important\s*$/i.test(value);
  const core = value.replace(/\s*!important\s*$/i, '').trim();
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+))\s*(px|em|rem|%)$/i.exec(core);
  if (!match) return null;
  const next = Number(match[1]) * factor;
  if (!Number.isFinite(next)) return null;
  const rendered = Number.isInteger(next)
    ? String(next)
    : String(Math.round(next * 1000) / 1000);
  return `${rendered}${match[2]}${important ? ' !important' : ''}`;
}

function isChromeTypeElement(el: Element): boolean {
  let node: Element | null = el;
  while (node && node.tagName.toLowerCase() !== 'section') {
    const cls = node.getAttribute('class') || '';
    const role = node.getAttribute('data-role') || node.getAttribute('role') || '';
    if (COMMENT_STYLE_CHROME_RE.test(cls) || COMMENT_STYLE_CHROME_RE.test(role)) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function scaleInlineFontSize(style: string, factor: number): string {
  const decls = parseInlineStyleDeclarations(style);
  const current = decls['font-size'];
  if (current) {
    const scaled = scaleCssLength(current, factor);
    if (scaled) {
      decls['font-size'] = scaled;
      return serializeInlineStyle(decls);
    }
  }
  decls['font-size'] = `${factor}em`;
  return serializeInlineStyle(decls);
}

function readCommentFontScaleFactor(slideHtml: string): number | null {
  const open = slideHtml.match(/^<section\b[^>]*>/i)?.[0] ?? '';
  const match = new RegExp(
    `\\b${COMMENT_FONT_SCALE_ATTR}\\s*=\\s*["']?(\\d+(?:\\.\\d+)?)`,
    'i',
  ).exec(open);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function collectFontScaleTargets(section: Element): Element[] {
  const nodes = [...section.querySelectorAll(COMMENT_STYLE_CONTENT_SELECTOR)];
  const content = nodes.filter((node) => !isChromeTypeElement(node));
  if (content.length > 0) return content;
  // Kicker/eyebrow stay chrome when title/body exist. If they are the only
  // type on the pinned slide, they are the content — scale them.
  return [...new Set([
    ...nodes.filter((node) => isChromeTypeElement(node)),
    ...section.querySelectorAll(COMMENT_STYLE_KICKER_SELECTOR),
  ])];
}

function graftFontScaleOntoSlideOuterHtml(
  slideHtml: string,
  factor: number,
): { html: string; alreadyApplied: boolean } | null {
  if (readCommentFontScaleFactor(slideHtml) === factor) {
    return { html: slideHtml, alreadyApplied: true };
  }
  const doc = parseManualEditSource(`<!doctype html><html><body>${slideHtml}</body></html>`);
  if (!doc) return null;
  const section = doc.querySelector('section') ?? doc.body.firstElementChild;
  if (!section) return null;
  if (section.getAttribute(COMMENT_FONT_SCALE_ATTR) === String(factor)) {
    return { html: slideHtml, alreadyApplied: true };
  }
  const targets = collectFontScaleTargets(section);
  let changed = 0;
  for (const node of targets) {
    const style = node.getAttribute('style') || '';
    const nextStyle = scaleInlineFontSize(style, factor);
    if (nextStyle === style) continue;
    node.setAttribute('style', nextStyle);
    changed += 1;
  }
  if (changed === 0) return null;
  section.setAttribute(COMMENT_FONT_SCALE_ATTR, String(factor));
  return { html: section.outerHTML, alreadyApplied: false };
}

function normalizeCommentTargetText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function isExactNamedTokenText(text: string, token: string): boolean {
  const normalized = normalizeCommentTargetText(text);
  const needle = token.trim();
  return Boolean(normalized) && Boolean(needle)
    && normalized.toLowerCase() === needle.toLowerCase();
}

function isExactOrCopyrightTokenText(text: string, token: string): boolean {
  if (isExactNamedTokenText(text, token)) return true;
  const normalized = normalizeCommentTargetText(text);
  if (!normalized) return false;
  const needle = token.trim();
  if (!needle) return false;
  const withoutCopyright = normalizeCommentTargetText(
    normalized.replace(/^(?:©|&copy;|\(c\)|copyright)\s*/i, ''),
  );
  return withoutCopyright.length > 0
    && withoutCopyright.length < normalized.length
    && withoutCopyright.toLowerCase() === needle.toLowerCase();
}

function isCopyrightTokenLine(text: string, token: string): boolean {
  return isExactOrCopyrightTokenText(text, token) && !isExactNamedTokenText(text, token);
}

function readElementFillColor(el: Element): string | null {
  const decls = parseInlineStyleDeclarations(el.getAttribute('style') || '');
  const bg = (decls['background-color'] || decls.background || '').trim();
  if (!bg) return null;
  if (/^(transparent|none|inherit|initial|unset)$/i.test(bg)) return null;
  if (/^url\(/i.test(bg)) return null;
  return bg;
}

/** Fill presence only. `matchElementByHtmlHint` prefers filled last-match via this. */
function isFilledChipBox(el: Element): boolean {
  return Boolean(readElementFillColor(el));
}

function isCommentStyleHeadingOrBodyNode(el: Element): boolean {
  try {
    return el.matches(COMMENT_STYLE_CONTENT_SELECTOR);
  } catch {
    return false;
  }
}

/** Filled `.card` / grid / cluster that already hosts heading or body copy. */
function isLargeFilledCardOrSection(el: Element): boolean {
  const tokens = [...el.classList].map((token) => token.toLowerCase());
  const looksLikeCardOrCluster = tokens.some((token) => (
    token === 'card'
    || token === 'grid'
    || token === 'cluster'
    || token === 'od-body-fill-cluster'
    || /(?:^|-)card$/.test(token)
  ));
  if (!looksLikeCardOrCluster) return false;
  return Boolean(el.querySelector(COMMENT_STYLE_CONTENT_SELECTOR));
}

/**
 * Climb-only chip detector. Do not reuse as `isFilledChipBox` — hint matching
 * still needs any inline fill, including large cards.
 */
function isChipLikeFilledBox(el: Element, section: Element): boolean {
  if (!isFilledChipBox(el) || isSlideSurfaceElement(el, section)) return false;
  if (isCommentStyleHeadingOrBodyNode(el)) return false;
  if (isLargeFilledCardOrSection(el)) return false;
  return !el.querySelector(COMMENT_STYLE_CONTENT_SELECTOR);
}

/** Prefer the filled chip that still reads as exact `Teamver`, not a sentence wrap. */
function resolveFilledChipTarget(
  leaf: Element,
  section: Element,
  token: string,
): Element | null {
  if (isCopyrightTokenLine(leaf.textContent || '', token)) return null;
  let node: Element | null = leaf;
  while (node && node !== section) {
    if (isFilledChipBox(node) && isExactNamedTokenText(node.textContent || '', token)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function isHiddenCommentStyleElement(el: Element): boolean {
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
    return true;
  }
  const decls = parseInlineStyleDeclarations(el.getAttribute('style') || '');
  if (/^none$/i.test(decls.display || '')) return true;
  if (/^hidden$/i.test(decls.visibility || '')) return true;
  return decls.opacity === '0';
}

function isSkippedNamedTextColorNode(el: Element, section: Element): boolean {
  if (NAMED_TEXT_SKIP_TAGS.has(el.tagName)) return true;
  if (isHiddenCommentStyleElement(el)) return true;
  const skippedAncestor = el.closest(NAMED_TEXT_SKIP_ANCESTOR_SELECTOR);
  return Boolean(
    skippedAncestor
    && skippedAncestor !== section
    && section.contains(skippedAncestor),
  );
}

/** Innermost matches only, then the last in tree order (bottom-most chip / © line). */
function selectBottomMostNamedTextTarget(matches: readonly Element[]): Element | null {
  if (matches.length === 0) return null;
  const leaves = matches.filter((node) =>
    !matches.some((other) => other !== node && node.contains(other)),
  );
  return (leaves.length > 0 ? leaves : matches).at(-1) ?? null;
}

function collectNamedTextColorTargets(section: Element, token: string): Element[] {
  const matches: Element[] = [];
  for (const node of section.querySelectorAll('*')) {
    if (node === section) continue;
    if (isSkippedNamedTextColorNode(node, section)) continue;
    if (!isExactOrCopyrightTokenText(node.textContent || '', token)) continue;
    matches.push(node);
  }
  return matches;
}

function applyInlineTextColor(el: Element, color: string): void {
  const decls = parseInlineStyleDeclarations(el.getAttribute('style') || '');
  decls.color = color;
  el.setAttribute('style', serializeInlineStyle(decls));
  el.setAttribute(COMMENT_TEXT_COLOR_ATTR, color);
}

function applyInlineChipFill(el: Element, color: string): void {
  const decls = parseInlineStyleDeclarations(el.getAttribute('style') || '');
  decls.background = color;
  decls['background-color'] = color;
  el.setAttribute('style', serializeInlineStyle(decls));
  el.setAttribute(COMMENT_CHIP_FILL_ATTR, color);
}

function elementFillMatches(el: Element, color: string): boolean {
  const bg = readElementFillColor(el);
  if (!bg) return false;
  const hex = bg.match(/#(?:[0-9a-f]{3,8})/i)?.[0];
  return (hex ?? bg).toLowerCase() === color.toLowerCase();
}

function cssQuotedAttrValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isSlideSurfaceElement(el: Element, section?: Element | null): boolean {
  if (section && el === section) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return true;
  if (tag === 'section' && (el.classList.contains('slide') || el.hasAttribute('data-slide-index'))) {
    return true;
  }
  return el.classList.contains('slide');
}

function querySelectorInSection(section: Element, selector: string): Element | null {
  const trimmed = selector.replace(/^dom:/i, '').trim();
  if (!trimmed || /[<{}]/.test(trimmed) || isGenericTagSelector(trimmed)) return null;
  try {
    const local = section.querySelector(trimmed);
    if (local) return local;
  } catch {
    // invalid selector
  }
  const stripped = trimmed.replace(
    /^(?:html\s*>\s*)?(?:body\s*>\s*)?(?:[a-z][\w-]*\s*>\s*)*section(?:\.slide)?(?::nth-(?:of-type|child)\(\d+\))?\s*>\s*/i,
    '',
  );
  if (!stripped || stripped === trimmed || isGenericTagSelector(stripped)) return null;
  try {
    return section.querySelector(stripped);
  } catch {
    return null;
  }
}

function matchElementByHtmlHint(section: Element, hint: string): Element | null {
  if (!hint.trim() || isSlideSurfaceHtmlHint(hint)) return null;
  const parsed = parseManualEditSource(`<!doctype html><html><body>${hint}</body></html>`);
  const hintEl = parsed?.body.firstElementChild;
  if (!hintEl || isSlideSurfaceElement(hintEl)) return null;
  const tag = hintEl.tagName;
  const text = normalizeCommentTargetText(hintEl.textContent || '');
  const fill = readElementFillColor(hintEl);
  const candidates = [...section.querySelectorAll(tag)].filter(
    (el) => el !== section && !isSlideSurfaceElement(el, section),
  );
  const exact = text
    ? candidates.filter((el) => normalizeCommentTargetText(el.textContent || '') === text)
    : candidates;
  if (fill) {
    const filled = (exact.length > 0 ? exact : candidates).filter((el) => isFilledChipBox(el));
    if (filled.length > 0) return filled.at(-1) ?? null;
  }
  if (exact.length === 1) return exact[0] ?? null;
  if (exact.length > 1) return exact.at(-1) ?? null;
  return null;
}

function resolveFilledChipAncestor(el: Element, section: Element): Element | null {
  const token = normalizeCommentTargetText(el.textContent || '');
  if (token) {
    const named = resolveFilledChipTarget(el, section, token);
    if (named) return named;
  }
  // Selected title/body inside a filled card must paint that node, not climb.
  if (isCommentStyleHeadingOrBodyNode(el)) return null;
  let node: Element | null = el;
  while (node && node !== section) {
    if (isChipLikeFilledBox(node, section)) return node;
    node = node.parentElement;
  }
  return null;
}

function resolveAttachedCommentStyleTarget(
  section: Element,
  attachment: ChatCommentAttachment,
): Element | null {
  const ids = [
    attachment.elementId,
    ...scopedCommentElementIds(attachment),
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .filter((id) => !isPageLevelCommentId(id) && !id.startsWith('visual-mark-'))
    .filter((id) => !isUnsafeCommentElementTargetId(id));
  for (const id of [...new Set(ids)]) {
    if (id.startsWith('dom:')) {
      const found = querySelectorInSection(section, id);
      if (found && !isSlideSurfaceElement(found, section)) return found;
      continue;
    }
    if (isGenericTagSelector(id)) continue;
    const escaped = cssQuotedAttrValue(id);
    const byAttr = section.querySelector(
      `[data-od-id="${escaped}"], [data-od-edit-id="${escaped}"], [data-od-runtime-id="${escaped}"], [id="${escaped}"]`,
    );
    if (byAttr && !isSlideSurfaceElement(byAttr, section)) return byAttr;
  }
  const selector = String(attachment.selector || '').trim();
  if (selector && !isGenericTagSelector(selector) && !isSlideSurfaceSelector(selector)) {
    const found = querySelectorInSection(section, selector);
    if (found && !isSlideSurfaceElement(found, section)) return found;
  }
  const fromHint = matchElementByHtmlHint(section, String(attachment.htmlHint || ''));
  if (fromHint) return fromHint;
  const text = normalizeCommentTargetText(attachment.currentText || '');
  if (!text) return null;
  const matches = collectNamedTextColorTargets(section, text);
  const chip = matches
    .map((leaf) => resolveFilledChipTarget(leaf, section, text))
    .find((node): node is Element => Boolean(node));
  if (chip) return chip;
  const leaf = selectBottomMostNamedTextTarget(matches);
  if (leaf && !isSlideSurfaceElement(leaf, section)) return leaf;
  return null;
}

function graftAttachmentTargetStyleOntoSlideOuterHtml(
  slideHtml: string,
  attachment: ChatCommentAttachment,
  color: string,
  instruction = '',
): { html: string; alreadyApplied: boolean; kind: 'text-color' | 'chip-fill' } | null {
  const doc = parseManualEditSource(`<!doctype html><html><body>${slideHtml}</body></html>`);
  if (!doc) return null;
  const section = doc.querySelector('section') ?? doc.body.firstElementChild;
  if (!section) return null;
  const target = resolveAttachedCommentStyleTarget(section, attachment);
  if (!target || isSlideSurfaceElement(target, section)) return null;
  const textOnly = isTextOnlyNamedColorInstruction(instruction);
  const chip = !textOnly ? resolveFilledChipAncestor(target, section) : null;
  const paint = chip
    ?? (!textOnly && isBackgroundColorCommentInstruction(instruction) ? target : null);
  if (paint && !isSlideSurfaceElement(paint, section)) {
    if (
      paint.getAttribute(COMMENT_CHIP_FILL_ATTR) === color
      && elementFillMatches(paint, color)
    ) {
      return { html: slideHtml, alreadyApplied: true, kind: 'chip-fill' };
    }
    applyInlineChipFill(paint, color);
    return { html: section.outerHTML, alreadyApplied: false, kind: 'chip-fill' };
  }
  if (target.getAttribute(COMMENT_TEXT_COLOR_ATTR) === color) {
    const decls = parseInlineStyleDeclarations(target.getAttribute('style') || '');
    if (decls.color?.trim().toLowerCase() === color.toLowerCase()) {
      return { html: slideHtml, alreadyApplied: true, kind: 'text-color' };
    }
  }
  applyInlineTextColor(target, color);
  return { html: section.outerHTML, alreadyApplied: false, kind: 'text-color' };
}

function graftNamedTextColorOntoSlideOuterHtml(
  slideHtml: string,
  token: string,
  color: string,
  instruction = '',
): { html: string; alreadyApplied: boolean; kind: 'text-color' | 'chip-fill' } | null {
  const doc = parseManualEditSource(`<!doctype html><html><body>${slideHtml}</body></html>`);
  if (!doc) return null;
  const section = doc.querySelector('section') ?? doc.body.firstElementChild;
  if (!section) return null;
  const leaf = selectBottomMostNamedTextTarget(
    collectNamedTextColorTargets(section, token),
  );
  if (!leaf) return null;
  const textOnly = isTextOnlyNamedColorInstruction(instruction);
  const chip = !textOnly ? resolveFilledChipTarget(leaf, section, token) : null;
  if (chip) {
    if (
      chip.getAttribute(COMMENT_CHIP_FILL_ATTR) === color
      && elementFillMatches(chip, color)
    ) {
      return { html: slideHtml, alreadyApplied: true, kind: 'chip-fill' };
    }
    applyInlineChipFill(chip, color);
    return { html: section.outerHTML, alreadyApplied: false, kind: 'chip-fill' };
  }
  if (leaf.getAttribute(COMMENT_TEXT_COLOR_ATTR) === color) {
    const decls = parseInlineStyleDeclarations(leaf.getAttribute('style') || '');
    if (decls.color?.trim().toLowerCase() === color.toLowerCase()) {
      return { html: slideHtml, alreadyApplied: true, kind: 'text-color' };
    }
  }
  applyInlineTextColor(leaf, color);
  return { html: section.outerHTML, alreadyApplied: false, kind: 'text-color' };
}

function graftBackgroundColorOntoSlideOuterHtml(
  slideHtml: string,
  color: string,
): string {
  const currentDecls = parseInlineStyleDeclarations(readSectionStyleAttr(
    slideHtml.match(/^<section\b[^>]*>/i)?.[0] ?? '',
  ));
  const nextDecls = {
    ...currentDecls,
    background: color,
    'background-color': color,
    '--paper': color,
    '--bg': color,
  };
  return writeSectionStyleAttr(slideHtml, serializeInlineStyle(nextDecls));
}

function joinCommentStyleInstruction(input: {
  instructionText?: string;
  commentAttachments: readonly ChatCommentAttachment[];
}): string {
  return [
    input.instructionText,
    ...input.commentAttachments.map((attachment) => attachment.comment),
  ].filter(Boolean).join('\n');
}

/**
 * 1007-N01 X/Y/Z — Apply font×2, selected-element fill/color, named
 * text/chip color, or a named slide background onto the pinned slide
 * using the prior deck only. MiniMax may return nothing.
 * Selected-element comments never paint `--paper` / section.slide.
 */
export function graftLocalCommentStyleOntoPrior(input: {
  priorHtml: string;
  commentAttachments: readonly ChatCommentAttachment[];
  instructionText?: string;
}): { ok: true; html: string; kind: LocalCommentStyleGraftKind } | { ok: false; reason: string } {
  if (input.commentAttachments.length === 0) {
    return { ok: false, reason: 'not a comment-scoped edit' };
  }
  const instruction = joinCommentStyleInstruction(input);
  const fontScale = isFontScaleCommentInstruction(instruction);
  const namedToken = isNamedTextColorCommentInstruction(instruction)
    ? parseCommentNamedTextToken(instruction)
    : null;
  const parsedColor = parseCommentBackgroundColor(instruction);
  const namedColor = namedToken
    ? (parsedColor ?? DEFAULT_NAMED_TOKEN_COLOR)
    : null;
  const elementTargeted = input.commentAttachments.some((attachment) =>
    commentAttachmentHasElementTarget(attachment),
  );
  const elementColor = elementTargeted
    ? (parsedColor ?? (COLOR_AS_TEXT_RE.test(instruction) ? DEFAULT_NAMED_TOKEN_COLOR : null))
    : null;
  // Whole-slide paper only when 배경 is explicit AND no selected element.
  const backgroundColor = !elementTargeted
    && !namedColor
    && isBackgroundColorCommentInstruction(instruction)
    ? parsedColor
    : null;
  if (!fontScale && !backgroundColor && !elementColor && !(namedColor && namedToken)) {
    return { ok: false, reason: 'comment is not a local style graft' };
  }
  const priorSlides = extractTopLevelSlideSections(extractDeckBodyContent(input.priorHtml));
  if (priorSlides.length === 0) {
    return { ok: false, reason: 'prior deck has no slides' };
  }
  const targets = resolveCommentEditTargetSlideIndexes({
    priorSlideCount: priorSlides.length,
    incomingSlides: [],
    commentAttachments: input.commentAttachments,
    priorHtml: input.priorHtml,
    priorSlides,
    instructionText: input.instructionText,
  });
  if (targets.length === 0) {
    return { ok: false, reason: 'comment target slide could not be resolved' };
  }
  const ops: Array<{ op: 'replace'; slideIndex: number; html: string }> = [];
  let fontScaleAlreadyApplied = false;
  let namedAlreadyApplied = false;
  let namedKind: 'text-color' | 'chip-fill' = 'text-color';
  for (const slideIndex of targets) {
    const priorSlide = priorSlides[slideIndex];
    if (!priorSlide) continue;
    let nextHtml = priorSlide.outerHtml;
    if (fontScale) {
      const scaled = graftFontScaleOntoSlideOuterHtml(nextHtml, COMMENT_FONT_SCALE_FACTOR);
      if (scaled) {
        nextHtml = scaled.html;
        if (scaled.alreadyApplied) fontScaleAlreadyApplied = true;
      }
    }
    let paintedElement = false;
    if (elementColor) {
      const attachmentsForSlide = input.commentAttachments.filter((attachment) =>
        !hasValidDeckSlideIndex(attachment) || attachment.slideIndex === slideIndex,
      );
      for (const attachment of attachmentsForSlide) {
        if (!commentAttachmentHasElementTarget(attachment)) continue;
        const colored = graftAttachmentTargetStyleOntoSlideOuterHtml(
          nextHtml,
          attachment,
          elementColor,
          instruction,
        );
        if (!colored) continue;
        nextHtml = colored.html;
        namedKind = colored.kind;
        if (colored.alreadyApplied) namedAlreadyApplied = true;
        paintedElement = true;
        break;
      }
    }
    if (!paintedElement && namedColor && namedToken) {
      const colored = graftNamedTextColorOntoSlideOuterHtml(
        nextHtml,
        namedToken.token,
        namedColor,
        instruction,
      );
      if (colored) {
        nextHtml = colored.html;
        namedKind = colored.kind;
        if (colored.alreadyApplied) namedAlreadyApplied = true;
      }
    }
    if (backgroundColor) {
      nextHtml = graftBackgroundColorOntoSlideOuterHtml(nextHtml, backgroundColor);
    }
    if (nextHtml !== priorSlide.outerHtml) {
      ops.push({ op: 'replace', slideIndex, html: nextHtml });
    }
  }
  if (ops.length === 0) {
    // Persist + empty_response (or a user retry) must not 64→128, and must
    // still count as a successful local graft so EMPTY_RESPONSE stays quiet.
    if (fontScale && fontScaleAlreadyApplied) {
      return { ok: true, html: input.priorHtml, kind: 'font-scale' };
    }
    if ((namedColor || elementColor) && namedAlreadyApplied) {
      return { ok: true, html: input.priorHtml, kind: namedKind };
    }
    return { ok: false, reason: 'local comment style did not graft' };
  }
  const patched = applyDeckPatch({
    currentHtml: input.priorHtml,
    patch: { ops },
  });
  if (!patched.ok) {
    return { ok: false, reason: 'local comment style patch failed' };
  }
  const kind: LocalCommentStyleGraftKind = (namedColor && namedToken) || elementColor
    ? namedKind
    : fontScale
      ? 'font-scale'
      : 'background';
  return {
    ok: true,
    html: patched.html,
    kind,
  };
}

/**
 * 1007-N01 AB — Selected-element fill / named bg / font×2 comments must
 * not wait for MiniMax. Requires a comment attachment so a greenfield
 * brief that happens to mention 빨강 still goes to the model.
 */
export function shouldSkipModelForLocalCommentStyle(input: {
  instructionText?: string;
  commentAttachments: readonly ChatCommentAttachment[];
}): boolean {
  if (input.commentAttachments.length === 0) return false;
  return canGraftLocalCommentStyleWithoutModel(
    joinCommentStyleInstruction(input),
    input.commentAttachments,
  );
}

/** Apply X/Y/Z local style onto the prior deck when MiniMax HTML is unused. */
export function tryLocalCommentStyleGraftInsteadOfModel(input: {
  priorHtml: string;
  commentAttachments: readonly ChatCommentAttachment[];
  instructionText?: string;
}): { ok: true; html: string; kind: LocalCommentStyleGraftKind } | { ok: false; reason: string } {
  if (!shouldSkipModelForLocalCommentStyle(input)) {
    return { ok: false, reason: 'comment is not a local style graft' };
  }
  if (!String(input.priorHtml ?? '').trim()) {
    return { ok: false, reason: 'no prior deck' };
  }
  return graftLocalCommentStyleOntoPrior(input);
}

function parseInlineStyleDeclarations(styleAttr: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of styleAttr.split(';')) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const value = part.slice(idx + 1).trim();
    if (prop && value) out[prop] = value;
  }
  return out;
}

function serializeInlineStyle(decls: Record<string, string>): string {
  return Object.entries(decls)
    .filter(([, value]) => value.trim())
    .map(([prop, value]) => `${prop}: ${value}`)
    .join('; ');
}

function readSectionStyleAttr(openTag: string): string {
  const match = openTag.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return match ? (match[1] ?? match[2] ?? '') : '';
}

function writeSectionStyleAttr(sectionHtml: string, style: string): string {
  const tagMatch = sectionHtml.match(/^<section\b([^>]*)>/i);
  if (!tagMatch) return sectionHtml;
  const attrs = tagMatch[1] ?? '';
  const styleMatch = attrs.match(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  let nextAttrs: string;
  if (!style.trim()) {
    nextAttrs = styleMatch
      ? attrs.replace(styleMatch[0], '').replace(/\s{2,}/g, ' ')
      : attrs;
  } else if (styleMatch) {
    nextAttrs = attrs.replace(styleMatch[0], `style="${style}"`);
  } else {
    nextAttrs = `${attrs} style="${style}"`;
  }
  return `<section${nextAttrs}>${sectionHtml.slice(tagMatch[0].length)}`;
}

function isSurfacePresentationProp(prop: string): boolean {
  return SURFACE_PRESENTATION_PROPS.has(prop.trim().toLowerCase());
}

function takeSurfacePresentation(
  decls: Record<string, string>,
  into: Record<string, string>,
): void {
  for (const [prop, value] of Object.entries(decls)) {
    if (isSurfacePresentationProp(prop) && value) into[prop] = value;
  }
}

function extractIncomingSurfacePresentation(
  incomingHtml: string,
  incomingSlide: { openTag: string; outerHtml: string },
): Record<string, string> {
  const found: Record<string, string> = {};
  takeSurfacePresentation(
    parseInlineStyleDeclarations(readSectionStyleAttr(incomingSlide.openTag)),
    found,
  );
  takeSurfacePresentation(
    parseInlineStyleDeclarations(readSectionStyleAttr(incomingSlide.outerHtml)),
    found,
  );
  for (const match of incomingHtml.matchAll(SURFACE_PRESENTATION_PROP_RE)) {
    const prop = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (!isSurfacePresentationProp(prop) || !value || found[prop]) continue;
    found[prop] = value;
  }
  return found;
}

function dataSlideIndexFromOpenTag(openTag: string): number | null {
  const match = openTag.match(/\bdata-slide-index\s*=\s*["']?(\d+)/i);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function resolveCommentEditTargetSlideIndexes(input: {
  priorSlideCount: number;
  incomingSlides: readonly { openTag: string }[];
  commentAttachments: readonly ChatCommentAttachment[];
  priorHtml?: string;
  priorSlides?: readonly { outerHtml: string }[];
  instructionText?: string;
}): number[] {
  const max = input.priorSlideCount;
  if (max <= 0) return [];
  // Pinned comment indexes win. Do not union with incoming data-slide-index:
  // a 1-slide draft almost always declares index 0 because it is the only
  // section, not because the user commented on slide 0.
  const fromAttachments = (scopedCommentSlideIndexesFromAttachments(input.commentAttachments) ?? [])
    .filter((index) => index < max);
  if (fromAttachments.length > 0) return [...new Set(fromAttachments)];

  const pageHint = parseCommentPageSlideIndex(joinCommentStyleInstruction({
    instructionText: input.instructionText,
    commentAttachments: input.commentAttachments,
  }));
  if (pageHint != null && pageHint < max) return [pageHint];

  if (input.commentAttachments.length > 0 && (input.priorHtml || input.priorSlides)) {
    const inferred: number[] = [];
    for (const attachment of input.commentAttachments) {
      const index = inferSlideIndexFromDeckHtml(
        input.priorHtml ?? '',
        attachment,
        input.priorSlides,
      );
      if (index != null && index >= 0 && index < max) inferred.push(index);
    }
    const uniqueInferred = [...new Set(inferred)];
    if (uniqueInferred.length > 0) return uniqueInferred;
  }

  const incomingIsShort =
    input.incomingSlides.length > 0 && input.incomingSlides.length < max;
  const fromIncoming = input.incomingSlides.flatMap((slide) => {
    const index = dataSlideIndexFromOpenTag(slide.openTag);
    return index != null && index < max ? [index] : [];
  });
  const incomingPins = incomingIsShort
    ? fromIncoming.filter((index) => !(input.incomingSlides.length === 1 && index === 0))
    : fromIncoming;
  if (incomingPins.length > 0) return [...new Set(incomingPins)];
  return [0];
}

const COMMENT_SLIDE_IDENTITY_ID_RE =
  /\bdata-od-(?:id|edit-id)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

function collectCommentSlideIdentityIds(html: string): Set<string> {
  const ids = new Set<string>();
  const re = new RegExp(COMMENT_SLIDE_IDENTITY_ID_RE.source, 'gi');
  let match: RegExpExecArray | null = re.exec(html);
  while (match) {
    const id = (match[1] ?? match[2] ?? '').trim();
    if (
      id
      && !id.startsWith('pin-')
      && !id.startsWith('file-comment-')
      && !id.startsWith('visual-mark-')
    ) {
      ids.add(id);
    }
    match = re.exec(html);
  }
  return ids;
}

function classTokensFromSlideOpenTag(openTag: string): string[] {
  const match = openTag.match(/\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return (match?.[1] ?? match?.[2] ?? '').trim().split(/\s+/).filter(Boolean);
}

function looksLikeCoverSlideFingerprint(slide: { openTag: string; outerHtml: string }): boolean {
  const tokens = classTokensFromSlideOpenTag(slide.openTag).map((token) => token.toLowerCase());
  if (tokens.includes('s-cover') || tokens.includes('cover')) return true;
  return /<section\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:s-cover|cover)\b/i.test(slide.outerHtml);
}

function firstCommentSlideHeadingText(outerHtml: string): string {
  const doc = parseManualEditSource(`<!doctype html><html><body>${outerHtml}</body></html>`);
  const section = doc?.querySelector('section') ?? doc?.body.firstElementChild;
  if (!section) return '';
  const heading = section.querySelector('.title, h1, h2');
  return normalizeCommentTargetText(heading?.textContent || '');
}

/**
 * 1007-N01 AA — 1-slide MiniMax HTML may stamp onto the pinned index only when
 * it is the same slide (od-id / distinctive heading). Cover fingerprints must
 * not replace a non-cover pin. `data-slide-index=0` on a 1-section draft is
 * not identity.
 */
function incomingCommentSlideIdentityMatchesPrior(
  incoming: { openTag: string; outerHtml: string },
  priorPinned: { openTag: string; outerHtml: string },
  pinIndex: number,
  priorSlides: readonly { openTag: string; outerHtml: string }[],
): boolean {
  if (pinIndex !== 0 && looksLikeCoverSlideFingerprint(incoming)) return false;
  const incomingIds = collectCommentSlideIdentityIds(incoming.outerHtml);
  const priorIds = collectCommentSlideIdentityIds(priorPinned.outerHtml);
  for (const id of incomingIds) {
    if (priorIds.has(id)) return true;
  }
  const incomingHeading = firstCommentSlideHeadingText(incoming.outerHtml);
  const priorHeading = firstCommentSlideHeadingText(priorPinned.outerHtml);
  if (!incomingHeading || incomingHeading !== priorHeading) return false;
  const headingMatches = priorSlides.filter((slide) => (
    firstCommentSlideHeadingText(slide.outerHtml) === incomingHeading
  ));
  // Shared title with the cover (or any other slide) is fail-closed.
  return headingMatches.length === 1;
}

/**
 * MiniMax often returns only the edited slide (index 0 in a 1-section
 * document). Expand that onto the prior deck at the pinned slide index so
 * later element/style merge sees matching counts.
 */
export function alignShortCommentIncomingToPriorDeck(input: {
  priorHtml: string;
  incomingHtml: string;
  commentAttachments: readonly ChatCommentAttachment[];
}): string {
  if (input.commentAttachments.length === 0) return input.incomingHtml;
  const priorSlides = extractTopLevelSlideSections(extractDeckBodyContent(input.priorHtml));
  const incomingSlides = extractTopLevelSlideSections(extractDeckBodyContent(input.incomingHtml));
  if (incomingSlides.length === 0 || priorSlides.length === 0) return input.incomingHtml;
  if (incomingSlides.length >= priorSlides.length) return input.incomingHtml;
  const targets = resolveCommentEditTargetSlideIndexes({
    priorSlideCount: priorSlides.length,
    incomingSlides,
    commentAttachments: input.commentAttachments,
    priorHtml: input.priorHtml,
    priorSlides,
  });
  if (targets.length === 0) return input.incomingHtml;
  if (incomingSlides.length === 1) {
    const pinIndex = targets[0];
    const priorPinned = pinIndex != null ? priorSlides[pinIndex] : undefined;
    if (
      pinIndex == null
      || !priorPinned
      || !incomingCommentSlideIdentityMatchesPrior(
        incomingSlides[0]!,
        priorPinned,
        pinIndex,
        priorSlides,
      )
    ) {
      return input.incomingHtml;
    }
  }
  const ops: Array<{ op: 'replace'; slideIndex: number; html: string }> = [];
  // Only write pinned targets. A 3-slide short draft must not spray onto
  // neighbors via targets[0]+offset.
  for (const [offset, slideIndex] of targets.entries()) {
    const replacement = incomingSlides.length === 1
      ? incomingSlides[0]!.outerHtml
      : incomingSlides[offset]?.outerHtml ?? incomingSlides[0]!.outerHtml;
    if (slideIndex >= 0 && slideIndex < priorSlides.length && replacement.trim()) {
      ops.push({ op: 'replace', slideIndex, html: replacement });
    }
  }
  if (ops.length === 0) return input.incomingHtml;
  const patched = applyDeckPatch({
    currentHtml: input.priorHtml,
    patch: { ops },
  });
  return patched.ok ? patched.html : input.incomingHtml;
}

export function graftIncomingSlideBackgroundOntoPrior(input: {
  priorHtml: string;
  incomingHtml: string;
  targetSlideIndexes: readonly number[];
}): string | null {
  const priorSlides = extractTopLevelSlideSections(extractDeckBodyContent(input.priorHtml));
  const incomingSlides = extractTopLevelSlideSections(extractDeckBodyContent(input.incomingHtml));
  if (priorSlides.length === 0 || incomingSlides.length === 0) return null;
  const ops: Array<{ op: 'replace'; slideIndex: number; html: string }> = [];
  for (const [offset, slideIndex] of input.targetSlideIndexes.entries()) {
    const priorSlide = priorSlides[slideIndex];
    if (!priorSlide) continue;
    const incomingSlide = incomingSlides.length === 1
      ? incomingSlides[0]!
      : incomingSlides[offset] ?? incomingSlides[slideIndex] ?? incomingSlides[0]!;
    const presentation = extractIncomingSurfacePresentation(input.incomingHtml, incomingSlide);
    if (Object.keys(presentation).length === 0) continue;
    const currentDecls = parseInlineStyleDeclarations(readSectionStyleAttr(priorSlide.openTag));
    const nextDecls = { ...currentDecls, ...presentation };
    const nextStyle = serializeInlineStyle(nextDecls);
    if (nextStyle === serializeInlineStyle(currentDecls)) continue;
    const nextSlide = writeSectionStyleAttr(priorSlide.outerHtml, nextStyle);
    if (nextSlide !== priorSlide.outerHtml) {
      ops.push({ op: 'replace', slideIndex, html: nextSlide });
    }
  }
  if (ops.length === 0) return null;
  const patched = applyDeckPatch({
    currentHtml: input.priorHtml,
    patch: { ops },
  });
  return patched.ok ? patched.html : null;
}

/**
 * 1007-N01 U — Comment edits must not require a full 8–10 slide rewrite.
 * If MiniMax returns only the edited slide, merge it onto the prior deck
 * (background/color onto the pinned slide; keep other slides and copy).
 * 1007-N01 X — Font×2 / named background must also work when incoming is empty.
 * 1007-N01 Y — Named bottom-most Teamver chip fill / © teamver text color is local too.
 * 1007-N01 Z — Selected-element color/fill never paints slide `--paper`.
 */
export function mergeCommentEditIncomingIntoPrior(input: {
  priorHtml: string;
  incomingHtml: string;
  commentAttachments: readonly ChatCommentAttachment[];
  instructionText?: string;
}): { ok: true; html: string; merged: boolean } | { ok: false; reason: string } {
  if (input.commentAttachments.length === 0) {
    return { ok: false, reason: 'not a comment-scoped edit' };
  }
  const priorSlides = extractTopLevelSlideSections(extractDeckBodyContent(input.priorHtml));
  const incomingSlides = extractTopLevelSlideSections(extractDeckBodyContent(input.incomingHtml));
  if (priorSlides.length === 0) {
    return { ok: false, reason: 'prior deck has no slides' };
  }

  const instruction = joinCommentStyleInstruction(input);
  const localStyle = canGraftLocalCommentStyleWithoutModel(
    instruction,
    input.commentAttachments,
  );
  const elementTargeted = input.commentAttachments.some((attachment) =>
    commentAttachmentHasElementTarget(attachment),
  );
  if (incomingSlides.length === 0) {
    if (!localStyle) {
      return { ok: false, reason: 'incoming comment edit has no slides' };
    }
    const grafted = graftLocalCommentStyleOntoPrior(input);
    if (grafted.ok) return { ok: true, html: grafted.html, merged: true };
    return { ok: false, reason: grafted.reason };
  }

  const targets = resolveCommentEditTargetSlideIndexes({
    priorSlideCount: priorSlides.length,
    incomingSlides,
    commentAttachments: input.commentAttachments,
    priorHtml: input.priorHtml,
    priorSlides,
    instructionText: input.instructionText,
  });

  if (isFontScaleCommentInstruction(instruction)) {
    const grafted = graftLocalCommentStyleOntoPrior(input);
    if (grafted.ok) return { ok: true, html: grafted.html, merged: true };
    return { ok: false, reason: grafted.reason };
  }

  const elementColorInstruction = elementTargeted && (
    isNamedTextColorCommentInstruction(instruction)
    || isBackgroundColorCommentInstruction(instruction)
    || Boolean(parseCommentBackgroundColor(instruction))
    || COLOR_AS_TEXT_RE.test(instruction)
  );
  if (elementColorInstruction || isNamedTextColorCommentInstruction(instruction)) {
    const grafted = graftLocalCommentStyleOntoPrior(input);
    if (grafted.ok) return { ok: true, html: grafted.html, merged: true };
    if (elementColorInstruction) {
      return { ok: false, reason: grafted.reason };
    }
  }

  if (isBackgroundColorCommentInstruction(instruction) && !elementTargeted) {
    const grafted = graftIncomingSlideBackgroundOntoPrior({
      priorHtml: input.priorHtml,
      incomingHtml: input.incomingHtml,
      targetSlideIndexes: targets,
    });
    if (grafted) return { ok: true, html: grafted, merged: true };
    const fromInstruction = graftLocalCommentStyleOntoPrior(input);
    if (fromInstruction.ok) return { ok: true, html: fromInstruction.html, merged: true };
    // Do not fall through to whole-slide align — that rewrites titles.
    return { ok: false, reason: 'background comment did not graft' };
  }

  if (incomingSlides.length >= priorSlides.length) {
    return { ok: true, html: input.incomingHtml, merged: false };
  }

  // 1007-N01 AA — Fail before mergeScoped/visual swap can stamp a 1-slide
  // cover onto a non-matching pin (e.g. 2페이지 지워줘).
  if (incomingSlides.length === 1) {
    const pinIndex = targets[0];
    const priorPinned = pinIndex != null ? priorSlides[pinIndex] : undefined;
    if (
      pinIndex == null
      || !priorPinned
      || !incomingCommentSlideIdentityMatchesPrior(
        incomingSlides[0]!,
        priorPinned,
        pinIndex,
        priorSlides,
      )
    ) {
      return {
        ok: false,
        reason: 'comment 1-slide incoming did not match pinned slide',
      };
    }
  }

  const scoped = mergeScopedCommentTargetsFromPatchedDeck({
    currentHtml: input.priorHtml,
    patchedHtml: input.incomingHtml,
    commentAttachments: input.commentAttachments,
    instructionText: input.instructionText,
    currentSlides: priorSlides,
  });
  if (scoped.ok && scoped.narrowed) {
    const count = extractTopLevelSlideSections(extractDeckBodyContent(scoped.html)).length;
    if (count === priorSlides.length) {
      return { ok: true, html: scoped.html, merged: true };
    }
  }

  const aligned = alignShortCommentIncomingToPriorDeck({
    priorHtml: input.priorHtml,
    incomingHtml: input.incomingHtml,
    commentAttachments: input.commentAttachments,
  });
  const alignedCount = extractTopLevelSlideSections(extractDeckBodyContent(aligned)).length;
  if (alignedCount === priorSlides.length && aligned !== input.priorHtml) {
    return { ok: true, html: aligned, merged: true };
  }
  return {
    ok: false,
    reason: !scoped.ok ? scoped.reason : 'comment short incoming did not merge',
  };
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
  let patchedHtml = input.patchedHtml;
  let patchedSlides = input.patchedSlides
    ?? extractTopLevelSlideSections(extractDeckBodyContent(patchedHtml));
  const attachments = input.commentAttachments;
  // 1007-N01 U — 1-slide comment drafts live at patched index 0, not the
  // pinned slideIndex. Expand onto prior shape before element/style merge.
  // Never align a non-comment short regenerate onto slide 0.
  if (
    attachments.length > 0
    && patchedSlides.length > 0
    && patchedSlides.length < nextSlides.length
  ) {
    const aligned = alignShortCommentIncomingToPriorDeck({
      priorHtml: nextHtml,
      incomingHtml: patchedHtml,
      commentAttachments: attachments,
    });
    if (aligned !== patchedHtml) {
      patchedHtml = aligned;
      patchedSlides = extractTopLevelSlideSections(extractDeckBodyContent(patchedHtml));
    }
  }
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
        patchedHtml,
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
        const patched = parseManualEditSource(patchedHtml);
        return current && patched ? { current, next: patched } : undefined;
      })();
      for (const slideIndex of slideCandidates) {
        const attempt = tryHintOnlyScopedMerge({
          nextHtml,
          patchedHtml,
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
          const patchedOuter = patchedSlides[slideIndex]?.outerHtml
            ?? (patchedSlides.length === 1 ? patchedSlides[0]?.outerHtml ?? null : null);
          const swap = tryVisualOrAnchorlessSlideSwap({
            nextHtml,
            patchedHtml,
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
      patchedHtml,
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
      const patched = parseManualEditSource(patchedHtml);
      return current && patched
        ? { current, next: patched, patched }
        : undefined;
    })();
    for (const slideIndex of slideCandidates) {
      const attempt = tryMergeScopedCommentAttachmentAtSlide({
        nextHtml,
        patchedHtml,
        attachment,
        slideIndex,
        instructionText: input.instructionText,
        parsedDocs: idBearingDocs,
        nextSlide: nextSlides[slideIndex]?.outerHtml ?? null,
        patchedSlide: patchedSlides[slideIndex]?.outerHtml
          ?? (patchedSlides.length === 1 ? patchedSlides[0]?.outerHtml ?? null : null),
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
    .filter(Boolean)
    .filter((id) => !isSyntheticVisualMarkTargetId(id));
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
    if (
      resolved
      && !resolved.startsWith('dom:')
      && !isSyntheticVisualMarkTargetId(slideReconciled.elementId)
    ) {
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
  if (
    isSyntheticVisualMarkTargetId(slideReconciled.elementId)
    && hasUserTypedVisualAnnotationRequest(slideReconciled)
    && slideReconciled.pagePosition
  ) {
    const boundsResolved = resolveManualEditTargetReferenceByPagePosition(
      deckHtml,
      { slideIndex },
      slideReconciled.pagePosition,
      parsedDoc,
    );
    if (boundsResolved && !boundsResolved.startsWith('dom:')) {
      devLog.info('[comment-reconcile] mapped visual annotation box to deck element', {
        elementId: boundsResolved,
        slideIndex,
      });
      return enrichVisualAnnotationFromResolvedTarget(
        deckHtml,
        slideReconciled,
        boundsResolved,
        slideIndex,
        parsedDoc,
      );
    }
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
