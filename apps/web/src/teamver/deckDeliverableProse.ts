const DECK_INTENT_RE =
  /\b(deck|slide|slides|presentation|ppt|keynote|html)\b|(?:슬라이드|발표\s*자료|프레젠테이션|피피티|덱)|\d+\s*슬라이드/i;

function looksLikeDeckCompletionClaimEn(text: string): boolean {
  return (
    /\b(?:created|generated|built|updated|edited|modified|completed|finished|done|wrote|saved)\b/i.test(text)
    || /\b(?:here it is|here's the deck|here is the deck|here is your deck)\b/i.test(text)
    || /\bready(?:\s+for|\s+to|\s*$|[.!])/i.test(text)
  );
}

const DECK_COMPLETION_CLAIM_KO_RE =
  /(?:완료했|완성했|마쳤|만들었(?:어|습)?|작성했(?:어|습)?|생성했(?:어|습)?|수정했(?:어|습)?|반영했(?:어|습)?|준비했(?:어|습)?|올렸(?:어|습)?|넣었(?:어|습)?|만들어\s*드렸)/;

/** Future-tense deck work — used by terminal slide-only gates, not in-flight UI hiding. */
const DECK_FUTURE_PROMISE_EN_RE =
  /\b(?:will create|will build|will generate|will write|I'll create|I'll build|I will create|I will build)\b/i;

const DECK_FUTURE_PROMISE_KO_RE =
  /(?:바로\s*)?(?:만들어\s*(?:드리|볼)|만들겠|작성하겠|생성하겠|수정하겠|반영하겠|제작하(?:겠| 할)|결정하겠|시작할게|진행하겠)/;

export function looksLikeDeckIntentProse(text: string): boolean {
  return DECK_INTENT_RE.test(text.trim());
}

function looksLikeDeckCompletionClaimProse(text: string): boolean {
  return looksLikeDeckCompletionClaimEn(text) || DECK_COMPLETION_CLAIM_KO_RE.test(text);
}

function looksLikeDeckFuturePromiseProse(text: string): boolean {
  return DECK_FUTURE_PROMISE_EN_RE.test(text) || DECK_FUTURE_PROMISE_KO_RE.test(text);
}

/**
 * True when prose claims the deck is already done while a live artifact is still
 * streaming. Only used for in-flight UI — never hide persisted/history prose.
 */
export function looksLikePrematureDeckCompletionProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!looksLikeDeckIntentProse(trimmed)) return false;
  return looksLikeDeckCompletionClaimProse(trimmed);
}

/** Plan/completion deck prose with no HTML on disk — slide-only terminal run gate. */
export function looksLikeDeckDeliverablePromiseProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return looksLikeDeckCompletionClaimProse(trimmed) || looksLikeDeckFuturePromiseProse(trimmed);
}

/** In-flight UI: hide premature completion lines only while a deck artifact is still open. */
export function shouldHidePrematureDeckCompletionProse(options: {
  text: string;
  streaming: boolean;
  liveArtifactOpen: boolean;
  teamverSlideUi: boolean;
}): boolean {
  if (!options.teamverSlideUi || !options.streaming || !options.liveArtifactOpen) return false;
  return looksLikePrematureDeckCompletionProse(options.text);
}
