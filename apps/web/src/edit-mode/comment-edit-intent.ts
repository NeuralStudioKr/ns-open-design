import { extractDeckBodyContent, extractTopLevelSlideSections } from '../artifacts/deck-patch';
import type { ChatCommentAttachment } from '../types';
import { parseManualEditSource, readScopedCommentTargetText } from './source-patches';

/** Mirror findScopedRoot slide discovery so Document path stays selector-parity. */
const INTENT_STRUCTURED_SLIDE_SELECTOR =
  '.deck > .slide, .deck-stage > .slide, .deck-shell > .slide, #od-stacked-deck-stage > .slide, body > .slide, body > section.slide, body > section[class~="slide"]';

function listDeckSlideIndexes(html: string, parsedDoc?: Document | null): number[] {
  // When finalize already shared a Document, derive indexes without body extract.
  if (parsedDoc) {
    const structured = parsedDoc.querySelectorAll(INTENT_STRUCTURED_SLIDE_SELECTOR);
    if (structured.length > 0) {
      return Array.from({ length: structured.length }, (_, index) => index);
    }
    const anySlide = parsedDoc.querySelectorAll('.slide');
    if (anySlide.length > 0) {
      return Array.from({ length: anySlide.length }, (_, index) => index);
    }
  }
  return extractTopLevelSlideSections(extractDeckBodyContent(html)).map((_, index) => index);
}

/**
 * Returns `verified` when at least one slide already preserves target text
 * (caller must not re-parse). Otherwise returns candidate slide indexes.
 */
function resolveValidationSlideIndexes(
  mergedHtml: string,
  attachment: ChatCommentAttachment,
  parsedDoc?: Document | null,
): { verified: true } | { verified: false; candidates: number[] } {
  const slides = listDeckSlideIndexes(mergedHtml, parsedDoc);
  const hint = {
    elementId: attachment.elementId,
    currentText: attachment.currentText,
    htmlHint: attachment.htmlHint,
    selector: attachment.selector,
  };
  const pinned =
    typeof attachment.slideIndex === 'number'
    && Number.isInteger(attachment.slideIndex)
    && attachment.slideIndex >= 0
      ? Math.floor(attachment.slideIndex)
      : null;
  // Prefer the pinned slide first — full-deck walk only when that miss.
  if (pinned != null) {
    const pinnedText = readScopedCommentTargetText(mergedHtml, { slideIndex: pinned }, hint, parsedDoc);
    if (pinnedText !== null && targetTextContentPreserved(attachment, pinnedText)) {
      return { verified: true };
    }
  }
  for (const slideIndex of slides) {
    if (slideIndex === pinned) continue;
    const mergedText = readScopedCommentTargetText(mergedHtml, { slideIndex }, hint, parsedDoc);
    if (mergedText !== null && targetTextContentPreserved(attachment, mergedText)) {
      return { verified: true };
    }
  }

  const candidates: number[] = [];
  const pushUnique = (index: number) => {
    if (Number.isInteger(index) && index >= 0 && !candidates.includes(index)) {
      candidates.push(index);
    }
  };
  if (pinned != null) pushUnique(pinned);
  for (const slideIndex of slides) {
    pushUnique(slideIndex);
  }
  return { verified: false, candidates };
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
  /** When set, skip a second DOMParser (deck-patch finalize / full-deck guard). */
  parsedDoc?: Document | null;
}): { ok: true } | { ok: false; reason: string } {
  const instruction = [
    input.instructionText,
    ...input.commentAttachments.map((attachment) => attachment.comment),
  ].filter(Boolean).join('\n');
  // Style ∪ layout ∪ alignment — "한 줄로" / "정렬" must not wipe pinned text either.
  if (!looksLikePresentationTweakCommentRequest(instruction)) {
    return { ok: true };
  }

  const parsedDoc = input.parsedDoc !== undefined
    ? input.parsedDoc
    : parseManualEditSource(input.mergedHtml);
  for (const attachment of input.commentAttachments) {
    if (attachment.selectionKind === 'visual') continue;
    const hint = {
      elementId: attachment.elementId,
      currentText: attachment.currentText,
      htmlHint: attachment.htmlHint,
      selector: attachment.selector,
    };
    const resolved = resolveValidationSlideIndexes(input.mergedHtml, attachment, parsedDoc);
    if (resolved.verified) continue;
    if (resolved.candidates.length === 0) continue;

    const preserved = resolved.candidates.some((slideIndex) => {
      const mergedText = readScopedCommentTargetText(
        input.mergedHtml,
        { slideIndex },
        hint,
        parsedDoc,
      );
      return mergedText !== null && targetTextContentPreserved(attachment, mergedText);
    });
    if (!preserved) {
      return {
        ok: false,
        reason:
          'presentation-only comment edit removed or emptied the pinned target text; keep currentText verbatim while changing style/layout/alignment',
      };
    }
  }

  return { ok: true };
}
