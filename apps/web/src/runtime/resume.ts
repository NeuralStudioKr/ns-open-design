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

// Prompt used by the capped *automatic* continue that fires when a terminal
// run finished streaming but produced no usable HTML deliverable — typically a
// 40-byte `<!doctype html><html…><head>` shell that pre-write validation had
// to reject, or a turn that emitted planning prose without ever opening the
// artifact block. In both cases the model already spent minutes producing
// tokens and the user is staring at an empty preview panel; a from-scratch
// retry would waste those tokens and duplicate the plan, so we instead nudge
// the same agent to finish the deliverable it started. Distinct from the
// manual RESUME_CONTINUE_PROMPT so telemetry can separate the two flows.
//
// Deliberately DIRECTIVE (not "continue from where you left off") because the
// observed failure mode is not truncation — it is the model overspending its
// budget on planning / skeleton-copying tool calls and then emitting an empty
// scaffold as the deliverable. A "continue" instruction on that state just
// prints another plan; the fix is to force the model into a single
// self-contained artifact write with an explicit budget of ONE artifact block
// and no tool calls before that write.
export const AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT =
  '앞선 응답이 슬라이드 결과물을 만들지 못하고 종료되었습니다 (아티팩트가 비어 있거나 뼈대만 있음). ' +
  '이번 턴에서는 계획을 다시 설명하거나 사용자에게 재확인하지 말고, ' +
  '지금까지 결정된 방향과 슬라이드 목차를 그대로 사용해서 완성된 HTML 슬라이드 덱을 즉시 출력하세요. ' +
  '출력 형식은 반드시 하나의 `<artifact type="text/html" identifier="...">...</artifact>` ' +
  '블록이며, 그 내부에 `<!doctype html>`부터 `</html>`까지 자체 완결형(self-contained) HTML이 들어가야 합니다. ' +
  '외부 파일 참조, 스켈레톤 복사, 추가 툴 호출 없이 이 한 번의 응답에서 덱을 완결지어야 합니다. ' +
  '만약 문맥에 슬라이드 목차가 없다면 임원 대상 12슬라이드 표준 구성으로 즉시 채워서 완성하세요. ' +
  '(English fallback: The previous turn produced no usable slide deck — emit a single, complete, ' +
  'self-contained HTML deck inside one `<artifact type="text/html">...</artifact>` block right now, ' +
  'with no further planning or tool calls.)';

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
