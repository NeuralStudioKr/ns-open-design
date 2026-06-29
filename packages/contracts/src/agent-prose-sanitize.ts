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

/** Pseudo-tool XML the model narrates when CLI tools are unavailable. Strip outer tags first. */
const PSEUDO_TOOL_TAG_NAMES = [
  "tool",
  "tools",
  "tool_calls",
  "tool-results",
  "tool_results",
  "tool-use",
  "tool_use",
  "function_calls",
  "invoke",
  "parameter",
  "parameters",
  "arguments",
  "args",
  "function_results",
  "function_result",
  "function",
  "todo",
  "todos",
  "todo_write",
  "todo_update",
  "todo-list",
  "todo_list",
  "task_list",
  "tool-call",
  "tool_call",
  "tool_result",
  "function_call",
  "result",
  "results",
  "info",
] as const;

/** Internal planning / reflection tags — safe to strip in any order (no nesting deps). */
const INTERNAL_PLANNING_TAG_NAMES = [
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
  "answer_operator",
  "task_analysis",
  "workflow",
  "workflow_plan",
  "execution_plan",
  "planning",
  "observation",
  "hidden",
  "private",
  "meta",
  "notes",
  "note",
  "analysis",
  "thought",
  "thoughts",
  "draft",
  "instructions",
] as const;

export const LEAKED_AGENT_PROSE_TAG_NAMES = [
  ...PSEUDO_TOOL_TAG_NAMES,
  ...INTERNAL_PLANNING_TAG_NAMES,
] as const;

const CLOSED_OD_TAG_RE = /<(od[A-Za-z][\w-]*)\b[^>]*>[\s\S]*?<\/\1>/gi;
const OPEN_OD_TAG_RE = /<(od[A-Za-z][\w-]*)\b[^>]*>/i;

/** Dynamic families: `<foo_operator>`, `<bar_analysis>` without listing every variant. */
const CLOSED_SUFFIX_OPERATOR_RE = /<([a-z][a-z0-9_]*_operator)\b[^>]*>[\s\S]*?<\/\1>/gi;
const OPEN_SUFFIX_OPERATOR_RE = /<([a-z][a-z0-9_]*_operator)\b[^>]*>/gi;
const CLOSED_SUFFIX_ANALYSIS_RE = /<([a-z][a-z0-9_]*_analysis)\b[^>]*>[\s\S]*?<\/\1>/gi;
const OPEN_SUFFIX_ANALYSIS_RE = /<([a-z][a-z0-9_]*_analysis)\b[^>]*>/gi;
const INTERNAL_MARKUP_NAME_PART_RE =
  "(?:[a-z][a-z0-9_-]*[-_])?(?:thinking|thought|reasoning|analysis|scratchpad|reflection|todo|tool|function|operator|workflow|plan)[a-z0-9_-]*";
const CLOSED_INTERNAL_MARKUP_FAMILY_RE = new RegExp(
  `<(${INTERNAL_MARKUP_NAME_PART_RE})\\b[^>]*>[\\s\\S]*?</\\1>`,
  "gi",
);
const OPEN_INTERNAL_MARKUP_FAMILY_RE = new RegExp(
  `<(${INTERNAL_MARKUP_NAME_PART_RE})\\b[^>]*>`,
  "gi",
);

const CLOSED_ANTML_RE = /<antml:[^>]+>[\s\S]*?<\/antml:[^>]+>/gi;

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

const closedTagRes = new Map<string, RegExp>();
const openTagRes = new Map<string, RegExp>();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function closedTagRe(tagName: string): RegExp {
  let re = closedTagRes.get(tagName);
  if (!re) {
    re = new RegExp(
      `<${escapeRegExp(tagName)}\\b[^>]*>[\\s\\S]*?</${escapeRegExp(tagName)}>`,
      "gi",
    );
    closedTagRes.set(tagName, re);
  }
  return re;
}

function openTagRe(tagName: string): RegExp {
  let re = openTagRes.get(tagName);
  if (!re) {
    re = new RegExp(`<${escapeRegExp(tagName)}\\b[^>]*>`, "i");
    openTagRes.set(tagName, re);
  }
  return re;
}

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
  openTagReSource: RegExp,
  tagName: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  let cursor = 0;
  while (cursor < input.length) {
    const slice = input.slice(cursor);
    const match = openTagReSource.exec(slice);
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

function stripTrailingOpenDynamicTag(
  input: string,
  openTagPattern: RegExp,
): { text: string; hadOpenInternalMarkup: boolean } {
  let last: { index: number; tagName: string; openEnd: number } | null = null;
  const re = new RegExp(openTagPattern.source, openTagPattern.flags.includes("g") ? openTagPattern.flags : `${openTagPattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    last = {
      index: match.index,
      tagName: match[1] ?? "",
      openEnd: match.index + match[0].length,
    };
  }
  if (!last || !last.tagName) {
    return { text: input, hadOpenInternalMarkup: false };
  }
  const closeIdx = findCloseTag(input, last.openEnd, `</${last.tagName}>`);
  if (closeIdx === -1) {
    return { text: input.slice(0, last.index).trimEnd(), hadOpenInternalMarkup: true };
  }
  return { text: input, hadOpenInternalMarkup: false };
}

function stripTrailingOpenMarkdownToolFence(
  input: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  OPEN_MARKDOWN_TOOL_FENCE_RE.lastIndex = 0;
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

function stripClosedTagFamilies(input: string, tagNames: readonly string[]): string {
  let out = input;
  for (const tagName of tagNames) {
    const re = closedTagRe(tagName);
    // Cached /g regexes retain lastIndex — reset so back-to-back passes stay deterministic.
    re.lastIndex = 0;
    out = out.replace(re, "");
  }
  return out;
}

/** Single-pass sanitizer for known leaked agent / pseudo-tool markup in assistant prose. */
export function sanitizeLeakedAgentProse(input: string): string {
  if (!input) return input;
  let out = input;
  out = stripClosedTagFamilies(out, PSEUDO_TOOL_TAG_NAMES);
  out = out.replace(CLOSED_ANTML_RE, "");
  out = out.replace(CLOSED_MARKDOWN_TOOL_FENCE_RE, "");
  out = out.replace(CLOSED_OD_TAG_RE, "");
  out = stripClosedTagFamilies(out, INTERNAL_PLANNING_TAG_NAMES);
  out = out.replace(CLOSED_INTERNAL_MARKUP_FAMILY_RE, "");
  out = out.replace(CLOSED_SUFFIX_OPERATOR_RE, "");
  out = out.replace(CLOSED_SUFFIX_ANALYSIS_RE, "");
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

  const openTagChain: Array<{ re: RegExp; name: string }> = [
    ...PSEUDO_TOOL_TAG_NAMES.map((name) => ({ re: openTagRe(name), name })),
    ...INTERNAL_PLANNING_TAG_NAMES.map((name) => ({ re: openTagRe(name), name })),
  ];

  let text = input;
  for (const { re, name } of openTagChain) {
    const next = stripTrailingOpenTag(text, re, name);
    if (next.hadOpenInternalMarkup) {
      return { text: next.text, hadOpenInternalMarkup: true };
    }
    text = next.text;
  }

  for (const suffixRe of [OPEN_SUFFIX_OPERATOR_RE, OPEN_SUFFIX_ANALYSIS_RE]) {
    const next = stripTrailingOpenDynamicTag(text, suffixRe);
    if (next.hadOpenInternalMarkup) {
      return next;
    }
    text = next.text;
  }

  const internalFamily = stripTrailingOpenDynamicTag(text, OPEN_INTERNAL_MARKUP_FAMILY_RE);
  if (internalFamily.hadOpenInternalMarkup) {
    return internalFamily;
  }
  text = internalFamily.text;

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
