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

import {
  ARTIFACT_LEAKED_EXTERNAL_SCRIPT_TAG_RE,
  ARTIFACT_LEAKED_HEAD_LINK_TAG_RE,
  ARTIFACT_LEAKED_META_CHARSET_TAG_RE,
  ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE,
  ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE,
  ARTIFACT_ORPHAN_LINK_ATTR_LEAK_RE,
  ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE,
  ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE,
  ARTIFACT_VIEWPORT_TEXT_LEAK_RE,
} from "./html/artifactPreviewTextLeaks.js";
import {
  ARTIFACT_CDN_HOSTS,
  ARTIFACT_CDN_HOST_STEMS,
  artifactCdnImportUrlTokenAlternation,
  artifactBareCdnHostLineSource,
  artifactCdnHostAlternation,
  artifactCdnHeuristicTokenAlternation,
} from "./html/artifactCdnHosts.js";

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
  "multi_edit",
  "notebook_edit",
  "create_file",
  "delete_file",
  "list_dir",
  "grep",
  "glob",
  "bash",
  "shell",
  "run_terminal_cmd",
  "run_terminal",
  "execute",
  "browser",
  "web_search",
  "web_fetch",
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
  "tool-call",
  "tool_call",
  "tool_call_chunk",
  "tool_result",
  "tool_request",
  "tool_response",
  "toolrequest",
  "toolresponse",
  "function_calls",
  "function_call",
  "function_results",
  "function_result",
  "function",
  "invoke",
  "parameter",
  "parameters",
  "arguments",
  "args",
  "todo",
  "todos",
  "todo_write",
  "todo_update",
  "todo-list",
  "todo_list",
  "todo_items",
  "task_list",
  "task",
  "tasks",
  "mcp",
  "mcp_tool",
  "mcp_call",
  "output",
  "stdout",
  "stderr",
  "result",
  "results",
  "info",
] as const;

/** Internal planning / reflection tags — safe to strip in any order (no nesting deps). */
const INTERNAL_PLANNING_TAG_NAMES = [
  "thinking",
  "think",
  // `system-reminder` intentionally NOT here: closed blocks stay in the prose so
  // AssistantMessage's `splitSystemReminders` can render them as the
  // "Possible prompt injection" chip. Open/streaming forms are stripped via
  // `stripTrailingOpenInternalMarkup`'s explicit handling below.
  "redacted_thinking",
  "scratchpad",
  "reflection",
  "internal",
  "chain_of_thought",
  "chain-of-thought",
  "reasoning",
  "reasoning_trace",
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
  "internal_notes",
  "system",
  "assistant_scratchpad",
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
  "thinking|thought|reasoning|analysis|scratchpad|reflection|todo|task|tool|function|invoke|parameter|argument|operator|workflow|plan|planning|internal|hidden|private|meta|note|instruction|trace|bash|shell|mcp|output|stdout|stderr|execute|browser|minimax|redacted|patch|grep|glob";
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

/** Namespaced vendor markup (`antml:…`, `minimax:…`) — strip closed + trailing open. */
const CLOSED_NAMESPACED_INTERNAL_RE =
  /<((?:antml|minimax|claude|openai|gemini):[a-z][\w:-]*)\b[^>]*>[\s\S]*?<\/\1>/gi;
const OPEN_NAMESPACED_INTERNAL_RE =
  /<((?:antml|minimax|claude|openai|gemini):[a-z][\w:-]*)\b[^>]*>/gi;
const ORPHAN_CLOSE_NAMESPACED_INTERNAL_RE =
  /<\/(?:antml|minimax|claude|openai|gemini):[a-z][\w:-]*\s*>/gi;

const OPEN_ARTIFACT_TAG_RE = /<artifact\b[^>]*>/i;
const CLOSED_ARTIFACT_RE = /<artifact\b[^>]*>[\s\S]*?<\/artifact>/gi;
const ATTACHED_PREVIEW_COMMENTS_RE =
  /\n*<attached-preview-comments\b[^>]*>[\s\S]*?<\/attached-preview-comments>\s*/gi;
const OPEN_ATTACHED_PREVIEW_COMMENTS_RE =
  /\n*<attached-preview-comments\b[^>]*>[\s\S]*$/gi;
const ATTACHED_PREVIEW_COMMENTS_EMPTY_FALLBACK_RE =
  /(?:^|\n)No comment location data provided\.\s*Apply the requested change to all slides\.\s*(?=\n|$)/gi;
const COMMENT_SLIDE_INDEX_ASK_RE =
  /(?:^|\n)(?:댓글에\s*)?(?:어떤\s*슬라이드의[^\n]*?|[^.\n]*?)`?slideIndex`?\s*정보가\s*없(?:어서|어요)[\s\S]*?(?:예:\s*["“][^"”]+["”][\s\S]*?(?=\n{2,}|$)|$)/gi;

const CLOSED_ANTML_RE = /<antml:[^>]+>[\s\S]*?<\/antml:[^>]+>/gi;
// Allow newlines inside attributes — agents sometimes break long antml tags
// across lines (`<antml:invoke\n name="…">`).
const OPEN_ANTML_RE = /<antml:[^>]+>/gi;

/**
 * Document / head skeleton tags that must never paint as chat prose mid-stream
 * (or as truncated debris). Distinct from internal agent markup — these are
 * legitimate HTML that belongs only inside `<artifact>` bodies / the preview
 * iframe, not the assistant bubble.
 */
const HEAD_SKELETON_TAG_NAMES = [
  "html",
  "head",
  "body",
  "link",
  "meta",
  "script",
  "style",
  "base",
  "title",
  "noscript",
] as const;

function isLikelyInternalMarkupLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^<[a-zA-Z!?/]/.test(trimmed)) return true;
  if (/^<!doctype\b/i.test(trimmed)) return true;
  if (trimmed.includes("<<<<<<< SEARCH")) return true;
  // Deck/HTML stylesheet bodies streamed inside an open artifact — not chat prose.
  if (/^\.slide\s*\{/.test(trimmed)) return true;
  if (/^-index\s*=\s*["']\d+["']/i.test(trimmed)) return true;
  if (/^<(?:section|div)\b/i.test(trimmed) && /\b(?:slide|data-slide-index|data-slide)\b/i.test(trimmed)) {
    return true;
  }
  if (/^\.grain::after\s*\{/.test(trimmed)) return true;
  if (/^#deck-(?:stage|prev|next|idx)\b/i.test(trimmed)) return true;
  if (/^<h[1-6]\b/i.test(trimmed) && /\bstyle\s*=/i.test(trimmed)) return true;
  if (/^[\d.]+(?:px|em|rem)(?:\/[\d.]+)?">/i.test(trimmed)) return true;
  if (/^@(?:page|media|keyframes|import)\b/.test(trimmed)) return true;
  if (/^\.[a-zA-Z0-9_-]+(\s*::(?:before|after))?\s*\{/.test(trimmed)) {
    if (/1920px|1080px|box-sizing|overflow:\s*hidden|pointer-events:\s*none|grain/i.test(trimmed)) {
      return true;
    }
  }
  // CDN / viewport / head-attr debris — never promote out of an open artifact
  // as "user-facing prose" (history stripTrailingOpenArtifact path).
  if (looksLikeHtmlDebrisLine(trimmed)) return true;
  return false;
}

/** @deprecated alias — use ARTIFACT_CDN_HOSTS (SSOT in artifactCdnHosts.ts). */
const HTML_DEBRIS_HOST_FRAGMENTS = ARTIFACT_CDN_HOSTS;

/** @deprecated alias — use ARTIFACT_CDN_HOST_STEMS. */
const HTML_DEBRIS_HOST_STEMS = ARTIFACT_CDN_HOST_STEMS;

function looksLikeHtmlDebrisLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower) return false;
  if (HTML_DEBRIS_HOST_FRAGMENTS.some((host) => lower.includes(host))) return true;
  if (
    /^(?:https?:\/\/)?(?:fonts\.|cdn\.|kit\.)?/i.test(lower)
    && new RegExp(`(?:${artifactCdnHeuristicTokenAlternation()})`, "i").test(lower)
  ) {
    return true;
  }
  if (/^(?:device-width|-width\b|viewport\s*=)/i.test(lower)) return true;
  if (/^family=[a-z0-9_+:;,=%&.@\-]+/i.test(lower)) return true;
  if (/^(?:rel|charset|integrity|crossorigin|name)\s*=/i.test(lower)) return true;
  if (/name\s*=\s*["']?viewport/i.test(lower) && /content\s*=/i.test(lower)) return true;
  // Completed orphan void tails (`…" />`) — still debris, not prose.
  if (
    /["']?\s*\/?\s*>\s*$/.test(lower)
    && (new RegExp(`(?:${artifactCdnHeuristicTokenAlternation()})`, "i").test(lower)
      || /device-width|initial-scale|stylesheet|preconnect|family=/i.test(lower))
  ) {
    return true;
  }
  // Bare host-only lines (no void terminator) — never valid chat copy.
  if (isBareCdnHostLine(lower)) return true;
  return false;
}

function isBareCdnHostLine(lower: string): boolean {
  const withoutProto = lower.replace(/^https?:\/\//, "").replace(/\/$/, "").trim();
  return HTML_DEBRIS_HOST_FRAGMENTS.some((host) => withoutProto === host);
}

const DECK_SLIDE_OPEN_TAG_TAIL_RE =
  /<(?:section|div)\b[^>]*(?:\bclass\s*=\s*["'][^"']*\bslide\b|data-slide-index|data-slide\b)[^>]*(?:>[\s\S]*)?$/i;
const DECK_SLIDE_ORPHAN_ATTR_TAIL_RE =
  /-index\s*=\s*["']\d+["']\s+style\s*=\s*["'][\s\S]*?(?:>[\s\S]*)?$/i;
const DECK_ORPHAN_STYLE_CLOSE_TAIL_RE =
  /\s+[\d.]+(?:px|em|rem|%|vh|vw)(?:\/[\d.]+)?">[\s\S]*$/i;
const DECK_TRAILING_INLINE_MARKUP_RE =
  /(?:\n|^)\s*<p\b[^>]*style\s*=\s*["'][^"']*(?:font|letter-spacing|margin)[^"']*["'][^>]*>[\s\S]*$/i;
const DECK_TRAILING_HEADING_MARKUP_RE =
  /(?:\n|^)\s*<h[1-6]\b[^>]*(?:style\s*=)?[^>]*>[\s\S]*$/i;
const DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE =
  /<(?:div|span)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?position\s*:\s*absolute[\s\S]*$/i;
const DECK_MOTIF_PILL_RADIUS_TAIL_RE =
  /<(?:div|span)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?border-radius\s*:\s*9999px[\s\S]*$/i;
const DECK_CARD_STYLE_DIV_TAIL_RE =
  /<(?:div|article)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:card|pill|chip|deco)[^"']*["'][^>]*\bstyle\s*=[\s\S]*$/i;
const DECK_DECO_CLASS_TAIL_RE =
  /<(?:div|span|svg|g|i)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:deco-|floating-pill|pixel-glitch|win-titlebar)[\s\S]*$/i;
const DECK_MOTIF_SVG_TAIL_RE =
  /<svg\b[^>]*(?:class\s*=\s*["'][^"']*\b(?:deco-|floating-pill)|viewBox\s*=|style\s*=\s*["'][^"']*position\s*:\s*absolute)[\s\S]*$/i;
const DECK_MOTIF_PATH_TAIL_RE =
  /<path\b[^>]*\bd\s*=\s*["'][\s\S]*$/i;
const DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE =
  /<\/(?:section|div)>\s*[-a-z]*weight\s*:[\s\S]*$/i;
const DECK_SLIDE_PARTIAL_OPEN_TAG_RE =
  /<(?:section|div)\b[^>]*(?:\bclass\s*=\s*["'][^"']*\bslide\b|data-slide-index|data-slide\b)[^>]*>/i;

function isDeckSlidePartialTag(name: string, after: string): boolean {
  const lower = name.toLowerCase();
  if (lower !== "section" && lower !== "div") return false;
  const tail = after.toLowerCase();
  return tail.includes("slide") || tail.includes("data-slide");
}

function findTrailingSameLineDeckHtmlCut(line: string): number | null {
  const orphan = line.match(/^(.*?)(-index\s*=\s*["']\d+["']\s+style\s*=.*)$/i);
  if (orphan?.[1] !== undefined) return orphan[1].length;
  const pxClose = line.match(/^(.*?)(?:\s+[\d.]+(?:px|em|rem|%|vh|vw)(?:\/[\d.]+)?">.*)$/i);
  if (pxClose?.[1] !== undefined) return pxClose[1].length;
  const open = line.match(
    /^(.*?)(<(?:section|div)\b[^>]*(?:data-slide-index|\bclass\s*=\s*["'][^"']*\bslide\b)[^>]*)$/i,
  );
  if (open?.[1] !== undefined) return open[1].length;
  return null;
}

/** Drop truncated deck slide HTML leaked into chat prose (mid-artifact abort). */
export function stripTrailingDeckHtmlMarkupLeak(input: string): string {
  if (!input) return input;
  for (const re of [
    DECK_SLIDE_OPEN_TAG_TAIL_RE,
    DECK_SLIDE_ORPHAN_ATTR_TAIL_RE,
    DECK_ORPHAN_STYLE_CLOSE_TAIL_RE,
    DECK_TRAILING_HEADING_MARKUP_RE,
    DECK_TRAILING_INLINE_MARKUP_RE,
    DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE,
    DECK_MOTIF_PILL_RADIUS_TAIL_RE,
    DECK_CARD_STYLE_DIV_TAIL_RE,
    DECK_DECO_CLASS_TAIL_RE,
    DECK_MOTIF_SVG_TAIL_RE,
    DECK_MOTIF_PATH_TAIL_RE,
    DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE,
  ]) {
    const match = re.exec(input);
    if (!match || match.index === undefined) continue;
    return input.slice(0, match.index).trimEnd();
  }
  return input;
}

function findArtifactOpenIndex(input: string, from: number): number {
  const slice = from > 0 ? input.slice(from) : input;
  const match = /<artifact(?=[\s>/])/i.exec(slice);
  return match?.index == null ? -1 : (from > 0 ? from : 0) + match.index;
}

function stripTrailingDeckHtmlMarkupLeakRespectingArtifacts(
  input: string,
  preserveArtifactBodies: boolean,
): string {
  if (!preserveArtifactBodies) return stripTrailingDeckHtmlMarkupLeak(input);
  let result = "";
  let cursor = 0;
  while (cursor < input.length) {
    const open = findArtifactOpenIndex(input, cursor);
    if (open === -1) {
      result += stripTrailingDeckHtmlMarkupLeak(input.slice(cursor));
      break;
    }
    result += stripTrailingDeckHtmlMarkupLeak(input.slice(cursor, open));
    const gt = input.indexOf(">", open);
    if (gt === -1) {
      result += input.slice(open);
      break;
    }
    const close = input.toLowerCase().indexOf("</artifact>", gt);
    if (close === -1) {
      result += input.slice(open);
      break;
    }
    const end = close + "</artifact>".length;
    result += input.slice(open, end);
    cursor = end;
  }
  return result;
}

/**
 * Hold incomplete trailing CDN/viewport/head-attr debris across chunk
 * boundaries. Without this, `feed("googleapis.com")` emits the host, then
 * `feed('/css2?…" />')` scrubs non-monotonically and growth is `""` — leaving
 * the already-emitted host stuck in append-only daemon persist.
 *
 * Also holds same-line trailing hosts (`Done. fonts.googleapis.com`) while
 * still allowing mid-sentence mentions (`See fonts.googleapis.com for docs`).
 */
export function stripIncompleteTrailingHtmlDebris(
  input: string,
  options: { allowSameLineTrailingCut?: boolean } = {},
): string {
  if (!input) return input;
  const lastNl = input.lastIndexOf("\n");
  const lineStart = lastNl === -1 ? 0 : lastNl + 1;
  const line = input.slice(lineStart);
  const trimmed = line.trim();
  if (!trimmed) return input;

  // Fully terminated void tail — leave for stripChatProseHtmlDebris.
  if (/["']?\s*\/?\s*>\s*$/.test(trimmed) && looksLikeHtmlDebrisLine(trimmed)) {
    return input;
  }

  if (looksLikeIncompleteHtmlDebrisLine(trimmed)) {
    return input.slice(0, lineStart).trimEnd();
  }

  // Same-line trailing CDN hold is streaming-only. History must not destroy
  // advisory mentions like `Docs at fonts.googleapis.com`.
  if (options.allowSameLineTrailingCut) {
    const trailingCut = findTrailingSameLineCdnDebrisCut(line);
    if (trailingCut !== null) {
      return input.slice(0, lineStart + trailingCut).trimEnd();
    }
  }
  const deckCut = findTrailingSameLineDeckHtmlCut(line);
  if (deckCut !== null) {
    return input.slice(0, lineStart + deckCut).trimEnd();
  }
  return input;
}

/**
 * If the line ends with a CDN host/path token (optional scheme), return the
 * character index where that token begins (including leading whitespace).
 * Returns null when the trailing token is ordinary prose.
 */
function findTrailingSameLineCdnDebrisCut(line: string): number | null {
  const m = line.match(/^(.*?)(\s+)(\S+)\s*$/);
  if (!m || m[1] === undefined || m[3] === undefined) return null;
  // Strip trailing sentence punctuation glued to the token (`host.`).
  const trailing = m[3].replace(/[.,;:!?]+$/g, "");
  if (!trailing) return null;
  // Completed void tails are handled by the full debris scrubber.
  if (/["']?\s*\/?\s*>\s*$/.test(trailing) && looksLikeHtmlDebrisLine(trailing)) {
    return null;
  }
  if (!isTrailingCdnDebrisToken(trailing)) return null;
  // Cut at the whitespace before the host so "Done." stays intact.
  return m[1].length;
}

function isTrailingCdnDebrisToken(token: string): boolean {
  const lower = token.toLowerCase().replace(/^https?:\/\//, "");
  // Bare stems (`jsdelivr`, `unpkg`) are ordinary words — never same-line cut.
  // Require a hostname dot, a path/query, or attr/query debris forms.
  if (
    !lower.includes(".")
    && !lower.includes("/")
    && !lower.includes("?")
    && !/^(?:css2\?)?family=/i.test(lower)
    && !/^(?:rel|href|charset|integrity|crossorigin)=/i.test(lower)
  ) {
    return false;
  }
  if (looksLikeIncompleteHtmlDebrisLine(token) || looksLikeIncompleteHtmlDebrisLine(lower)) {
    return true;
  }
  if (isBareCdnHostLine(lower.replace(/\/$/, ""))) return true;
  return HTML_DEBRIS_HOST_FRAGMENTS.some(
    (host) =>
      lower === host
      || lower.startsWith(`${host}/`)
      || lower.startsWith(`${host}?`)
      || lower.startsWith(`${host}"`)
      || lower.startsWith(`${host}'`),
  );
}

function looksLikeIncompleteHtmlDebrisLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (!lower) return false;
  // Already has a void-tag terminator — not incomplete.
  if (/["']?\s*\/?\s*>\s*$/.test(lower)) return false;

  // Attribute-only / viewport-only fragments.
  if (/^(?:device-width|-width\b|viewport\s*=)/i.test(lower)) return true;
  if (/^(?:css2\?)?family=[a-z0-9_+:;,=%&.@\-]*$/i.test(lower)) return true;
  if (/^(?:rel|charset|integrity|crossorigin|href|name)\s*=/i.test(lower)) return true;
  if (/^-index\s*=\s*["']\d+["']/i.test(lower)) return true;
  if (/^style\s*=\s*["'][^"']*(?:min-height|100vh|box-sizing|padding)/i.test(lower)) return true;
  if (/^-index\s*=\s*["']\d+["']/i.test(lower)) return true;
  if (/^style\s*=\s*["'][^"']*(?:min-height|100vh|box-sizing|padding)/i.test(lower)) return true;

  // Line is essentially a CDN host / URL (optional scheme), not surrounding prose.
  const withoutProto = lower.replace(/^https?:\/\//, "");
  for (const host of HTML_DEBRIS_HOST_FRAGMENTS) {
    if (
      withoutProto === host
      || withoutProto.startsWith(`${host}/`)
      || withoutProto.startsWith(`${host}?`)
      || withoutProto.startsWith(`${host}"`)
      || withoutProto.startsWith(`${host}'`)
    ) {
      return true;
    }
    // Reverse prefix while the host is still being typed.
    // Floor at 6 so `googlea` / `fonts.` hold; stems cover shorter cases.
    if (withoutProto.length >= 6 && host.startsWith(withoutProto)) return true;
  }
  for (const stem of HTML_DEBRIS_HOST_STEMS) {
    if (withoutProto === stem) return true;
    if (withoutProto.length >= 4 && stem.startsWith(withoutProto)) return true;
    if (withoutProto.startsWith(stem) && withoutProto.length <= stem.length + 8) {
      // `fonts.google` + partial continuation still incomplete host typing
      const rest = withoutProto.slice(stem.length);
      if (!rest || /^[a-z0-9.-]*$/i.test(rest)) return true;
    }
  }

  // Truncated `https://fonts.` / `https://cdn.` with no host completion yet.
  if (/^https?:\/\/(?:fonts\.|cdn\.|kit\.)?[a-z0-9.-]*$/i.test(lower)) return true;

  return false;
}

/** True when the last `<artifact …>` in `input` has no matching `</artifact>`. */
function hasUnclosedTrailingArtifact(input: string): boolean {
  if (!input) return false;
  const re = new RegExp(OPEN_ARTIFACT_TAG_RE.source, "gi");
  let lastOpen: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    lastOpen = match;
  }
  if (!lastOpen || lastOpen.index === undefined) return false;
  const openEnd = lastOpen.index + lastOpen[0].length;
  return findCloseTag(input, openEnd, "</artifact>") === -1;
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

/**
 * True when an open artifact is a Teamver deck deliverable. Mid-stream
 * max_tokens cuts often end on a slide text node (`Andiamo! (안디아모 =`) —
 * that must NOT be promoted into the chat bubble as "user-facing prose".
 * Broader `type="text/html"` artifacts still allow trailing summary promotion
 * (BYOK pseudo-tool turns often leave a Korean status line after the body).
 */
function isOpenDeckDeliverableArtifactTag(openTag: string): boolean {
  return /\btype\s*=\s*(?:"|')(?:deck|deck-patch)(?:"|')/i.test(openTag)
    || /\bidentifier\s*=\s*(?:"|')(?:deck|slides?)(?:"|')/i.test(openTag);
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
  // Truncated deck bodies: drop from `<artifact` to EOF. Never promote slide
  // copy / emoji chips that happen to look like chat prose.
  if (isOpenDeckDeliverableArtifactTag(lastOpen[0] ?? "")) {
    return { text: input.slice(0, openStart).trimEnd(), hadOpenInternalMarkup: true };
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

const CLOSED_MARKDOWN_TOOL_FENCE_RE =
  /```(?:tool_call|tool_use|tool|function_call|function|xml)\s*\n[\s\S]*?```/gi;
const OPEN_MARKDOWN_TOOL_FENCE_RE =
  /```(?:tool_call|tool_use|tool|function_call|function|xml)\s*\n/i;

const KNOWN_TOOL_JSON_NAMES =
  "TodoWrite|TodoUpdate|Read|Write|Edit|Bash|WebFetch|WebSearch|Grep|Glob|Task|Shell|write_todos|TaskCreate|TaskUpdate|ApplyPatch|MultiEdit|NotebookEdit|Delete|SearchReplace|run_terminal_cmd|mcp_call";

const FAKE_TOOL_NARRATION_RE = new RegExp(
  `\\[(?:正在调用|calling|invoking|Using tool|Running tool|Tool call)\\s+(?:${KNOWN_TOOL_JSON_NAMES})[^\\]]*\\]`,
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
  // Compact agent-authored nav (no deck-stage chrome): `(function(){ const
  // slides=document.querySelectorAll('.slide'); … ArrowRight … })();`
  `document\\.querySelectorAll\\(['"]\\.slide['"]\\)`,
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
  // Compact nav dialects: arrow/touch/wheel handlers around `.slide` nodes.
  `e\\.key\\s*===\\s*['"]ArrowRight['"]`,
  `document\\.addEventListener\\(['"]touchstart['"]`,
  `document\\.addEventListener\\(['"]wheel['"]`,
  // Classic function(e) + half-screen click nav (no .slide / ArrowRight).
  `clientX\\s*>\\s*window\\.innerWidth\\s*/\\s*2`,
  `go\\s*\\(\\s*cur\\s*\\+\\s*1\\s*\\)`,
  `document\\.addEventListener\\(['"]keydown['"]\\s*,\\s*function\\s*\\(`,
  `document\\.addEventListener\\(['"]click['"]\\s*,\\s*function\\s*\\(`,
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
  `(?:^|\\n)\\s*(?:var|let|const)\\s+slides\\s*=\\s*(?:Array\\.prototype\\.slice\\.call\\()?document\\.querySelectorAll\\(['"]\\.slide['"]\\)\\)?;?[\\s\\S]{0,20000}${DECK_IIFE_CLOSE_TAIL}`,
  "gi",
);

/** Compact one-line / modern-const IIFE with `.slide` + keyboard nav. */
const LEAKED_COMPACT_DECK_NAV_IIFE_RE = new RegExp(
  `(?:^|\\n|(?<=[.。!?…])\\s*)\\(\\s*function\\s*\\(\\s*\\)\\s*\\{(?=[\\s\\S]{0,4000}?document\\.querySelectorAll\\(['"]\\.slide['"]\\))(?=[\\s\\S]{0,8000}?(?:ArrowRight|ArrowLeft|keydown))[\\s\\S]{0,20000}${DECK_IIFE_STRICT_CLOSE_TAIL}`,
  "gi",
);

/** Arrow-function IIFE dialect: `(()=>{ const slides=querySelectorAll('.slide'); … })();` */
const LEAKED_COMPACT_ARROW_DECK_NAV_IIFE_RE = new RegExp(
  `(?:^|\\n|(?<=[.。!?…])\\s*)\\(\\s*\\(\\s*\\)\\s*=>\\s*\\{(?=[\\s\\S]{0,4000}?document\\.querySelectorAll\\(['"]\\.slide['"]\\))(?=[\\s\\S]{0,8000}?(?:ArrowRight|ArrowLeft|keydown))[\\s\\S]{0,20000}${DECK_IIFE_STRICT_CLOSE_TAIL}`,
  "gi",
);

/**
 * Closed-form for truncated-then-completed compact arrow/touch nav that never
 * mentions `.slide` / deck-stage — e.g. a mid-script leak that later closed
 * with `})();` in the same prose blob.
 */
const LEAKED_COMPACT_ARROW_NAV_TAIL_RE = new RegExp(
  `(?:^|\\n|(?<=[.。!?…])\\s*)document\\.addEventListener\\(['"]keydown['"]\\s*,\\s*e\\s*=>\\s*\\{(?=[\\s\\S]{0,4000}?ArrowRight)[\\s\\S]{0,12000}${DECK_IIFE_STRICT_CLOSE_TAIL}`,
  "gi",
);

/** `window.onkeydown = e => { if (e.key === 'ArrowRight') … }` glued into prose. */
const LEAKED_WINDOW_ONKEYDOWN_NAV_RE = new RegExp(
  `(?:^|\\n|(?<=[.。!?…])\\s*)(?:window|document)\\.onkeydown\\s*=\\s*e\\s*=>\\s*\\{(?=[\\s\\S]{0,2000}?ArrowRight)[\\s\\S]{0,4000}?\\}\\s*;?`,
  "gi",
);

/**
 * Classic minified click/keyboard nav IIFE without `.slide` / ArrowRight:
 * `(function(){ document.addEventListener('keydown',function(e){ …
 * document.addEventListener('click',function(e){ if(e.clientX>window.innerWidth/2)go(cur+1); … })();`
 */
const LEAKED_COMPACT_CLASSIC_CLICK_NAV_IIFE_RE = new RegExp(
  `(?:^|\\n|(?<=[.。!?…])\\s*)\\(\\s*function\\s*\\(\\s*\\)\\s*\\{(?=[\\s\\S]{0,6000}?(?:clientX\\s*>\\s*window\\.innerWidth\\s*/\\s*2|go\\s*\\(\\s*cur\\s*\\+\\s*1\\s*\\)|document\\.addEventListener\\(['"]keydown['"]\\s*,\\s*function\\s*\\())[\\s\\S]{0,20000}${DECK_IIFE_STRICT_CLOSE_TAIL}`,
  "gi",
);

/** Truncated/completed classic keydown+click handler tail without an IIFE opener. */
const LEAKED_COMPACT_CLASSIC_KEYDOWN_CLICK_NAV_TAIL_RE = new RegExp(
  `(?:^|\\n|(?<=[.。!?…])\\s*)document\\.addEventListener\\(['"]keydown['"]\\s*,\\s*function\\s*\\(\\s*\\w*\\s*\\)\\s*\\{(?=[\\s\\S]{0,8000}?(?:clientX\\s*>\\s*window\\.innerWidth|go\\s*\\(\\s*cur))[\\s\\S]{0,16000}${DECK_IIFE_STRICT_CLOSE_TAIL}`,
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
  /(?:^|\n)\s*(?:var|let|const)\s+slides\s*=\s*(?:Array\.prototype\.slice\.call\()?document\.querySelectorAll\(['"]\.slide['"]\)/i,
  /(?:^|\n)\s*\(\s*function\s*\(\s*\)\s*\{(?=[\s\S]{0,4000}?document\.querySelectorAll\(['"]\.slide['"]\))/i,
  /(?:^|\n)\s*slides\.forEach\(\s*(?:function\s*\(|\()/i,
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
  // Compact `function go(n){…}` left behind after a mid-script keydown strip.
  /(?:^|\n)\s*function\s+go\s*\(\s*\w+\s*\)\s*\{(?=[\s\S]{0,1600}?(?:ArrowRight|slides\.length|querySelectorAll\(['"]\.slide))/i,
  /(?:^|\n)\s*idx\s*=\s*Math\.max\(0,\s*Math\.min\(slides\.length\s*-\s*1,\s*i\)\)\s*;?/i,
  /(?:^|\n)\s*try\s*\{\s*localStorage\.setItem\(STORE,\s*String\(idx\)\)\s*;\s*\}\s*catch\s*\(_\)\s*\{\s*\}\s*;?/i,
  /(?:^|\n)\s*function\s+onKey\s*\(\s*e\s*\)\s*\{(?=[\s\S]{0,1600}?(?:ArrowRight|PageDown|PageUp|Home|End|go\(idx))/i,
  /(?:^|\n)\s*if\s*\(\s*e\.key\s*===\s*['"]ArrowRight['"]\s*\|\|\s*e\.key\s*===\s*['"]PageDown['"]/i,
  /(?:^|\n)\s*else\s+if\s*\(\s*e\.key\s*===\s*['"]ArrowLeft['"]\s*\|\|\s*e\.key\s*===\s*['"]PageUp['"]/i,
  /(?:^|\n)\s*else\s+if\s*\(\s*e\.key\s*===\s*['"]Home['"]\s*\)\s*\{\s*e\.preventDefault\(\)\s*;\s*go\(0\)/i,
  /(?:^|\n)\s*else\s+if\s*\(\s*e\.key\s*===\s*['"]End['"]\s*\)\s*\{\s*e\.preventDefault\(\)\s*;\s*go\(slides\.length\s*-\s*1\)/i,
  /(?:^|\n)\s*window\.addEventListener\(['"]keydown['"]\s*,\s*onKey\s*,\s*true\)\s*;?/i,
  /(?:^|\n)\s*document\.addEventListener\(['"]keydown['"]\s*,\s*onKey\s*,\s*true\)\s*;?/i,
  // Truncated compact nav: bare `document.addEventListener('keydown', e=>{…`
  // without deck-stage / querySelectorAll anchors (end_turn mid-script).
  // Allow same-line glue after sentence punctuation (`덱 완성. document…`).
  /(?:^|\n|[.。!?…]\s*)document\.addEventListener\(['"]keydown['"]\s*,\s*(?:onKey|e\s*=>|function\s*\()/i,
  // Classic function(e) click-to-advance nav (half-screen / go(cur±1)).
  /(?:^|\n|[.。!?…]\s*)document\.addEventListener\(['"]click['"]\s*,\s*function\s*\(\s*\w*\s*\)\s*\{(?=[\s\S]{0,2000}?(?:clientX\s*>\s*window\.innerWidth|go\s*\(\s*cur))/i,
  /(?:^|\n|[.。!?…]\s*)\(\s*function\s*\(\s*\)\s*\{(?=[\s\S]{0,4000}?document\.addEventListener\(['"]keydown['"]\s*,\s*function\s*\()/i,
  /(?:^|\n|[.。!?…]\s*)\(\s*function\s*\(\s*\)\s*\{(?=[\s\S]{0,6000}?clientX\s*>\s*window\.innerWidth\s*\/\s*2)/i,
  /(?:^|\n|[.。!?…]\s*)(?:window|document)\.addEventListener\(['"](?:touchstart|touchend|wheel)['"]/i,
  /(?:^|\n|[.。!?…]\s*)(?:window|document)\.onkeydown\s*=\s*e\s*=>/i,
  /(?:^|\n)\s*if\s*\(\s*e\.key\s*===\s*['"]ArrowRight['"]\s*\|\|\s*e\.key\s*===\s*['"]ArrowDown['"]/i,
  /(?:^|\n)\s*if\s*\(\s*e\.key\s*===\s*['"]ArrowRight['"]\s*\|\|\s*e\.key\s*===\s*['"]ArrowLeft['"]/i,
  // Broken IIFE remnant that agents stream after a dropped opener:
  // `(\n  }\n  document.addEventListener('keydown', …`
  /(?:^|\n)\s*\(\s*\n?\s*\}\s*\n?\s*document\.addEventListener\(['"]keydown['"]/i,
  // Arrow IIFE opener glued to prose or on its own line.
  /(?:^|\n|[.。!?…]\s*)\(\s*\(\s*\)\s*=>\s*\{(?=[\s\S]{0,4000}?document\.querySelectorAll\(['"]\.slide['"]\))/i,
  /(?:^|\n|[.。!?…]\s*)\(\s*function\s*\(\s*\)\s*\{(?=[\s\S]{0,4000}?document\.querySelectorAll\(['"]\.slide['"]\))/i,
  /(?:^|\n|[.。!?…]\s*)(?:const|let|var)\s+slides\s*=\s*(?:Array\.prototype\.slice\.call\()?document\.querySelectorAll\(['"]\.slide['"]/i,
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
    // Same delimiter guard as openTagRe — prevents `<todo\b` from swallowing
    // `<todo-list>` and stealing the outer strip's close-tag search when a
    // hyphenated variant of the same prefix appears in the stream.
    re = new RegExp(
      `<${escapeRegExp(tagName)}(?=[\\s>/])[^>]*>[\\s\\S]*?</${escapeRegExp(tagName)}\\s*>`,
      "gi",
    );
    closedTagRes.set(tagName, re);
  }
  return re;
}

function openTagRe(tagName: string): RegExp {
  let re = openTagRes.get(tagName);
  if (!re) {
    // Require an explicit delimiter after the tag name — plain `\b` treats
    // `-` as a word boundary and would let `<system\b` accidentally match
    // `<system-reminder>` (then `[^>]*` gobbles `-reminder`), stealing the
    // longer tag's close-search from the openTag chain.
    re = new RegExp(`<${escapeRegExp(tagName)}(?=[\\s>/])[^>]*>`, "i");
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

function stripTrailingOpenAntml(
  input: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  OPEN_ANTML_RE.lastIndex = 0;
  let lastOpen: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  const re = new RegExp(OPEN_ANTML_RE.source, "gi");
  while ((match = re.exec(input)) !== null) {
    lastOpen = match;
  }
  if (!lastOpen || lastOpen.index === undefined) {
    return { text: input, hadOpenInternalMarkup: false };
  }
  const openStart = lastOpen.index;
  const openEnd = openStart + lastOpen[0].length;
  // Best-effort close: </antml:anything>
  const closeIdx = input.slice(openEnd).search(/<\/antml:[^>]+>/i);
  if (closeIdx !== -1) {
    return { text: input, hadOpenInternalMarkup: false };
  }
  return { text: input.slice(0, openStart).trimEnd(), hadOpenInternalMarkup: true };
}

function isInternalMarkupTagName(name: string): boolean {
  const lower = name.toLowerCase();
  if (!lower) return false;
  // Exact / longer prefix matches against the known registry.
  if (
    LEAKED_AGENT_PROSE_TAG_NAMES.some((tag) => {
      const t = tag.toLowerCase();
      if (t === lower || lower.startsWith(t)) return true;
      // Hold incomplete tokens like "thi"→thinking, but avoid eating real HTML
      // prefixes (`<p`, `<a`, `<i`) via very short reverse prefix matches.
      if (lower.length >= 3 && t.startsWith(lower)) return true;
      return false;
    })
  ) {
    return true;
  }
  if (
    new RegExp(`^(?:[a-z][a-z0-9_-]*[-_])?(?:${INTERNAL_MARKUP_KEYWORDS})`, "i").test(lower)
    || (lower.length >= 3
      && INTERNAL_MARKUP_KEYWORDS.split("|").some(
        (keyword) => keyword.startsWith(lower) || lower.startsWith(keyword),
      ))
  ) {
    return true;
  }
  if (
    lower === "artifact"
    || lower.startsWith("od")
    || lower.startsWith("antml")
    || lower.startsWith("minimax")
    || lower.startsWith("claude:")
    || lower.startsWith("openai:")
    || lower.startsWith("gemini:")
    || lower === "question-form"
    || lower === "ask-question"
    // Hold back partial `<system-remi…` mid-stream tokens so the injected
    // prompt doesn't briefly render as bare prose before the closing tag
    // arrives (which turns the block into the prompt-injection chip).
    || (lower.length >= 3 && "system-reminder".startsWith(lower))
  ) {
    return true;
  }
  // Hold incomplete document/head skeleton tags (`<lin`, `<script`, `<meta`)
  // so truncated CDN/font debris never paints in the chat bubble. Require
  // ≥3 chars for reverse-prefix matches to avoid eating `<st` from "start".
  if (
    HEAD_SKELETON_TAG_NAMES.some((tag) => {
      if (tag === lower || lower.startsWith(tag)) return true;
      if (lower.length >= 3 && tag.startsWith(lower)) return true;
      return false;
    })
  ) {
    return true;
  }
  return false;
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

/**
 * Inline fingerprints for deck-nav JS glued onto the same line as prose
 * (`덱 완성. document.addEventListener…`, `완료.(()=>{const slides=…`).
 * Returns the start index of the JS leak, or -1.
 */
function findInlineDeckNavLeakStart(input: string): number {
  const patterns = [
    /document\.addEventListener\s*\(\s*['"]keydown['"]\s*,\s*(?:onKey|e\s*=>|function\s*\()/i,
    /document\.addEventListener\s*\(\s*['"]click['"]\s*,\s*function\s*\(\s*\w*\s*\)\s*\{(?=[\s\S]{0,2000}?(?:clientX\s*>\s*window\.innerWidth|go\s*\(\s*cur))/i,
    /(?:window|document)\.addEventListener\s*\(\s*['"](?:touchstart|touchend|wheel)['"]/i,
    /(?:window|document)\.onkeydown\s*=\s*e\s*=>/i,
    /\(\s*\(\s*\)\s*=>\s*\{(?=[\s\S]{0,4000}?document\.querySelectorAll\(['"]\.slide['"]\))/i,
    /\(\s*function\s*\(\s*\)\s*\{(?=[\s\S]{0,4000}?document\.querySelectorAll\(['"]\.slide['"]\))/i,
    /\(\s*function\s*\(\s*\)\s*\{(?=[\s\S]{0,4000}?document\.addEventListener\(['"]keydown['"]\s*,\s*function\s*\()/i,
    /\(\s*function\s*\(\s*\)\s*\{(?=[\s\S]{0,6000}?clientX\s*>\s*window\.innerWidth\s*\/\s*2)/i,
    /(?:const|let|var)\s+slides\s*=\s*(?:Array\.prototype\.slice\.call\()?document\.querySelectorAll\(['"]\.slide['"]/i,
  ] as const;
  let best = -1;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(input);
    if (!match || match.index === undefined) continue;
    if (best === -1 || match.index < best) best = match.index;
  }
  return best;
}

function findOpenDeckNavScriptStart(input: string): number {
  let best = -1;
  for (const pattern of OPEN_DECK_NAV_SCRIPT_RE_LIST) {
    pattern.lastIndex = 0;
    const match = pattern.exec(input);
    if (!match || match.index === undefined) continue;
    const rawStart = match.index;
    const matchText = match[0] ?? "";
    // Patterns that allow `[.。!?…]\s*` may include the punctuation in
    // match[0]. Strip only that leading punct/space prefix so prose like
    // `덱 완성.` stays — never advance into mid-match (`var total = document…`).
    const punctPrefix = matchText.match(/^[.。!?…]+\s*/);
    const start = punctPrefix
      ? rawStart + punctPrefix[0].length
      : rawStart + Math.max(0, matchText.search(/\S/));
    if (best === -1 || start < best) best = start;
  }
  const inline = findInlineDeckNavLeakStart(input);
  if (inline !== -1 && (best === -1 || inline < best)) best = inline;
  return best;
}

/**
 * Last-resort deck-nav JS scrub. Pattern-specific open/closed matchers above
 * can miss a dialect or lag a stale build; once prose contains both a nav
 * listener and a slide-advance fingerprint, chop from the earliest JS opener
 * so `(function(){ document.addEventListener('keydown',function(e){ …` never
 * paints in chat.
 */
export function stripHardDeckNavJsFingerprints(input: string): string {
  if (!input) return input;
  const hasListener =
    /addEventListener\s*\(\s*['"]keydown['"]/i.test(input)
    || (
      /addEventListener\s*\(\s*['"]click['"]/i.test(input)
      && /clientX/i.test(input)
    )
    || /(?:window|document)\.onkeydown\s*=/i.test(input);
  const hasAdvance =
    /clientX\s*>\s*window\.innerWidth/i.test(input)
    || /go\s*\(\s*cur\s*[+-]/i.test(input)
    || /ArrowRight|ArrowLeft|ArrowDown|PageDown|PageUp/i.test(input)
    || /querySelectorAll\s*\(\s*['"]\.slide['"]/i.test(input);
  if (!hasListener || !hasAdvance) return input;

  const starts: number[] = [];
  const openStart = findOpenDeckNavScriptStart(input);
  if (openStart !== -1) starts.push(openStart);
  for (const pattern of [
    /\(\s*function\s*\(\s*\)\s*\{/i,
    /\(\s*\(\s*\)\s*=>\s*\{/i,
    /document\.addEventListener\s*\(\s*['"](?:keydown|click)['"]/i,
    /(?:window|document)\.onkeydown\s*=/i,
    /(?:const|let|var)\s+slides\s*=\s*(?:Array\.prototype\.slice\.call\()?document\.querySelectorAll/i,
    /function\s+go\s*\(\s*\w+\s*\)\s*\{/i,
  ] as const) {
    pattern.lastIndex = 0;
    const match = pattern.exec(input);
    if (match?.index !== undefined) starts.push(match.index);
  }
  if (starts.length === 0) {
    // Fingerprints present but no opener — drop pure-JS blobs entirely.
    return /^\s*(?:\(|document\.|function\s)/i.test(input) ? "" : input;
  }
  return input.slice(0, Math.min(...starts)).trimEnd();
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

/** Quote-aware artifact open tag so attrs may contain `>`. */
const ARTIFACT_OPEN_ATTRS = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`;
const CLOSED_ARTIFACT_SCAN_RE = new RegExp(
  String.raw`<artifact\b${ARTIFACT_OPEN_ATTRS}>[\s\S]*?</artifact\s*>`,
  "gi",
);
/** Unclosed artifact stream suffix (no matching `</artifact>`). */
const OPEN_ARTIFACT_SUFFIX_RE = new RegExp(
  String.raw`<artifact\b${ARTIFACT_OPEN_ATTRS}>(?![\s\S]*?</artifact\s*>)[\s\S]*$`,
  "i",
);
const ARTIFACT_PLACEHOLDER_PREFIX = "\u0000OD_ARTIFACT_MASK_";
const ARTIFACT_PLACEHOLDER_SUFFIX = "\u0000";

/**
 * Replace closed `<artifact …>…</artifact>` regions (and any trailing unclosed
 * `type="element-patch"` stream) with stable placeholders so subsequent tag /
 * debris scrubbing cannot touch their contents — including inner `<patch>`.
 *
 * The placeholder uses NUL bytes to guarantee it will not collide
 * with either the input prose or any regex pattern in this module.
 * Callers must invoke `restore` before returning the sanitized text
 * or the placeholders will leak into user-visible output.
 */
function maskClosedArtifactRegions(
  input: string,
): { text: string; restore: (masked: string) => string } {
  CLOSED_ARTIFACT_SCAN_RE.lastIndex = 0;
  const regions: string[] = [];
  const push = (match: string): string => {
    const token = `${ARTIFACT_PLACEHOLDER_PREFIX}${regions.length}${ARTIFACT_PLACEHOLDER_SUFFIX}`;
    regions.push(match);
    return token;
  };
  let masked = input.replace(CLOSED_ARTIFACT_SCAN_RE, (match) => push(match));
  // Truncated streams often leave `<artifact type="element-patch">…<patch>…`
  // without `</artifact>`. Mask element-patch suffixes so pseudo-tool strip
  // does not empty the in-progress patch body mid-turn.
  OPEN_ARTIFACT_SUFFIX_RE.lastIndex = 0;
  masked = masked.replace(OPEN_ARTIFACT_SUFFIX_RE, (match) => {
    if (!/\btype\s*=\s*["']element-patch["']/i.test(match)) return match;
    return push(match);
  });
  if (regions.length === 0) {
    return { text: input, restore: (out: string) => out };
  }
  const restore = (out: string): string => {
    return out.replace(
      new RegExp(`${ARTIFACT_PLACEHOLDER_PREFIX}(\\d+)${ARTIFACT_PLACEHOLDER_SUFFIX}`, "g"),
      (_full, indexRaw: string) => {
        const index = Number(indexRaw);
        if (!Number.isInteger(index) || index < 0 || index >= regions.length) return "";
        return regions[index] ?? "";
      },
    );
  };
  return { text: masked, restore };
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
export function sanitizeLeakedAgentProse(
  input: string,
  options: { preserveClosedArtifact?: boolean } = {},
): string {
  if (!input) return input;
  let out = input;
  // Element-patch artifacts embed `<patch target-id="…" slide-index="…"
  // kind="…">…</patch>` blocks inside their body. `<patch>` is ALSO listed
  // in FILE_OPERATION_PSEUDO_TOOL_TAG_NAMES so Claude-style file-edit
  // narration is scrubbed from chat prose — but that strip also chews
  // through the element-patch body when it runs unconditionally.
  //
  // Empirically the model was emitting a well-formed element-patch, the
  // sanitizer was stripping every `<patch>` block inside it, and by the
  // time `parseElementPatch` looked at the body it saw only whitespace
  // between `<artifact type="element-patch">` and `</artifact>`. The
  // downstream error surfaced as `terminalPersistResultKind=skipped-
  // incomplete reason=empty element-patch body`, which was reproduced
  // reliably on staging conversations.
  //
  // Mask every closed `<artifact …>…</artifact>` region behind
  // placeholders BEFORE any tag-family strip runs. Multiple patterns
  // (PSEUDO_TOOL_TAG_NAMES, LEAKED_AGENT_PROSE_TAG_NAMES,
  // CLOSED_INTERNAL_MARKUP_FAMILY_RE, and the "patch" keyword inside
  // INTERNAL_MARKUP_KEYWORDS) would otherwise chew through the
  // element-patch body (which embeds `<patch target-id="…" slide-index="…"
  // kind="…">…</patch>` blocks), leaving the artifact body empty and
  // producing `terminalPersistResultKind=skipped-incomplete
  // reason=empty element-patch body` downstream.
  //
  // Mask BEFORE the strip chain, restore AFTER the entire chain
  // completes. The strip still runs on prose OUTSIDE artifacts so
  // genuine pseudo-tool `<patch>` narration keeps getting scrubbed.
  const { text: masked, restore: restoreArtifacts } = maskClosedArtifactRegions(out);
  out = masked;
  out = stripClosedTagFamilies(out, PSEUDO_TOOL_TAG_NAMES);
  // While streaming, keep closed <artifact> blocks so the live HTML parser can
  // receive the final body bytes + </artifact>. Display layers strip them.
  if (!options.preserveClosedArtifact) {
    // Strip artifact placeholders too — the restore below would put
    // them back, but display mode explicitly wants closed artifacts
    // dropped. Zap the placeholders (and their region entries)
    // before the restore step so nothing leaks.
    out = out.replace(
      new RegExp(`${ARTIFACT_PLACEHOLDER_PREFIX}\\d+${ARTIFACT_PLACEHOLDER_SUFFIX}`, "g"),
      "",
    );
  }
  out = out.replace(CLOSED_ANTML_RE, "");
  out = out.replace(CLOSED_NAMESPACED_INTERNAL_RE, "");
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
  out = out.replace(LEAKED_COMPACT_DECK_NAV_IIFE_RE, "");
  out = out.replace(LEAKED_COMPACT_ARROW_DECK_NAV_IIFE_RE, "");
  out = out.replace(LEAKED_COMPACT_ARROW_NAV_TAIL_RE, "");
  out = out.replace(LEAKED_WINDOW_ONKEYDOWN_NAV_RE, "");
  out = out.replace(LEAKED_COMPACT_CLASSIC_CLICK_NAV_IIFE_RE, "");
  out = out.replace(LEAKED_COMPACT_CLASSIC_KEYDOWN_CLICK_NAV_TAIL_RE, "");
  out = out.replace(LEAKED_DECK_NAV_SCRIPT_STORE_RE, "");
  out = out.replace(LEAKED_DECK_NAV_SCRIPT_MANGLED_IIFE_RE, "");
  out = stripOrphanCloseTagFamilies(out, LEAKED_AGENT_PROSE_TAG_NAMES);
  out = out.replace(ORPHAN_CLOSE_INTERNAL_MARKUP_FAMILY_RE, "");
  out = out.replace(ORPHAN_CLOSE_NAMESPACED_INTERNAL_RE, "");
  const bareTail = out.match(new RegExp(`${BARE_TOOL_JSON_OPEN_RE.source}[\\s\\S]*$`));
  if (bareTail?.index !== undefined) {
    out = out.slice(0, bareTail.index).trimEnd();
  }
  // Restore the masked artifact regions AFTER every strip has run,
  // so their inner `<patch>` / other reserved tags survive intact.
  out = restoreArtifacts(out);
  return collapseExtraBlankLines(out);
}

/**
 * Strip truncated head/CDN debris that agents stream as chat prose
 * (`googleapis.com" />`, orphan viewport meta tails, leaked `<link rel=stylesheet>`).
 * Reuses the preview leak patterns so chat and iframe stay in sync.
 *
 * When `preserveArtifactBodies` is true, debris scrubbing is applied only
 * outside closed `<artifact>…</artifact>` blocks so stylesheet URLs inside
 * the live HTML body survive until the preview parser consumes them.
 * Open (unclosed) artifact regions also skip full-tag scrub so mid-stream
 * `<link>` / `<script src>` inside the artifact still reach the live panel.
 */
export function stripChatProseHtmlDebris(
  input: string,
  options: { preserveArtifactBodies?: boolean } = {},
): string {
  if (!input) return input;
  const orphanPatterns = [
    ARTIFACT_VIEWPORT_TEXT_LEAK_RE,
    ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE,
    ARTIFACT_ORPHAN_LINK_ATTR_LEAK_RE,
    ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE,
    ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE,
  ];
  const fullTagPatterns = [
    ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE,
    ARTIFACT_LEAKED_META_CHARSET_TAG_RE,
    ARTIFACT_LEAKED_HEAD_LINK_TAG_RE,
    ARTIFACT_LEAKED_EXTERNAL_SCRIPT_TAG_RE,
  ];
  // Full head tags MUST run before orphan attr/void patterns. Otherwise
  // `rel="stylesheet"` carves the middle out of an intact `<link …>` and
  // leaves a `<link` residue in chat.
  // Full head tags MUST run before orphan attr/void patterns (invariant).
  const fullScrubPatterns = [...fullTagPatterns, ...orphanPatterns];

  const scrubSegment = (
    segment: string,
    patterns: RegExp[],
    scrubOpts: { stripDocumentBlocks?: boolean } = {},
  ): string => {
    let out = segment;
    for (const re of patterns) {
      re.lastIndex = 0;
      out = out.replace(re, "");
    }
    // Closed document/CSS/JS blocks never belong in chat prose. Never apply
    // inside open-artifact light scrub — the live HTML panel needs them.
    if (scrubOpts.stripDocumentBlocks) {
      out = out
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
        .replace(/<\/?(?:html|head|body|base)\b[^>]*>/gi, "")
        .replace(/<!doctype\s+html[^>]*>/gi, "");
      // Leaked CSS @import / url() font CDN lines — never chat copy.
      out = out.replace(
        new RegExp(
          `@import\\s+url\\s*\\(\\s*['"]?https?:\\/\\/[^)'"]*(?:${artifactCdnImportUrlTokenAlternation()})[^)'"]*['"]?\\s*\\)\\s*;?`,
          "gi",
        ),
        "",
      );
      out = out.replace(
        new RegExp(
          `(^|\\n)[ \\t]*url\\s*\\(\\s*['"]?https?:\\/\\/[^)'"]*(?:${artifactCdnImportUrlTokenAlternation()})[^)'"]*['"]?\\s*\\)\\s*;?[ \\t]*(?=\\n|$)`,
          "gi",
        ),
        "$1",
      );
      // Bare host or host+path lines (no `"/>` terminator) — chat prose only.
      out = out.replace(
        new RegExp(
          `(^|\\n)[ \\t]*${artifactBareCdnHostLineSource()}[ \\t]*(?=\\n|$)`,
          "gi",
        ),
        "$1",
      );
      // Same-line trailing host WITH path/query only (truncate debris).
      // Bare FQDN advice (`Docs at fonts.googleapis.com`) is preserved.
      out = out.replace(
        new RegExp(
          `(\\s)(?:https?:\\/\\/)?(?:${artifactCdnHostAlternation()})(?:\\/[^\\s<>]+|\\?[^\\s<>]+)(?=\\s*(?:\\n|$))`,
          "gi",
        ),
        "",
      );
      // family=/css2?family= lines (display=swap optional; void optional).
      out = out.replace(
        /(^|\n)[ \t]*(?:css2\?)?family=[A-Za-z0-9_+:;,=%&.@\-]+(?:(?:&amp;|&)[^\n]*)?[ \t]*(?:["']?\s*\/?\s*>)?[ \t]*(?=\n|$)/gi,
        "$1",
      );
    }
    return out;
  };

  const fullScrub = (segment: string): string =>
    scrubSegment(segment, fullScrubPatterns, { stripDocumentBlocks: true });
  const lightScrub = (segment: string): string =>
    scrubSegment(segment, orphanPatterns, { stripDocumentBlocks: false });

  /** Full-scrub prose, but leave an open `<artifact` region lightly scrubbed. */
  const scrubOutsideOpenArtifact = (segment: string): string => {
    const openArt = segment.search(/<artifact\b/i);
    if (openArt === -1) return fullScrub(segment);
    return fullScrub(segment.slice(0, openArt)) + lightScrub(segment.slice(openArt));
  };

  if (!options.preserveArtifactBodies) {
    return collapseExtraBlankLines(fullScrub(input));
  }

  const parts: string[] = [];
  let cursor = 0;
  CLOSED_ARTIFACT_RE.lastIndex = 0;
  let match: RegExpExecArray | null = CLOSED_ARTIFACT_RE.exec(input);
  while (match) {
    parts.push(scrubOutsideOpenArtifact(input.slice(cursor, match.index)));
    parts.push(match[0]);
    cursor = match.index + match[0].length;
    match = CLOSED_ARTIFACT_RE.exec(input);
  }
  parts.push(scrubOutsideOpenArtifact(input.slice(cursor)));
  return collapseExtraBlankLines(parts.join(""));
}


/**
 * Hold unclosed <style>/<script>/<title>/<noscript> in chat prose so CSS/JS
 * bodies cannot paint mid-stream. Skips the open-<artifact> suffix so the live
 * HTML panel still receives stylesheet blocks inside the artifact.
 */
function stripTrailingOpenDocumentBlocks(
  input: string,
): { text: string; hadOpenInternalMarkup: boolean } {
  const openArt = input.search(/<artifact\b/i);
  const closeArt = input.toLowerCase().lastIndexOf("</artifact>");
  const hasOpenArtifact = openArt !== -1 && (closeArt === -1 || closeArt < openArt);
  const head = hasOpenArtifact ? input.slice(0, openArt) : input;
  const tail = hasOpenArtifact ? input.slice(openArt) : "";
  let text = head;
  let hadOpenInternalMarkup = false;
  for (const name of ["style", "script", "title", "noscript"] as const) {
    const next = stripTrailingOpenTag(text, openTagRe(name), name);
    if (next.hadOpenInternalMarkup) {
      hadOpenInternalMarkup = true;
      text = next.text;
    }
  }
  const deckSlideOpen = stripTrailingOpenTag(text, DECK_SLIDE_PARTIAL_OPEN_TAG_RE, "section");
  if (deckSlideOpen.hadOpenInternalMarkup) {
    hadOpenInternalMarkup = true;
    text = deckSlideOpen.text;
  }
  return { text: text + tail, hadOpenInternalMarkup };
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
    // Open discovery forms flash raw JSON mid-stream; closed forms stay for UI.
    { re: openTagRe("question-form"), name: "question-form" },
    { re: openTagRe("ask-question"), name: "ask-question" },
    // Open system-reminder mid-stream: hide the injected prompt while it streams;
    // once closed, sanitize keeps the block so AssistantMessage can chip-render it.
    { re: openTagRe("system-reminder"), name: "system-reminder" },
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

  const namespaced = stripTrailingOpenDynamicTag(text, OPEN_NAMESPACED_INTERNAL_RE);
  if (namespaced.hadOpenInternalMarkup) {
    hadOpenInternalMarkup = true;
    text = namespaced.text;
  }

  const antml = stripTrailingOpenAntml(text);
  if (antml.hadOpenInternalMarkup) {
    hadOpenInternalMarkup = true;
    text = antml.text;
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

  const docBlocks = stripTrailingOpenDocumentBlocks(text);
  if (docBlocks.hadOpenInternalMarkup) {
    hadOpenInternalMarkup = true;
    text = docBlocks.text;
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

/**
 * Hold incomplete trailing markup tokens so chunk boundaries like
 * `"<thi"` + `"nking>…"` or `"<invoke name=\"Todo"` cannot paint partial tags.
 */
export function stripIncompleteTrailingMarkupToken(input: string): string {
  if (!input) return input;
  const lt = input.lastIndexOf("<");
  if (lt === -1) return input;
  const after = input.slice(lt + 1);
  if (after.includes(">")) return input;

  // Bare `<` / `<!` / `<!DOCTYPE…` / `</` prefixes mid-stream.
  if (after === "" || after === "/" || after === "!" || /^\/?!?(?:DOCTYPE\s*html?)?$/i.test(after)) {
    return input.slice(0, lt).trimEnd();
  }

  // Tag name only, or tag name + partial attributes (no closing `>` yet).
  const nameMatch = after.match(/^(\/?[a-zA-Z][a-zA-Z0-9_:-]*)/);
  if (!nameMatch) return input;
  const rawName = (nameMatch[1] ?? "").replace(/^\//, "");
  if (isInternalMarkupTagName(rawName)) {
    return input.slice(0, lt).trimEnd();
  }
  if (isDeckSlidePartialTag(rawName, after)) {
    return input.slice(0, lt).trimEnd();
  }
  return input;
}

const CLOSED_DISPLAY_CODE_FENCE_RE =
  /```(?:html|HTML|js|javascript|css|tsx|jsx|ts|typescript|json)?[^\n]*\n[\s\S]*?```/g;
const OPEN_DISPLAY_CODE_FENCE_RE =
  /```(?:html|HTML|js|javascript|css|tsx|jsx|ts|typescript|json)?[^\n]*\n[\s\S]*$/;

/** Strip fenced code blocks that should not appear in user-facing chat bubbles. */
export function stripAssistantCodeFencesForDisplay(input: string): string {
  if (!input) return input;
  let out = input.replace(CLOSED_DISPLAY_CODE_FENCE_RE, "");
  OPEN_DISPLAY_CODE_FENCE_RE.lastIndex = 0;
  const open = OPEN_DISPLAY_CODE_FENCE_RE.exec(out);
  if (open && open.index !== undefined) {
    out = out.slice(0, open.index).trimEnd();
  }
  // Incomplete fence opener: trailing ``` or ```ht…
  const partialFence = out.match(/```[a-zA-Z0-9_-]*$/);
  if (partialFence && partialFence.index !== undefined) {
    out = out.slice(0, partialFence.index).trimEnd();
  }
  return collapseExtraBlankLines(out);
}

export type SanitizeAssistantProseOptions = {
  streaming?: boolean;
  /** Hide ```html/js/… fences (Teamver embed / hide-thinking surfaces). */
  stripCodeFences?: boolean;
  /** Keep closed `<artifact>` blocks (defaults to true while `streaming`). */
  preserveClosedArtifact?: boolean;
};

/** Combined display sanitizer for assistant prose (history + live stream). */
export function sanitizeAssistantProseForDisplay(
  input: string,
  options: SanitizeAssistantProseOptions = {},
): string {
  const streaming = options.streaming ?? false;
  const withoutCommentProtocol = String(input || "")
    .replace(ATTACHED_PREVIEW_COMMENTS_RE, "\n")
    .replace(OPEN_ATTACHED_PREVIEW_COMMENTS_RE, "\n")
    .replace(ATTACHED_PREVIEW_COMMENTS_EMPTY_FALLBACK_RE, "\n")
    .replace(COMMENT_SLIDE_INDEX_ASK_RE, "\n");
  const closed = sanitizeLeakedAgentProse(withoutCommentProtocol, {
    // Live HTML parser feeds onContentDelta from this sanitized stream — keep
    // closed artifacts until the turn settles (display strips via stripArtifact).
    preserveClosedArtifact: streaming || options.preserveClosedArtifact === true,
  });
  let text = stripTrailingOpenInternalMarkup(closed, {
    preserveOpenArtifact: streaming,
  }).text;
  // Always strip incomplete trailing markup tokens — history/listMessages
  // must not leave `<thi` / `<lin` fragments from dirty persisted rows.
  text = stripIncompleteTrailingMarkupToken(text);
  // Hold incomplete CDN/viewport debris. Same-line trailing host cut is
  // streaming-only so history keeps advisory FQDN mentions.
  text = stripIncompleteTrailingHtmlDebris(text, {
    allowSameLineTrailingCut: streaming,
  });
  if (options.stripCodeFences) {
    text = stripAssistantCodeFencesForDisplay(text);
  }
  // Orphan CDN/viewport debris is always scrubbed outside artifact bodies.
  // Full head tags run on prose (and before open `<artifact` regions) so chat
  // never keeps CDN `<script>` / `<link>` while streaming; closed + open
  // artifact bodies keep their stylesheets for the live HTML panel.
  const preservingArtifacts = streaming || options.preserveClosedArtifact === true;
  text = stripChatProseHtmlDebris(text, {
    preserveArtifactBodies: preservingArtifacts,
  });
  // Debris scrub can leave a truncated tag name (`<link`); strip it now.
  text = stripIncompleteTrailingMarkupToken(text);
  const stripDeckCssTail =
    !streaming || !hasUnclosedTrailingArtifact(text);
  if (stripDeckCssTail) {
    text = stripTrailingDeckFrameworkCssLeak(text);
  }
  // Kit `:root{--bg:#…}` dumps can appear mid-message (not only trailing).
  // Never scrub inside preserved artifact bodies (live style tokens stay intact).
  text = stripLeakedCssCustomPropertyBlocksRespectingArtifacts(text, preservingArtifacts);
  text = stripTrailingDeckHtmlMarkupLeakRespectingArtifacts(text, preservingArtifacts);
  // Absolute last pass: classic/minified click-nav and keydown advance must
  // never survive a dialect miss or partial open-form match.
  text = stripHardDeckNavJsFingerprints(text);
  return text;
}

/** Drop truncated deck stylesheet/CSS leaked into chat prose (mid-artifact abort). */
export function stripTrailingDeckFrameworkCssLeak(input: string): string {
  if (!input) return input;
  const match = /(?:^|\n\n|\n)((?::root\s*\{|(?:\.slide|(?:\.[A-Za-z_-][\w-]*|#[A-Za-z_-][\w-]*|h[1-6]|p|ul|li|body|section(?:\.[\w-]+)?)\s*\{))[\s\S]*)$/i.exec(input);
  if (!match || match.index === undefined) return input;
  const tail = match[1] ?? "";
  const looksLikeDeckFramework =
    /width:\s*1920px|height:\s*1080px|box-sizing:\s*border-box|\.grain::after/i.test(tail)
    || /<\/style>|<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b|<!--\s*SLIDE\b/i.test(tail)
    || /^\.slide\s*\{[\s\S]*/.test(tail.trim())
    || /\.deco-[\w-]+\s*\{/i.test(tail)
    || looksLikeLeakedCssCustomPropertyBlock(tail);
  if (!looksLikeDeckFramework) return input;
  return input.slice(0, match.index).trimEnd();
}

/**
 * True for `:root{--bg:#…;--coral:#…}` (and multiline hex splits) that must
 * never appear as chat copy — models often emit kit tokens before/without the
 * deck artifact.
 */
function looksLikeLeakedCssCustomPropertyBlock(text: string): boolean {
  const sample = String(text ?? "").trim();
  if (!sample) return false;
  if (!/^:root\b/i.test(sample) && !/--[a-zA-Z_][\w-]*\s*:/.test(sample)) return false;
  const customProps = sample.match(/--[a-zA-Z_][\w-]*\s*:/g) ?? [];
  if (customProps.length < 2) return false;
  // Palette / surface dumps always carry hex (optionally split across lines).
  const hexHits = sample.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [];
  if (hexHits.length < 2 && !/--(?:bg|fg|ink|paper|surface|outline|coral|lime|sky)\b/i.test(sample)) {
    return false;
  }
  // Reject if it still looks like normal prose with an incidental mention.
  if (/[가-힣A-Za-z]{12,}/.test(sample.replace(/:root|var\(--[\w-]+\)|--[\w-]+/gi, " "))) {
    return false;
  }
  return true;
}

/**
 * Strip standalone kit `:root { --token: #hex }` dumps anywhere in chat prose
 * (not only trailing). Keeps real sentences; drops pure token blocks.
 */
export function stripLeakedCssCustomPropertyBlocks(input: string): string {
  if (!input) return input;
  let text = String(input);
  // Compact or pretty `:root{--a:#…;--b:#…}` blocks (hex may wrap after `:`).
  text = text.replace(
    /(?:^|\n)\s*:root\s*\{[\s\S]*?\}/gi,
    (block, offset) => (looksLikeLeakedCssCustomPropertyBlock(block) ? (offset > 0 ? "\n" : "") : block),
  );
  // Entire-message dump without a closing `}` yet (streaming / aborted style).
  if (looksLikeLeakedCssCustomPropertyBlock(text) && !/<[a-z]|[가-힣]{4,}/i.test(text.replace(/:root|--[\w-]+|#[0-9A-Fa-f]+/gi, " "))) {
    return "";
  }
  text = text.replace(/\n{3,}/g, "\n\n");
  // Do not trim — preserving a trailing `\n` before `<artifact` matters for
  // streaming/history equality and monotonic chat growth.
  if (!text.trim()) return "";
  return text;
}

function stripLeakedCssCustomPropertyBlocksRespectingArtifacts(
  input: string,
  preserveArtifactBodies: boolean,
): string {
  if (!preserveArtifactBodies) return stripLeakedCssCustomPropertyBlocks(input);
  let result = "";
  let cursor = 0;
  while (cursor < input.length) {
    const open = input.indexOf("<artifact", cursor);
    if (open === -1) {
      result += stripLeakedCssCustomPropertyBlocks(input.slice(cursor));
      break;
    }
    result += stripLeakedCssCustomPropertyBlocks(input.slice(cursor, open));
    const gt = input.indexOf(">", open);
    if (gt === -1) {
      result += input.slice(open);
      break;
    }
    const close = input.toLowerCase().indexOf("</artifact>", gt);
    if (close === -1) {
      // Open artifact: scrub prose before it, keep the open body untouched.
      result += input.slice(open);
      break;
    }
    const end = close + "</artifact>".length;
    result += input.slice(open, end);
    cursor = end;
  }
  return result;
}

/**
 * Stateful streaming guard: reassembles deltas, sanitizes the full buffer, and
 * only emits monotonic visible growth. Prevents per-chunk strip from splitting
 * tags across SSE boundaries.
 */
export function createStreamingAssistantProseGuard(
  options: Omit<SanitizeAssistantProseOptions, "streaming"> = {},
): {
  feed: (delta: string) => string;
  flush: () => string;
} {
  let buffer = "";
  let emitted = "";
  const sanitize = (value: string) =>
    sanitizeAssistantProseForDisplay(value, { ...options, streaming: true });

  const emitGrowth = (visible: string): string => {
    if (visible.startsWith(emitted)) {
      const growth = visible.slice(emitted.length);
      emitted = visible;
      return growth;
    }
    // Non-monotonic after a late closed-tag strip: do not re-send prior text.
    emitted = visible;
    return "";
  };

  return {
    feed(delta: string) {
      if (!delta) return "";
      buffer += delta;
      return emitGrowth(sanitize(buffer));
    },
    flush() {
      if (!buffer && !emitted) return "";
      // Use streaming-mode sanitize even at flush time so that any trailing
      // partial internal-markup token (e.g. `<thi` waiting for `<think>`) is
      // still dropped instead of being emitted as visible text when the
      // stream ends without a closing `>`. Closed artifacts stay preserved
      // because the live HTML panel parses them from the delta stream.
      const visible = sanitizeAssistantProseForDisplay(buffer, {
        ...options,
        streaming: true,
      });
      const growth = emitGrowth(visible);
      buffer = "";
      return growth;
    },
  };
}
