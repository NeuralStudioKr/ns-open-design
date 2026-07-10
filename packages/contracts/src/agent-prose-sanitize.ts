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

/** Pseudo file-operation XML emitted when CLI tools (Read/Write/Edit) are unavailable. */
const FILE_OPERATION_PSEUDO_TOOL_TAG_NAMES = [
  "read",
  "edit",
  "write",
  "search_replace",
  "apply_patch",
  "patch",
  "delete",
  "path",
  "diff",
] as const;

/** Pseudo-tool XML the model narrates when CLI tools are unavailable. Strip outer tags first. */
const PSEUDO_TOOL_TAG_NAMES = [
  ...FILE_OPERATION_PSEUDO_TOOL_TAG_NAMES,
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
const INTERNAL_MARKUP_KEYWORDS =
  "thinking|thought|reasoning|analysis|scratchpad|reflection|todo|task|tool|function|operator|workflow|plan|planning|internal|hidden|private|meta|note|instruction|trace";
const INTERNAL_MARKUP_NAME_PART_RE =
  `(?:[a-z][a-z0-9_-]*[-_])?(?:${INTERNAL_MARKUP_KEYWORDS})[a-z0-9_-]*`;
const CLOSED_INTERNAL_MARKUP_FAMILY_RE = new RegExp(
  `<(${INTERNAL_MARKUP_NAME_PART_RE})\\b[^>]*>[\\s\\S]*?</\\1>`,
  "gi",
);
const OPEN_INTERNAL_MARKUP_FAMILY_RE = new RegExp(
  `<(${INTERNAL_MARKUP_NAME_PART_RE})\\b[^>]*>`,
  "gi",
);
const ORPHAN_CLOSE_INTERNAL_MARKUP_FAMILY_RE = new RegExp(
  `</(${INTERNAL_MARKUP_NAME_PART_RE})\\s*>`,
  "gi",
);

const OPEN_ARTIFACT_TAG_RE = /<artifact\b[^>]*>/i;
const CLOSED_ARTIFACT_RE = /<artifact\b[^>]*>[\s\S]*?<\/artifact>/gi;

const CLOSED_ANTML_RE = /<antml:[^>]+>[\s\S]*?<\/antml:[^>]+>/gi;

function isLikelyInternalMarkupLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^<[a-zA-Z!?/]/.test(trimmed)) return true;
  if (/^<!doctype\b/i.test(trimmed)) return true;
  if (trimmed.includes("<<<<<<< SEARCH")) return true;
  return false;
}

/** Character index where trailing user-facing prose begins (inside an open artifact tail). */
function trailingDisplayProseStart(input: string, fromIndex: number): number {
  const tail = input.slice(fromIndex);
  const lines = tail.split("\n");
  let firstProseLine = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i]?.trim() ?? "";
    if (!trimmed) {
      if (firstProseLine !== -1) continue;
      continue;
    }
    if (isLikelyInternalMarkupLine(lines[i] ?? "")) break;
    firstProseLine = i;
  }
  if (firstProseLine === -1) return -1;
  let offset = fromIndex;
  for (let i = 0; i < firstProseLine; i += 1) {
    offset += (lines[i]?.length ?? 0) + 1;
  }
  return offset;
}

/** Strip an unclosed `<artifact …>` block; preserve trailing user-facing prose after the body. */
function stripTrailingOpenArtifact(
  input: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  OPEN_ARTIFACT_TAG_RE.lastIndex = 0;
  let lastOpen: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  const re = new RegExp(OPEN_ARTIFACT_TAG_RE.source, "gi");
  while ((match = re.exec(input)) !== null) {
    lastOpen = match;
  }
  if (!lastOpen || lastOpen.index === undefined) {
    return { text: input, hadOpenInternalMarkup: false };
  }
  const openStart = lastOpen.index;
  const openEnd = openStart + lastOpen[0].length;
  const closeIdx = findCloseTag(input, openEnd, "</artifact>");
  if (closeIdx !== -1) {
    return { text: input, hadOpenInternalMarkup: false };
  }
  const proseStart = trailingDisplayProseStart(input, openEnd);
  if (proseStart === -1) {
    return { text: input.slice(0, openStart).trimEnd(), hadOpenInternalMarkup: true };
  }
  const head = input.slice(0, openStart).trimEnd();
  const prose = input.slice(proseStart).trimStart();
  const merged = head.length > 0 && prose.length > 0 ? `${head}\n\n${prose}` : head + prose;
  return { text: merged.trim(), hadOpenInternalMarkup: true };
}

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

/**
 * Original deck-framework opener anchors — these only appear near the TOP of
 * a well-formed script. Keep this list narrow so the closed-form regex below
 * can safely use a loose `})` tail (agent-emitted close without `();`).
 */
const DECK_NAV_ORIGINAL_ANCHORS = [
  `document\\.getElementById\\(['"]deck-stage['"]\\)`,
  `document\\.getElementById\\(['"]deck-prev['"]\\)`,
  `document\\.getElementById\\(['"]deck-next['"]\\)`,
  `deck:idx:`,
].join("|");

/**
 * Additional body fingerprints unique to the deck framework. Used ONLY for
 * open-form detection (opener list) and for closed-form matching under a
 * STRICT `})();` close — otherwise greedy backtracking could stop at an
 * internal `});` (e.g. `focus({ preventScroll: true });`).
 */
const DECK_NAV_BODY_FINGERPRINTS = [
  `stage\\.style\\.transform\\s*=\\s*['"]translate\\(['"]?\\s*\\+\\s*tx\\s*\\+`,
  `function\\s+focusDeck\\s*\\(`,
  `document\\.addEventListener\\(['"]mousedown['"]\\s*,\\s*focusDeck\\s*\\)`,
  `window\\.addEventListener\\(['"]resize['"]\\s*,\\s*fit\\s*\\)`,
].join("|");

/** Loose IIFE close: bare `})` OR full `})();`. */
const DECK_IIFE_CLOSE_TAIL = `\\}\\s*\\)\\s*(?:\\(\\s*\\)\\s*)?;?`;

/** Strict IIFE close: full `})();` only. Prevents backtrack onto internal `});`. */
const DECK_IIFE_STRICT_CLOSE_TAIL = `\\}\\s*\\)\\s*\\(\\s*\\)\\s*;?`;

const LEAKED_DECK_NAV_SCRIPT_RE = new RegExp(
  `(?:^|\\n)\\s*(?:\\(\\s*)?function\\s*\\(\\)\\s*\\{(?=[\\s\\S]{0,4000}?(?:${DECK_NAV_ORIGINAL_ANCHORS}))[\\s\\S]{0,20000}${DECK_IIFE_CLOSE_TAIL}`,
  "gi",
);

const LEAKED_DECK_NAV_SCRIPT_BODY_RE = new RegExp(
  `(?:^|\\n)\\s*var\\s+stage\\s*=\\s*document\\.getElementById\\(['"]deck-stage['"]\\)[\\s\\S]{0,20000}${DECK_IIFE_CLOSE_TAIL}`,
  "gi",
);

const LEAKED_DECK_NAV_SCRIPT_PREV_BODY_RE = new RegExp(
  `(?:^|\\n)\\s*var\\s+prev\\s*=\\s*document\\.getElementById\\(['"]deck-prev['"]\\)[\\s\\S]{0,20000}${DECK_IIFE_CLOSE_TAIL}`,
  "gi",
);

const LEAKED_DECK_NAV_SCRIPT_TAIL_RE = new RegExp(
  `(?:^|\\n)\\s*var\\s+slides\\s*=\\s*Array\\.prototype\\.slice\\.call\\(document\\.querySelectorAll\\(['"]\\.slide['"]\\)\\);[\\s\\S]{0,20000}${DECK_IIFE_CLOSE_TAIL}`,
  "gi",
);

const LEAKED_DECK_NAV_SCRIPT_STORE_RE = new RegExp(
  `(?:^|\\n)\\s*var\\s+STORE\\s*=\\s*['"]deck:idx:[^'"]*['"][\\s\\S]{0,20000}${DECK_IIFE_CLOSE_TAIL}`,
  "gi",
);

/**
 * Mangled variant: model dropped every `var stage/prev/next/STORE/slides`
 * declaration and glued the body-only leak after a garbled IIFE opener
 * `(function () {location.pathname || '/');`. Anchors detection on any
 * deck-framework body fingerprint and REQUIRES the strict `})();` close
 * so greedy backtracking cannot stop at an internal `});`. When there is
 * no proper close, the open-form matcher chops from the mangled opener
 * or the earliest body fingerprint line all the way to end.
 */
const LEAKED_DECK_NAV_SCRIPT_MANGLED_IIFE_RE = new RegExp(
  `(?:^|\\n)\\s*(?:\\(\\s*)?function\\s*\\(\\s*\\)\\s*\\{(?=[\\s\\S]{0,4000}?(?:${DECK_NAV_BODY_FINGERPRINTS}))[\\s\\S]{0,20000}${DECK_IIFE_STRICT_CLOSE_TAIL}`,
  "gi",
);

const OPEN_DECK_NAV_SCRIPT_RE_LIST = [
  new RegExp(
    `(?:^|\\n)\\s*(?:\\(\\s*)?function\\s*\\(\\)\\s*\\{(?=[\\s\\S]{0,4000}?(?:${DECK_NAV_ORIGINAL_ANCHORS}|${DECK_NAV_BODY_FINGERPRINTS}))`,
    "i",
  ),
  /(?:^|\n)\s*var\s+stage\s*=\s*document\.getElementById\(['"]deck-stage['"]\)/i,
  /(?:^|\n)\s*var\s+prev\s*=\s*document\.getElementById\(['"]deck-prev['"]\)/i,
  /(?:^|\n)\s*var\s+next\s*=\s*document\.getElementById\(['"]deck-next['"]\)/i,
  /(?:^|\n)\s*var\s+cur\s*=\s*document\.getElementById\(['"]deck-cur['"]\)/i,
  /(?:^|\n)\s*var\s+STORE\s*=\s*['"]deck:idx:/i,
  /(?:^|\n)\s*var\s+slides\s*=\s*Array\.prototype\.slice\.call\(document\.querySelectorAll\(['"]\.slide['"]\)\);/i,
  /(?:^|\n)\s*var\s+total\s*=\s*document\.getElementById\(['"]deck-total['"]\)/i,
  /(?:^|\n)\s*(?:try\s*\{\s*)?var\s+saved\s*=\s*parseInt\(localStorage\.getItem\(STORE\)\s*\|\|\s*['"]0['"]\s*,\s*10\)/i,
  /(?:^|\n)\s*if\s*\(!isNaN\(saved\)\s*&&\s*saved\s*>=\s*0\s*&&\s*saved\s*<\s*slides\.length\)\s*idx\s*=\s*saved\s*;?/i,
  /(?:^|\n)\s*function\s+pad2\s*\(\s*n\s*\)\s*\{\s*return\s*\(n\s*<\s*10\s*\?/i,
  /(?:^|\n)\s*function\s+paint\s*\(\)\s*\{(?=[\s\S]{0,1200}?(?:slides\.forEach|deck-cur|deck-total|toggleAttribute))/i,
  /(?:^|\n)\s*slides\.forEach\(function\s*\(\s*el\s*,\s*i\s*\)\s*\{\s*el\.classList\.toggle\(['"]active['"]/i,
  /(?:^|\n)\s*if\s*\(\s*cur\s*\)\s*cur\.textContent\s*=\s*pad2\(idx\s*\+\s*1\)\s*;?/i,
  /(?:^|\n)\s*if\s*\(\s*total\s*\)\s*total\.textContent\s*=\s*pad2\(slides\.length\)\s*;?/i,
  /(?:^|\n)\s*if\s*\(\s*prev\s*\)\s*prev\.toggleAttribute\(['"]disabled['"]\s*,\s*idx\s*<=\s*0\)\s*;?/i,
  /(?:^|\n)\s*if\s*\(\s*next\s*\)\s*next\.toggleAttribute\(['"]disabled['"]\s*,\s*idx\s*>=\s*slides\.length\s*-\s*1\)\s*;?/i,
  /(?:^|\n)\s*function\s+go\s*\(\s*i\s*\)\s*\{(?=[\s\S]{0,1200}?(?:Math\.max|paint\(\)|localStorage\.setItem))/i,
  /(?:^|\n)\s*idx\s*=\s*Math\.max\(0,\s*Math\.min\(slides\.length\s*-\s*1,\s*i\)\)\s*;?/i,
  /(?:^|\n)\s*try\s*\{\s*localStorage\.setItem\(STORE,\s*String\(idx\)\)\s*;\s*\}\s*catch\s*\(_\)\s*\{\s*\}\s*;?/i,
  /(?:^|\n)\s*function\s+onKey\s*\(\s*e\s*\)\s*\{(?=[\s\S]{0,1600}?(?:ArrowRight|PageDown|PageUp|Home|End|go\(idx))/i,
  /(?:^|\n)\s*if\s*\(\s*e\.key\s*===\s*['"]ArrowRight['"]\s*\|\|\s*e\.key\s*===\s*['"]PageDown['"]/i,
  /(?:^|\n)\s*else\s+if\s*\(\s*e\.key\s*===\s*['"]ArrowLeft['"]\s*\|\|\s*e\.key\s*===\s*['"]PageUp['"]/i,
  /(?:^|\n)\s*else\s+if\s*\(\s*e\.key\s*===\s*['"]Home['"]\s*\)\s*\{\s*e\.preventDefault\(\)\s*;\s*go\(0\)/i,
  /(?:^|\n)\s*else\s+if\s*\(\s*e\.key\s*===\s*['"]End['"]\s*\)\s*\{\s*e\.preventDefault\(\)\s*;\s*go\(slides\.length\s*-\s*1\)/i,
  /(?:^|\n)\s*window\.addEventListener\(['"]keydown['"]\s*,\s*onKey\s*,\s*true\)\s*;?/i,
  /(?:^|\n)\s*document\.addEventListener\(['"]keydown['"]\s*,\s*onKey\s*,\s*true\)\s*;?/i,
  /(?:^|\n)\s*if\s*\(\s*prev\s*\)\s*prev\.addEventListener\(['"]click['"]\s*,\s*function\s*\(\s*\)\s*\{\s*go\(idx\s*-\s*1\)/i,
  /(?:^|\n)\s*if\s*\(\s*next\s*\)\s*next\.addEventListener\(['"]click['"]\s*,\s*function\s*\(\s*\)\s*\{\s*go\(idx\s*\+\s*1\)/i,
  /(?:^|\n)\s*document\.body\.setAttribute\(['"]tabindex['"]\s*,\s*['"]-1['"]\)\s*;?/i,
  /(?:^|\n)\s*document\.body\.style\.outline\s*=\s*['"]none['"]\s*;?/i,
  /(?:^|\n)\s*function\s+fit\s*\(\)\s*\{(?=[\s\S]{0,1200}?(?:stage\.style\.transform|window\.innerWidth|deck-stage))/i,
  /(?:^|\n)\s*\(\s*function\s*\(\s*\)\s*\{\s*location\.pathname/i,
  /(?:^|\n)\s*stage\.style\.transform\s*=\s*['"]translate\(['"]?\s*\+\s*tx\s*\+/i,
  /(?:^|\n)\s*function\s+focusDeck\s*\(\s*\)\s*\{\s*try\s*\{\s*window\.focus\(\)\s*;\s*document\.body\.focus\(/i,
  /(?:^|\n)\s*document\.addEventListener\(['"]mousedown['"]\s*,\s*focusDeck\s*\)/i,
  /(?:^|\n)\s*window\.addEventListener\(['"]load['"]\s*,\s*focusDeck\s*\)\s*;?/i,
  /(?:^|\n)\s*window\.addEventListener\(['"]resize['"]\s*,\s*fit\s*\)\s*;?/i,
  /(?:^|\n)\s*fit\(\)\s*;\s*paint\(\)\s*;\s*focusDeck\(\)\s*;?/i,
] as const;

const BARE_TOOL_JSON_OPEN_RE = new RegExp(
  `\\{"name"\\s*:\\s*"(?:${KNOWN_TOOL_JSON_NAMES})"\\s*,\\s*"arguments"\\s*:`,
  "g",
);

const closedTagRes = new Map<string, RegExp>();
const openTagRes = new Map<string, RegExp>();
const orphanCloseTagRes = new Map<string, RegExp>();

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

function orphanCloseTagRe(tagName: string): RegExp {
  let re = orphanCloseTagRes.get(tagName);
  if (!re) {
    re = new RegExp(`</${escapeRegExp(tagName)}\\s*>`, "gi");
    orphanCloseTagRes.set(tagName, re);
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
  const flags = openTagPattern.flags.includes("g")
    ? openTagPattern.flags
    : `${openTagPattern.flags}g`;
  const re = new RegExp(openTagPattern.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    const tagName = match[1] ?? "";
    if (!tagName) continue;
    const openEnd = match.index + match[0].length;
    const closeIdx = findCloseTag(input, openEnd, `</${tagName}>`);
    if (closeIdx === -1) {
      return { text: input.slice(0, match.index).trimEnd(), hadOpenInternalMarkup: true };
    }
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

function findOpenDeckNavScriptStart(input: string): number {
  let best = -1;
  for (const pattern of OPEN_DECK_NAV_SCRIPT_RE_LIST) {
    pattern.lastIndex = 0;
    const match = pattern.exec(input);
    if (!match || match.index === undefined) continue;
    const rawStart = match.index;
    const matchText = match[0] ?? "";
    const trimmedStart = rawStart + matchText.search(/\S/);
    const start = trimmedStart >= rawStart ? trimmedStart : rawStart;
    if (best === -1 || start < best) best = start;
  }
  return best;
}

function stripTrailingOpenDeckNavScript(
  input: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  const start = findOpenDeckNavScriptStart(input);
  if (start === -1) return { text: input, hadOpenInternalMarkup: false };
  return { text: input.slice(0, start).trimEnd(), hadOpenInternalMarkup: true };
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

function stripOrphanCloseTagFamilies(input: string, tagNames: readonly string[]): string {
  let out = input;
  for (const tagName of tagNames) {
    const re = orphanCloseTagRe(tagName);
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
  out = out.replace(CLOSED_ARTIFACT_RE, "");
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
  out = out.replace(LEAKED_DECK_NAV_SCRIPT_RE, "");
  out = out.replace(LEAKED_DECK_NAV_SCRIPT_BODY_RE, "");
  out = out.replace(LEAKED_DECK_NAV_SCRIPT_PREV_BODY_RE, "");
  out = out.replace(LEAKED_DECK_NAV_SCRIPT_TAIL_RE, "");
  out = out.replace(LEAKED_DECK_NAV_SCRIPT_STORE_RE, "");
  out = out.replace(LEAKED_DECK_NAV_SCRIPT_MANGLED_IIFE_RE, "");
  out = stripOrphanCloseTagFamilies(out, LEAKED_AGENT_PROSE_TAG_NAMES);
  out = out.replace(ORPHAN_CLOSE_INTERNAL_MARKUP_FAMILY_RE, "");
  const bareTail = out.match(new RegExp(`${BARE_TOOL_JSON_OPEN_RE.source}[\\s\\S]*$`));
  if (bareTail?.index !== undefined) {
    out = out.slice(0, bareTail.index).trimEnd();
  }
  return collapseExtraBlankLines(out);
}

/** While streaming or loading history, drop trailing unclosed internal blocks. */
export function stripTrailingOpenInternalMarkup(
  input: string,
  options: { preserveOpenArtifact?: boolean } = {},
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
  let hadOpenInternalMarkup = false;
  for (const { re, name } of openTagChain) {
    const next = stripTrailingOpenTag(text, re, name);
    if (next.hadOpenInternalMarkup) {
      hadOpenInternalMarkup = true;
      text = next.text;
    }
  }

  for (const suffixRe of [OPEN_SUFFIX_OPERATOR_RE, OPEN_SUFFIX_ANALYSIS_RE]) {
    const next = stripTrailingOpenDynamicTag(text, suffixRe);
    if (next.hadOpenInternalMarkup) {
      hadOpenInternalMarkup = true;
      text = next.text;
    }
  }

  const internalFamily = stripTrailingOpenDynamicTag(text, OPEN_INTERNAL_MARKUP_FAMILY_RE);
  if (internalFamily.hadOpenInternalMarkup) {
    hadOpenInternalMarkup = true;
    text = internalFamily.text;
  }

  const markdownFence = stripTrailingOpenMarkdownToolFence(text);
  if (markdownFence.hadOpenInternalMarkup) {
    hadOpenInternalMarkup = true;
    text = markdownFence.text;
  }

  const bareJson = stripTrailingBareToolJson(text);
  if (bareJson.hadOpenInternalMarkup) {
    hadOpenInternalMarkup = true;
    text = bareJson.text;
  }

  const deckScript = stripTrailingOpenDeckNavScript(text);
  if (deckScript.hadOpenInternalMarkup) {
    hadOpenInternalMarkup = true;
    text = deckScript.text;
  }

  if (!options.preserveOpenArtifact) {
    const openArtifact = stripTrailingOpenArtifact(text);
    if (openArtifact.hadOpenInternalMarkup) {
      hadOpenInternalMarkup = true;
      text = openArtifact.text;
    }
  }

  return { text, hadOpenInternalMarkup };
}

/** Combined display sanitizer for assistant prose (history + live stream). */
export function sanitizeAssistantProseForDisplay(
  input: string,
  options: { streaming?: boolean } = {},
): string {
  const closed = sanitizeLeakedAgentProse(input);
  return stripTrailingOpenInternalMarkup(closed, {
    preserveOpenArtifact: options.streaming ?? false,
  }).text;
}
