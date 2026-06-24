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

/** Qwen / DeepSeek-style thinking blocks leaked into the text channel. */
const CLOSED_THINKING_RE = /<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi;
const OPEN_THINKING_RE = /<thinking\b[^>]*>/i;
const CLOSED_THINK_RE = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
const OPEN_THINK_RE = /<think\b[^>]*>/i;

/** Cursor / agent system reminders echoed into assistant prose. */
const CLOSED_SYSTEM_REMINDER_RE = /<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi;
const OPEN_SYSTEM_REMINDER_RE = /<system-reminder\b[^>]*>/i;

/** Agent runtime tool-status narration (TodoWrite progress) leaked into stdout prose. */
const CLOSED_INFO_RE = /<info\b[^>]*>[\s\S]*?<\/info>/gi;
const OPEN_INFO_RE = /<info\b[^>]*>/i;

/** CLI / API pseudo-tool XML leaked into assistant text instead of structured tool_use. */
const CLOSED_FUNCTION_CALLS_RE = /<function_calls\b[^>]*>[\s\S]*?<\/function_calls>/gi;
const OPEN_FUNCTION_CALLS_RE = /<function_calls\b[^>]*>/i;
const CLOSED_INVOKE_RE = /<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi;
const OPEN_INVOKE_RE = /<invoke\b[^>]*>/i;
const CLOSED_PARAMETER_RE = /<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi;
const OPEN_PARAMETER_RE = /<parameter\b[^>]*>/i;
const CLOSED_FUNCTION_RESULTS_RE = /<function_results\b[^>]*>[\s\S]*?<\/function_results>/gi;
const CLOSED_TODO_LIST_RE = /<todo-list\b[^>]*>[\s\S]*?<\/todo-list>/gi;
const OPEN_TODO_LIST_RE = /<todo-list\b[^>]*>/i;
const CLOSED_TOOL_CALL_RE = /<tool-call\b[^>]*>[\s\S]*?<\/tool-call>/gi;
const OPEN_TOOL_CALL_RE = /<tool-call\b[^>]*>/i;
const CLOSED_ANTML_RE = /<antml:[^>]+>[\s\S]*?<\/antml:[^>]+>/gi;

/** Narrated tool calls some models emit when tools are unavailable or ignored. */
const FAKE_TOOL_NARRATION_RE =
  /\[(?:正在调用|calling|invoking)\s+(?:TodoWrite|Read|Write|Edit|Bash|WebFetch|WebSearch|Grep|Glob|Task|Shell|write_todos|TaskCreate|TaskUpdate)[^\]]*\]/gi;

/** Fake file-read protocol prose observed in #313 (`[读取 template.html …]`). */
const FAKE_FILE_READ_NARRATION_RE = /\[(?:读取|Reading|reading)\s+[^\]]{1,240}\]/gi;

/** Plain-text agent runtime status lines (often wrapped in `<info>` but sometimes bare). */
const AGENT_RUNTIME_STATUS_LINE_RE =
  /^\s*(?:TodoWrite called with \d+ tasks|Marking task \d+ as (?:in_progress|completed|pending|cancelled|stopped)|Running tool: \w+|Tool (?:completed|failed): \w+)\s*$/gim;

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

function collapseExtraBlankLines(input: string): string {
  return input.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
}

/**
 * Single-pass sanitizer for all known leaked agent / pseudo-tool markup in
 * assistant prose. Used by stream handlers, persistence, and display.
 */
export function sanitizeLeakedAgentProse(input: string): string {
  if (!input) return input;
  let out = input;
  out = out.replace(CLOSED_FUNCTION_CALLS_RE, "");
  out = out.replace(CLOSED_INVOKE_RE, "");
  out = out.replace(CLOSED_PARAMETER_RE, "");
  out = out.replace(CLOSED_FUNCTION_RESULTS_RE, "");
  out = out.replace(CLOSED_TODO_LIST_RE, "");
  out = out.replace(CLOSED_TOOL_CALL_RE, "");
  out = out.replace(CLOSED_ANTML_RE, "");
  out = out.replace(CLOSED_INFO_RE, "");
  out = out.replace(CLOSED_OD_TAG_RE, "");
  out = out.replace(CLOSED_REDACTED_THINKING_RE, "");
  out = out.replace(CLOSED_THINKING_RE, "");
  out = out.replace(CLOSED_THINK_RE, "");
  out = out.replace(CLOSED_SYSTEM_REMINDER_RE, "");
  out = out.replace(FAKE_TOOL_NARRATION_RE, "");
  out = out.replace(FAKE_FILE_READ_NARRATION_RE, "");
  out = out.replace(AGENT_RUNTIME_STATUS_LINE_RE, "");
  return collapseExtraBlankLines(out);
}

/** Remove completed internal markup blocks and fake tool narration from prose. */
export function stripInternalOpenDesignMarkup(input: string): string {
  return sanitizeLeakedAgentProse(input);
}

/**
 * While streaming, drop a trailing unclosed internal block so users never see
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

  const openTagChain: Array<{ re: RegExp; name: string }> = [
    { re: OPEN_FUNCTION_CALLS_RE, name: "function_calls" },
    { re: OPEN_INVOKE_RE, name: "invoke" },
    { re: OPEN_PARAMETER_RE, name: "parameter" },
    { re: OPEN_TODO_LIST_RE, name: "todo-list" },
    { re: OPEN_TOOL_CALL_RE, name: "tool-call" },
    { re: OPEN_THINKING_RE, name: "thinking" },
    { re: OPEN_THINK_RE, name: "think" },
    { re: OPEN_SYSTEM_REMINDER_RE, name: "system-reminder" },
    { re: OPEN_INFO_RE, name: "info" },
  ];
  let text = thinking.text;
  for (const { re, name } of openTagChain) {
    const next = stripTrailingOpenTag(text, re, name);
    if (next.hadOpenInternalMarkup) {
      return { text: next.text, hadOpenInternalMarkup: true };
    }
    text = next.text;
  }

  return { text, hadOpenInternalMarkup: false };
}

/** Combined display sanitizer for assistant prose (history + live stream). */
export function sanitizeAssistantProseForDisplay(
  input: string,
  options: { streaming?: boolean } = {},
): string {
  const closed = sanitizeLeakedAgentProse(input);
  if (!options.streaming) return closed;
  return stripTrailingOpenInternalMarkup(closed).text;
}
