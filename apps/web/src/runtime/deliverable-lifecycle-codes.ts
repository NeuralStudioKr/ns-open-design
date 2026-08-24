/**
 * Leaf status-event codes for deliverable lifecycle notices.
 * Kept free of other runtime imports so chat-events / conversation-message-dedupe
 * cannot form a TDZ cycle with slide-deliverable-recovery.
 */
export const AUTO_CONTINUE_STATUS_CODE = "auto_continue_incomplete_output";
export const EMERGENCY_DECK_FALLBACK_STATUS_CODE = "emergency_deck_fallback";
export const OUTLINE_DECK_FALLBACK_STATUS_CODE = "outline_deck_fallback";
