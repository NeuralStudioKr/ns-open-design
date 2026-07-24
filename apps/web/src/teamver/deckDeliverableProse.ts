const DECK_INTENT_RE =
  /\b(deck|slide|slides|presentation|ppt|keynote|html)\b|(?:슬라이드|발표\s*자료|프레젠테이션|피피티|덱)|\d+\s*슬라이드/i;

const DECK_COMPLETION_CLAIM_EN_RE =
  /(?:created|generated|built|updated|edited|modified|completed|finished|done|wrote|saved|ready|here it is|here's|here is)/i;

const DECK_COMPLETION_CLAIM_KO_RE =
  /(?:완료했|완성했|마쳤|만들었|작성했|생성했|수정했|반영했|준비했|올렸|넣었|드렸|했습니다|되었습니다)/;

const DECK_PROMISE_OR_COMPLETION_EN_RE =
  /(?:created|generated|built|updated|edited|modified|completed|finished|done|wrote|saved|ready|here it is|will create|will build|I'll|I will)/i;

const DECK_PROMISE_OR_COMPLETION_KO_RE =
  /(?:바로\s*)?(?:만들어|만들겠|작성하겠|생성하겠|수정하겠|반영하겠|제작하|결정하겠|확정|채우|출력|완료|완성|마쳤|만들었|작성했|생성했|수정했|반영했|준비했|시작할게|진행하겠|올렸|넣었|드렸)/;

export function looksLikeDeckIntentProse(text: string): boolean {
  return DECK_INTENT_RE.test(text.trim());
}

function looksLikeDeckCompletionClaimProse(text: string): boolean {
  return DECK_COMPLETION_CLAIM_EN_RE.test(text) || DECK_COMPLETION_CLAIM_KO_RE.test(text);
}

/** True when prose claims the deck is already done while artifact streaming may still be open. */
export function looksLikePrematureDeckCompletionProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!looksLikeDeckIntentProse(trimmed)) return false;
  return looksLikeDeckCompletionClaimProse(trimmed);
}

export function looksLikeDeckDeliverablePromiseProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return DECK_PROMISE_OR_COMPLETION_EN_RE.test(trimmed)
    || DECK_PROMISE_OR_COMPLETION_KO_RE.test(trimmed);
}
