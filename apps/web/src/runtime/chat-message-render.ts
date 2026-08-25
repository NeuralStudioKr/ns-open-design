import type { ChatMessage } from "../types";
import { stripAllClosedArtifacts } from "../artifacts/strip";
import { stripDeckInFlightStatusResidue } from "../teamver/deckDeliverableProse";
import { assistantMessageTextBody, messageHasVisibleProse } from "./chat-events";
import { isEmptyAssistantShell } from "./conversation-message-dedupe";
import { deriveFileOps } from "./file-ops";
import { isAutoContinueIncompleteOutputPrompt } from "./resume";
import { isSlideCountTopUpPrompt } from "../teamver/slideCountTopUp";

function isHiddenAutomationUserPrompt(content: string | null | undefined): boolean {
  return isAutoContinueIncompleteOutputPrompt(content) || isSlideCountTopUpPrompt(content);
}

export type ChatMessageRenderContext = {
  streaming: boolean;
  lastAssistantId: string | undefined;
  hideAssistantThinkingDetails: boolean;
};

export type TerminalSucceededAnchorOptions = {
  isLast: boolean;
  streaming: boolean;
};

/**
 * Terminal succeeded empty shells anchor the turn after auto-continue recovery.
 * They must count as renderable only when AssistantMessage would show a body
 * (completion lead), not merely the agent role header.
 */
export function isTerminalSucceededEmptyShellForDisplay(message: ChatMessage): boolean {
  return (
    isEmptyAssistantShell(message)
    && message.runStatus === "succeeded"
    && message.endedAt !== undefined
  );
}

export function isTerminalSucceededEmptyShellAnchor(
  message: ChatMessage,
  options: TerminalSucceededAnchorOptions,
): boolean {
  return (
    options.isLast
    && !options.streaming
    && isTerminalSucceededEmptyShellForDisplay(message)
  );
}

export function terminalSucceededAnchorLeadCopy(locale: string): string {
  if (locale.startsWith("ko")) {
    return "작업이 완료되었습니다.";
  }
  return "The task is complete.";
}

function isLastAssistantInVisibleUserTurn(
  messages: readonly ChatMessage[],
  messageIndex: number,
): boolean {
  const turnEnd = findVisibleUserTurnEnd(messages, messageIndex);
  for (let index = messageIndex + 1; index < turnEnd; index += 1) {
    if (messages[index]?.role === "assistant") return false;
  }
  return true;
}

/**
 * Terminal succeeded empty shells anchor the turn after auto-continue recovery.
 * They must count as renderable only when AssistantMessage would show a body
 * (completion lead), not merely the agent role header.
 */
function wouldTerminalEmptyShellShowBody(message: ChatMessage): boolean {
  return isTerminalSucceededEmptyShellForDisplay(message);
}

function wouldAssistantRenderIgnoringSupersededOmission(
  message: ChatMessage,
  ctx: ChatMessageRenderContext,
  messages: readonly ChatMessage[],
  messageIndex: number,
): boolean {
  if (message.role !== "assistant") return false;
  if (isLiveStreamingAssistantTarget(message, ctx)) return true;
  if (
    isEmptyAssistantShell(message)
    && isLastAssistantInVisibleUserTurn(messages, messageIndex)
  ) {
    return wouldTerminalEmptyShellShowBody(message) || hasEmbedVisibleAssistantBody(message);
  }
  if (isEmptyAssistantShell(message)) return false;
  if (
    ctx.hideAssistantThinkingDetails
    && !hasEmbedVisibleAssistantBody(message)
  ) {
    return false;
  }
  return true;
}

function hasLaterRenderableAssistantInVisibleUserTurn(
  messages: readonly ChatMessage[],
  messageIndex: number,
  ctx: ChatMessageRenderContext,
): boolean {
  const turnEnd = findVisibleUserTurnEnd(messages, messageIndex);
  for (let index = messageIndex + 1; index < turnEnd; index += 1) {
    const later = messages[index];
    if (later?.role !== "assistant") continue;
    if (wouldAssistantRenderIgnoringSupersededOmission(later, ctx, messages, index)) {
      return true;
    }
  }
  return false;
}

function findVisibleUserTurnStart(
  messages: readonly ChatMessage[],
  messageIndex: number,
): number {
  let index = messageIndex;
  while (index > 0) {
    const previous = messages[index - 1];
    if (
      previous?.role === "user"
      && !isHiddenAutomationUserPrompt(previous.content)
    ) {
      return index - 1;
    }
    index -= 1;
  }
  return 0;
}

function findVisibleUserTurnEnd(
  messages: readonly ChatMessage[],
  messageIndex: number,
): number {
  let index = messageIndex + 1;
  while (index < messages.length) {
    const message = messages[index];
    if (
      message?.role === "user"
      && !isHiddenAutomationUserPrompt(message.content)
    ) {
      return index;
    }
    index += 1;
  }
  return messages.length;
}

function hasLaterAssistantInVisibleUserTurn(
  messages: readonly ChatMessage[],
  messageIndex: number,
): boolean {
  const turnEnd = findVisibleUserTurnEnd(messages, messageIndex);
  for (let index = messageIndex + 1; index < turnEnd; index += 1) {
    if (messages[index]?.role === "assistant") return true;
  }
  return false;
}

/**
 * Auto-continue retries append a new assistant row after each incomplete
 * failure. The earlier failures often carry only error status events — the
 * chat UI still renders their role header (agent icon + name), so three
 * retries look like three stacked agent labels. Drop superseded failed rows
 * in the same visible user turn when they have no user-visible body left.
 */
export function shouldOmitSupersededAutoContinueFailure(
  messages: readonly ChatMessage[],
  messageIndex: number,
  ctx?: ChatMessageRenderContext,
): boolean {
  const message = messages[messageIndex];
  if (!message || message.role !== "assistant") return false;
  if (message.runStatus !== "failed") return false;
  if (!hasLaterAssistantInVisibleUserTurn(messages, messageIndex)) return false;
  if ((message.producedFiles?.length ?? 0) > 0) return false;
  if (messageHasVisibleProse(message)) return false;
  if (deriveFileOps(message.events ?? []).length > 0) return false;
  if (
    ctx
    && !hasLaterRenderableAssistantInVisibleUserTurn(messages, messageIndex, ctx)
  ) {
    return false;
  }
  return true;
}

function isLiveStreamingAssistantTarget(
  message: ChatMessage,
  ctx: ChatMessageRenderContext,
): boolean {
  return ctx.streaming && message.id === ctx.lastAssistantId;
}

/** Text-channel body only — thinking is filtered in Teamver embed chat UI. */
function hasEmbedVisibleProseBody(message: ChatMessage): boolean {
  const body = assistantMessageTextBody(message).trim();
  if (!body) return false;
  const stripped = stripAllClosedArtifacts(body)
    .replace(/<artifact\b[\s\S]*$/i, "")
    .trim();
  if (!stripped) return false;
  // Settled runs: leftover in-flight status ("작성 중" / live-lead copy) must
  // not count as visible prose — otherwise completed-artifact lead is blocked.
  // Strip residue lines so long progressive explanations still count as visible.
  if (assistantRunSucceeded(message)) {
    return stripDeckInFlightStatusResidue(stripped).length > 0;
  }
  return true;
}

function assistantRunSucceeded(message: ChatMessage): boolean {
  if (message.runStatus === "failed" || message.runStatus === "canceled") return false;
  if (message.runStatus === "succeeded") return true;
  return !message.runStatus && !!message.endedAt;
}

const SLIDE_EDIT_ARTIFACT_TYPES = /^(?:deck-patch|slide-patch|element-patch)$/i;
const SLIDE_EDIT_ARTIFACT_TYPE_ATTR =
  /\btype\s*=\s*["']?(?:deck-patch|slide-patch|element-patch)\b/i;

/**
 * Primary Teamver deck filename convention — aligned with ProjectView
 * `isCanonicalDeckFileName` (`deck.html`, `deck-2.html`, …).
 */
export function isPrimaryDeckFileName(name: string): boolean {
  const base = (
    String(name).replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? String(name)
  ).toLowerCase();
  return /^deck(?:[-_.].*)?\.html?$/.test(base);
}

/**
 * True when the assistant turn is delivering a structured slide *edit*
 * artifact (not a full new deck). Accepts an optional live streaming type.
 */
export function messageIndicatesSlideEditArtifact(
  content: string,
  liveArtifactType?: string | null,
): boolean {
  if (liveArtifactType && SLIDE_EDIT_ARTIFACT_TYPES.test(liveArtifactType)) return true;
  if (/<artifact\b[^>]*\stype=["'](?:deck-patch|slide-patch|element-patch)["']/i.test(content)) {
    return true;
  }
  const openIdx = content.search(/<artifact\b/i);
  if (openIdx === -1) return false;
  const gt = content.indexOf(">", openIdx);
  const partialTag = gt === -1 ? content.slice(openIdx) : content.slice(openIdx, gt + 1);
  return SLIDE_EDIT_ARTIFACT_TYPE_ATTR.test(partialTag);
}

/** @deprecated Prefer messageIndicatesSlideEditArtifact — kept for call-site compat. */
export function messageIndicatesDeckPatchArtifact(content: string): boolean {
  return messageIndicatesSlideEditArtifact(content);
}

function messageHasPreTurnPrimaryDeck(message: ChatMessage): boolean {
  return (message.preTurnFileNames ?? []).some((name) => isPrimaryDeckFileName(String(name)));
}

/** Resolve durable create/edit label at send time (Teamver slide-only).
 * Prefer an auto-attached canonical deck, else preTurn primary deck names.
 * Template-clone content fill must stay "create" even when Clone already
 * wrote a LOOK preview to deck.html (otherwise UI/system go edit-tone).
 */
export function resolveSlideTurnKindForSend(options: {
  slideOnlyMvp: boolean;
  preTurnFileNames: readonly string[];
  existingDeckAttached?: boolean;
  templateCloneContentFill?: boolean;
}): "create" | "edit" | undefined {
  if (!options.slideOnlyMvp) return undefined;
  if (options.templateCloneContentFill) return "create";
  if (options.existingDeckAttached) return "edit";
  if (options.preTurnFileNames.some((name) => isPrimaryDeckFileName(String(name)))) {
    return "edit";
  }
  return "create";
}

/**
 * Slide-edit completion copy after reload: persist sanitizer strips closed
 * patch artifacts, so body detection alone is not enough.
 *
 * Prefer durable `slideTurnKind`, then patch markers, then pre-turn primary
 * deck (`deck.html`) — never leftover non-deck HTML (about.html, notes.html).
 */
export function messageLooksLikeSlideEditTurn(message: ChatMessage): boolean {
  const body = assistantMessageTextBody(message);
  if (message.slideTurnKind === "edit") return true;
  if (message.slideTurnKind === "create") {
    // Model may still emit element-patch / deck-patch on a create-labeled send.
    return messageIndicatesSlideEditArtifact(body);
  }
  if (messageIndicatesSlideEditArtifact(body)) return true;
  return messageHasPreTurnPrimaryDeck(message);
}

/**
 * Closed `<artifact>` blocks with non-whitespace bodies. Empty wrappers like
 * `<artifact type="deck"></artifact>` are phantom shells and must stay hidden.
 */
export function messageHasSubstantiveClosedArtifact(content: string): boolean {
  const re = /<artifact\b[^>]*>([\s\S]*?)<\/artifact>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1]?.trim()) return true;
  }
  return false;
}

/**
 * Whether AssistantMessage should synthesize the Teamver "slide ready / edit
 * applied" lead after a successful artifact turn. Must survive hard reload when
 * closed artifacts were stripped from content/events but producedFiles or
 * preTurnFileNames remain.
 *
 * Do NOT require ChatPane `isLast` — `resolveLastAssistantMessageId` may point
 * at a superseded failed sibling, and historical turns must keep their lead
 * after the user continues chatting.
 */
export function shouldSynthesizeTeamverCompletedArtifactLead(
  message: ChatMessage,
  options: {
    streaming: boolean;
    isLast?: boolean;
    hasVisibleAssistantText: boolean;
  },
): boolean {
  if (options.streaming || options.hasVisibleAssistantText) return false;
  if (!assistantRunSucceeded(message)) return false;
  // Durable slide-turn label survives reload when artifact prose / producedFiles
  // were stripped — keep the completion lead for every generation entry path.
  if (message.slideTurnKind === "create" || message.slideTurnKind === "edit") {
    return true;
  }
  // Historical + auto-continue: any terminal succeeded empty shell keeps lead.
  if (isTerminalSucceededEmptyShellForDisplay(message)) return true;
  if ((message.producedFiles?.length ?? 0) > 0) return true;
  const body = assistantMessageTextBody(message);
  if (messageHasSubstantiveClosedArtifact(body)) return true;
  // deck-patch marker still in body, or preTurn HTML after tags were stripped.
  return messageLooksLikeSlideEditTurn(message);
}

function hasTeamverCompletedArtifactLead(message: ChatMessage): boolean {
  return shouldSynthesizeTeamverCompletedArtifactLead(message, {
    streaming: false,
    hasVisibleAssistantText: hasEmbedVisibleProseBody(message),
  });
}

/**
 * Approximate AssistantMessage embed early-return: after tool/thinking/status
 * filters, would the row still show user-visible body?
 *
 * Keep in sync with AssistantMessage `hasEmbedVisibleBody` (text-only prose;
 * thinking must NOT count as visible here or ChatPane reserves a phantom row).
 */
export function hasEmbedVisibleAssistantBody(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.runStatus === "failed" || message.runStatus === "canceled") return true;
  if (message.resumable === true) return true;
  if ((message.producedFiles?.length ?? 0) > 0) return true;
  if (hasEmbedVisibleProseBody(message)) return true;
  if (deriveFileOps(message.events ?? []).length > 0) return true;
  if (hasTeamverCompletedArtifactLead(message)) return true;
  const body = assistantMessageTextBody(message);
  if (messageIndicatesDeckPatchArtifact(body)) return true;
  if (messageHasSubstantiveClosedArtifact(body) && assistantRunSucceeded(message)) {
    return true;
  }
  if (wouldTerminalEmptyShellShowBody(message)) return true;
  return false;
}

/** True when ChatPane / AssistantMessage would render nothing for this row. */
export function shouldOmitMessageFromChatRender(
  message: ChatMessage,
  ctx: ChatMessageRenderContext,
  options?: {
    messages?: readonly ChatMessage[];
    messageIndex?: number;
  },
): boolean {
  if (
    options?.messages
    && typeof options.messageIndex === "number"
    && shouldOmitSupersededAutoContinueFailure(options.messages, options.messageIndex, ctx)
  ) {
    return true;
  }
  if (message.role === "user") {
    return isHiddenAutomationUserPrompt(message.content);
  }
  if (message.role !== "assistant") return false;
  // Persist/HTML strip can move the hidden APPEND prompt onto the assistant
  // row as "The / Keep / APPEND / This is an explicit slide-count expansion".
  if (
    isSlideCountTopUpPrompt(message.content)
    && (message.producedFiles?.length ?? 0) === 0
    && !messageHasSubstantiveClosedArtifact(assistantMessageTextBody(message))
  ) {
    return true;
  }
  if (isLiveStreamingAssistantTarget(message, ctx)) return false;
  if (isEmptyAssistantShell(message)) {
    if (isTerminalSucceededEmptyShellForDisplay(message)) {
      // Drop same-turn shells superseded by a later assistant — collapsed at
      // load, but omit is the safety net. Without index context, keep the shell
      // so completion leads survive reload filtering.
      if (
        options?.messages
        && typeof options.messageIndex === "number"
        && !isLastAssistantInVisibleUserTurn(options.messages, options.messageIndex)
      ) {
        return true;
      }
      return false;
    }
    return true;
  }
  if (ctx.hideAssistantThinkingDetails && !hasEmbedVisibleAssistantBody(message)) {
    // Last-resort: succeeded slide turns must always reserve a row for the
    // synthetic completion lead even when stale lifecycle events blocked
    // empty-shell detection above.
    if (
      assistantRunSucceeded(message)
      && message.endedAt !== undefined
      && shouldSynthesizeTeamverCompletedArtifactLead(message, {
        streaming: false,
        hasVisibleAssistantText: false,
      })
    ) {
      return false;
    }
    return true;
  }
  return false;
}

export function shouldIncludeMessageInChatRender(
  message: ChatMessage,
  ctx: ChatMessageRenderContext,
  options?: {
    messages?: readonly ChatMessage[];
    messageIndex?: number;
  },
): boolean {
  return !shouldOmitMessageFromChatRender(message, ctx, options);
}
