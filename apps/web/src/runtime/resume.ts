import type { ChatMessage } from '../types';
import { salvageTruncatedHtmlDocument } from '../artifacts/recover';
import { isIncompleteHtmlDocumentShell } from '../artifacts/validate';
import { COMPACT_DECK_SLIDE_COUNT_GUIDANCE } from './deckGuidance';

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
  '이 대화에 이미 있는 요청·목차·Plugin inputs·quick-brief 답변만 사용해 완성된 HTML 슬라이드 덱을 즉시 출력하세요. ' +
  '출력 형식은 반드시 하나의 `<artifact type="deck" identifier="...">...</artifact>` ' +
  '블록이며, 그 내부에 `<!doctype html>`부터 `</html>`까지 자체 완결형(self-contained) HTML이 들어가야 합니다. ' +
  '외부 파일 참조, 프레임워크 스켈레톤 복사, SLOT 주석, 추가 툴 호출 없이 이 한 번의 응답에서 덱을 완결지어야 합니다. ' +
  `길게 만들다가 끊기지 않도록 간결한 HTML 덱으로 작성하세요. (${COMPACT_DECK_SLIDE_COUNT_GUIDANCE}) ` +
  '각 슬라이드는 제목과 2~4개의 실제 문장/불릿을 가져야 하며 빈 `<head>`나 빈 `<body>`로 끝내면 안 됩니다. ' +
  `이 대화에 슬라이드 분량이 없다면 ${COMPACT_DECK_SLIDE_COUNT_GUIDANCE.toLowerCase()} ` +
  '분량 미지정 시 임원 대상 6~8슬라이드 표준 구성으로 즉시 채워서 완성하세요. ' +
  '(English: Use ONLY this conversation in this project. Do not continue any other project. ' +
  'The previous turn in THIS chat produced no usable slide deck — emit one complete self-contained ' +
  `deck inside a single \`<artifact type="deck">...</artifact>\` block now (${COMPACT_DECK_SLIDE_COUNT_GUIDANCE}), ` +
  'with no planning, no framework skeleton, no SLOT comments, and no tool calls. Never use `type="text/html"`.)';

/** True when a user-message body is the automatic-continue recovery prompt. */
export function isAutoContinueIncompleteOutputPrompt(content: string | null | undefined): boolean {
  const text = (content ?? '').trimStart();
  if (!text) return false;
  if (text.startsWith(AUTO_CONTINUE_PROMPT_SENTINEL)) return true;
  // Legacy bodies that already landed in persisted chats before the sentinel.
  if (text.startsWith('앞선 응답이 슬라이드 결과물을 만들지 못하고')) return true;
  if (text.startsWith('이 대화(현재 프로젝트)의 직전 모델 응답만')) return true;
  if (text.startsWith('[FINAL RETRY]')) return true;
  return false;
}

const AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT_ESCALATED =
  `${AUTO_CONTINUE_PROMPT_SENTINEL}\n` +
  '[FINAL RETRY] 이 대화(현재 프로젝트)의 이전 자동 이어쓰기도 사용 가능한 슬라이드 덱을 만들지 못했습니다. ' +
  '다른 프로젝트·다른 대화의 슬라이드를 이어 쓰지 마세요. ' +
  '이번 응답은 반드시 `<artifact type="deck" identifier="...">`로 시작해서 `</artifact>`로 끝나야 합니다. `type="text/html"`은 금지입니다. ' +
  '인사, 사과, 계획, 목차 나열, "만들겠습니다" 약속, question-form은 금지입니다. ' +
  '응답 전체가 하나의 완전한 `<!doctype html>…</html>` 덱이어야 합니다. ' +
  // Token-budget escape hatch: previous full-scope attempts likely died at
  // max_tokens mid-artifact. Cut inline styles/scripts and slide count to
  // fit inside the output budget so at least a minimal previewable deck
  // lands. Deleting the framework <script> is acceptable here since the
  // deliverable-missing failure is worse than a static (non-navigable) deck.
  '실제 슬라이드는 6장 이상이면 되고, ' +
  '각 슬라이드에는 SLOT 주석이 아니라 실제 텍스트 콘텐츠(제목·본문·목록)가 반드시 들어가야 합니다. ' +
  '이 대화의 Plugin inputs·quick-brief 답변·선택 템플릿 맥락을 유지하고, 새 질문으로 되돌아가지 마세요. ' +
  '인라인 CSS는 최소한만 쓰고, 필요하면 프레임워크 스크립트를 생략해도 좋습니다 — 빈 덱보다 스크롤로 넘기는 정적 덱이 낫습니다. ' +
  '`<!-- SLOT: ... -->` 형태의 주석 자리표시자를 그대로 남기는 것은 금지입니다. ' +
  '(English: Output ONE complete HTML deck artifact — no prose. ' +
  'At least 6 slides, real text in every <section class="slide"> (never the SLOT comment). ' +
  'Minimize inline CSS; skip the framework <script> if needed — a static deck beats an empty artifact.)';

const AUTO_CONTINUE_MAX_PARTIAL_HTML_EXCERPT = 4000;
const AUTO_CONTINUE_MAX_PLAN_OUTLINE_EXCERPT = 2000;

export type AutoContinuePromptContext = {
  /** 1-based attempt index for this automatic continue fire. */
  attempt: number;
  partialHtml?: string | null;
  planOutline?: string | null;
  referenceFiles?: readonly string[];
  /** Parsed from prior user turns — e.g. "정확히 10장의 슬라이드를 출력하세요." */
  slideCountHint?: string | null;
  /** Set when the prior turn ended with stop_reason=max_tokens. */
  truncatedByMaxTokens?: boolean;
  /** Saved slide deck on disk from an earlier successful turn in this project. */
  existingDeckPath?: string | null;
};

// Cap on automatic continue attempts inside a single conversation.
//
// Five retries covers plan-only → partial shell → truncated head → shortened
// head → almost-complete-but-cut patterns observed on Teamver embed API runs.
// Earlier cap was three, but Canvas → Slide launches consistently landed on
// `incomplete_output` after the model produced a truncated deck the first
// pass and the retry budget ran out before salvage / stream-close converged.
// The exposure surface is bounded: cap is per-conversation, escalated
// wording after attempt 2 short-circuits obvious shell-only regressions,
// and the manual retry affordance remains beyond the cap.
export const AUTO_CONTINUE_MAX_PER_CONVERSATION = 5;

/** Scoped preview-comment edits salvage client-side first — three auto retries max. */
export const AUTO_CONTINUE_MAX_SCOPED_COMMENT_EDIT = 3;

/** Visual-mark scoped edits (no DOM target id) get one extra retry. */
export const AUTO_CONTINUE_MAX_SCOPED_VISUAL_MARK_EDIT = 4;

export function resolveAutoContinueMaxAttempts(options: {
  scopedCommentAttachmentCount: number;
  visualMarkOnly?: boolean;
}): number {
  if (options.scopedCommentAttachmentCount > 0) {
    return options.visualMarkOnly
      ? AUTO_CONTINUE_MAX_SCOPED_VISUAL_MARK_EDIT
      : AUTO_CONTINUE_MAX_SCOPED_COMMENT_EDIT;
  }
  return AUTO_CONTINUE_MAX_PER_CONVERSATION;
}

/** Build the user prompt for a capped automatic incomplete-output continue. */
export function buildAutoContinueIncompleteOutputPrompt(
  context: AutoContinuePromptContext = { attempt: 1 },
): string {
  const attempt = Math.max(1, Math.floor(context.attempt));
  const parts: string[] = [];

  if (context.truncatedByMaxTokens) {
    parts.push(
      'The previous response hit the output token limit while the HTML artifact was still streaming. ' +
        'Continue from the partial HTML below and finish ONE complete `<artifact type="deck">...</artifact>` deck in this turn. Never use `type="text/html"`. ' +
        'Do not restart with a new empty `<head>` shell.\n',
    );
  }

  const partialShellOnly = Boolean(
    context.partialHtml?.trim()
    && isIncompleteHtmlDocumentShell(context.partialHtml),
  );
  // Head-only shells burn auto-continue slots without progress — escalate
  // immediately instead of waiting for attempt 2.
  parts.push(
    attempt >= 2 || partialShellOnly
      ? AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT_ESCALATED
      : AUTO_CONTINUE_INCOMPLETE_OUTPUT_PROMPT,
  );

  const outline = context.planOutline?.trim();
  if (outline) {
    parts.push(
      '\n\n[이 대화의 직전 응답 슬라이드 목차/방향 — 그대로 사용하고 다시 설명하지 마세요:]\n'
        + outline.slice(0, AUTO_CONTINUE_MAX_PLAN_OUTLINE_EXCERPT),
    );
  }

  const referenceFiles = Array.from(
    new Set((context.referenceFiles ?? []).map((path) => path.trim()).filter(Boolean)),
  ).slice(0, 12);
  if (referenceFiles.length > 0) {
    parts.push(
      '\n\n[이 대화에서 첨부된 참고 파일 — 필요하면 읽고 반영하되, 최종 산출물로 취급하지 마세요:]\n'
        + referenceFiles.map((path) => `- ${path}`).join('\n'),
    );
  }

  const slideCountHint = context.slideCountHint?.trim();
  if (slideCountHint) {
    parts.push(
      '\n\n[이 대화의 슬라이드 분량 — 반드시 준수:]\n'
        + slideCountHint,
    );
  }

  const existingDeckPath = context.existingDeckPath?.trim();
  if (existingDeckPath) {
    parts.push(
      `\n\n[이 프로젝트에 이미 저장된 슬라이드 덱: \`${existingDeckPath}\`. `
        + '직전 turn이 incomplete_output이어도 "완성된 덱이 없다"고 말하지 마세요. '
        + '디스크의 덱을 기준으로 이어서 완성하거나 필요한 슬라이드만 deck-patch로 수정하세요. '
        + '첨부 이미지를 넣는 요청이면 전체 덱을 2~3장으로 새로 만들지 말고, '
        + '대상 슬라이드 HTML을 복사한 뒤 `<img src="정확한경로">`만 삽입하는 deck-patch를 쓰세요. '
        + '슬라이드 장수를 줄이는 것은 금지입니다.]',
    );
  }

  let partial = context.partialHtml?.trim();
  if (partial && isIncompleteHtmlDocumentShell(partial)) {
    // Truncated decks with real slide copy are still worth fencing so the
    // model can continue from the cut. Empty / SLOT-only shells must not be
    // re-fed — that anchors the next turn to the same blank deliverable.
    const salvaged = salvageTruncatedHtmlDocument(partial);
    if (salvaged) {
      parts.push(
        '\n\n[이 대화에서 시작했지만 미완성인 HTML — 이어서 완성하거나 버리고 새 완전 덱을 한 번에 출력:]\n'
          + '```html\n'
          + partial.slice(0, AUTO_CONTINUE_MAX_PARTIAL_HTML_EXCERPT)
          + '\n```',
      );
    } else {
      parts.push(
        '\n\n[이전 HTML은 빈 document shell / 미완성 덱에 불과합니다 — 이어 쓰지 말고 버리세요:]\n'
          + partial.slice(0, 160)
          + '\n\n위 shell을 복사하지 말고, 새 complete HTML deck artifact를 즉시 작성하세요. ('
          + COMPACT_DECK_SLIDE_COUNT_GUIDANCE
          + ')',
      );
    }
  } else if (partial && partial.length >= 128) {
    parts.push(
      '\n\n[이 대화에서 시작했지만 미완성인 HTML — 이어서 완성하거나 버리고 새 완전 덱을 한 번에 출력:]\n'
        + '```html\n'
        + partial.slice(0, AUTO_CONTINUE_MAX_PARTIAL_HTML_EXCERPT)
        + '\n```',
    );
  } else if (partial) {
    parts.push(
      '\n\n[이전 HTML은 빈 document shell에 불과합니다 — 이어 쓰지 말고 버리세요:]\n'
        + partial.slice(0, 160)
        + '\n\n위 shell을 복사하지 말고, 새 complete HTML deck artifact를 즉시 작성하세요. ('
        + COMPACT_DECK_SLIDE_COUNT_GUIDANCE
        + ')',
    );
  }

  // Always keep the hide-sentinel as the first non-whitespace bytes so ChatPane
  // can suppress every attempt (including escalated + excerpt appends).
  const joined = parts.join('');
  if (joined.trimStart().startsWith(AUTO_CONTINUE_PROMPT_SENTINEL)) return joined;
  return `${AUTO_CONTINUE_PROMPT_SENTINEL}\n${joined}`;
}

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
  | 'skipped-discovery-turn'
  | 'scope-rejected'
  | 'artifact-regression'
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
  scopedCommentAttachmentCount?: number;
  terminalPersistResultKind: AutoContinuePersistResultKind;
  terminalPersistResultCode?: string | null;
  terminalPersistResultReason?: string | null;
  hadIncompleteParsedArtifact: boolean;
  shouldFailMissingSlideHtml: boolean;
  shouldRouteScopedCommentEditToAutoContinue?: (
    code: string | null | undefined,
    reason: string,
  ) => boolean;
}): boolean {
  if (!options.runIsVisible) return false;
  const max = options.maxPerConversation
    ?? (options.scopedCommentAttachmentCount && options.scopedCommentAttachmentCount > 0
      ? AUTO_CONTINUE_MAX_SCOPED_COMMENT_EDIT
      : AUTO_CONTINUE_MAX_PER_CONVERSATION);
  if (options.autoContinueCount >= max) return false;

  const kind = options.terminalPersistResultKind;
  if (kind === 'skipped-incomplete') return true;
  // Validation refusal / residual discovery-skip with incomplete or missing
  // slide signals — content never landed; let the capped continue retry.
  // Infra `save-failed` still must not regenerate the same write path.
  if (
    (kind === 'rejected' || kind === 'skipped-discovery-turn')
    && (options.hadIncompleteParsedArtifact || options.shouldFailMissingSlideHtml)
  ) {
    return true;
  }
  if (
    kind === 'skipped-duplicate'
    && (options.scopedCommentAttachmentCount ?? 0) > 0
  ) {
    return true;
  }
  if (
    kind === 'scope-rejected'
    && (options.scopedCommentAttachmentCount ?? 0) > 0
    && options.shouldRouteScopedCommentEditToAutoContinue?.(
      options.terminalPersistResultCode,
      options.terminalPersistResultReason ?? '',
    )
  ) {
    return true;
  }
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

const ARTIFACT_BODY_RE = /<artifact\b[^>]*>([\s\S]*?)<\/artifact>/gi;
const DOCTYPE_SNIPPET_RE = /<!doctype\s+html[\s\S]*/i;

/** Recover partial HTML / plan outline from a failed assistant row for auto-continue. */
export function extractAutoContinueContextFromAssistant(
  message: Pick<ChatMessage, 'content' | 'events'>,
  overrides?: { partialHtml?: string | null; planOutline?: string | null },
): Pick<AutoContinuePromptContext, 'partialHtml' | 'planOutline'> {
  let partialHtml = overrides?.partialHtml?.trim() || null;
  let planOutline = overrides?.planOutline?.trim() || null;

  const textParts: string[] = [];
  if (message.content?.trim()) textParts.push(message.content);
  for (const event of message.events ?? []) {
    if ((event.kind === 'text' || event.kind === 'thinking') && typeof event.text === 'string') {
      textParts.push(event.text);
    }
  }
  const combined = textParts.join('\n');

  if (!partialHtml && combined) {
    for (const match of combined.matchAll(ARTIFACT_BODY_RE)) {
      const body = match[1]?.trim();
      if (body && /<!doctype\s+html|<html\b/i.test(body)) {
        partialHtml = body;
        break;
      }
    }
    if (!partialHtml) {
      const openIdx = combined.search(/<artifact\b[^>]*>/i);
      if (openIdx >= 0) {
        const tail = combined.slice(openIdx).replace(/<artifact\b[^>]*>/i, '').trim();
        if (/<!doctype\s+html|<html\b/i.test(tail)) partialHtml = tail;
      }
    }
    if (!partialHtml) {
      const docMatch = combined.match(DOCTYPE_SNIPPET_RE);
      if (docMatch?.[0]) partialHtml = docMatch[0].trim();
    }
  }

  if (!planOutline && combined.trim()) {
    const stripped = combined
      .replace(ARTIFACT_BODY_RE, '')
      .replace(/<artifact\b[\s\S]*$/i, '')
      .trim();
    if (stripped.length > 0) planOutline = stripped;
  }

  return { partialHtml, planOutline };
}

export type ScopedCommentEditAutoContinueContext = {
  attempt: number;
  failureReason?: string | null;
  commentContext?: string | null;
  userInstruction?: string | null;
  concretePatchTemplate?: string | null;
  /** Screenshot/draw placement-only marks (heart icon, etc.) — deck-patch graft, not element-patch. */
  visualMarkOnly?: boolean;
  /** Box tool or typed overlay note — edit real slide content, never decorative overlays. */
  visualAnnotationEdit?: boolean;
};

function appendScopedCommentEditRetryContext(
  parts: string[],
  context: ScopedCommentEditAutoContinueContext,
): void {
  const failureReason = context.failureReason?.trim();
  if (failureReason) {
    parts.push('', `[직전 실패 사유: ${failureReason}]`);
  }
  const userInstruction = context.userInstruction?.trim();
  if (userInstruction) {
    parts.push(
      '',
      '[원래 사용자 편집 요청 — 반드시 이 요청을 아래 댓글 대상에만 적용하세요:]',
      userInstruction,
    );
  }
  const commentContext = context.commentContext?.trim();
  if (commentContext) {
    parts.push(
      '',
      '[반드시 사용할 댓글 대상 정보 — 아래 slideIndex / elementId / selector / currentText 만 수정 대상입니다:]',
      commentContext,
    );
  }
  const concreteTemplate = context.concretePatchTemplate?.trim();
  if (concreteTemplate) {
    parts.push(
      '',
      context.attempt >= 2
        ? '[필수] 아래 템플릿을 **그대로 복사**해서 출력하세요. 주석 자리만 사용자 요청에 맞게 채우고, 다른 설명·인사·question-form은 금지합니다:'
        : '[권장] 아래 템플릿의 slide-index 를 그대로 쓰고 슬라이드 section 본문만 사용자 요청에 맞게 채우세요:',
      concreteTemplate,
    );
  }
}

function buildAutoContinueVisualMarkEditPrompt(
  context: ScopedCommentEditAutoContinueContext,
): string {
  const attempt = Math.max(1, Math.floor(context.attempt));
  const parts: string[] = [
    AUTO_CONTINUE_PROMPT_SENTINEL,
    attempt >= 2 ? '[FINAL RETRY] ' : '',
    '직전 응답은 **시각 마크(드로잉/스크린샷)가 붙은 슬라이드 영역 편집** turn이었지만, 유효한 deck-patch deliverable을 만들지 못했습니다.',
    '전체 덱을 새로 쓰거나 `<artifact type="deck">` 전체 교체를 하지 마세요. 디스크의 기존 deck.html은 그대로 두고, 표시된 슬라이드 section만 수정하세요.',
    '',
    '이번 응답은 반드시 non-empty `<artifact type="deck-patch" identifier="deck">` 하나만 출력하세요:',
    '',
    '<artifact type="deck-patch" identifier="deck">',
    '  <section class="slide" data-slide-index="{slideIndex from attached-preview-comments}">',
    '    <!-- 해당 슬라이드 전체 HTML. 첨부 스크린샷/드로잉 표시를 참고해 하트·도형은 inline SVG 등으로 추가 -->',
    '  </section>',
    '</artifact>',
    '',
    '- `data-slide-index`는 `<attached-preview-comments>`의 slideIndex와 정확히 일치해야 합니다.',
    '- `position:` / `placement:` 좌표(슬라이드 캔버스 1920×1080 픽셀)에 맞춰 새 아이콘/도형 wrapper를 `position:absolute`로 배치하세요. 슬라이드 기존 본문은 유지하고 marked box 안에만 추가/수정하세요.',
    '- target-id 기반 패치 사용 금지 (시각 마크에는 DOM element id가 없습니다).',
    '- 빈 `<artifact type="deck-patch">` 또는 slide section 없는 wrapper는 금지.',
    '',
    '(English: visual-mark scoped edit — emit ONE non-empty deck-patch with a single slide section; use the screenshot annotation for placement.)',
  ];
  appendScopedCommentEditRetryContext(parts, context);
  if (attempt >= 3) {
    parts.push(
      '',
      '[최종 시도] 위 템플릿을 그대로 출력하지 못하면 `<artifact type="deck-patch" identifier="deck">` 안에 해당 slide `<section class="slide" data-slide-index="{N}">` 하나만 넣으세요. 전체 deck rewrite 금지.',
    );
  }
  return parts.join('\n');
}

function buildAutoContinueVisualAnnotationEditPrompt(
  context: ScopedCommentEditAutoContinueContext,
): string {
  const attempt = Math.max(1, Math.floor(context.attempt));
  const parts: string[] = [
    AUTO_CONTINUE_PROMPT_SENTINEL,
    attempt >= 2 ? '[FINAL RETRY] ' : '',
    '직전 응답은 **박스/메모 시각 주석이 붙은 영역 편집** turn이었지만, 유효한 patch deliverable을 만들지 못했습니다.',
    '장식용 overlay (`od-visual-mark-target`, 하트 SVG wrapper 등)를 추가하지 마세요. 디스크 deck.html의 실제 텍스트/스타일만 수정하세요.',
    '전체 덱을 새로 쓰거나 `<artifact type="deck">` 전체 교체를 하지 마세요.',
    '',
    '이번 응답은 반드시 non-empty `<artifact type="element-patch" identifier="deck">` 하나만 출력하세요:',
    '',
    '<artifact type="element-patch" identifier="deck">',
    '  <patch target-id="{real data-od-id from deck HTML}" slide-index="{slideIndex from attached-preview-comments}" kind="set-style">{"fontSize":"32px"}</patch>',
    '</artifact>',
    '',
    '- `<attached-preview-comments>`의 `visual-mark-*` / synthetic id는 deck DOM에 없습니다 — 디스크 HTML에서 boxed `pagePosition` 영역과 겹치는 실제 `data-od-id`를 찾아 `target-id`에 넣으세요.',
    '- `slide-index`는 주석의 slideIndex와 정확히 일치해야 합니다.',
    '- 크기/색/강조 ("크게", "키워", font size): `kind="set-style"` JSON (`fontSize`, `fontWeight`, `color`). `currentText`는 그대로.',
    '- 문구 교체: `kind="set-text"`에 새 문구만.',
    '- 장식 overlay div 추가 금지 — 사용자가 명시적으로 도형/아이콘을 요청한 경우에만 예외.',
    '- 빈 `<artifact type="element-patch">` 또는 patch 없는 wrapper는 금지.',
    '',
    '(English: visual annotation edit retry — resolve real element ids from the boxed region; emit element-patch style/text edits, not decorative overlays.)',
  ];
  appendScopedCommentEditRetryContext(parts, context);
  if (attempt >= 3) {
    parts.push(
      '',
      '[최종 시도] boxed 영역의 텍스트를 찾지 못하면 `<artifact type="deck-patch" identifier="deck">`에 해당 slide `<section>` 전체 HTML을 복사한 뒤 그 영역의 `font-size`/`style`만 조정하세요. overlay div 추가 금지.',
    );
  }
  return parts.join('\n');
}

/**
 * Auto-continue prompt for scoped preview-comment edits. Unlike the
 * generic incomplete-output prompt (which demands a full
 * `<artifact type="deck">`), this keeps the retry on element-patch /
 * deck-patch so the model does not rewrite the whole deck when only a
 * pinned element failed to persist.
 */
export function buildAutoContinueScopedCommentEditPrompt(
  context: ScopedCommentEditAutoContinueContext,
): string {
  const attempt = Math.max(1, Math.floor(context.attempt));
  if (context.visualMarkOnly) {
    return buildAutoContinueVisualMarkEditPrompt(context);
  }
  if (context.visualAnnotationEdit) {
    return buildAutoContinueVisualAnnotationEditPrompt(context);
  }
  const parts: string[] = [
    AUTO_CONTINUE_PROMPT_SENTINEL,
    attempt >= 2 ? '[FINAL RETRY] ' : '',
    '직전 응답은 `<attached-preview-comments>`가 붙은 **요소 단위 편집** turn이었지만, 유효한 patch deliverable을 만들지 못했습니다.',
    '전체 덱을 새로 쓰거나 `<artifact type="deck">` 전체 교체를 하지 마세요. 디스크의 기존 deck.html은 그대로 두고, pinned element만 수정하세요.',
    '',
    '이번 응답은 반드시 non-empty `<artifact type="element-patch" identifier="deck">` 하나만 출력하세요:',
    '',
    '<artifact type="element-patch" identifier="deck">',
    '  <patch target-id="{elementId from attached-preview-comments}" slide-index="{slideIndex from attached-preview-comments}" kind="set-text">replacement text</patch>',
    '</artifact>',
    '',
    '- `target-id`와 `slide-index`는 `<attached-preview-comments>`의 elementId / slideIndex와 정확히 일치해야 합니다.',
    '- 텍스트 교체 요청 ("\'새 문구\'로 수정", "멘트를 …로"): `kind="set-text"`에 새 문구만 넣으세요.',
    '- 크기/색/강조만 바꾸는 요청: `kind="set-style"` JSON (`fontSize`, `fontWeight`, `color`). `currentText`는 그대로.',
    '- 줄바꿈/한 줄/nowrap 같은 레이아웃 요청: `kind="set-outer-html"` (`<br>` 제거) 또는 `kind="set-style"` `{"whiteSpace":"nowrap"}`. `<br>`/중첩 태그가 있으면 `set-text` 금지.',
    '- 정렬/간격 요청: `kind="set-style"` JSON (`textAlign`, `padding`, `margin`). `currentText`는 그대로.',
    '- 삭제/제거 요청: `kind="remove-element"` (빈 body).',
    '- 빈 `<artifact type="element-patch">` 또는 patch 없는 wrapper는 금지.',
    '- slide 구조 변경이 필요할 때만 `<artifact type="deck-patch">`에 해당 slide `<section>` 하나.',
    '',
    '(English: scoped comment edit retry — emit ONE non-empty element-patch for the pinned target only; never rewrite the full deck.)',
  ];
  appendScopedCommentEditRetryContext(parts, context);
  if (attempt >= 3) {
    parts.push(
      '',
      '[최종 시도] 위 템플릿을 그대로 출력하지 못하면 `<artifact type="deck-patch" identifier="deck">` 안에 해당 slide `<section class="slide" data-slide-index="{N}">` 하나만 넣으세요. 전체 deck rewrite 금지.',
    );
  }
  return parts.join('\n');
}

export function resolveAutoContinuePrompt(options: {
  commentAttachmentCount: number;
  incompleteOutput: AutoContinuePromptContext;
  scopedCommentEditFailureReason?: string | null;
  scopedCommentContext?: string | null;
  scopedUserInstruction?: string | null;
  concretePatchTemplate?: string | null;
  visualMarkOnly?: boolean;
  visualAnnotationEdit?: boolean;
}): string {
  if (options.commentAttachmentCount > 0) {
    return buildAutoContinueScopedCommentEditPrompt({
      attempt: options.incompleteOutput.attempt,
      failureReason: options.scopedCommentEditFailureReason,
      commentContext: options.scopedCommentContext,
      userInstruction: options.scopedUserInstruction,
      concretePatchTemplate: options.concretePatchTemplate,
      visualMarkOnly: options.visualMarkOnly,
      visualAnnotationEdit: options.visualAnnotationEdit,
    });
  }
  return buildAutoContinueIncompleteOutputPrompt(options.incompleteOutput);
}
