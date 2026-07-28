import type { AgentEvent, ChatMessage } from "../types";
import { stripAllClosedArtifacts } from "../artifacts/strip";
import { sanitizeAssistantProseForDisplay } from "../runtime/internalAgentMarkup";

function hasNonProseStructureEvents(events: AgentEvent[]): boolean {
  return events.some(
    (event) =>
      event.kind === "tool_use"
      || event.kind === "tool_result"
      || event.kind === "thinking",
  );
}

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

  // Text-only turns: if joining chunk events and re-sanitizing matches content
  // (modulo trailing whitespace), collapse events onto content SSOT. Covers
  // stop mid-deck where per-chunk sanitize left a trailing newline while
  // content already dropped the CSS leak. Do not force-align when content and
  // events intentionally differ (separate prose streams in tests/history).
  if (nextEvents?.length && !hasNonProseStructureEvents(nextEvents)) {
    const joinedText = nextEvents
      .filter((event): event is Extract<AgentEvent, { kind: "text" }> => event.kind === "text")
      .map((event) => event.text)
      .join("");
    if (joinedText !== nextContent) {
      const sanitizedJoined = sanitizeAssistantProseForDisplay(stripAllClosedArtifacts(joinedText), {
        stripCodeFences: options.stripCodeFences,
      });
      if (
        sanitizedJoined === nextContent
        || sanitizedJoined.trimEnd() === nextContent.trimEnd()
      ) {
        const nonText = nextEvents.filter((event) => event.kind !== "text");
        nextEvents = nextContent.trim()
          ? [{ kind: "text", text: nextContent }, ...nonText]
          : nonText;
        changed = true;
      }
    }
  }

  if (!changed) return message;
  return {
    ...message,
    content: nextContent,
    ...(nextEvents ? { events: nextEvents } : {}),
  };
}
