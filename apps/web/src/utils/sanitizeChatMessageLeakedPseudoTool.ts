import type { AgentEvent, ChatMessage } from "../types";
import { stripAllClosedArtifacts } from "../artifacts/strip";
import { sanitizeAssistantProseForDisplay } from "../runtime/internalAgentMarkup";

function sanitizeProseChunk(text: string): string {
  return sanitizeAssistantProseForDisplay(stripAllClosedArtifacts(text));
}

function sanitizeEvent(event: AgentEvent): AgentEvent {
  if (event.kind === "text" && typeof event.text === "string") {
    const text = sanitizeProseChunk(event.text);
    if (text === event.text) return event;
    return { ...event, text };
  }
  if (event.kind === "thinking" && typeof event.text === "string") {
    const text = sanitizeProseChunk(event.text);
    if (text === event.text) return event;
    return { ...event, text };
  }
  return event;
}

function dropEmptyProseEvents(events: AgentEvent[]): AgentEvent[] {
  return events.filter((event) => {
    if (event.kind === "text" || event.kind === "thinking") {
      return typeof event.text === "string" && event.text.trim().length > 0;
    }
    return true;
  });
}

/** Strip leaked CLI pseudo-tool XML from persisted assistant/user message bodies. */
export function sanitizeChatMessageLeakedPseudoTool(message: ChatMessage): ChatMessage {
  let changed = false;

  const content = message.content ?? "";
  const nextContent = sanitizeProseChunk(content);
  if (nextContent !== content) changed = true;

  let nextEvents = message.events;
  if (message.events?.length) {
    const mapped = message.events.map(sanitizeEvent);
    const filtered = dropEmptyProseEvents(mapped);
    if (filtered.length !== message.events.length) {
      changed = true;
      nextEvents = filtered;
    } else if (mapped.some((event, index) => event !== message.events![index])) {
      changed = true;
      nextEvents = mapped;
    }
  }

  if (!changed) return message;
  return {
    ...message,
    content: nextContent,
    ...(nextEvents ? { events: nextEvents } : {}),
  };
}
