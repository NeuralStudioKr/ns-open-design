import type { AgentEvent, ChatMessage } from "../types";
import { stripAllClosedArtifacts } from "../artifacts/strip";
import { sanitizeAssistantProseForDisplay } from "../runtime/internalAgentMarkup";

function dropEmptyProseEvents(events: AgentEvent[]): AgentEvent[] {
  return events.filter((event) => {
    if (event.kind === "text" || event.kind === "thinking") {
      return typeof event.text === "string" && event.text.trim().length > 0;
    }
    return true;
  });
}

export type SanitizeChatMessageOptions = {
  /** Hide ```html/js fences (Teamver embed). */
  stripCodeFences?: boolean;
  /** Drop structured thinking events entirely (Teamver embed). */
  dropThinkingEvents?: boolean;
};

/** Strip leaked CLI pseudo-tool XML from persisted assistant/user message bodies. */
export function sanitizeChatMessageLeakedPseudoTool(
  message: ChatMessage,
  options: SanitizeChatMessageOptions = {},
): ChatMessage {
  let changed = false;

  const content = message.content ?? "";
  const nextContent = sanitizeAssistantProseForDisplay(stripAllClosedArtifacts(content), {
    stripCodeFences: options.stripCodeFences,
  });
  if (nextContent !== content) changed = true;

  let nextEvents = message.events;
  if (message.events?.length) {
    const mapped = message.events
      .map((event) => {
        if (options.dropThinkingEvents && event.kind === "thinking") {
          changed = true;
          return null;
        }
        if ((event.kind === "text" || event.kind === "thinking") && typeof event.text === "string") {
          const text = sanitizeAssistantProseForDisplay(stripAllClosedArtifacts(event.text), {
            stripCodeFences: options.stripCodeFences,
          });
          if (text === event.text) return event;
          changed = true;
          return { ...event, text };
        }
        return event;
      })
      .filter((event): event is AgentEvent => event != null);
    const filtered = dropEmptyProseEvents(mapped);
    if (
      filtered.length !== message.events.length
      || filtered.some((event, index) => event !== message.events![index])
    ) {
      changed = true;
      nextEvents = filtered;
    }
  }

  if (!changed) return message;
  return {
    ...message,
    content: nextContent,
    ...(nextEvents ? { events: nextEvents } : {}),
  };
}
