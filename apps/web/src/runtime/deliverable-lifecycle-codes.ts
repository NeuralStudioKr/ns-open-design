/**
 * Leaf status-event codes for deliverable lifecycle notices.
 * Kept free of other runtime imports so chat-events / conversation-message-dedupe
 * cannot form a TDZ cycle with slide-deliverable-recovery.
 */
export const AUTO_CONTINUE_STATUS_CODE = "auto_continue_incomplete_output";
export const EMERGENCY_DECK_FALLBACK_STATUS_CODE = "emergency_deck_fallback";
export const OUTLINE_DECK_FALLBACK_STATUS_CODE = "outline_deck_fallback";
/**
 * 루프362 — Clone 첫 채우기 턴에서 모델 산출이 저품질(low-substance / catalog leftover /
 * incomplete-html-shell)로 persist 거부됐을 때, 이미 디스크에 있는 LOOK seed를 열고 run을
 * succeeded로 마감했다는 신호. `EMERGENCY_DECK_FALLBACK_STATUS_CODE`와 별도 코드로 남겨
 * ops에서 seed 복구 빈도를 개별 측정할 수 있게 한다.
 */
export const CLONE_LOOK_SEED_FALLBACK_STATUS_CODE = "clone_look_seed_fallback";
