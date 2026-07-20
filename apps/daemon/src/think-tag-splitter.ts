import {
  sanitizeAssistantProseForDisplay,
  sanitizeLeakedAgentProse,
  createStreamingAssistantProseGuard,
} from "@open-design/contracts";

/** Remove CLI-style pseudo-tool XML leaked into BYOK/API chat deltas (#313).
 *  SSOT: `@open-design/contracts` — streaming mode preserves open `<artifact>` for FE live panel. */
export function stripLeakedPseudoToolXml(text: string): string {
  return sanitizeAssistantProseForDisplay(text, { streaming: true });
}

/** History / complete-message sanitizer (no open-artifact preserve). */
export function stripLeakedPseudoToolXmlComplete(text: string): string {
  return sanitizeLeakedAgentProse(text);
}

/** Stateful delta sanitizer — safe across chunk boundaries. */
export function createStreamingProseDeltaGuard(
  options: { stripCodeFences?: boolean } = {},
): {
  feed: (delta: string) => string;
  flush: () => string;
} {
  return createStreamingAssistantProseGuard(options);
}

const REDACTED_THINKING_TAG = "redacted_thinking";

/** Cap unclosed redacted_thinking blocks so a missing close tag cannot grow without bound. */
const OPEN_THINK_CAP_BYTES = 64 * 1024;

function sliceUtf8ByBytes(text: string, maxBytes: number): { head: string; tail: string } {
  if (maxBytes <= 0) return { head: '', tail: text };
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return { head: text, tail: '' };
  let end = maxBytes;
  while (end > 0 && (buf[end]! & 0xc0) === 0x80) end -= 1;
  return {
    head: buf.subarray(0, end).toString('utf8'),
    tail: buf.subarray(end).toString('utf8'),
  };
}

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
  let thinkOpenBytes = 0;

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
        thinkOpenBytes = 0;
        continue;
      }

      const closeIdx = working.indexOf(CLOSE);
      if (closeIdx === -1) {
        const partial = partialTokenSuffix(working, CLOSE);
        const chunk = partial > 0
          ? working.slice(0, working.length - partial)
          : working;
        const held = partial > 0 ? working.slice(working.length - partial) : '';

        const chunkBytes = Buffer.byteLength(chunk, 'utf8');
        if (thinkOpenBytes + chunkBytes > OPEN_THINK_CAP_BYTES) {
          const budget = Math.max(0, OPEN_THINK_CAP_BYTES - thinkOpenBytes);
          const { head, tail } = sliceUtf8ByBytes(chunk, budget);
          thinking += head;
          if (onThinkingChunk && head) onThinkingChunk(head);
          visible += tail + held;
          inThink = false;
          thinkOpenBytes = 0;
          buffer = '';
          break;
        }

        thinkOpenBytes += chunkBytes;
        thinking += chunk;
        if (onThinkingChunk && chunk) onThinkingChunk(chunk);
        buffer = held;
        break;
      }
      const chunk = working.slice(0, closeIdx);
      thinkOpenBytes += Buffer.byteLength(chunk, 'utf8');
      thinking += chunk;
      if (onThinkingChunk && chunk) onThinkingChunk(chunk);
      working = working.slice(closeIdx + CLOSE.length);
      inThink = false;
      thinkOpenBytes = 0;
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
