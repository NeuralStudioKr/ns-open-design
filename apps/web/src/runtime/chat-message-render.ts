import type { ChatMessage } from "../types";
import { stripAllClosedArtifacts } from "../artifacts/strip";
import { assistantMessageTextBody, messageHasVisibleProse } from "./chat-events";
import { sanitizeAssistantProseForDisplay } from "./internalAgentMarkup";
import { isEmptyAssistantShell } from "./conversation-message-dedupe";
import { deriveFileOps } from "./file-ops";
import { isAutoContinueIncompleteOutputPrompt } from "./resume";

export type ChatMessageRenderContext = {
  streaming: boolean;
  lastAssistantId: string | undefined;
  hideAssistantThinkingDetails: boolean;
};

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
    return true;
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
      && !isAutoContinueIncompleteOutputPrompt(previous.content)
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
      && !isAutoContinueIncompleteOutputPrompt(message.content)
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
function hasVisibleTextBody(message: ChatMessage): boolean {
  const body = assistantMessageTextBody(message);
  if (!body.trim()) return false;
  const stripped = stripAllClosedArtifacts(body);
  const cleaned = sanitizeAssistantProseForDisplay(stripped, {
    streaming: false,
    stripCodeFences: true,
  }).trim();
  return cleaned.length > 0;
}

function assistantRunSucceeded(message: ChatMessage): boolean {
  if (message.runStatus === "failed") return false;
  return message.runStatus === "succeeded" || (!message.runStatus && !!message.endedAt);
}

function messageIndicatesDeckPatchArtifact(content: string): boolean {
  if (/<artifact\b[^>]*\stype=["'](?:deck-patch|slide-patch)["']/i.test(content)) return true;
  const openIdx = content.search(/<artifact\b/i);
  if (openIdx === -1) return false;
  const gt = content.indexOf(">", openIdx);
  const partialTag = gt === -1 ? content.slice(openIdx) : content.slice(openIdx, gt + 1);
  return /\btype\s*=\s*["']?(?:deck-patch|slide-patch)\b/i.test(partialTag);
}

function hasTeamverCompletedArtifactLead(message: ChatMessage): boolean {
  if (!assistantRunSucceeded(message)) return false;
  const body = assistantMessageTextBody(message);
  if (!/<artifact\b/i.test(body)) return false;
  return (message.producedFiles?.length ?? 0) > 0 || messageIndicatesDeckPatchArtifact(body);
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
  if (hasVisibleTextBody(message)) return true;
  if (deriveFileOps(message.events ?? []).length > 0) return true;
  if (hasTeamverCompletedArtifactLead(message)) return true;
  const body = assistantMessageTextBody(message);
  if (messageIndicatesDeckPatchArtifact(body)) return true;
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
    return isAutoContinueIncompleteOutputPrompt(message.content);
  }
  if (message.role !== "assistant") return false;
  if (isLiveStreamingAssistantTarget(message, ctx)) return false;
  if (isEmptyAssistantShell(message)) {
    if (
      options?.messages
      && typeof options.messageIndex === "number"
      && isLastAssistantInVisibleUserTurn(options.messages, options.messageIndex)
    ) {
      return false;
    }
    return true;
  }
  if (
    ctx.hideAssistantThinkingDetails
    && !hasEmbedVisibleAssistantBody(message)
  ) {
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
