/**
 * Strip model-emitted internal Open Design markup from user-visible assistant
 * prose. Weak/plain-stream models sometimes echo pseudo-XML tool blocks such as
 * `<odTodoWrite>[…]</odTodoWrite>` in text_delta instead of real tool_use
 * events — those must never render in the chat surface or transcript.
 */

const CLOSED_OD_TAG_RE = /<(od[A-Za-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi;

// Matches `<odTodoWrite`, `<odThinking`, etc. while still streaming.
const OPEN_OD_TAG_RE = /<(od[A-Za-z][\w-]*)\b[^>]*>/i;

const REDACTED_THINKING_TAG = "redacted_thinking";

/** MiniMax inline chain-of-thought markers that leak when the daemon splitter misses a chunk. */
const CLOSED_REDACTED_THINKING_RE = new RegExp(
  `<${REDACTED_THINKING_TAG}[^>]*>[\\s\\S]*?</${REDACTED_THINKING_TAG}>`,
  "gi",
);
const OPEN_REDACTED_THINKING_RE = new RegExp(`<${REDACTED_THINKING_TAG}[^>]*>`, "i");

/** Cursor / agent system reminders echoed into assistant prose. */
const CLOSED_SYSTEM_REMINDER_RE = /<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi;
const OPEN_SYSTEM_REMINDER_RE = /<system-reminder\b[^>]*>/i;

/** Narrated tool calls some models emit when tools are unavailable or ignored. */
const FAKE_TOOL_NARRATION_RE =
  /\[(?:正在调用|calling|invoking)\s+(?:TodoWrite|Read|Write|Edit|Bash|WebFetch|WebSearch|Grep|Glob|Task|Shell)[^\]]*\]/gi;

function findCloseTag(input: string, from: number, closeTag: string): number {
  const closeLower = closeTag.toLowerCase();
  const tagLen = closeTag.length;
  const maxStart = input.length - tagLen;
  for (let i = from; i <= maxStart; i += 1) {
    if (input.slice(i, i + tagLen).toLowerCase() === closeLower) return i;
  }
  return -1;
}

function stripTrailingOpenTag(
  input: string,
  openTagRe: RegExp,
  tagName: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const match = openTagRe.exec(slice);
    if (!match) break;
    const closeTag = `</${tagName}>`;
    const openStart = cursor + match.index;
    const openEnd = openStart + match[0].length;
    const closeIdx = findCloseTag(input, openEnd, closeTag);
    if (closeIdx === -1) {
      return { text: input.slice(0, openStart).trimEnd(), hadOpenInternalMarkup: true };
    }
    cursor = closeIdx + closeTag.length;
  }
  return { text: input, hadOpenInternalMarkup: false };
}

/** Remove completed internal markup blocks and fake tool narration from prose. */
export function stripInternalOpenDesignMarkup(input: string): string {
  let out = input.replace(CLOSED_OD_TAG_RE, "");
  out = out.replace(CLOSED_REDACTED_THINKING_RE, "");
  out = out.replace(CLOSED_SYSTEM_REMINDER_RE, "");
  out = out.replace(FAKE_TOOL_NARRATION_RE, "");
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}

/**
 * While streaming, drop a trailing unclosed `<od…>` block so users never see
 * half-written todo/thinking JSON in the chat log.
 */
export function stripTrailingOpenInternalMarkup(
  input: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const match = OPEN_OD_TAG_RE.exec(slice);
    if (!match) break;
    const tagName = match[1] ?? "odTodoWrite";
    const closeTag = `</${tagName}>`;
    const openStart = cursor + match.index;
    const openEnd = openStart + match[0].length;
    const closeIdx = findCloseTag(input, openEnd, closeTag);
    if (closeIdx === -1) {
      return { text: input.slice(0, openStart).trimEnd(), hadOpenInternalMarkup: true };
    }
    cursor = closeIdx + closeTag.length;
  }

  const thinking = stripTrailingOpenTag(
    input,
    OPEN_REDACTED_THINKING_RE,
    REDACTED_THINKING_TAG,
  );
  if (thinking.hadOpenInternalMarkup) {
    return { text: thinking.text, hadOpenInternalMarkup: true };
  }

  const reminder = stripTrailingOpenTag(thinking.text, OPEN_SYSTEM_REMINDER_RE, "system-reminder");
  if (reminder.hadOpenInternalMarkup) {
    return { text: reminder.text, hadOpenInternalMarkup: true };
  }

  return { text: reminder.text, hadOpenInternalMarkup: false };
}

/** Combined display sanitizer for assistant prose (history + live stream). */
export function sanitizeAssistantProseForDisplay(
  input: string,
  options: { streaming?: boolean } = {},
): string {
  const closed = stripInternalOpenDesignMarkup(input);
  if (!options.streaming) return closed;
  return stripTrailingOpenInternalMarkup(closed).text;
}
