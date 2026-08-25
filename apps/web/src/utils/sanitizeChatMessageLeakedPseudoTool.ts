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

function replaceJoinedTextEvents(events: AgentEvent[], cleanedText: string): AgentEvent[] {
  let placed = false;
  const next: AgentEvent[] = [];
  for (const event of events) {
    if (event.kind !== "text") {
      next.push(event);
      continue;
    }
    if (!placed && cleanedText.trim()) {
      next.push({ kind: "text", text: cleanedText });
      placed = true;
    }
  }
  if (!placed && cleanedText.trim()) {
    next.unshift({ kind: "text", text: cleanedText });
  }
  return next;
}

function sanitizeDisplayText(
  text: string,
  options: Pick<SanitizeChatMessageOptions, "stripCodeFences" | "streaming">,
): string {
  return sanitizeAssistantProseForDisplay(stripAllClosedArtifacts(text), {
    stripCodeFences: options.stripCodeFences,
    streaming: options.streaming,
  });
}

export type SanitizeChatMessageOptions = {
  /** Hide ```html/js fences (Teamver embed). */
  stripCodeFences?: boolean;
  /** Drop structured thinking events entirely (Teamver embed). */
  dropThinkingEvents?: boolean;
  /** Keep open question-form / artifact tails (in-flight merge). */
  streaming?: boolean;
};

/** Strip leaked CLI pseudo-tool XML from persisted assistant/user message bodies. */
export function sanitizeChatMessageLeakedPseudoTool(
  message: ChatMessage,
  options: SanitizeChatMessageOptions = {},
): ChatMessage {
  let changed = false;

  const content = message.content ?? "";
  const nextContent = sanitizeDisplayText(content, options);
  if (nextContent !== content) changed = true;

  let nextEvents = message.events;
  if (message.events?.length) {
    const prepared: AgentEvent[] = [];
    const textParts: string[] = [];
    for (const event of message.events) {
      if (options.dropThinkingEvents && event.kind === "thinking") {
        changed = true;
        continue;
      }
      if (event.kind === "thinking" && typeof event.text === "string") {
        const text = sanitizeDisplayText(event.text, options);
        if (!text.trim()) {
          changed = true;
          continue;
        }
        if (text !== event.text) {
          changed = true;
          prepared.push({ ...event, text });
        } else {
          prepared.push(event);
        }
        continue;
      }
      if (event.kind === "text" && typeof event.text === "string") {
        textParts.push(event.text);
        prepared.push(event);
        continue;
      }
      prepared.push(event);
    }

    const joined = textParts.join("");
    const cleanedJoined = sanitizeDisplayText(joined, options);
    const eventText = cleanedJoined.trim() ? cleanedJoined : nextContent;
    let mapped = prepared;
    if (textParts.length > 1 || eventText !== joined) {
      mapped = replaceJoinedTextEvents(prepared, eventText);
      if (mapped !== prepared) changed = true;
    }

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
      const sanitizedJoined = sanitizeDisplayText(joinedText, options);
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
