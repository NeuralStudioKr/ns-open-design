import type { ChatMessage } from "../types";
import { assistantMessageTextBody } from "./chat-events";
import { isEmptyAssistantShell } from "./conversation-message-dedupe";
import { deriveFileOps } from "./file-ops";
import { isAutoContinueIncompleteOutputPrompt } from "./resume";

export type ChatMessageRenderContext = {
  streaming: boolean;
  lastAssistantId: string | undefined;
  hideAssistantThinkingDetails: boolean;
};

function isLiveStreamingAssistantTarget(
  message: ChatMessage,
  ctx: ChatMessageRenderContext,
): boolean {
  return ctx.streaming && message.id === ctx.lastAssistantId;
}

/** Text-channel body only — thinking is filtered in Teamver embed chat UI. */
function hasVisibleTextBody(message: ChatMessage): boolean {
  if ((message.content ?? "").trim().length > 0) return true;
  return (message.events ?? []).some(
    (event) =>
      event.kind === "text"
      && typeof event.text === "string"
      && event.text.trim().length > 0,
  );
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
  // Artifact-only turns still get a Teamver completion lead in AssistantMessage.
  if (/<artifact\b/i.test(assistantMessageTextBody(message))) return true;
  return false;
}

/** True when ChatPane / AssistantMessage would render nothing for this row. */
export function shouldOmitMessageFromChatRender(
  message: ChatMessage,
  ctx: ChatMessageRenderContext,
): boolean {
  if (message.role === "user") {
    return isAutoContinueIncompleteOutputPrompt(message.content);
  }
  if (message.role !== "assistant") return false;
  if (isLiveStreamingAssistantTarget(message, ctx)) return false;
  if (isEmptyAssistantShell(message)) return true;
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
): boolean {
  return !shouldOmitMessageFromChatRender(message, ctx);
}
