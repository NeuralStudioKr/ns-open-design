import { extractTopLevelSlideSections } from '../artifacts/deck-patch';
import type { ChatCommentAttachment } from '../types';
import { readScopedCommentTargetText } from './source-patches';

function listDeckSlideIndexes(html: string): number[] {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(html);
  const scope = bodyMatch ? bodyMatch[1] ?? '' : html;
  return extractTopLevelSlideSections(scope).map((_, index) => index);
}

function resolveValidationSlideIndexes(
  mergedHtml: string,
  attachment: ChatCommentAttachment,
): number[] {
  const slides = listDeckSlideIndexes(mergedHtml);
  const hint = {
    elementId: attachment.elementId,
    currentText: attachment.currentText,
    htmlHint: attachment.htmlHint,
    selector: attachment.selector,
  };
  const verified: number[] = [];
  for (const slideIndex of slides) {
    const mergedText = readScopedCommentTargetText(mergedHtml, { slideIndex }, hint);
    if (mergedText !== null && targetTextContentPreserved(attachment, mergedText)) {
      verified.push(slideIndex);
    }
  }
  if (verified.length > 0) return verified;

  const candidates: number[] = [];
  const pushUnique = (index: number) => {
    if (Number.isInteger(index) && index >= 0 && !candidates.includes(index)) {
      candidates.push(index);
    }
  };
  if (
    typeof attachment.slideIndex === 'number'
    && Number.isInteger(attachment.slideIndex)
    && attachment.slideIndex >= 0
  ) {
    pushUnique(attachment.slideIndex);
  }
  for (const slideIndex of slides) {
    pushUnique(slideIndex);
  }
  return candidates;
}

function collapseText(value: string): string {
  return String(value ?? '').replace(/\s+/g, '').trim();
}

function significantTokens(text: string): string[] {
  return [...new Set(
    collapseText(text)
      .split(/[^가-힣A-Za-z0-9]+/)
      .filter((token) => token.length >= 2),
  )];
}

/**
 * True when the user asked to change presentation (size, weight, color,
 * emphasis) without replacing the actual words.
 */
const EXPLICIT_TEXT_CHANGE_SIGNAL =
  /텍스트\s*(를|을)\s*['"“”「『]|(?:로|으로)\s*바꿔|(?:로|으로)\s*변경|문구\s*변경|내용\s*변경|replace\s+with|rename|다르게\s*써/i;

const EXPLICIT_REMOVAL_SIGNAL =
  /삭제|제거|없애|지워|빼\s*줘|빼주|remove|delete/i;

export function looksLikeStyleOnlyCommentRequest(instruction: string): boolean {
  const text = String(instruction ?? '').trim();
  if (!text) return false;
  if (looksLikeMarkupLayoutCommentRequest(text)) return false;
  const styleSignals =
    /크게|작게|키워|글자|폰트|굵게|선명|눈에\s*띄|강조|크기|사이즈|가독|눈에\s*잘|font|bigger|larger|smaller|size|bold|emphas|highlight|visibility/i;
  return styleSignals.test(text) && !EXPLICIT_TEXT_CHANGE_SIGNAL.test(text);
}

/**
 * True when the user asked to change layout/wrapping (line breaks, single line)
 * without replacing the actual words.
 */
export function looksLikeMarkupLayoutCommentRequest(instruction: string): boolean {
  const text = String(instruction ?? '').trim();
  if (!text) return false;
  const layoutSignals =
    /줄바꿈|한\s*줄|한줄|줄\s*맞|개행|엔터|두\s*줄|2\s*줄|wrap|line[-\s]?break|single\s*line|one\s*line|nowrap|no[-\s]?wrap|white[-\s]?space/i;
  return layoutSignals.test(text) && !EXPLICIT_TEXT_CHANGE_SIGNAL.test(text);
}

/**
 * True when the user asked to change alignment/spacing without replacing words.
 */
export function looksLikeAlignmentCommentRequest(instruction: string): boolean {
  const text = String(instruction ?? '').trim();
  if (!text) return false;
  const alignmentSignals =
    /정렬|가운데|중앙|왼쪽|오른쪽|align|center|left|right|justify|spacing|간격|여백|padding|margin/i;
  return alignmentSignals.test(text) && !EXPLICIT_TEXT_CHANGE_SIGNAL.test(text);
}

export function looksLikePresentationTweakCommentRequest(instruction: string): boolean {
  return (
    looksLikeStyleOnlyCommentRequest(instruction)
    || looksLikeMarkupLayoutCommentRequest(instruction)
    || looksLikeAlignmentCommentRequest(instruction)
  );
}

/**
 * True when the user asked to delete/remove the pinned element.
 */
export function looksLikeRemovalCommentRequest(instruction: string): boolean {
  const text = String(instruction ?? '').trim();
  if (!text) return false;
  return EXPLICIT_REMOVAL_SIGNAL.test(text) && !EXPLICIT_TEXT_CHANGE_SIGNAL.test(text);
}

export function targetTextContentPreserved(
  attachment: Pick<ChatCommentAttachment, 'currentText' | 'htmlHint' | 'podMembers'>,
  mergedElementText: string,
): boolean {
  const anchors = [
    attachment.currentText,
    attachment.htmlHint?.replace(/<[^>]+>/g, ' '),
    ...(attachment.podMembers ?? []).map((member) => member.text),
  ]
    .map((value) => collapseText(value || ''))
    .filter((value) => value.length >= 2);
  if (anchors.length === 0) return true;

  const merged = collapseText(mergedElementText || '');
  if (!merged) return false;

  for (const anchor of anchors) {
    if (merged.includes(anchor)) return true;
    const tokens = significantTokens(anchor);
    if (tokens.length === 0) continue;
    const preserved = tokens.filter((token) => merged.includes(token)).length;
    if (preserved / tokens.length >= 0.6) return true;
  }
  return false;
}

export function validateCommentEditIntentRespected(input: {
  mergedHtml: string;
  commentAttachments: readonly ChatCommentAttachment[];
  instructionText?: string;
}): { ok: true } | { ok: false; reason: string } {
  const instruction = [
    input.instructionText,
    ...input.commentAttachments.map((attachment) => attachment.comment),
  ].filter(Boolean).join('\n');
  if (!looksLikeStyleOnlyCommentRequest(instruction)) {
    return { ok: true };
  }

  for (const attachment of input.commentAttachments) {
    if (attachment.selectionKind === 'visual') continue;
    const hint = {
      elementId: attachment.elementId,
      currentText: attachment.currentText,
      htmlHint: attachment.htmlHint,
      selector: attachment.selector,
    };
    const slideIndexes = resolveValidationSlideIndexes(input.mergedHtml, attachment);
    if (slideIndexes.length === 0) continue;

    const preserved = slideIndexes.some((slideIndex) => {
      const mergedText = readScopedCommentTargetText(input.mergedHtml, { slideIndex }, hint);
      return mergedText !== null && targetTextContentPreserved(attachment, mergedText);
    });
    if (!preserved) {
      return {
        ok: false,
        reason:
          'style-only comment edit removed or emptied the pinned target text; use set-style (e.g. fontSize) and keep currentText verbatim',
      };
    }
  }

  return { ok: true };
}
