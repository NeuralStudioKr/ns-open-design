// Canonical prompt sent by the "Continue the run" affordance on a resumable
// failed run. The daemon resumes the persisted CLI session for this
// (conversation, agent) and seeds only this turn (skipTranscript), so the agent
// continues from its committed work. Worded to be correct whether or not a
// committed boundary exists, and deliberately NOT a re-send of the original
// user turn — a resume must not duplicate the original request the way the
// from-scratch Retry path (retryOfAssistantId) does.
export const RESUME_CONTINUE_PROMPT =
  'The previous turn was interrupted by a transient failure. ' +
  'If your last response was cut off, continue it from where you left off ' +
  'and keep any work already completed; otherwise complete the original ' +
  'request. Inspect the current project files as needed before making ' +
  'further changes.';

/**
 * Stable sentinel prepended to the automatic-continue model prompt so the
 * chat UI can hide the message from the user. The model ignores HTML
 * comments in its instruction text; ChatPane matches on this prefix.
 */
export const AUTO_CONTINUE_PROMPT_SENTINEL = '<!--od:auto_continue_incomplete_output-->';

// Prompt used by the capped *automatic* continue that fires when a terminal
// run finished streaming but produced no usable HTML deliverable — typically a
// 40-byte `<!doctype html><html…><head>` shell that pre-write validation had
// to reject, or a turn that emitted planning prose without ever opening the
// artifact block.
//
// Scoped strictly to THIS conversation / THIS project. Earlier wording
// ("앞선 응답", "지금까지 결정된 방향") made demos look like the agent was
// continuing a different project's deck when a brand-new project hit the
// shell-then-stop failure on its first turn.
export const AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT =
  `${AUTO_CONTINUE_PROMPT_SENTINEL}\n` +
  '이 대화(현재 프로젝트)의 직전 모델 응답만 기준으로 하세요. ' +
  '다른 프로젝트·다른 대화의 슬라이드나 계획을 이어 쓰지 마세요. ' +
  '직전 응답이 완성된 HTML 슬라이드 덱을 남기지 못했습니다 (빈 뼈대만 있음). ' +
  '계획을 다시 설명하거나 사용자에게 재확인하지 말고, ' +
  '이 대화에 이미 있는 요청·목차만 사용해 완성된 HTML 슬라이드 덱을 즉시 출력하세요. ' +
  '출력 형식은 반드시 하나의 `<artifact type="text/html" identifier="...">...</artifact>` ' +
  '블록이며, 그 내부에 `<!doctype html>`부터 `</html>`까지 자체 완결형(self-contained) HTML이 들어가야 합니다. ' +
  '외부 파일 참조, 스켈레톤 복사, 추가 툴 호출 없이 이 한 번의 응답에서 덱을 완결지어야 합니다. ' +
  '이 대화에 슬라이드 목차가 없다면 임원 대상 12슬라이드 표준 구성으로 즉시 채워서 완성하세요. ' +
  '(English: Use ONLY this conversation in this project. Do not continue any other project. ' +
  'The previous turn in THIS chat produced no usable slide deck — emit one complete self-contained ' +
  'HTML deck inside a single `<artifact type="text/html">...</artifact>` block now, with no planning or tool calls.)';

/** True when a user-message body is the automatic-continue recovery prompt. */
export function isAutoContinueIncompleteOutputPrompt(content: string | null | undefined): boolean {
  const text = (content ?? '').trimStart();
  if (!text) return false;
  if (text.startsWith(AUTO_CONTINUE_PROMPT_SENTINEL)) return true;
  // Legacy bodies that already landed in persisted chats before the sentinel.
  if (text.startsWith('앞선 응답이 슬라이드 결과물을 만들지 못하고')) return true;
  if (text.startsWith('이 대화(현재 프로젝트)의 직전 모델 응답만')) return true;
  return false;
}

// Cap on automatic continue attempts inside a single conversation. Two retries
// is the sweet spot from demo observation: one retry salvages "cut off"
// runs; a second retry catches the "the model produced a plan-then-shell
// pattern twice" case that the stricter fallback prompt is specifically
// written for. A third attempt would exceed reasonable token spend for a
// genuinely broken turn where the model can't recover. Manual retry stays
// available beyond the cap via the existing failed-run "다시 시도" button.
export const AUTO_CONTINUE_MAX_PER_CONVERSATION = 2;

// Error status-event code used for the "결과물이 완성되지 않아 이어쓰기를
// 시도합니다" notice we drop into the assistant card just before the
// automatic continue fires. Kept as a named export so tests and the assistant
// message renderer can match against it without duplicating string literals.
export const AUTO_CONTINUE_STATUS_CODE = 'auto_continue_incomplete_output';

// Analytics entry-from used by run_created / run_finished when the automatic
// continue path is what kicked off a new run. Distinct from 'resume_continue'
// (manual button) so the demo dashboard can measure how often the automatic
// recovery fires and whether it actually salvages the deliverable.
export const AUTO_CONTINUE_ENTRY_FROM = 'auto_continue_incomplete_output';

export type AutoContinuePersistResultKind =
  | 'skipped-incomplete'
  | 'rejected'
  | 'save-failed'
  | 'persisted'
  | 'pointer'
  | 'skipped-duplicate'
  | 'auth-replay-queued'
  | null;

/**
 * Pure gate for the capped automatic continue. Kept outside ProjectView so
 * unit tests can pin the decision table without mounting the chat surface.
 *
 * Only content-incompleteness qualifies: a rejected shell, a validation
 * refusal, or a slide-only turn that finished with no HTML on disk. Infra
 * save failures (`save-failed`) must NOT auto-continue — regenerating the
 * same deliverable would just hit the same write path again.
 */
export function shouldAutoContinueForIncompleteOutput(options: {
  runIsVisible: boolean;
  autoContinueCount: number;
  maxPerConversation?: number;
  terminalPersistResultKind: AutoContinuePersistResultKind;
  hadIncompleteParsedArtifact: boolean;
  shouldFailMissingSlideHtml: boolean;
}): boolean {
  if (!options.runIsVisible) return false;
  const max = options.maxPerConversation ?? AUTO_CONTINUE_MAX_PER_CONVERSATION;
  if (options.autoContinueCount >= max) return false;

  const kind = options.terminalPersistResultKind;
  if (kind === 'skipped-incomplete' || kind === 'rejected') return true;
  if (kind !== null) return false;
  return options.hadIncompleteParsedArtifact || options.shouldFailMissingSlideHtml;
}

/** True when a live local AbortController (or another conversation's stream)
 * must block the automatic-continue fire. Same-conversation "streaming"
 * without abortRef is the BYOK background-recovery phantom and must NOT block. */
export function isLiveLocalStreamBlockingAutoContinue(options: {
  abortController: AbortController | null;
  streamingConversationId: string | null;
  targetConversationId: string;
}): boolean {
  if (options.abortController) return true;
  const streaming = options.streamingConversationId;
  if (!streaming) return false;
  return streaming !== options.targetConversationId;
}

/** Roll back one consumed auto-continue slot when the fire path aborts. */
export function rollbackAutoContinueCount(
  counts: Map<string, number>,
  conversationId: string,
): number {
  const next = Math.max(0, (counts.get(conversationId) ?? 1) - 1);
  counts.set(conversationId, next);
  return next;
}
