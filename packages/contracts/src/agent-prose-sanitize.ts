/**
 * SSOT for stripping model-emitted internal agent markup from user-visible prose.
 *
 * Consumed by:
 * - apps/web (display, persist, SSE reattach)
 * - apps/daemon (BYOK delta guard, claude-stream text_delta)
 *
 * When adding a new leak pattern, update `LEAKED_AGENT_PROSE_TAG_NAMES` and the
 * fixture matrix in `packages/contracts/tests/agent-prose-sanitize.test.ts`.
 */

export const LEAKED_AGENT_PROSE_TAG_NAMES = [
  "function_calls",
  "invoke",
  "parameter",
  "function_results",
  "function_result",
  "todo-list",
  "tool-call",
  "tool_call",
  "tool_result",
  "function_call",
  "info",
  "thinking",
  "think",
  "system-reminder",
  "redacted_thinking",
  "scratchpad",
  "reflection",
  "internal",
  "chain_of_thought",
  "chain-of-thought",
  "reasoning",
  "plan",
  "action",
] as const;

const CLOSED_OD_TAG_RE = /<(od[A-Za-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi;
const OPEN_OD_TAG_RE = /<(od[A-Za-z][\w-]*)\b[^>]*>/i;

const REDACTED_THINKING_TAG = "redacted_thinking";

const CLOSED_REDACTED_THINKING_RE = new RegExp(
  `<${REDACTED_THINKING_TAG}[^>]*>[\\s\\S]*?</${REDACTED_THINKING_TAG}>`,
  "gi",
);
const OPEN_REDACTED_THINKING_RE = new RegExp(`<${REDACTED_THINKING_TAG}[^>]*>`, "i");

const CLOSED_THINKING_RE = /<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi;
const OPEN_THINKING_RE = /<thinking\b[^>]*>/i;
const CLOSED_THINK_RE = /<think\b[^>]*>[\s\S]*?<\/think>/gi;
const OPEN_THINK_RE = /<think\b[^>]*>/i;

const CLOSED_SYSTEM_REMINDER_RE = /<system-reminder\b[^>]*>[\s\S]*?<\/system-reminder>/gi;
const OPEN_SYSTEM_REMINDER_RE = /<system-reminder\b[^>]*>/i;

const CLOSED_INFO_RE = /<info\b[^>]*>[\s\S]*?<\/info>/gi;
const OPEN_INFO_RE = /<info\b[^>]*>/i;

const CLOSED_FUNCTION_CALLS_RE = /<function_calls\b[^>]*>[\s\S]*?<\/function_calls>/gi;
const OPEN_FUNCTION_CALLS_RE = /<function_calls\b[^>]*>/i;
const CLOSED_INVOKE_RE = /<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi;
const OPEN_INVOKE_RE = /<invoke\b[^>]*>/i;
const CLOSED_PARAMETER_RE = /<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi;
const OPEN_PARAMETER_RE = /<parameter\b[^>]*>/i;
const CLOSED_FUNCTION_RESULTS_RE = /<function_results\b[^>]*>[\s\S]*?<\/function_results>/gi;
const CLOSED_FUNCTION_RESULT_RE = /<function_result\b[^>]*>[\s\S]*?<\/function_result>/gi;
const OPEN_FUNCTION_RESULT_RE = /<function_result\b[^>]*>/i;
const CLOSED_TODO_LIST_RE = /<todo-list\b[^>]*>[\s\S]*?<\/todo-list>/gi;
const OPEN_TODO_LIST_RE = /<todo-list\b[^>]*>/i;
const CLOSED_TOOL_CALL_RE = /<tool-call\b[^>]*>[\s\S]*?<\/tool-call>/gi;
const OPEN_TOOL_CALL_RE = /<tool-call\b[^>]*>/i;
const CLOSED_TOOL_CALL_UNDERSCORE_RE = /<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi;
const OPEN_TOOL_CALL_UNDERSCORE_RE = /<tool_call\b[^>]*>/i;
const CLOSED_TOOL_RESULT_UNDERSCORE_RE = /<tool_result\b[^>]*>[\s\S]*?<\/tool_result>/gi;
const OPEN_TOOL_RESULT_UNDERSCORE_RE = /<tool_result\b[^>]*>/i;
const CLOSED_FUNCTION_CALL_RE = /<function_call\b[^>]*>[\s\S]*?<\/function_call>/gi;
const OPEN_FUNCTION_CALL_RE = /<function_call\b[^>]*>/i;
const CLOSED_ANTML_RE = /<antml:[^>]+>[\s\S]*?<\/antml:[^>]+>/gi;

const CLOSED_SCRATCHPAD_RE = /<scratchpad\b[^>]*>[\s\S]*?<\/scratchpad>/gi;
const OPEN_SCRATCHPAD_RE = /<scratchpad\b[^>]*>/i;
const CLOSED_REFLECTION_RE = /<reflection\b[^>]*>[\s\S]*?<\/reflection>/gi;
const OPEN_REFLECTION_RE = /<reflection\b[^>]*>/i;
const CLOSED_INTERNAL_RE = /<internal\b[^>]*>[\s\S]*?<\/internal>/gi;
const OPEN_INTERNAL_RE = /<internal\b[^>]*>/i;
const CLOSED_CHAIN_OF_THOUGHT_UNDERSCORE_RE =
  /<chain_of_thought\b[^>]*>[\s\S]*?<\/chain_of_thought>/gi;
const OPEN_CHAIN_OF_THOUGHT_UNDERSCORE_RE = /<chain_of_thought\b[^>]*>/i;
const CLOSED_CHAIN_OF_THOUGHT_HYPHEN_RE =
  /<chain-of-thought\b[^>]*>[\s\S]*?<\/chain-of-thought>/gi;
const OPEN_CHAIN_OF_THOUGHT_HYPHEN_RE = /<chain-of-thought\b[^>]*>/i;
const CLOSED_REASONING_RE = /<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi;
const OPEN_REASONING_RE = /<reasoning\b[^>]*>/i;
const CLOSED_PLAN_RE = /<plan\b[^>]*>[\s\S]*?<\/plan>/gi;
const OPEN_PLAN_RE = /<plan\b[^>]*>/i;
const CLOSED_ACTION_RE = /<action\b[^>]*>[\s\S]*?<\/action>/gi;
const OPEN_ACTION_RE = /<action\b[^>]*>/i;

const CLOSED_MARKDOWN_TOOL_FENCE_RE = /```(?:tool_call|tool)\s*\n[\s\S]*?```/gi;
const OPEN_MARKDOWN_TOOL_FENCE_RE = /```(?:tool_call|tool)\s*\n/i;

const KNOWN_TOOL_JSON_NAMES =
  "TodoWrite|TodoUpdate|Read|Write|Edit|Bash|WebFetch|WebSearch|Grep|Glob|Task|Shell|write_todos|TaskCreate|TaskUpdate|ApplyPatch|MultiEdit|NotebookEdit";

const FAKE_TOOL_NARRATION_RE = new RegExp(
  `\\[(?:正在调用|calling|invoking)\\s+(?:${KNOWN_TOOL_JSON_NAMES})[^\\]]*\\]`,
  "gi",
);

const FAKE_FILE_READ_NARRATION_RE = /\[(?:读取|Reading|reading)\s+[^\]]{1,240}\]/gi;

const AGENT_RUNTIME_STATUS_LINE_RE =
  /^\s*(?:TodoWrite called with \d+ tasks|Marking task \d+ as (?:in_progress|completed|pending|cancelled|stopped)|Running tool: \w+|Tool (?:completed|failed): \w+)\s*$/gim;

const BARE_TOOL_JSON_OPEN_RE = new RegExp(
  `\\{"name"\\s*:\\s*"(?:${KNOWN_TOOL_JSON_NAMES})"\\s*,\\s*"arguments"\\s*:`,
  "g",
);

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

function stripTrailingOpenMarkdownToolFence(
  input: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  const match = OPEN_MARKDOWN_TOOL_FENCE_RE.exec(input);
  if (!match || match.index === undefined) {
    return { text: input, hadOpenInternalMarkup: false };
  }
  const openStart = match.index;
  const afterOpen = input.slice(openStart + match[0].length);
  const closeIdx = afterOpen.indexOf("```");
  if (closeIdx === -1) {
    return { text: input.slice(0, openStart).trimEnd(), hadOpenInternalMarkup: true };
  }
  return { text: input, hadOpenInternalMarkup: false };
}

function stripTrailingBareToolJson(
  input: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  let lastIdx = -1;
  let match: RegExpExecArray | null;
  const re = new RegExp(BARE_TOOL_JSON_OPEN_RE.source, "g");
  while ((match = re.exec(input)) !== null) {
    lastIdx = match.index;
  }
  if (lastIdx < 0) return { text: input, hadOpenInternalMarkup: false };
  return { text: input.slice(0, lastIdx).trimEnd(), hadOpenInternalMarkup: true };
}

function collapseExtraBlankLines(input: string): string {
  return input.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
}

/** Single-pass sanitizer for known leaked agent / pseudo-tool markup in assistant prose. */
export function sanitizeLeakedAgentProse(input: string): string {
  if (!input) return input;
  let out = input;
  out = out.replace(CLOSED_FUNCTION_CALLS_RE, "");
  out = out.replace(CLOSED_INVOKE_RE, "");
  out = out.replace(CLOSED_PARAMETER_RE, "");
  out = out.replace(CLOSED_FUNCTION_RESULTS_RE, "");
  out = out.replace(CLOSED_FUNCTION_RESULT_RE, "");
  out = out.replace(CLOSED_TODO_LIST_RE, "");
  out = out.replace(CLOSED_TOOL_CALL_RE, "");
  out = out.replace(CLOSED_TOOL_CALL_UNDERSCORE_RE, "");
  out = out.replace(CLOSED_TOOL_RESULT_UNDERSCORE_RE, "");
  out = out.replace(CLOSED_FUNCTION_CALL_RE, "");
  out = out.replace(CLOSED_ANTML_RE, "");
  out = out.replace(CLOSED_MARKDOWN_TOOL_FENCE_RE, "");
  out = out.replace(CLOSED_INFO_RE, "");
  out = out.replace(CLOSED_OD_TAG_RE, "");
  out = out.replace(CLOSED_REDACTED_THINKING_RE, "");
  out = out.replace(CLOSED_THINKING_RE, "");
  out = out.replace(CLOSED_THINK_RE, "");
  out = out.replace(CLOSED_SYSTEM_REMINDER_RE, "");
  out = out.replace(CLOSED_SCRATCHPAD_RE, "");
  out = out.replace(CLOSED_REFLECTION_RE, "");
  out = out.replace(CLOSED_INTERNAL_RE, "");
  out = out.replace(CLOSED_CHAIN_OF_THOUGHT_UNDERSCORE_RE, "");
  out = out.replace(CLOSED_CHAIN_OF_THOUGHT_HYPHEN_RE, "");
  out = out.replace(CLOSED_REASONING_RE, "");
  out = out.replace(CLOSED_PLAN_RE, "");
  out = out.replace(CLOSED_ACTION_RE, "");
  out = out.replace(FAKE_TOOL_NARRATION_RE, "");
  out = out.replace(FAKE_FILE_READ_NARRATION_RE, "");
  out = out.replace(AGENT_RUNTIME_STATUS_LINE_RE, "");
  const bareTail = out.match(new RegExp(`${BARE_TOOL_JSON_OPEN_RE.source}[\\s\\S]*$`));
  if (bareTail?.index !== undefined) {
    out = out.slice(0, bareTail.index).trimEnd();
  }
  return collapseExtraBlankLines(out);
}

/** While streaming or loading history, drop trailing unclosed internal blocks. */
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
    { re: OPEN_FUNCTION_RESULT_RE, name: "function_result" },
    { re: OPEN_TODO_LIST_RE, name: "todo-list" },
    { re: OPEN_TOOL_CALL_RE, name: "tool-call" },
    { re: OPEN_TOOL_CALL_UNDERSCORE_RE, name: "tool_call" },
    { re: OPEN_TOOL_RESULT_UNDERSCORE_RE, name: "tool_result" },
    { re: OPEN_FUNCTION_CALL_RE, name: "function_call" },
    { re: OPEN_SCRATCHPAD_RE, name: "scratchpad" },
    { re: OPEN_REFLECTION_RE, name: "reflection" },
    { re: OPEN_INTERNAL_RE, name: "internal" },
    { re: OPEN_CHAIN_OF_THOUGHT_UNDERSCORE_RE, name: "chain_of_thought" },
    { re: OPEN_CHAIN_OF_THOUGHT_HYPHEN_RE, name: "chain-of-thought" },
    { re: OPEN_REASONING_RE, name: "reasoning" },
    { re: OPEN_PLAN_RE, name: "plan" },
    { re: OPEN_ACTION_RE, name: "action" },
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

  const markdownFence = stripTrailingOpenMarkdownToolFence(text);
  if (markdownFence.hadOpenInternalMarkup) {
    return markdownFence;
  }
  text = markdownFence.text;

  const bareJson = stripTrailingBareToolJson(text);
  if (bareJson.hadOpenInternalMarkup) {
    return bareJson;
  }

  return { text: bareJson.text, hadOpenInternalMarkup: false };
}

/** Combined display sanitizer for assistant prose (history + live stream). */
export function sanitizeAssistantProseForDisplay(
  input: string,
  _options: { streaming?: boolean } = {},
): string {
  const closed = sanitizeLeakedAgentProse(input);
  return stripTrailingOpenInternalMarkup(closed).text;
}
