import type { ChatMessage } from "../types";
import { sanitizeLeakedAgentProse } from "../runtime/internalAgentMarkup";

/** Strip leaked CLI pseudo-tool XML from persisted assistant/user message bodies. */
export function sanitizeChatMessageLeakedPseudoTool(message: ChatMessage): ChatMessage {
  let changed = false;

  const content = message.content ?? "";
  const nextContent = sanitizeLeakedAgentProse(content);
  if (nextContent !== content) changed = true;

  let nextEvents = message.events;
  if (message.events?.length) {
    nextEvents = message.events.map((event) => {
      if (event.kind !== "text" || typeof event.text !== "string") return event;
      const text = sanitizeLeakedAgentProse(event.text);
      if (text === event.text) return event;
      changed = true;
      return { ...event, text };
    });
  }

  if (!changed) return message;
  return {
    ...message,
    content: nextContent,
    ...(nextEvents ? { events: nextEvents } : {}),
  };
}
