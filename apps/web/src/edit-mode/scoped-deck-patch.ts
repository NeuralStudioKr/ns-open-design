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
  extractTopLevelSlideSections,
  parseDeckPatch,
  type DeckPatch,
} from '../artifacts/deck-patch';
import type { ChatCommentAttachment } from '../types';
import { validateCommentEditIntentRespected, targetTextContentPreserved } from './comment-edit-intent';
import {
  graftPatchedTargetElementFromSource,
  mergeManualEditTargetByHint,
  mergeManualEditTargetsFromSource,
  readScopedCommentTargetText,
  resolveManualEditTargetReference,
} from './source-patches';

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
  | { ok: true; html: string }
  | { ok: false; code: ScopedDeckPersistFailureCode; reason: string };

export function scopedCommentElementIds(attachment: ChatCommentAttachment): string[] {
  if (attachment.selectionKind === 'visual') return [];
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
      .filter((id) => !isUnsafeCommentElementTargetId(id)),
  )];
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
): DeckPatch {
  if (!allowedSlideIndexes || allowedSlideIndexes.length !== 1) return patch;
  const allowed = allowedSlideIndexes[0]!;
  if (!patch.ops.some((op) => op.slideIndex !== allowed)) return patch;
  if (currentHtml && commentAttachments?.length) {
    for (const op of patch.ops) {
      if (op.slideIndex === allowed) continue;
      const modelSlide = extractSlideByIndex(currentHtml, op.slideIndex);
      if (!modelSlide) continue;
      for (const attachment of commentAttachments) {
        if (targetTextPreservedInPatchedSlide(modelSlide, attachment)) {
          return patch;
        }
      }
    }
  }
  return {
    ops: patch.ops.map((op) => ({ ...op, slideIndex: allowed })),
  };
}

function targetElementTextPreservedAfterMerge(
  currentHtml: string,
  patchedHtml: string,
  attachment: ChatCommentAttachment,
  slideIndex: number,
): boolean {
  const hint = attachmentMergeHint(attachment);
  const scope = { slideIndex };
  const before = readScopedCommentTargetText(currentHtml, scope, {
    elementId: attachment.elementId,
    ...hint,
  });
  const after = readScopedCommentTargetText(patchedHtml, scope, {
    elementId: attachment.elementId,
    ...hint,
  });
  if (!before?.trim()) return true;
  return targetTextContentPreserved(attachment, after ?? '');
}

export function applyScopedDeckPatchToHtml(input: {
  currentHtml: string;
  patchBody?: string;
  patch?: DeckPatch;
  allowedSlideIndexes?: readonly number[];
  commentAttachments?: readonly ChatCommentAttachment[];
  instructionText?: string;
}): DeckPatchMergeResult {
  const parsed = input.patch
    ? { ok: true as const, patch: input.patch }
    : parseDeckPatch(input.patchBody ?? '', {
        fallbackSlideIndexes: input.allowedSlideIndexes,
        currentHtml: input.currentHtml,
      });
  if (!parsed.ok) {
    return { ok: false, code: 'deck_patch_parse_failed', reason: parsed.reason };
  }
  const currentHtml = input.currentHtml;
  const patchForScope = coerceDeckPatchToAllowedScope(
    parsed.patch,
    input.allowedSlideIndexes,
    currentHtml,
    input.commentAttachments,
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
      console.warn('[deck-patch] strict scope apply rejected — retrying without scope guard', {
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
  if (input.allowedSlideIndexes && input.commentAttachments?.length) {
    const scoped = mergeScopedCommentTargetsFromPatchedDeck({
      currentHtml,
      patchedHtml: merged.html,
      commentAttachments: input.commentAttachments,
      instructionText: input.instructionText,
    });
    if (!scoped.ok) {
      return { ok: false, code: 'deck_patch_merge_failed', reason: scoped.reason };
    }
    if (scoped.narrowed) {
      const intent = validateCommentEditIntentRespected({
        mergedHtml: scoped.html,
        commentAttachments: input.commentAttachments,
        instructionText: input.instructionText,
      });
      if (!intent.ok) {
        return { ok: false, code: 'comment_edit_intent_violated', reason: intent.reason };
      }
      return { ok: true, html: scoped.html };
    }
    if (mergedScopeRelaxed) {
      console.warn('[deck-patch] scope-relaxed apply produced no narrowed match — rejecting', {
        allowedSlideIndexes: input.allowedSlideIndexes,
      });
      return {
        ok: false,
        code: 'deck_patch_merge_failed',
        reason: strictScopeApply.ok ? 'unexpected relaxed apply state' : strictScopeApply.reason,
      };
    }
  }
  const intent = validateCommentEditIntentRespected({
    mergedHtml: merged.html,
    commentAttachments: input.commentAttachments ?? [],
    instructionText: input.instructionText,
  });
  if (!intent.ok && input.commentAttachments?.length) {
    return { ok: false, code: 'comment_edit_intent_violated', reason: intent.reason };
  }
  return { ok: true, html: merged.html };
}

function scopeRejectionCanRetry(reason: string): boolean {
  return (
    reason.includes('outside attached comment scope') ||
    reason.includes('is not allowed for scoped comment edits') ||
    /targets slideIndex \d+ but deck has \d+ slides/.test(reason)
  );
}

function listChangedDeckSlideIndexes(currentHtml: string, patchedHtml: string): number[] {
  const currentSlides = listDeckSlideIndexes(currentHtml).map((index) => ({
    index,
    html: extractSlideByIndex(currentHtml, index) ?? '',
  }));
  const patchedSlides = listDeckSlideIndexes(patchedHtml).map((index) => ({
    index,
    html: extractSlideByIndex(patchedHtml, index) ?? '',
  }));
  const changed: number[] = [];
  const pushUnique = (index: number) => {
    if (Number.isInteger(index) && index >= 0 && !changed.includes(index)) {
      changed.push(index);
    }
  };
  for (const current of currentSlides) {
    const patched = patchedSlides.find((slide) => slide.index === current.index);
    if (patched && patched.html !== current.html) {
      pushUnique(current.index);
    }
  }
  for (const patched of patchedSlides) {
    const current = currentSlides.find((slide) => slide.index === patched.index);
    if (!current || current.html !== patched.html) {
      pushUnique(patched.index);
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
  );
  if (merged.ok) {
    console.info('[deck-patch] accepted hint-only target fallback', {
      slideIndex: input.slideIndex,
      selector: hint.selector,
    });
    return { ok: true, html: merged.source };
  }
  return { ok: false, reason: merged.reason };
}

function listDeckSlideIndexes(html: string): number[] {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  const scope = bodyMatch ? bodyMatch[1] ?? '' : html;
  return extractTopLevelSlideSections(scope).map((_, index) => index);
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
}): number[] {
  const verified: number[] = [];
  const pushUnique = (list: number[], index: number) => {
    if (Number.isInteger(index) && index >= 0 && !list.includes(index)) {
      list.push(index);
    }
  };

  for (const slideIndex of listDeckSlideIndexes(input.currentHtml)) {
    const slide = extractSlideByIndex(input.currentHtml, slideIndex);
    if (slide && targetTextPreservedInPatchedSlide(slide, input.attachment)) {
      pushUnique(verified, slideIndex);
    }
  }

  for (const slideIndex of listDeckSlideIndexes(input.patchedHtml)) {
    const slide = extractSlideByIndex(input.patchedHtml, slideIndex);
    if (slide && targetTextPreservedInPatchedSlide(slide, input.attachment)) {
      pushUnique(verified, slideIndex);
    }
  }

  const candidates: number[] = [...verified];

  for (const slideIndex of listChangedDeckSlideIndexes(input.currentHtml, input.patchedHtml)) {
    pushUnique(candidates, slideIndex);
  }

  if (hasValidDeckSlideIndex(input.attachment)) {
    const idx = Math.floor(input.attachment.slideIndex as number);
    if (verified.includes(idx)) {
      pushUnique(candidates, idx);
    }
  }

  if (candidates.length === 0) {
    const inferred = inferSlideIndexFromDeckHtml(input.currentHtml, input.attachment)
      ?? inferSlideIndexFromDeckHtml(input.patchedHtml, input.attachment);
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
}): { ok: true; html: string } | { ok: false; reason: string } {
  const ids = scopedCommentElementIds(input.attachment);
  const hints = ids.map((id) => ({
    id,
    ...attachmentMergeHint(input.attachment, input.instructionText),
  }));

  const merged = mergeManualEditTargetsFromSource(
    input.nextHtml,
    input.patchedHtml,
    ids,
    { slideIndex: input.slideIndex },
    hints,
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

  const nextSlide = extractSlideByIndex(input.nextHtml, input.slideIndex);
  const patchedSlide = extractSlideByIndex(input.patchedHtml, input.slideIndex);
  if (!nextSlide || !patchedSlide) {
    return { ok: false, reason: merged.reason };
  }

  const acceptSlideLevel = (kind: 'style-only' | 'text-preserved'): string | null => {
    const swapped = applyDeckPatch({
      currentHtml: input.nextHtml,
      patch: {
        ops: [{ op: 'replace', slideIndex: input.slideIndex, html: patchedSlide }],
      },
    });
    if (!swapped.ok) return null;
    console.info('[deck-patch] accepted slide-level fallback', {
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
    targetElementTextPreservedAfterMerge(input.nextHtml, input.patchedHtml, input.attachment, input.slideIndex)
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
    );
    if (graft.ok && graft.source !== input.nextHtml) {
      console.info('[deck-patch] accepted grafted target fallback', {
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
  const hintOnly = tryHintOnlyScopedMerge(input);
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
  if (acceptForAnchorlessNotFound) {
    const swapped = applyDeckPatch({
      currentHtml: input.nextHtml,
      patch: {
        ops: [{ op: 'replace', slideIndex: input.slideIndex, html: patchedSlide }],
      },
    });
    if (swapped.ok) {
      console.warn('[deck-patch] accepted last-resort slide-level swap', {
        slideIndex: input.slideIndex,
        ids,
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
}): { ok: true; html: string; narrowed: boolean } | { ok: false; reason: string } {
  let nextHtml = input.currentHtml;
  let narrowed = false;
  for (const attachment of input.commentAttachments) {
    const ids = scopedCommentElementIds(attachment);
    if (ids.length === 0) {
      const slideCandidates = resolveScopedCommentSlideCandidates({
        attachment,
        currentHtml: nextHtml,
        patchedHtml: input.patchedHtml,
      });
      if (slideCandidates.length === 0) {
        return {
          ok: false,
          reason: 'comment target slide could not be resolved from attachment or deck HTML',
        };
      }
      let hintMerged = false;
      let lastReason = 'No matching targets found to merge.';
      for (const slideIndex of slideCandidates) {
        const attempt = tryHintOnlyScopedMerge({
          nextHtml,
          patchedHtml: input.patchedHtml,
          attachment,
          slideIndex,
          instructionText: input.instructionText,
        });
        if (attempt.ok) {
          nextHtml = attempt.html;
          narrowed = true;
          hintMerged = true;
          break;
        }
        lastReason = attempt.reason;
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
    });
    if (slideCandidates.length === 0) {
      return {
        ok: false,
        reason: 'comment target slide could not be resolved from attachment or deck HTML',
      };
    }

    let lastReason = 'No matching targets found to merge.';
    let mergedForAttachment = false;
    for (const slideIndex of slideCandidates) {
      const attempt = tryMergeScopedCommentAttachmentAtSlide({
        nextHtml,
        patchedHtml: input.patchedHtml,
        attachment,
        slideIndex,
        instructionText: input.instructionText,
      });
      if (attempt.ok) {
        nextHtml = attempt.html;
        narrowed = true;
        mergedForAttachment = true;
        break;
      }
      lastReason = attempt.reason;
    }

    if (!mergedForAttachment) {
      console.warn('[deck-patch] scoped narrow merge failed', {
        slideCandidates,
        ids,
        reason: lastReason,
        currentText: attachment.currentText,
        htmlHint: attachment.htmlHint?.slice(0, 120),
      });
      return { ok: false, reason: lastReason };
    }
  }
  return { ok: true, html: nextHtml, narrowed };
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
    const collapsed = collapseTargetTextForMatch(raw);
    if (!collapsed || seen.has(collapsed)) return;
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
): number | null {
  const sections = extractTopLevelSlideSections(html);
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
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  const scope = bodyMatch ? bodyMatch[1] ?? '' : html;
  const topSections = extractTopLevelSlideSections(scope);
  const candidates = topSections.map((section, index) => ({
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

/**
 * Verify or replace `attachment.slideIndex` against the current deck HTML.
 * Prefers text-verified slides, then structural inference.
 */
export function reconcileCommentAttachmentSlideIndex(
  deckHtml: string,
  attachment: ChatCommentAttachment,
): ChatCommentAttachment {
  if (!deckHtml.trim()) return attachment;

  const candidates = resolveScopedCommentSlideCandidates({
    attachment,
    currentHtml: deckHtml,
    patchedHtml: deckHtml,
  });

  const inferred = inferSlideIndexFromDeckHtml(deckHtml, attachment);
  if (inferred != null) {
    const inferredSlide = extractSlideByIndex(deckHtml, inferred);
    if (
      inferredSlide
      && targetTextPreservedInPatchedSlide(inferredSlide, attachment)
      && (!hasValidDeckSlideIndex(attachment) || attachment.slideIndex !== inferred)
    ) {
      return { ...attachment, slideIndex: inferred };
    }
  }

  if (hasValidDeckSlideIndex(attachment)) {
    const slide = extractSlideByIndex(deckHtml, attachment.slideIndex!);
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
): ChatCommentAttachment {
  if (!deckHtml.trim()) return attachment;
  const slideReconciled = reconcileCommentAttachmentSlideIndex(deckHtml, attachment);
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
  );
  if (hintOnly && !hintOnly.startsWith('dom:')) {
    return { ...slideReconciled, elementId: hintOnly };
  }
  return slideReconciled;
}

export function reconcileCommentAttachmentForDeck(
  deckHtml: string,
  attachment: ChatCommentAttachment,
): ChatCommentAttachment {
  return reconcileCommentAttachmentElementId(deckHtml, attachment);
}

export function reconcileCommentAttachmentsForDeck(
  deckHtml: string,
  attachments: readonly ChatCommentAttachment[],
): ChatCommentAttachment[] {
  return attachments.map((attachment) => reconcileCommentAttachmentForDeck(deckHtml, attachment));
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
 * Resolve allowed slide indexes for element-patch when the attachment
 * carried a stale slideIndex. Uses target-text signals on the model's
 * chosen slide before falling back to the attachment value.
 */
export function resolveElementPatchAllowedSlideIndexes(input: {
  currentHtml: string;
  patches: readonly { slideIndex: number }[];
  allowedSlideIndexes?: readonly number[];
  commentAttachments?: readonly ChatCommentAttachment[];
}): number[] | undefined {
  if (!input.allowedSlideIndexes || input.allowedSlideIndexes.length === 0) {
    return input.allowedSlideIndexes ? [...input.allowedSlideIndexes] : undefined;
  }
  if (!input.commentAttachments?.length) {
    return [...input.allowedSlideIndexes];
  }

  const discovered = new Set<number>();
  for (const attachment of input.commentAttachments) {
    for (const patch of input.patches) {
      const modelSlide = extractSlideByIndex(input.currentHtml, patch.slideIndex);
      if (modelSlide && targetTextPreservedInPatchedSlide(modelSlide, attachment)) {
        discovered.add(patch.slideIndex);
      }
    }
    const candidates = resolveScopedCommentSlideCandidates({
      attachment,
      currentHtml: input.currentHtml,
      patchedHtml: input.currentHtml,
    });
    for (const candidate of candidates) {
      discovered.add(candidate);
    }
  }

  if (discovered.size > 0) {
    return [...discovered];
  }
  return [...input.allowedSlideIndexes];
}

export function extractSlideByIndex(html: string, slideIndex: number): string | null {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  const scope = bodyMatch ? bodyMatch[1] ?? '' : html;
  const sections = extractTopLevelSlideSections(scope);
  const section = sections[slideIndex];
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
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}
