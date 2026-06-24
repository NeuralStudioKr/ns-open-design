const REDACTED_THINKING_TAG = "redacted_thinking";

/** Streaming-safe splitter for MiniMax redacted_thinking markers in delta.content. */
export function createThinkTagSplitter(
  onThinkingChunk?: (chunk: string) => void,
): {
  feed: (text: string) => { visible: string; thinking: string };
  flush: () => { visible: string; thinking: string };
} {
  const OPEN = `<${REDACTED_THINKING_TAG}>`;
  const CLOSE = `</${REDACTED_THINKING_TAG}>`;
  let inThink = false;
  let buffer = "";

  const partialTokenSuffix = (text: string, token: string): number => {
    const max = Math.min(text.length, token.length - 1);
    for (let n = max; n > 0; n -= 1) {
      const suffix = text.slice(-n);
      if (suffix.startsWith("<") && token.startsWith(suffix)) return n;
    }
    return 0;
  };

  const split = (raw: string): { visible: string; thinking: string } => {
    let visible = "";
    let thinking = "";
    let working = buffer + raw;
    buffer = "";

    while (working.length > 0) {
      if (!inThink) {
        const openIdx = working.indexOf(OPEN);
        if (openIdx === -1) {
          const partial = partialTokenSuffix(working, OPEN);
          if (partial > 0) {
            visible += working.slice(0, working.length - partial);
            buffer = working.slice(working.length - partial);
          } else {
            visible += working;
          }
          break;
        }
        visible += working.slice(0, openIdx);
        working = working.slice(openIdx + OPEN.length);
        inThink = true;
        continue;
      }

      const closeIdx = working.indexOf(CLOSE);
      if (closeIdx === -1) {
        const partial = partialTokenSuffix(working, CLOSE);
        if (partial > 0) {
          const chunk = working.slice(0, working.length - partial);
          thinking += chunk;
          if (onThinkingChunk && chunk) onThinkingChunk(chunk);
          buffer = working.slice(working.length - partial);
        } else {
          thinking += working;
          if (onThinkingChunk && working) onThinkingChunk(working);
        }
        break;
      }
      const chunk = working.slice(0, closeIdx);
      thinking += chunk;
      if (onThinkingChunk && chunk) onThinkingChunk(chunk);
      working = working.slice(closeIdx + CLOSE.length);
      inThink = false;
    }

    return { visible, thinking: onThinkingChunk ? "" : thinking };
  };

  return {
    feed(text: string) {
      return split(text);
    },
    flush() {
      if (!buffer && !inThink) return { visible: "", thinking: "" };
      const tail = buffer;
      buffer = "";
      if (inThink) {
        inThink = false;
        if (onThinkingChunk && tail) onThinkingChunk(tail);
        return { visible: "", thinking: onThinkingChunk ? "" : tail };
      }
      return { visible: tail, thinking: "" };
    },
  };
}

/** Remove CLI-style pseudo-tool XML leaked into BYOK/API chat deltas (#313).
 *  Keep patterns in sync with apps/web/src/runtime/internalAgentMarkup.ts `sanitizeLeakedAgentProse`. */
export function stripLeakedPseudoToolXml(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/<function_calls\b[^>]*>[\s\S]*?<\/function_calls>/gi, "");
  out = out.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "");
  out = out.replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, "");
  out = out.replace(/<function_results\b[^>]*>[\s\S]*?<\/function_results>/gi, "");
  out = out.replace(/<todo-list\b[^>]*>[\s\S]*?<\/todo-list>/gi, "");
  out = out.replace(/<tool-call\b[^>]*>[\s\S]*?<\/tool-call>/gi, "");
  out = out.replace(/<antml:[^>]+>[\s\S]*?<\/antml:[^>]+>/gi, "");
  out = out.replace(/<info\b[^>]*>[\s\S]*?<\/info>/gi, "");
  out = out.replace(/<(od[A-Za-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  out = out.replace(
    new RegExp(`<${REDACTED_THINKING_TAG}[^>]*>[\\s\\S]*?</${REDACTED_THINKING_TAG}>`, "gi"),
    "",
  );
  out = out.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "");
  out = out.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  out = out.replace(/<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi, "");
  out = out.replace(
    /\[(?:正在调用|calling|invoking)\s+(?:TodoWrite|Read|Write|Edit|Bash|WebFetch|WebSearch|Grep|Glob|Task|Shell|write_todos|TaskCreate|TaskUpdate)[^\]]*\]/gi,
    "",
  );
  out = out.replace(/\[(?:读取|Reading|reading)\s+[^\]]{1,240}\]/gi, "");
  out = out.replace(
    /^\s*(?:TodoWrite called with \d+ tasks|Marking task \d+ as (?:in_progress|completed|pending|cancelled|stopped)|Running tool: \w+|Tool (?:completed|failed): \w+)\s*$/gim,
    "",
  );
  return out.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
}
