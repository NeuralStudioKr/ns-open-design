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

const DECK_EDIT_CLAIM_RE =
  /(?:수정이\s*반영|수정을\s*반영|수정했|반영되었|반영했|\b(?:updated|edited|modified|applied)\b)/i;

const DECK_CREATE_CLAIM_KO_RE =
  /(?:초안이\s*생성|생성되었|생성했(?:어|습)?|만들(?:었(?:어|습)?|어\s*드렸)|작성했(?:어|습)?|완성했(?:어|습)?|준비했(?:어|습)?|완성했습니다|준비했습니다)/;

const DECK_CREATE_PROGRESS_KO_RE =
  /(?:초안을\s*작성\s*중|작성\s*중|생성\s*중|만들고\s*있|작성하고\s*있|생성하고\s*있)/;

const DECK_CREATE_PROGRESS_EN_RE =
  /\b(?:creating|building|generating|making)\b[\s\S]{0,40}\b(?:deck|slide|slides|presentation)\b|\bmaking your deck\b/i;

/**
 * Prose that claims a *new* deck was created (not an in-place edit).
 * Used to suppress misleading create copy on slide-edit turns.
 */
export function looksLikeDeckCreateCompletionProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Pure edit claims stay visible / are replaced by synthetic edit lead separately.
  // Mixed "created and updated" still counts as create mislabel on edit turns.
  if (DECK_EDIT_CLAIM_RE.test(trimmed) && !/\b(?:created|generated|built)\b|생성|초안이\s*생성|만들(?:었|어)/i.test(trimmed)) {
    return false;
  }
  if (
    /슬라이드\s*초안이\s*생성되었/.test(trimmed)
    || /The slide deck draft is ready\.?/i.test(trimmed)
    || /Creating the slide deck now/i.test(trimmed)
    || /\bhere is your deck\b/i.test(trimmed)
    || /\bhere(?:'s| is) the deck\b/i.test(trimmed)
  ) {
    return true;
  }
  if (!looksLikeDeckIntentProse(trimmed) && !/\bdraft\b|초안|덱|presentation/i.test(trimmed)) {
    return false;
  }
  return (
    DECK_CREATE_CLAIM_KO_RE.test(trimmed)
    || /\b(?:created|generated|built|finished)\b/i.test(trimmed)
    || /\bdraft\b[\s\S]{0,40}\bready\b/i.test(trimmed)
    || /\b(?:slides?|deck|presentation)\b[\s\S]{0,20}\bready\b/i.test(trimmed)
  );
}

/**
 * Short UI-locale status lines the model is prompted to emit before an artifact
 * (e.g. bare "작성 중"). These must count as create-progress even without deck
 * keywords — otherwise they stick after the run completes and block the
 * synthetic "draft ready" lead.
 */
const DECK_CREATE_PROGRESS_STATUS_ONLY_RE =
  /^(?:작성\s*중\.?|생성\s*중\.?|만들고\s*있(?:습니다)?\.?|작성하고\s*있(?:습니다)?\.?|생성하고\s*있(?:습니다)?\.?|Writing\.?|Creating\.{0,3}|Building\.{0,3}|Generating\.{0,3})$/i;

/** Edit-turn status lines from the same prompt contract ("수정 반영 중"). */
const DECK_EDIT_PROGRESS_STATUS_ONLY_RE =
  /^(?:수정\s*반영\s*중\.?|반영\s*중\.?|Applying your edits\.?|Applying\.{0,3})$/i;

/** In-flight create-toned status ("작성 중", "making your deck") on an edit turn. */
export function looksLikeDeckCreateProgressProse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (DECK_EDIT_CLAIM_RE.test(trimmed)) return false;
  if (DECK_CREATE_PROGRESS_STATUS_ONLY_RE.test(trimmed)) return true;
  if (
    /슬라이드\s*초안(?:을)?\s*작성\s*중/.test(trimmed)
    || /Creating the slide deck now/i.test(trimmed)
    || /\bmaking your deck\b/i.test(trimmed)
  ) {
    return true;
  }
  if (!looksLikeDeckIntentProse(trimmed) && !/초안|draft/i.test(trimmed)) {
    return DECK_CREATE_PROGRESS_KO_RE.test(trimmed) && /슬라이드|덱|발표/.test(trimmed);
  }
  return DECK_CREATE_PROGRESS_KO_RE.test(trimmed) || DECK_CREATE_PROGRESS_EN_RE.test(trimmed);
}

/**
 * Narrow leftover in-flight status that must not survive a settled Teamver
 * slide turn. Intentionally tighter than `looksLikeDeckCreateProgressProse`:
 * long explanatory prose that merely uses progressive tense stays visible.
 */
export function looksLikeDeckInFlightStatusResidue(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (DECK_CREATE_PROGRESS_STATUS_ONLY_RE.test(trimmed)) return true;
  if (DECK_EDIT_PROGRESS_STATUS_ONLY_RE.test(trimmed)) return true;
  // Synthetic live-lead copy (ko/en) left in message.content after stream end.
  if (
    /^슬라이드\s*초안(?:을)?\s*작성\s*중/.test(trimmed)
    || /^슬라이드\s*수정을\s*반영하고\s*있/.test(trimmed)
    || /^Creating the slide deck now/i.test(trimmed)
    || /^Applying slide updates/i.test(trimmed)
    || /^making your deck\b/i.test(trimmed)
    || /^Applying your edits\b/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/**
 * Drop per-line in-flight status residue (bare "작성 중", live-lead copy) while
 * keeping explanatory lines. Empty result ⇒ whole segment should be hidden.
 */
export function stripDeckInFlightStatusResidue(text: string): string {
  const kept = text.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !looksLikeDeckInFlightStatusResidue(trimmed);
  });
  return kept.join("\n").replace(/^\n+|\n+$/g, "").trim();
}

/**
 * After the run settles, hide leftover in-flight status residue so the
 * Teamver completed-artifact lead (or real completion copy) can take over.
 * Does not hide long progressive-tense explanations.
 */
export function shouldHideDeckCreateProgressProseWhenSettled(options: {
  text: string;
  streaming: boolean;
  teamverSlideUi: boolean;
}): boolean {
  if (!options.teamverSlideUi || options.streaming) return false;
  return stripDeckInFlightStatusResidue(options.text).length === 0
    && options.text.trim().length > 0;
}

/**
 * On edit turns (existing deck baseline / deck-patch), hide model or leftover
 * "draft created" / "creating deck" prose so the UI can show edit lead copy.
 */
export function shouldHideDeckCreateCompletionProseOnEditTurn(options: {
  text: string;
  isSlideEditTurn: boolean;
  teamverSlideUi: boolean;
}): boolean {
  if (!options.teamverSlideUi || !options.isSlideEditTurn) return false;
  return (
    looksLikeDeckCreateCompletionProse(options.text)
    || looksLikeDeckCreateProgressProse(options.text)
  );
}
