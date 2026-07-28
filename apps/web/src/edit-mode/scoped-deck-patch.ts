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
import { graftPatchedTargetElementFromSource, mergeManualEditTargetsFromSource } from './source-patches';

export type ScopedDeckPersistFailureCode =
  | 'deck_patch_parse_failed'
  | 'deck_patch_current_unreadable'
  | 'deck_patch_merge_failed'
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
      .filter((id) => id && !id.startsWith('pin-') && !id.startsWith('file-comment-')),
  )];
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
    : parseDeckPatch(input.patchBody ?? '');
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
    if (scoped.narrowed) return { ok: true, html: scoped.html };
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
  return { ok: true, html: merged.html };
}

function scopeRejectionCanRetry(reason: string): boolean {
  return (
    reason.includes('outside attached comment scope') ||
    reason.includes('is not allowed for scoped comment edits') ||
    /targets slideIndex \d+ but deck has \d+ slides/.test(reason)
  );
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

  if (
    typeof input.attachment.slideIndex === 'number' &&
    Number.isInteger(input.attachment.slideIndex) &&
    input.attachment.slideIndex >= 0
  ) {
    pushUnique(candidates, Math.floor(input.attachment.slideIndex));
  }

  return candidates.length > 0 ? candidates : verified;
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
    currentText: input.attachment.currentText,
    instructionText: scopedCommentInstructionText(input.attachment, input.instructionText),
    htmlHint: input.attachment.htmlHint,
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
    slideDiffIsStyleOnly(nextSlide, patchedSlide)
  ) {
    const html = acceptSlideLevel('style-only');
    if (html) return { ok: true, html };
  }

  if (targetTextPreservedInPatchedSlide(patchedSlide, input.attachment)) {
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
    if (ids.length === 0) continue;

    const slideCandidates = resolveScopedCommentSlideCandidates({
      attachment,
      currentHtml: nextHtml,
      patchedHtml: input.patchedHtml,
    });
    if (slideCandidates.length === 0) continue;

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
