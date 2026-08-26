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

/**
 * Host-parsed markup that must survive residual HTML scrub so the
 * Questions banner / live artifact / prompt-injection chip can parse it.
 */
const CHAT_PROSE_PROTOCOL_TAG_NAMES = [
  "artifact",
  "question-form",
  "ask-question",
  "system-reminder",
] as const;

const CHAT_PROSE_PROTOCOL_TAG_ALT = CHAT_PROSE_PROTOCOL_TAG_NAMES.join("|");

const DECK_HTML_ATTR_TAIL_NAMES =
  "class|id|style|role|aria-[\\w-]+|data-[\\w-]+|xmlns(?::[\\w-]+)?|viewBox|d|srcset|sizes|tabindex|src|href|className|xlink:href|stroke(?:-width|-linecap|-linejoin|-miterlimit)?|fill|on[a-z]+\\$?|points|clip-path|srcdoc|sandbox|transform|v-[\\w-]+|:class|:key|:style|@[\\w.-]+|on:[a-z]+|hx-[\\w-]+|x-[\\w-]+|colspan|rowspan|loading|decoding|fetchpriority|crossorigin|integrity|poster|usemap|formaction|referrerpolicy|nonce|marker-start|marker-end|marker-mid|paint-order|vector-effect|gradientUnits|stop-color|stop-opacity|stdDeviation|cx|cy|r|rx|ry";

function isChatProseProtocolTagName(name: string): boolean {
  const lower = name.toLowerCase();
  return (CHAT_PROSE_PROTOCOL_TAG_NAMES as readonly string[]).includes(lower);
}

function lineIsChatProseProtocolMarkup(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  const match = /^<\/?([A-Za-z][\w:-]*)\b/.exec(trimmed);
  return Boolean(match?.[1] && isChatProseProtocolTagName(match[1]));
}

/**
 * 1–2 letter tags without attrs stay while streaming (`Text <p`, `Text <a`).
 * `h1`–`h6` / list / table tags are deck chrome even at two letters.
 */
function isShortStreamingHtmlPrefix(name: string): boolean {
  const lower = String(name ?? "").toLowerCase();
  if (!lower) return false;
  if (isChatProseProtocolTagName(lower) || /^(?:https?|br|wbr)$/.test(lower)) return true;
  if (/^(?:h[1-6]|li|ul|ol|td|th|tr)$/.test(lower)) return false;
  return lower.length <= 2;
}

function looksLikeIncompleteHtmlOpenLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || lineIsChatProseProtocolMarkup(trimmed)) return false;
  return /^<\/?[A-Za-z][\w:-]*\b[^>]*$/.test(trimmed) && !/>/.test(trimmed);
}

function looksLikeHtmlAttrContinuationLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || lineIsChatProseProtocolMarkup(trimmed)) return false;
  if (/^<https?:\/\//i.test(trimmed)) return false;
  if (/^(?:[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+)\s*)+\/?>/.test(trimmed)) return true;
  if (/^[\w:-]+\s*=\s*["'][^"']*$/.test(trimmed)) return true;
  if (/^[\w:-]+\s*=/.test(trimmed) && /<\/?[A-Za-z]/.test(trimmed)) return true;
  return false;
}

/** Standalone SVG/XML/HTML attribute dumps left after the opener was cut. */
function looksLikeHtmlAttrDumpLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || lineIsChatProseProtocolMarkup(trimmed)) return false;
  if (/^<https?:\/\//i.test(trimmed)) return false;
  if (
    new RegExp(`^(?:${DECK_HTML_ATTR_TAIL_NAMES}|preserveAspectRatio|clip-rule|fill-rule)\\s*=`, "i").test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^d\s*=\s*["'][MmLlHhVvCcSsQqTtAaZz]/.test(trimmed)) return true;
  if (/^transform\s*=\s*["'](?:translate|scale|rotate|matrix|skew)/i.test(trimmed)) return true;
  if (/^values\s*=\s*["'][\d.\s-]+/.test(trimmed)) return true;
  if (/^gradientTransform\s*=/i.test(trimmed)) return true;
  if (/^in\s*=\s*["']Source/i.test(trimmed)) return true;
  if (/^result\s*=\s*["']goo["']/i.test(trimmed)) return true;
  if (/^style=\{\{/.test(trimmed)) return true;
  if (/^(?:\([\w.-]+\)|\[[\w.-]+\]|\*ng[\w]+)\s*=/.test(trimmed)) return true;
  if (/^(?:as|type|media)\s*=\s*["']?(?:font|text\/|image\/|video\/|audio\/|print|screen|all|\()/i.test(trimmed)) {
    return true;
  }
  if (/^(?:(?:cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|dx|dy|offset)\s*=\s*["']?[\d.]+["']?\s*){2,}$/i.test(trimmed)) {
    return true;
  }
  if (
    /^(?:class|id|style|className)\s*=\s*[^\s<>]+$/.test(trimmed)
    && !/[\uac00-\ud7af]{4,}/.test(trimmed)
  ) {
    return true;
  }
  if (
    /^(?:[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*')\s*){1,12}$/.test(trimmed)
    && /(?:xmlns|viewBox|class|style|data-|aria-|srcset|tabindex|role)\b/i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/** Whole-line CSS function leftovers (`linear-gradient(…)`, `var(--bg)`). */
function looksLikeCssFunctionDebrisLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || /[\uac00-\ud7af]{3,}/.test(trimmed)) return false;
  if (/^(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i.test(trimmed)) return true;
  if (/^var\(\s*--[\w-]+\s*(?:,[^)]*)?\)\s*;?\s*$/i.test(trimmed)) return true;
  if (/^(?:oklch|oklab|hwb|lab|lch|color-mix)\s*\(/i.test(trimmed)) return true;
  if (/^hsla?\s*\(\s*[\d.]+(?:[\s,/%\d.]+)+\)\s*;?\s*$/i.test(trimmed)) return true;
  if (/^url\(\s*data:/i.test(trimmed)) return true;
  if (/^data:image\//i.test(trimmed)) return true;
  if (/^rgba?\s*\(/i.test(trimmed)) return true;
  if (/^url\(\s*#/i.test(trimmed)) return true;
  if (/^url\(\s*['"]?(?:https?:|\/|\.\/|\.\.\/)/i.test(trimmed)) return true;
  if (/^url\(\s*['"][^'"]+\.(?:woff2?|ttf|otf|eot)(?:\?|#|['")])?/i.test(trimmed)) return true;
  if (/^format\(\s*['"](?:woff2?|truetype|opentype|embedded-opentype|svg)['"]/i.test(trimmed)) {
    return true;
  }
  if (/^local\(\s*['"]?[A-Za-z]/.test(trimmed)) return true;
  if (/^tech\(\s*[\w-]+/i.test(trimmed)) return true;
  if (/^(?:calc|clamp|min|max|minmax|repeat|fit-content)\s*\(/i.test(trimmed)) return true;
  if (
    /^(?:blur|drop-shadow|grayscale|brightness|contrast|saturate|sepia|hue-rotate|invert|opacity)\s*\(/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^(?:circle|ellipse|inset|xywh|rect|polygon|path|superellipse)\s*\(/i.test(trimmed)) {
    return true;
  }
  if (/^(?:paint|contrast-color|palette-mix|linear|abs|sign|mod|rem|round|hypot|pow|sqrt)\s*\(/i.test(trimmed)) {
    return true;
  }
  if (/^var\(\s*--(?:font|ff|display|sans|serif|mono|hand)[\w-]*/i.test(trimmed)) return true;
  if (/^image\s*\(/i.test(trimmed)) return true;
  if (/^element\s*\(\s*#/i.test(trimmed)) return true;
  if (/^anchor(?:-size)?\s*\(/i.test(trimmed)) return true;
  if (/^color\s*\(\s*(?:display-p3|srgb|srgb-linear|a98-rgb|prophoto-rgb|rec2020|xyz)/i.test(trimmed)) {
    return true;
  }
  if (/^light-dark\s*\(/i.test(trimmed)) return true;
  if (/^image-set\s*\(/i.test(trimmed)) return true;
  if (/^env\s*\(\s*safe-area/i.test(trimmed)) return true;
  if (/^steps\s*\(\s*\d+/i.test(trimmed)) return true;
  if (/^cross-fade\s*\(/i.test(trimmed)) return true;
  if (/^device-cmyk\s*\(/i.test(trimmed)) return true;
  if (/^(?:calc-size|scroll|view|ray|attr|counter|sibling-index|sibling-count|cubic-bezier)\s*\(/i.test(trimmed)) {
    return true;
  }
  if (/^if\s*\(\s*style\s*\(/i.test(trimmed)) return true;
  if (
    /^(?:translate(?:3d|[XYZ])?|rotate(?:[XYZ]|3d)?|scale(?:3d|[XYZ])?|skew(?:[XY])?|matrix(?:3d)?|perspective)\s*\(/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/** Tailwind arbitrary size/color dumps (`bg-[#F5F0E6] w-[1920px]`). */
function looksLikeTailwindArbitraryDebrisLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || /[\uac00-\ud7af]{3,}/.test(trimmed)) return false;
  if (/[{};<>]/.test(trimmed)) return false;
  const tokens = trimmed.split(/\s+/);
  const arbitrary = tokens.filter((token) =>
    /^(?:[a-z]{1,12}-)?(?:w|h|min-w|min-h|max-w|max-h|bg|text|border|p|px|py|m|mx|my|gap|top|left|right|bottom|inset|from|to|via)-\[/.test(
      token,
    ),
  );
  if (arbitrary.length >= 2) return true;
  return arbitrary.length >= 1 && /1920|1080|#[0-9A-Fa-f]{3,8}/.test(trimmed);
}

function looksLikeBrStackedHeadingLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!/<br\b/i.test(trimmed) || trimmed.length > 80 || /[.!?。…?]/.test(trimmed)) {
    return false;
  }
  return /^(?:[\p{L}\p{N}\s/·.\-]*<br\s*\/?>\s*)+[\p{L}\p{N}\s/·.\-]*$/u.test(trimmed);
}

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
  if (
    /^@(?:page|media|keyframes|import|font-face|supports|layer|container|scope|property|starting-style|charset|counter-style)\b/.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^(?:from|to|\d+%)\s*\{/.test(trimmed) && /transform|opacity|translate|rotate/i.test(trimmed)) {
    return true;
  }
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
/**
 * Trailing styled inline chrome. Nested quotes inside `style="font-family:'X'"`
 * must NOT use `[^"']*` (that stops at the first inner quote).
 */
const DECK_TRAILING_INLINE_MARKUP_RE =
  /(?:\n|^)\s*<(?:p|span|div|strong|em|b|i|button|label)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:font|letter-spacing|margin|text-transform|display\s*:\s*flex)[\s\S]*$/i;
const DECK_TRAILING_HEADING_MARKUP_RE =
  /(?:\n|^)\s*<h[1-6]\b[^>]*(?:style\s*=)?[^>]*>[\s\S]*$/i;
const DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE =
  /<(?:div|span|header|footer|nav|img|aside)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?position\s*:\s*(?:absolute|fixed)[\s\S]*$/i;
const DECK_MOTIF_PILL_RADIUS_TAIL_RE =
  /<(?:div|span|button)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?border-radius\s*:\s*9999px[\s\S]*$/i;
/**
 * Daisy / Quicksand badge pills (`border-radius:20px` + box-shadow / font-family)
 * — not covered by the Capsule `9999px` pill pattern.
 */
const DECK_MOTIF_STYLED_BADGE_TAIL_RE =
  /<(?:div|span|button)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?border-radius\s*:\s*\d+px[\s\S]*?(?:box-shadow|font-family|font-weight|padding)\s*:[\s\S]*$/i;
/**
 * Deck eyebrow / hero typography chrome (`font-family` + letter-spacing /
 * text-transform / large display size) without border-radius — user report
 * 2026-08-20 reload leak (`Barlow` + `Engineering Deep Dive`).
 */
const DECK_MOTIF_STYLED_TYPOGRAPHY_TAIL_RE =
  /<(?:div|span|strong|em|b|p|h[1-6]|button|label)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?font-family\s*:[\s\S]*?(?:letter-spacing|text-transform|font-size\s*:\s*\d{2,}px|font-weight\s*:\s*(?:[5-9]00|bold))[\s\S]*$/i;
/** Orphan `</div><div style="flex:…">` layout shells after the opener was cut. */
const DECK_ORPHAN_FLEX_LAYOUT_DIV_TAIL_RE =
  /<\/div>\s*<div\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:display\s*:\s*flex|flex\s*:|flex-direction|justify-content|gap\s*:)[\s\S]*$/i;
/** Standalone flex/grid layout shells (no preceding `</div>` required). */
const DECK_FLEX_OR_GRID_LAYOUT_TAIL_RE =
  /<(?:div|section|header|footer|nav|main|article)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:display\s*:\s*(?:flex|grid)|flex-direction|grid-template|justify-content|align-items|gap\s*:\s*\d)[\s\S]*$/i;
/** Full-bleed 1920×1080 slide frame without `class="slide"`. */
const DECK_FULL_FRAME_SIZE_TAIL_RE =
  /<(?:section|div|main|article)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:width\s*:\s*1920px|height\s*:\s*1080px)[\s\S]*$/i;
/** `data-deck-*` / `data-slide-*` chrome. */
const DECK_DATA_ATTR_TAIL_RE =
  /<(?:div|section|main|article)\b[^>]*\bdata-(?:deck|slide)[\w-]*\s*=/i;
/** %-positioned deco shells (relative/absolute). */
const DECK_POSITIONED_PCT_TAIL_RE =
  /<(?:div|span)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:(?:top|right|bottom|left)\s*:\s*[\d.]+%|(?:transform\s*:\s*translate)|(?:position\s*:\s*(?:relative|absolute|fixed)[\s\S]*?(?:top|left|right|bottom|inset)\s*:))[\s\S]*$/i;
/** Table / list chrome with inline styles. */
const DECK_TABLE_OR_LIST_TAIL_RE =
  /<(?:table|ul|ol)\b[^>]*\bstyle\s*=\s*["'][\s\S]*$/i;
/** Deck `<img … style|motif.svg>`. */
const DECK_IMG_TAIL_RE =
  /<img\b[^>]*(?:\bstyle\s*=|src\s*=\s*["'][^"']*(?:motif|deco|\.svg)|object-fit\s*:)[\s\S]*$/i;
/** `<picture>` / `<source srcset>` media chrome. */
const DECK_PICTURE_TAIL_RE =
  /<(?:picture|source)\b[\s\S]*$/i;
/** Video / canvas / iframe / object / embed deck chrome. */
const DECK_MEDIA_EMBED_TAIL_RE =
  /<(?:video|canvas|iframe|audio|object|embed)\b[^>]*(?:\bstyle\s*=|width\s*=\s*["']?1920|height\s*=\s*["']?1080|poster\s*=|object-fit|data\s*=|type\s*=\s*["']image\/)[\s\S]*$/i;
/** `role="presentation"` / `aria-hidden` deco shells. */
const DECK_A11Y_DECO_SHELL_TAIL_RE =
  /<(?:div|span|section)\b[^>]*(?:\brole\s*=\s*["']presentation["']|\baria-hidden\s*=\s*["']true["'])[^>]*(?:\bstyle\s*=)?[\s\S]*$/i;
/** Figure / figcaption chrome. */
const DECK_FIGURE_TAIL_RE =
  /<(?:figure|figcaption)\b[^>]*\bstyle\s*=\s*["'][\s\S]*$/i;
/**
 * Visual chrome styles that are never chat prose: gradients, clip-path,
 * backdrop-filter (with or without border-radius).
 */
const DECK_VISUAL_EFFECT_STYLE_TAIL_RE =
  /<(?:div|span|section|aside|header|footer)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:(?:linear|radial|conic)-gradient\s*\(|clip-path\s*:|(?:-webkit-)?backdrop-filter\s*:|mix-blend-mode\s*:|(?:-webkit-)?mask-image\s*:|filter\s*:\s*blur|aspect-ratio\s*:|background-image\s*:\s*url\s*\(\s*data:|box-shadow\s*:[\s\S]*border-radius\s*:|height\s*:\s*\d+px[\s\S]*width\s*:\s*\d+%|will-change\s*:|writing-mode\s*:|column-count\s*:)[\s\S]*$/i;
/** Escaped inline style dumps (`style=\"font-family:…\"`). */
const DECK_ESCAPED_STYLE_ATTR_TAIL_RE =
  /(?:\n|^)\s*<(?:span|div|strong|em|p|h[1-6]|button)\b[^>]*\bstyle\s*=\s*\\["'][\s\S]*$/i;
/** HTML-entity encoded deck tags (`&lt;span style=…&gt;`). */
const DECK_HTML_ENTITY_TAG_TAIL_RE =
  /(?:\n|^)\s*&lt;\/?(?:span|div|section|style|svg|h[1-6]|p|button)\b[\s\S]*$/i;
/** Bare CSS dumps: class rules (incl. `.tag.inv`), pseudo, animation shorthand. */
const DECK_BARE_CSS_MOTION_TAIL_RE =
  /(?:\n|^)\s*(?:(?:\.[A-Za-z_-][\w-]*)+(?:::?(?:before|after))?\s*\{|animation\s*:[\s\S]*?(?:infinite|forwards|ease|linear)|transform-origin\s*:)[\s\S]*$/i;
/**
 * Compound / utility class CSS rule dumps that are never chat prose
 * (`.tag.inv{border-color:rgba(…);color:\n#1c1c1c}`).
 */
const DECK_CLASS_RULE_CSS_TAIL_RE =
  /(?:\n|^)\s*(?:\.[A-Za-z_-][\w-]*){1,6}\s*\{[\s\S]*?(?:(?:border(?:-color|-radius|-width)?|color|padding|margin|background|font|display|opacity)\s*:|rgba?\(|hsla?\(|#[0-9A-Fa-f]{3,8})[\s\S]*$/i;
/** MathML / foreignObject leftovers. */
const DECK_MATH_OR_FOREIGN_TAIL_RE =
  /<(?:math|foreignObject|mi|mo|mn|mrow)\b[\s\S]*$/i;
/** Landmark chrome (`header`/`footer`/`nav`). */
const DECK_CHROME_LANDMARK_TAIL_RE =
  /<(?:header|footer|nav|aside)\b[^>]*\bstyle\s*=\s*["'][\s\S]*$/i;
/** Trailing orphan close-tag stacks (`</div></div></section>`). */
const DECK_ORPHAN_CLOSE_TAGS_TAIL_RE =
  /(?:\n|^)\s*(?:<\/(?:div|span|section|header|footer|nav|aside|main|article|h[1-6]|p|ul|ol|li|table|tr|td|th|button)+>\s*)+\s*$/i;
/** Mid-message CSS custom-property dumps (`--bg:#…;--fg:#…`). */
const DECK_CSS_CUSTOM_PROP_DUMP_TAIL_RE =
  /(?:\n|^)\s*(?:--[\w-]+\s*:\s*[^;\n]+;\s*){2,}[\s\S]*$/i;
/**
 * `<br>`-stacked hero titles ending in `</h1>` without a clean opener.
 * Hangul-glued forms (`제목 넣는 중CLOUD<br>…`) are handled by
 * findTrailingSameLineDeckHtmlCut so the Hangul prefix is kept.
 */
const DECK_BR_STACKED_HEADING_TAIL_RE =
  /(?:\n|^)(?![^\n]*[\uac00-\ud7af])[^\n]*<br\b[\s\S]*?<\/h[1-6]>/i;
const DECK_CARD_STYLE_DIV_TAIL_RE =
  /<(?:div|article)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:card|pill|chip|deco)[^"']*["'][^>]*\bstyle\s*=[\s\S]*$/i;
const DECK_DECO_CLASS_TAIL_RE =
  /<(?:div|span|svg|g|i)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:deco-|floating-pill|pixel-glitch|win-titlebar)[\s\S]*$/i;
const DECK_MOTIF_SVG_TAIL_RE =
  /<svg\b[^>]*(?:class\s*=\s*["'][^"']*\b(?:deco-|floating-pill)|viewBox\s*=|style\s*=\s*["'][^"']*position\s*:\s*absolute)[\s\S]*$/i;
const DECK_MOTIF_PATH_TAIL_RE =
  /<path\b[^>]*\bd\s*=\s*["'][\s\S]*$/i;
/** Leftover Daisy SVG children after `<svg` was already consumed. */
const DECK_MOTIF_SVG_PRIMITIVE_TAIL_RE =
  /<(?:circle|rect|ellipse|polygon|polyline|line|g|defs|linearGradient|radialGradient|stop|use|text|tspan|foreignObject)\b/i;
const DECK_MOTIF_SVG_CLOSE_TAIL_RE = /<\/svg\b/i;
/** `<!-- Daisy motif TL -->` / layout comments (`<!-- Left: intro -->`) + following dump. */
const DECK_MOTIF_HTML_COMMENT_TAIL_RE =
  /(?:^|\n)\s*<!--[\s\S]*$/;
/** Orphan deck `<li>…</li>` dumps (zhangzara/studio HTML body leaked into chat). */
const DECK_ORPHAN_LI_DUMP_TAIL_RE =
  /(?:^|\n)\s*<li\b[\s\S]*$/i;
/** Bare / mismatched `<div>…</p>` chrome stacks (2+ bare divs or div/p mismatch). */
const DECK_BARE_DIV_OR_MISMATCH_TAIL_RE =
  /(?:^|\n)\s*(?:(?:<\/?div>\s*){2,}|(?:<div\b[^>]*>[\s\S]*?<\/p>))[\s\S]*$/i;
const DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE =
  /<\/(?:section|div)>\s*[-a-z]*weight\s*:[\s\S]*$/i;
/**
 * Truncated inline-style attribute debris that starts mid-declaration
 * (`px;left:60px;…uppercase">Label</div>`) — common after mid-artifact abort
 * when the leading `<div style="…` was already consumed by stripArtifact.
 *
 * Values may be quoted (`font-family:'Space Grotesk'`) or split across
 * newlines (`color:\n#7ECDC0`). Require two declarations so a lone
 * `color: red">` mention in prose is not chopped.
 */
const DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE =
  /(?:^|\n)(?:(?:px|em|rem|%|vh|vw|#(?:[0-9A-Fa-f]{3,8}))\s*;\s*)?(?:[a-zA-Z-]+\s*:\s*[^;]*;?\s*){2,}[\s\S]*?["']\s*>[\s\S]*$/i;
/**
 * Truncated SVG `<style>` body (`none;stroke:…}.cls-3{…}</style>`) after the
 * opening `<style>` / comment was already stripped. `</style>` is optional —
 * reload can persist a cut mid-declaration without the closing tag.
 */
const DECK_ORPHAN_MID_SVG_CSS_STYLE_TAIL_RE =
  /(?:^|\n)(?:(?:none|solid|inherit|round|butt|miter|bevel)\s*;\s*)?(?:(?:stroke(?:-[\w]+)?|fill|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit)\s*:[^;]*;?\s*){2,}[\s\S]*$/i;
const DECK_SLIDE_PARTIAL_OPEN_TAG_RE =
  /<(?:section|div)\b[^>]*(?:\bclass\s*=\s*["'][^"']*\bslide\b|data-slide-index|data-slide\b)[^>]*>/i;

function isDeckSlidePartialTag(name: string, after: string): boolean {
  const lower = name.toLowerCase();
  if (lower !== "section" && lower !== "div") return false;
  const tail = after.toLowerCase();
  return tail.includes("slide") || tail.includes("data-slide");
}

/** Incomplete open tags for deck chrome left after mid-scrub (`<span style="`). */
function isDeckChromePartialTag(name: string, after: string): boolean {
  const lower = name.toLowerCase();
  if (
    !/^(?:div|span|section|header|footer|nav|aside|main|article|table|tr|td|th|ul|ol|li|img|button|strong|em|b|i|p|h[1-6]|figure|figcaption|label|a|video|canvas|iframe|audio|picture|source|object|embed|math|foreignObject|link|meta)$/.test(
      lower,
    )
  ) {
    return false;
  }
  return (
    /\b(?:style|class|data-(?:slide|deck)|src|href|srcset|poster|role|aria-hidden|rel|name|content|data)\s*=/i.test(after)
    || /\b(?:style|class)\s*=\s*["']?\s*$/i.test(after)
  );
}

/**
 * Hangul/CJK status glued to a truncated font-family / mid-style dump:
 * `슬라이드 추가 중Caveat',cursive;font-size:23px;…">`.
 * The dump often starts with a font name leftover, not `property:`.
 */
function findHangulGluedStyleDumpCut(line: string): number | null {
  const match = /^(.*[\uac00-\ud7af\u3000-\u9fff][.\u3002…]?)([\s\S]+)$/u.exec(line);
  if (!match?.[1] || !match[2]) return null;
  const prefix = match[1];
  const dump = match[2];
  if (/\s$/.test(prefix) || dump.length < 4) return null;
  if (
    /^@(?:import|font-face|supports|layer|keyframes|media|charset|container|scope|property|starting-style|page|counter-style)\b/i.test(
      dump,
    )
  ) {
    return prefix.length;
  }
  if (/^(?:from|to|\d+%)\s*\{/.test(dump)) return prefix.length;
  if (/^--[A-Za-z_][\w-]*\s*[:{]/.test(dump)) return prefix.length;
  if (/^html\s*>/i.test(dump)) return prefix.length;
  if (looksLikeCssFunctionDebrisLine(dump)) return prefix.length;
  if (/^\$[a-zA-Z_-][\w-]*\s*:/.test(dump) && /(?:#|rgba?\(|hsla?\(|px|em|rem|%)/.test(dump)) {
    return prefix.length;
  }
  if (/^(?:document|window)\.\w+/.test(dump)) return prefix.length;
  if (dump.length >= 6 && looksLikeDeckCodeDebrisLine(dump)) return prefix.length;
  if (dump.length >= 6 && looksLikeTailwindArbitraryDebrisLine(dump)) return prefix.length;
  if (dump.length < 8) return null;
  const decls = dump.match(/[a-zA-Z-]+\s*:\s*[^;\n]{1,96};/g) ?? [];
  const fontStack = /(?:cursive|sans-serif|serif|monospace|fantasy|system-ui)\s*;/i.test(dump);
  const styleClose = /["']\s*>/.test(dump);
  const fontName = /(?:Caveat|Zilla|Quicksand|Fredoka|Grotesk|Barlow|Instrument|Plex|Inter|Geist|Playfair|Pretendard|Noto)/i.test(
    dump,
  );
  const fontLeftover =
    /^(?:['"][A-Za-z][\w\s]+['"]|[A-Za-z][\w\s]{0,24}['"])\s*,\s*(?:cursive|sans-serif|serif|monospace)/i.test(
      dump,
    );
  if (decls.length >= 2 && (styleClose || fontStack || fontName || fontLeftover)) {
    return prefix.length;
  }
  if (fontStack && decls.length >= 1) return prefix.length;
  if ((fontStack || fontName || fontLeftover) && styleClose) return prefix.length;
  if (fontName && fontStack) return prefix.length;
  if (fontLeftover && (fontStack || styleClose || decls.length >= 1)) return prefix.length;
  // @font-face body glued to status: `중url('…woff2')` / `중src: url(` / `중local(`.
  if (/^(?:url|local|format|tech)\s*\(|^src\s*:\s*(?:url|local|tech)\s*\(|^@font-face\b/i.test(dump)) {
    return prefix.length;
  }
  return null;
}

/**
 * Latin/Hangul prose glued to `Caveat',cursive;font-size:…">` when midCss
 * matches the whole line as CSS (empty prefix) and would otherwise keep it.
 */
function findFontStackDumpIndex(line: string): number | null {
  // Prefer a CamelCase font leftover after prose (`slideCaveat',cursive;`)
  // so `Adding slideCaveat'` does not match from column 0.
  const re =
    /[A-Z][A-Za-z]{1,23}['"]\s*,\s*(?:cursive|sans-serif|serif|monospace|fantasy|system-ui)\s*;/g;
  let match: RegExpExecArray | null = re.exec(line);
  while (match) {
    if (match.index > 0) {
      const prefix = line.slice(0, match.index);
      if (
        /[\p{L}\p{N}]/u.test(prefix)
        && !/\bstyle\s*=\s*["']\s*$/i.test(prefix)
        && !/<[a-z][\w:-]*\b[^>]*$/i.test(prefix)
      ) {
        const dump = line.slice(match.index);
        if (/(?:[a-zA-Z-]+\s*:\s*[^;]*;){1,}|["']\s*>/.test(dump)) {
          return match.index;
        }
      }
    }
    match = re.exec(line);
  }
  return null;
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
  // Hangul/CJK glued to stacked hero: `제목 넣는 중CLOUD<br>NATIVE</h1>`
  const hangulBrHero = line.match(
    /^(.*?[\uac00-\ud7af\u3000-\u9fff])\s*([A-Za-z][\s\S]*<br\b[\s\S]*<\/h[1-6]>)/u,
  );
  if (hangulBrHero?.[1] !== undefined) return hangulBrHero[1].length;
  // Hangul/CJK glued to a truncated font-family leftover:
  // `슬라이드 추가 중Caveat',cursive;font-size:…">`. Run before midCss —
  // midCss would otherwise keep `Caveat',` as the human prefix.
  const hangulStyleGlue = findHangulGluedStyleDumpCut(line);
  if (hangulStyleGlue != null) return hangulStyleGlue;
  // Hangul status glued to a tag-stripped slide body (round 23). Must run
  // before the whole-line debris filter drops the status with the dump.
  const hangulSlideBodyGlue = findHangulGluedTagStrippedSlideBodyCut(line);
  if (hangulSlideBodyGlue != null) return hangulSlideBodyGlue;
  const fontStackDump = findFontStackDumpIndex(line);
  if (fontStackDump != null) return fontStackDump;
  // Mid-word CSS join after Hangul/Latin: `슬라이드 추가 중ospace;font-size:…">Label</div>`
  // (`ospace` = truncated `monospace`). Keep the human prefix.
  // NEVER cut intact `… style="font-family:…"` tags — that left `<span style="`
  // residues that later scrapers could not match (2026-08-21 regression).
  // Fail fast when the line has no attr-close / tag-close — otherwise the
  // reluctant `[\s\S]*?["']\s*>` backtracks into ReDoS on long CSS dumps.
  if (/["']\s*>|<\/(?:div|span|p|h[1-6])\b|<br\b/i.test(line)) {
    const midCss = line.match(
      /^(.*?)((?:[A-Za-z][\w\s]{0,24}['"]\s*,\s*)?(?:[a-z]{2,14};)?(?:[a-zA-Z-]+\s*:\s*[^;]*;){2,}[\s\S]*?["']\s*>[\s\S]*)$/i,
    );
    if (midCss?.[1] !== undefined && midCss[2]) {
      let prefix = midCss[1];
      const css = midCss[2];
      const endsInStyleAttr = /\bstyle\s*=\s*["']\s*$/i.test(prefix);
      const openTagPrefix = /<[a-z][\w:-]*\b[^>]*$/i.test(prefix);
      const cjkGlue = /[\u3000-\u9fff\uac00-\ud7af]/u.test(prefix.slice(-12));
      const midWordCssFrag =
        /^(?:[A-Za-z][\w\s]{0,24}['"]\s*,\s*)?(?:[a-z]{2,14};)/i.test(css);
      if (
        !endsInStyleAttr
        && !openTagPrefix
        && (cjkGlue || midWordCssFrag)
        && /(?:font-size|letter-spacing|text-transform|opacity|margin|font-family|line-height)\s*:/i.test(css)
        && (/(?:<\/(?:div|span|p|h[1-6])>|<br\b)/i.test(css) || /["']\s*>/.test(css))
        && /[\p{L}\p{N}]/u.test(prefix.slice(-8))
      ) {
        prefix = prefix.replace(/[A-Za-z][\w\s]{0,24}['"]\s*,\s*$/u, "");
        return prefix.length;
      }
    }
  }
  // Broken attribute splice: `font-size:131 style="font-family:…`
  const brokenAttr = line.match(
    /^(.*?)((?:font-size|width|height|padding|margin)\s*:\s*[\d.]+)\s+style\s*=\s*["'][\s\S]*$/i,
  );
  if (brokenAttr?.[1] !== undefined) return brokenAttr[1].length;
  const gluedCss = line.match(
    /^(.*?[\uac00-\ud7af])((?:[a-zA-Z-]+\s*:\s*[^;]+;){1,}[a-zA-Z-]+\s*:\s*[^;]+;?)\s*$/u,
  );
  if (
    gluedCss?.[1] !== undefined
    && /(?:font-size|letter-spacing|font-family|text-transform|opacity|margin|padding|line-height|color)\s*:/i.test(
      gluedCss[2] ?? "",
    )
  ) {
    return gluedCss[1].length;
  }
  const voidSlash = /^(.*?(?:[.。…]|\s))(?:\s*\/\s*>)\s*$/u.exec(line);
  if (voidSlash?.[1] !== undefined && /[\p{L}\p{N}.。…]$/u.test(voidSlash[1].trimEnd())) {
    return voidSlash[1].trimEnd().length;
  }
  const attrTail = new RegExp(
    `^(.*?)(?:\\s+["']?\\s*(?:${DECK_HTML_ATTR_TAIL_NAMES}|\\([\\w.-]+\\)|\\[[\\w.-]+\\]|\\*ng[\\w]+)\\s*=\\s*(?:"[^"]*"|'[^']*'|\\{[^}]*\\}|[^\\s>"']+))+\\s*$`,
    "i",
  ).exec(line);
  if (attrTail?.[1] !== undefined && /[\p{L}\p{N}.。…]$/u.test(attrTail[1].trimEnd())) {
    return attrTail[1].trimEnd().length;
  }
  const mixedQuote =
    /^(.*?)(?:\s+(?:class|id|style|className)\s*=\s*(?:"[^"\n]*'|'[^'\n]*"))\s*$/i.exec(line);
  if (mixedQuote?.[1] !== undefined && /[\p{L}\p{N}.。…]$/u.test(mixedQuote[1].trimEnd())) {
    return mixedQuote[1].trimEnd().length;
  }
  const reactStyle = /^(.*?)(?:\s+style=\{\{[\s\S]*\}\})\s*$/.exec(line);
  if (reactStyle?.[1] !== undefined && /[\p{L}\p{N}.。…]$/u.test(reactStyle[1].trimEnd())) {
    return reactStyle[1].trimEnd().length;
  }
  const boolAttr = /^(.*?)(?:\s+(?:playsinline|muted|autoplay|loop|controls|default|defer|async|nomodule))\s*$/i.exec(
    line,
  );
  if (boolAttr?.[1] !== undefined && /[\p{L}\p{N}.。…]$/u.test(boolAttr[1].trimEnd())) {
    return boolAttr[1].trimEnd().length;
  }
  const mimeAttr =
    /^(.*?)(?:\s+(?:as|type|media)\s*=\s*["']?(?:font|text\/|image\/|video\/|audio\/|print|screen|all|\())/i.exec(
      line,
    );
  if (mimeAttr?.[1] !== undefined && /[\p{L}\p{N}.。…]$/u.test(mimeAttr[1].trimEnd())) {
    return mimeAttr[1].trimEnd().length;
  }
  const scssDump = /^(.*?)(?:\s+)(\$[a-zA-Z_-][\w-]*\s*:)/.exec(line);
  if (
    scssDump?.[1] !== undefined
    && /[\p{L}\p{N}.。…]$/u.test(scssDump[1].trimEnd())
    && /(?:#|rgba?\(|hsla?\(|px|em|rem|%)/.test(line.slice(scssDump[1].length))
  ) {
    return scssDump[1].trimEnd().length;
  }
  const cssDump = /^(.*?)(?:\s+)(?=(?:(?:repeating-)?(?:linear|radial|conic)-gradient|rgba?|hsla?|light-dark|image-set|cross-fade|device-cmyk|url|format|local|fit-content|calc|clamp)\b|\/\*)/i.exec(
    line,
  );
  if (cssDump?.[1] !== undefined && /[\p{L}\p{N}.。…]$/u.test(cssDump[1].trimEnd())) {
    const dump = line.slice(cssDump[1].length).trim();
    if (looksLikeCssFunctionDebrisLine(dump) || /^\/\*/.test(dump)) {
      return cssDump[1].trimEnd().length;
    }
  }
  return null;
}

/** Drop truncated deck slide HTML leaked into chat prose (mid-artifact abort). */
export function stripTrailingDeckHtmlMarkupLeak(input: string): string {
  if (!input) return input;
  let cut: number | null = null;
  for (const re of [
    DECK_SLIDE_OPEN_TAG_TAIL_RE,
    DECK_SLIDE_ORPHAN_ATTR_TAIL_RE,
    DECK_ORPHAN_STYLE_CLOSE_TAIL_RE,
    DECK_TRAILING_HEADING_MARKUP_RE,
    DECK_TRAILING_INLINE_MARKUP_RE,
    DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE,
    DECK_MOTIF_PILL_RADIUS_TAIL_RE,
    DECK_MOTIF_STYLED_BADGE_TAIL_RE,
    DECK_MOTIF_STYLED_TYPOGRAPHY_TAIL_RE,
    DECK_ORPHAN_FLEX_LAYOUT_DIV_TAIL_RE,
    DECK_FLEX_OR_GRID_LAYOUT_TAIL_RE,
    DECK_FULL_FRAME_SIZE_TAIL_RE,
    DECK_DATA_ATTR_TAIL_RE,
    DECK_POSITIONED_PCT_TAIL_RE,
    DECK_TABLE_OR_LIST_TAIL_RE,
    DECK_IMG_TAIL_RE,
    DECK_PICTURE_TAIL_RE,
    DECK_MEDIA_EMBED_TAIL_RE,
    DECK_A11Y_DECO_SHELL_TAIL_RE,
    DECK_FIGURE_TAIL_RE,
    DECK_VISUAL_EFFECT_STYLE_TAIL_RE,
    DECK_ESCAPED_STYLE_ATTR_TAIL_RE,
    DECK_HTML_ENTITY_TAG_TAIL_RE,
    DECK_BARE_CSS_MOTION_TAIL_RE,
    DECK_CLASS_RULE_CSS_TAIL_RE,
    DECK_MATH_OR_FOREIGN_TAIL_RE,
    DECK_CHROME_LANDMARK_TAIL_RE,
    DECK_ORPHAN_CLOSE_TAGS_TAIL_RE,
    DECK_CSS_CUSTOM_PROP_DUMP_TAIL_RE,
    DECK_BR_STACKED_HEADING_TAIL_RE,
    DECK_CARD_STYLE_DIV_TAIL_RE,
    DECK_DECO_CLASS_TAIL_RE,
    DECK_MOTIF_SVG_TAIL_RE,
    DECK_MOTIF_PATH_TAIL_RE,
    DECK_MOTIF_SVG_PRIMITIVE_TAIL_RE,
    DECK_MOTIF_SVG_CLOSE_TAIL_RE,
    DECK_MOTIF_HTML_COMMENT_TAIL_RE,
    DECK_ORPHAN_LI_DUMP_TAIL_RE,
    DECK_BARE_DIV_OR_MISMATCH_TAIL_RE,
    DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE,
    DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE,
    DECK_ORPHAN_MID_SVG_CSS_STYLE_TAIL_RE,
  ]) {
    // Fail-fast: mid-style attr scrapers ReDoS without `">` on long CSS dumps.
    if (re === DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE && !/["']\s*>/.test(input)) {
      continue;
    }
    const match = re.exec(input);
    if (match?.index === undefined) continue;
    if (cut == null || match.index < cut) cut = match.index;
  }
  // Same-line mid-word CSS / broken attr cuts — scan every line so reload
  // debris glued to Hangul status text (`중ospace;font-size:…`) is chopped.
  let offset = 0;
  const lines = input.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const lineCut = findTrailingSameLineDeckHtmlCut(line);
    if (lineCut != null) {
      const abs = offset + lineCut;
      if (cut == null || abs < cut) cut = abs;
    }
    offset += line.length + (i < lines.length - 1 ? 1 : 0);
  }
  if (cut == null) return input;
  return input.slice(0, cut).trimEnd();
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
  if (
    after === ""
    || after === "/"
    || after === "!"
    || after === "?"
    || /^\/?!?(?:DOCTYPE\s*html?)?$/i.test(after)
    || /^\?/.test(after)
  ) {
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
  if (isDeckChromePartialTag(rawName, after)) {
    return input.slice(0, lt).trimEnd();
  }
  if (!isShortStreamingHtmlPrefix(rawName)) {
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
  // Tag-stripped leftover (`html>`, `body>`, `<!doctype html>…`) must run
  // before prose HTML debris eats the doctype/html wrappers and leaves a
  // Hangul slide title in the bubble.
  text = stripOrphanArtifactCloserDumpRespectingArtifacts(text, preservingArtifacts);
  text = stripChatProseHtmlDebris(text, {
    preserveArtifactBodies: preservingArtifacts,
  });
  // Debris scrub can leave a truncated tag name (`<link`); strip it now.
  text = stripIncompleteTrailingMarkupToken(text);
  // Line-heuristic before any trailing `[\s\S]*$` CSS scrapers so Hangul
  // after a mid-message `.tag.inv{…}` dump is preserved.
  text = stripLeakedDeckCodeDebrisBlocksRespectingArtifacts(text, preservingArtifacts);
  const stripDeckCssTail =
    !streaming || !hasUnclosedTrailingArtifact(text);
  if (stripDeckCssTail) {
    text = stripTrailingDeckFrameworkCssLeak(text);
  }
  // Kit `:root{--bg:#…}` dumps can appear mid-message (not only trailing).
  // Never scrub inside preserved artifact bodies (live style tokens stay intact).
  text = stripLeakedCssCustomPropertyBlocksRespectingArtifacts(text, preservingArtifacts);
  text = stripLeakedDeckCodeDebrisBlocksRespectingArtifacts(text, preservingArtifacts);
  text = stripTrailingDeckHtmlMarkupLeakRespectingArtifacts(text, preservingArtifacts);
  // Second heuristic pass: catch residues left after named scrapers
  // (e.g. incomplete open tags / property continuations).
  text = stripLeakedDeckCodeDebrisBlocksRespectingArtifacts(text, preservingArtifacts);
  // Absolute residual pass: strip any remaining deck HTML comments/tags
  // (single-line glued dumps, table rows, entity-encoded tags) so unknown
  // dialects cannot re-enter the bubble after reload.
  text = stripResidualDeckHtmlMarkupRespectingArtifacts(text, preservingArtifacts);
  // Final incomplete open-tag chop — catches residues like `<span style="`
  // left by an earlier mid-line cut that no longer matches typography regexes.
  text = stripIncompleteTrailingMarkupToken(text);
  // Absolute last pass: classic/minified click-nav and keydown advance must
  // never survive a dialect miss or partial open-form match.
  text = stripHardDeckNavJsFingerprints(text);
  // Reload/cold-load: persist often stores a tag-stripped artifact tail
  // (`html>WD · LECTURE…</artifact>`) after the open `<artifact` was lost.
  text = stripOrphanArtifactCloserDumpRespectingArtifacts(text, preservingArtifacts);
  text = stripSlideCountTopUpLeftover(text);
  return text;
}

const SLIDE_COUNT_TOP_UP_LEFTOVER_RE =
  /\[od:slide_count_top_up\]|<!--od:slide_count_top_up-->|this is an explicit slide-count expansion|append only new slides|closed\s+\d+-slide\s+deliverable|do not rewrite the saved deck|emit only the new|keep slides 1[–-]/i;
const SLIDE_COUNT_TOP_UP_GARBLED_LINE_RE =
  /^(?:the|keep|append)\s*$/i;

/**
 * Hidden top-up instruction that persist HTML-strip leaves in the chat bubble
 * (`The / Keep / APPEND / This is an explicit slide-count expansion…`).
 */
export function looksLikeSlideCountTopUpLeftover(text: string): boolean {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  return SLIDE_COUNT_TOP_UP_LEFTOVER_RE.test(raw);
}

function stripSlideCountTopUpLeftover(input: string): string {
  const raw = String(input ?? "");
  if (!raw.trim()) return raw;
  if (looksLikeSlideCountTopUpLeftover(raw) && !/[\uac00-\ud7af]/.test(raw)) {
    return "";
  }
  const kept: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push(line);
      continue;
    }
    if (SLIDE_COUNT_TOP_UP_LEFTOVER_RE.test(trimmed) || SLIDE_COUNT_TOP_UP_GARBLED_LINE_RE.test(trimmed)) {
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/^\n+|\n+$/g, "");
}

/** Drop truncated deck stylesheet/CSS leaked into chat prose (mid-artifact abort). */
export function stripTrailingDeckFrameworkCssLeak(input: string): string {
  if (!input) return input;
  const match = /(?:^|\n\n|\n)((?::root\s*\{|@(?:-webkit-)?(?:keyframes\s+[\w-]+|font-face)\s*\{|@(?:media|page|supports|layer)\b[^{]*\{|@import\s+(?:url\(|["'])|<style\b[^>]*>|(?:from|to|\d+%)\s*\{|(?:\.slide|(?:(?:\.[A-Za-z_-][\w-]*)+|#[A-Za-z_-][\w-]*|h[1-6]|p|ul|li|body|section(?:\.[\w-]+)?)\s*\{))[\s\S]*)$/i.exec(input);
  if (!match || match.index === undefined) return input;
  const tail = match[1] ?? "";
  const looksLikeDeckFramework =
    /width:\s*1920px|height:\s*1080px|box-sizing:\s*border-box|\.grain::after/i.test(tail)
    || /<\/style>|<style\b|<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b|<!--\s*(?:SLIDE|Daisy|motif|deco)\b/i.test(tail)
    || /^\.slide\s*\{[\s\S]*/.test(tail.trim())
    || /\.deco-[\w-]+(?:\s*\{|::)/i.test(tail)
    || /(?:^|\n)\s*animation\s*:/i.test(tail)
    || /\.cls-\d+\s*\{/i.test(tail)
    // Utility / compound class dumps (`.tag.inv{border-color:…}`)
    || /(?:^|\n)\s*(?:\.[A-Za-z_-][\w-]*){1,6}\s*\{[\s\S]*(?:border(?:-color)?|color|padding|background|rgba?\(|#[0-9A-Fa-f]{3,8})/i.test(tail)
    || /@keyframes\s+[\w-]+\s*\{/i.test(tail)
    || /@font-face\b/i.test(tail)
    || /@media\b/i.test(tail)
    || /@import\s+(?:url\(|["'])/i.test(tail)
    || /@page\b/i.test(tail)
    || /@supports\b/i.test(tail)
    || /@layer\b/i.test(tail)
    || /(?:^|\n)(?:from|to|\d+%)\s*\{[\s\S]*(?:transform|opacity|translate|rotate)/i.test(tail)
    || looksLikeLeakedCssCustomPropertyBlock(tail);
  if (!looksLikeDeckFramework) return input;
  return input.slice(0, match.index).trimEnd();
}

const TAG_STRIPPED_LEFTOVER_OPENER_RE =
  /(?:^|[\n\uac00-\ud7af\u3000-\u9fff][.\u3002…]?\s*)(?:html|body|head|section|article|main)\s*>/i;
const TAG_STRIPPED_LEFTOVER_CLOSER_RE =
  /<\/(?:artifact|html|body|head|section|article|main)\s*>/i;
const TAG_STRIPPED_LEFTOVER_CHROME_RE =
  /(?:data-slide-index|prefers-reduced-motion|axe-core|FRONT-END TRACK|LECTURE\s+\d+|WD\s*[·•\-–—]\s*[A-Z][A-Z0-9_-]{1,24}|INTRO\s*[·•\-–—]\s*FRONT-END|\b(?:SLIDE|PAGE|SEC|CHAPTER|CH|PART|LECTURE|UNIT|STEP|MODULE|SECTION|ACT|SCENE|PHASE|EPISODE|BLOCK|FRAME|SESSION|WEEK|DAY|SEG|APPENDIX|TABLE|TOPIC|TRACK|PANEL|CARD|BEAT|LESSON|CLIP|ROUND|PASS|NOTE|QUOTE|ASIDE|CALL|HINT|FAQ|LAB|DEMO|DRILL|INDEX|TOC|MAP|BRIEF|HOOK|SCREEN|TASK|WORKSHOP|DECK|MOTIF|OUTRO|INTRO|CLOSING|SUMMARY|RECAP|AGENDA|COVER|CHECKLIST|KEYTAKE|TAKEAWAY|QNA|QA|WRAP|FINALE|OPENING|GOAL|AIM|THESIS|CLAIM|INSIGHT|TIP|WARNING|CAUTION|EXAMPLE|SAMPLE|CASE|STUDY|OVERVIEW|CONTEXT|BACKGROUND|PROBLEM|SOLUTION|FEATURE|BENEFIT|METRIC|KPI|CHART|STATS|NUMBER|COMPARE|VERSUS|PROS|CONS|TIMELINE|ROADMAP|PROCESS|FLOW|NEXT|CTA|ACTION|RESOURCES|REFERENCE|SOURCE|CITATION|CREDIT|LAYOUT|GRID|COLUMN|ROW|HERO|BANNER|FOOTER|HEADER|NAV|MENU|SIDEBAR|TOOLBAR|BADGE|TAG|LABEL|CAPTION|FIGURE|IMAGE|ICON|SPRITE|GALLERY|CAROUSEL|MODAL|DIALOG|TOAST|ALERT|TAB|TABS|ACCORDION|COLLAPSE|STEPPER|PROGRESS|FORM|INPUT|FIELD|BUTTON|LINK|LIST|TABLEAU|WIDGET|AVATAR|CHIP|PILL|TOGGLE|SWITCH|SLIDER|CHECKBOX|RADIO|DROPDOWN|SELECT|COMBOBOX|PICKER|CALENDAR|DATEPICKER|MILESTONE|SCORECARD|DASHBOARD|VIEWPORT|CANVAS|LAYER|STACK|CLUSTER|GROUP|TOOLTIP|POPOVER|DRAWER|OFFCANVAS|SHEET|BREADCRUMB|PAGINATION|SKELETON|SPINNER|LOADER|OVERLAY|BACKDROP|SNACKBAR|NOTICE|FAB|MEGAMENU|SUBNAV|CALLOUT|HIGHLIGHT|MARKER|PIN|ANNOTATION|COMMENT|THREAD|REPLY|FEEDBACK|RATING|REVIEW|TESTIMONIAL|LOGO|BRAND|WORDMARK|LOCKUP|SPLIT|SPLITTER|RESIZER|HANDLE|SCROLLBAR|OVERFLOW|MASK|GRADIENT|PATTERN|TEXTURE|NOISE|BLUR|GLASS|FROST|SHADOW|ELEVATION|SURFACE|PAPER|INSET|RIBBON|STICKER|WATERMARK|EMBLEM|FAVICON|THUMBNAIL|PLACEHOLDER|KICKER|EYEBROW|SUBHEAD|BYLINE|ATTRIBUTION|FOOTNOTE|ENDNOTE|RAIL|GUTTER|MASTHEAD|JUMBOTRON|MARQUEE|KNOB|GRIP|DIVIDER|SEPARATOR|RULE|HAIRLINE|SCRIM|VEIL|HAZE|GLOW|AURA|BEZEL|RIM|ORNAMENT|FLOURISH|DECOR|ACCENT|STROKE|OUTLINE|BORDER|RING|HALO|PORTAL|SLOT|FRAGMENT|ZONE|REGION|FLEX|WRAPPER|CONTAINER|SHELL|CHROME|BLEED|TRIM|SAFEAREA|MARGIN|PADDING|GAP|SPACING|CROP|THUMB|PREVIEW|PARALLAX|KENBURNS|REVEAL|STAGGER|KEYFRAME|EASING|SPRING|FILTER|BLEND|COMPOSITE|DRAFT|WIP|TODO|FIXME|HACK|DEBUG|TRACE|PROBE|FIXTURE|MOCK|STUB|SEED|LETTERBOX|PILLARBOX|MATTE|VIGNETTE|GRAIN|DUST|SCRATCH|LENS|BOKEH|DOF|FOG|MIST|SMOKE|SPARK|GLITCH|CRT|SCANLINE|PIXELATE|MOSAIC|POSTERIZE|SOLARIZE|DUOTONE|HALFTONE|CROSSHATCH|STROBE|FLICKER|DODGE|BURN|ZINDEX|OPACITY|VISIBILITY|DISPLAY|POSITION|ABSOLUTE|RELATIVE|FIXED|STICKY|FLOAT|CLEAR|CURSOR|CARET|SELECTION|AUTOFILL|APPEARANCE|TRANSFORM|TRANSLATE|ROTATE|SCALE|SKEW|MATRIX|OUTSET|OFFSET|SCROLLSNAP|OVERSCROLL|TOUCHACTION|POINTER|USERSELECT|OVERFLOWX|OVERFLOWY|SVG|PATH|CLIPPATH|MASKPATH|SHADER|WEBGL|CANVAS2D|BEZIER|SPLINE|FILLET|CHAMFER|NOTCH|CUTOUT|PUNCH|KEYHOLE|FLANGE|LIP|BASELINE|LEADING|TRACKING|KERNING|XHEIGHT|CAPHEIGHT|ASCENDER|DESCENDER|EMBOX|SERIF|SANS|MONO|DISPLAYTYPE|BODYTYPE|PULLQUOTE|DROPCAP|INITIAL|ORNATE|FOLIO|RUNNINGHEAD|RUNNINGFOOT|COLOPHON|ERRATA|ADDENDUM|ANNEX|GLOSSARY|INDEXCARD|FLASHCARD|CHEATSHEET|HANDOUT|WORKSHEET|RUBRIC|SCORE|LEADERBOARD|PODIUM|BRACKET|FUNNEL|SANKEY|TREEMAP|HEATMAP|SPARKLINE|GAUGE|RADAR|BUBBLE|SCATTER|HISTOGRAM|BOXPLOT|VIOLIN|WATERFALL|CALLOUTBOX|SPEECHBUBBLE|THOUGHTBUBBLE|ARROW|CHEVRON|CROSSHAIR|BULLSEYE|TARGET|HOTSPOT|CALLOUTLINE|LEADERLINE|DIMENSION|GUIDE|RULER|PROTRACTOR|COMPASS|GRIDSNAP|GRIDLINE|SAFE|INSETBOX|RESIZEBOX|STEM|COUNTER|APERTURE|CARETPTR|POINTERARROW|PLACEHOLDERTEXT|TIMELINEAXIS|DATALABEL|LEGENDKEY|AXIS|PLOT|SERIES|CATEGORY|DOMAIN|RANGEAXIS|TICK|GRIDMINOR|ANNOTATIONLINE|REFLINE|BAND|THRESHOLD|DELTA|VARIANCE|KPISTRIP|STATCARD|METRICROW|COMPARISON|BEFOREAFTER|SPLITVIEW|MAGNIFIER|LOUPE|CALLOUTPIN|WAYPOINT|BREADCRUMBTRAIL|ANNOTATIONBOX|CALLOUTARROW|LEADERDOT|ENDMARK|SECTIONBREAK|PAGEBREAK|COLUMNBREAK|FRAMEBREAK|SOFTBREAK|HARDBREAK|WIDOW|ORPHAN|RIVER|RAG|JUSTIFY|HANGING|OPTICAL|INDENT|OUTDENT|TABSTOP|LEADERDOTS|TOCENTRY|TOCPAGE|INDEXENTRY|FOOTERNOTE|ENDNOTEREF|CROSSREF|HYPERLINK|BOOKMARK|ANCHOR|FRAGMENTID|SLUG|PERMALINK|SHORTLINK|QRCODE|BARCODE|ISBN|DOI|UUID|HASHID|TOKENCHIP|HASHTAG|MENTION|HANDLEAT|EMOJI|STICKERPACK|REACTION|BADGECOUNT|UNREAD|PRESENCE|STATUSDOT|ONLINE|OFFLINE|AWAY|BUSY|DND|TYPING|READRECEIPT|DELIVERED|SENT|FAILED|RETRYBTN|REFRESHBTN|CLOSEBTN|MINIMIZE|MAXIMIZE|EXPANDALL|COLLAPSEALL|SELECTALL|DESELECT|CLEARALL|RESETALL|UNDOBTN|REDOBTN|CUTBTN|COPYBTN|PASTEBTN|DOWNLOADBTN|UPLOADBTN|SHAREBTN|PRINTBTN|EXPORTBTN|IMPORTBTN|SAVEBTN|EDITBTN|DELETEBTN|ADDBTN|REMOVEBTN|MOREBTN|MENUBTN|SEARCHBTN|FILTERBTN|SORTBTN|ICONBTN|GHOSTBTN|PRIMARYBTN|SECONDARYBTN|TEXTBTN|LINKBTN|FABBTN|ICONONLY|CHEVRONBTN|BACKBTN|NEXTBTN|PREVBTN|HOMEBTN|HELPBTN|INFOBTN|WARNBTN|DANGERBTN|SUCCESSBTN|NEUTRALBTN|TOGGLEBTN|SEGMENT|SEGMENTED|STEPPERCTRL|PAGERCTRL|TABSCTRL|RAILCTRL|DOCK|STATUSBAR|TITLEBAR|MENUBAR|TOOLSTRIP|COMMANDPALETTE|QUICKACTIONS|CONTEXTMENU|DROPZONE|FILEPICKER|COLORPICKER|DATEFIELD|TIMEFIELD|NUMBERFIELD|SEARCHFIELD|PASSWORDFIELD|TEXTAREAFIELD|SELECTFIELD|CHECKFIELD|RADIOFIELD|SWITCHFIELD|SLIDERFIELD|RATINGFIELD|TAGINPUT|CHIPINPUT|MENTIONINPUT|BREADCRUMBCTRL|PAGINATIONCTRL|OVERFLOWMENU|ACTIONBAR|APPBAR|BOTTOMBAR|TABBAR|SIDEBARCTRL|NAVRAIL|DRAWERCTRL|SHEETCTRL|MODALCTRL|TOASTCTRL|SNACKBARCTRL|BANNERCTRL|ALERTCTRL|DIALOGCTRL|POPOVERCTRL|TOOLTIPCTRL|ACCORDIONCTRL|COLLAPSECTRL|TREECTRL|LISTCTRL|TABLECTRL|DATAGRID|VIRTUALLIST|INFINITE|LAZYLOAD|SKELETONCTRL|EMPTYSTATE|ERRORSTATE|LOADINGSTATE|SUCCESSSTATE|ZEROSTATE)\s*(?:\d{1,2}|[A-Z])\s*[·•\-–—]|font-size\s*:|mix-blend-mode\s*:|offset-path\s*:|<!doctype\s+html)/i;
const SHORT_DECK_TRACK_CHROME_RE =
  /^(?:WD|SLIDE|PAGE|SEC|CHAPTER|CH|PART|LECTURE|UNIT|STEP|MODULE|SECTION|ACT|SCENE|PHASE|EPISODE|BLOCK|FRAME|SESSION|WEEK|DAY|SEG|APPENDIX|TABLE|TOPIC|TRACK|PANEL|CARD|BEAT|LESSON|CLIP|ROUND|PASS|NOTE|QUOTE|ASIDE|CALL|HINT|FAQ|LAB|DEMO|DRILL|INDEX|TOC|MAP|BRIEF|HOOK|SCREEN|TASK|WORKSHOP|DECK|MOTIF|OUTRO|INTRO|CLOSING|SUMMARY|RECAP|AGENDA|COVER|CHECKLIST|KEYTAKE|TAKEAWAY|QNA|QA|WRAP|FINALE|OPENING|GOAL|AIM|THESIS|CLAIM|INSIGHT|TIP|WARNING|CAUTION|EXAMPLE|SAMPLE|CASE|STUDY|OVERVIEW|CONTEXT|BACKGROUND|PROBLEM|SOLUTION|FEATURE|BENEFIT|METRIC|KPI|CHART|STATS|NUMBER|COMPARE|VERSUS|PROS|CONS|TIMELINE|ROADMAP|PROCESS|FLOW|NEXT|CTA|ACTION|RESOURCES|REFERENCE|SOURCE|CITATION|CREDIT|LAYOUT|GRID|COLUMN|ROW|HERO|BANNER|FOOTER|HEADER|NAV|MENU|SIDEBAR|TOOLBAR|BADGE|TAG|LABEL|CAPTION|FIGURE|IMAGE|ICON|SPRITE|GALLERY|CAROUSEL|MODAL|DIALOG|TOAST|ALERT|TAB|TABS|ACCORDION|COLLAPSE|STEPPER|PROGRESS|FORM|INPUT|FIELD|BUTTON|LINK|LIST|TABLEAU|WIDGET|AVATAR|CHIP|PILL|TOGGLE|SWITCH|SLIDER|CHECKBOX|RADIO|DROPDOWN|SELECT|COMBOBOX|PICKER|CALENDAR|DATEPICKER|MILESTONE|SCORECARD|DASHBOARD|VIEWPORT|CANVAS|LAYER|STACK|CLUSTER|GROUP|TOOLTIP|POPOVER|DRAWER|OFFCANVAS|SHEET|BREADCRUMB|PAGINATION|SKELETON|SPINNER|LOADER|OVERLAY|BACKDROP|SNACKBAR|NOTICE|FAB|MEGAMENU|SUBNAV|CALLOUT|HIGHLIGHT|MARKER|PIN|ANNOTATION|COMMENT|THREAD|REPLY|FEEDBACK|RATING|REVIEW|TESTIMONIAL|LOGO|BRAND|WORDMARK|LOCKUP|SPLIT|SPLITTER|RESIZER|HANDLE|SCROLLBAR|OVERFLOW|MASK|GRADIENT|PATTERN|TEXTURE|NOISE|BLUR|GLASS|FROST|SHADOW|ELEVATION|SURFACE|PAPER|INSET|RIBBON|STICKER|WATERMARK|EMBLEM|FAVICON|THUMBNAIL|PLACEHOLDER|KICKER|EYEBROW|SUBHEAD|BYLINE|ATTRIBUTION|FOOTNOTE|ENDNOTE|RAIL|GUTTER|MASTHEAD|JUMBOTRON|MARQUEE|KNOB|GRIP|DIVIDER|SEPARATOR|RULE|HAIRLINE|SCRIM|VEIL|HAZE|GLOW|AURA|BEZEL|RIM|ORNAMENT|FLOURISH|DECOR|ACCENT|STROKE|OUTLINE|BORDER|RING|HALO|PORTAL|SLOT|FRAGMENT|ZONE|REGION|FLEX|WRAPPER|CONTAINER|SHELL|CHROME|BLEED|TRIM|SAFEAREA|MARGIN|PADDING|GAP|SPACING|CROP|THUMB|PREVIEW|PARALLAX|KENBURNS|REVEAL|STAGGER|KEYFRAME|EASING|SPRING|FILTER|BLEND|COMPOSITE|DRAFT|WIP|TODO|FIXME|HACK|DEBUG|TRACE|PROBE|FIXTURE|MOCK|STUB|SEED|LETTERBOX|PILLARBOX|MATTE|VIGNETTE|GRAIN|DUST|SCRATCH|LENS|BOKEH|DOF|FOG|MIST|SMOKE|SPARK|GLITCH|CRT|SCANLINE|PIXELATE|MOSAIC|POSTERIZE|SOLARIZE|DUOTONE|HALFTONE|CROSSHATCH|STROBE|FLICKER|DODGE|BURN|ZINDEX|OPACITY|VISIBILITY|DISPLAY|POSITION|ABSOLUTE|RELATIVE|FIXED|STICKY|FLOAT|CLEAR|CURSOR|CARET|SELECTION|AUTOFILL|APPEARANCE|TRANSFORM|TRANSLATE|ROTATE|SCALE|SKEW|MATRIX|OUTSET|OFFSET|SCROLLSNAP|OVERSCROLL|TOUCHACTION|POINTER|USERSELECT|OVERFLOWX|OVERFLOWY|SVG|PATH|CLIPPATH|MASKPATH|SHADER|WEBGL|CANVAS2D|BEZIER|SPLINE|FILLET|CHAMFER|NOTCH|CUTOUT|PUNCH|KEYHOLE|FLANGE|LIP|BASELINE|LEADING|TRACKING|KERNING|XHEIGHT|CAPHEIGHT|ASCENDER|DESCENDER|EMBOX|SERIF|SANS|MONO|DISPLAYTYPE|BODYTYPE|PULLQUOTE|DROPCAP|INITIAL|ORNATE|FOLIO|RUNNINGHEAD|RUNNINGFOOT|COLOPHON|ERRATA|ADDENDUM|ANNEX|GLOSSARY|INDEXCARD|FLASHCARD|CHEATSHEET|HANDOUT|WORKSHEET|RUBRIC|SCORE|LEADERBOARD|PODIUM|BRACKET|FUNNEL|SANKEY|TREEMAP|HEATMAP|SPARKLINE|GAUGE|RADAR|BUBBLE|SCATTER|HISTOGRAM|BOXPLOT|VIOLIN|WATERFALL|CALLOUTBOX|SPEECHBUBBLE|THOUGHTBUBBLE|ARROW|CHEVRON|CROSSHAIR|BULLSEYE|TARGET|HOTSPOT|CALLOUTLINE|LEADERLINE|DIMENSION|GUIDE|RULER|PROTRACTOR|COMPASS|GRIDSNAP|GRIDLINE|SAFE|INSETBOX|RESIZEBOX|STEM|COUNTER|APERTURE|CARETPTR|POINTERARROW|PLACEHOLDERTEXT|TIMELINEAXIS|DATALABEL|LEGENDKEY|AXIS|PLOT|SERIES|CATEGORY|DOMAIN|RANGEAXIS|TICK|GRIDMINOR|ANNOTATIONLINE|REFLINE|BAND|THRESHOLD|DELTA|VARIANCE|KPISTRIP|STATCARD|METRICROW|COMPARISON|BEFOREAFTER|SPLITVIEW|MAGNIFIER|LOUPE|CALLOUTPIN|WAYPOINT|BREADCRUMBTRAIL|ANNOTATIONBOX|CALLOUTARROW|LEADERDOT|ENDMARK|SECTIONBREAK|PAGEBREAK|COLUMNBREAK|FRAMEBREAK|SOFTBREAK|HARDBREAK|WIDOW|ORPHAN|RIVER|RAG|JUSTIFY|HANGING|OPTICAL|INDENT|OUTDENT|TABSTOP|LEADERDOTS|TOCENTRY|TOCPAGE|INDEXENTRY|FOOTERNOTE|ENDNOTEREF|CROSSREF|HYPERLINK|BOOKMARK|ANCHOR|FRAGMENTID|SLUG|PERMALINK|SHORTLINK|QRCODE|BARCODE|ISBN|DOI|UUID|HASHID|TOKENCHIP|HASHTAG|MENTION|HANDLEAT|EMOJI|STICKERPACK|REACTION|BADGECOUNT|UNREAD|PRESENCE|STATUSDOT|ONLINE|OFFLINE|AWAY|BUSY|DND|TYPING|READRECEIPT|DELIVERED|SENT|FAILED|RETRYBTN|REFRESHBTN|CLOSEBTN|MINIMIZE|MAXIMIZE|EXPANDALL|COLLAPSEALL|SELECTALL|DESELECT|CLEARALL|RESETALL|UNDOBTN|REDOBTN|CUTBTN|COPYBTN|PASTEBTN|DOWNLOADBTN|UPLOADBTN|SHAREBTN|PRINTBTN|EXPORTBTN|IMPORTBTN|SAVEBTN|EDITBTN|DELETEBTN|ADDBTN|REMOVEBTN|MOREBTN|MENUBTN|SEARCHBTN|FILTERBTN|SORTBTN|ICONBTN|GHOSTBTN|PRIMARYBTN|SECONDARYBTN|TEXTBTN|LINKBTN|FABBTN|ICONONLY|CHEVRONBTN|BACKBTN|NEXTBTN|PREVBTN|HOMEBTN|HELPBTN|INFOBTN|WARNBTN|DANGERBTN|SUCCESSBTN|NEUTRALBTN|TOGGLEBTN|SEGMENT|SEGMENTED|STEPPERCTRL|PAGERCTRL|TABSCTRL|RAILCTRL|DOCK|STATUSBAR|TITLEBAR|MENUBAR|TOOLSTRIP|COMMANDPALETTE|QUICKACTIONS|CONTEXTMENU|DROPZONE|FILEPICKER|COLORPICKER|DATEFIELD|TIMEFIELD|NUMBERFIELD|SEARCHFIELD|PASSWORDFIELD|TEXTAREAFIELD|SELECTFIELD|CHECKFIELD|RADIOFIELD|SWITCHFIELD|SLIDERFIELD|RATINGFIELD|TAGINPUT|CHIPINPUT|MENTIONINPUT|BREADCRUMBCTRL|PAGINATIONCTRL|OVERFLOWMENU|ACTIONBAR|APPBAR|BOTTOMBAR|TABBAR|SIDEBARCTRL|NAVRAIL|DRAWERCTRL|SHEETCTRL|MODALCTRL|TOASTCTRL|SNACKBARCTRL|BANNERCTRL|ALERTCTRL|DIALOGCTRL|POPOVERCTRL|TOOLTIPCTRL|ACCORDIONCTRL|COLLAPSECTRL|TREECTRL|LISTCTRL|TABLECTRL|DATAGRID|VIRTUALLIST|INFINITE|LAZYLOAD|SKELETONCTRL|EMPTYSTATE|ERRORSTATE|LOADINGSTATE|SUCCESSSTATE|ZEROSTATE)\s*(?:\d{1,2}|[A-Z])?\s*[·•\-–—]\s*[A-Z0-9][A-Z0-9_-]{0,24}\b/i;
const SHORT_DECK_INDEX_BADGE_RE =
  /^\d{1,2}\s*[\/·•]\s*[A-Za-z가-힣][A-Za-z가-힣\s-]{1,20}$/u;
const TAG_STRIPPED_HANGUL_LATIN_GLUE_RE =
  /[\uac00-\ud7af][\s·•./:_-]*[A-Za-z]|[A-Za-z][\s·•./:_-]*[\uac00-\ud7af]/;

/**
 * Tag-stripped slide copy left after reload (`html>…</artifact>`, `body>…`,
 * Hangul-titled lecture blobs). Shape-based — not one lecture's copy.
 *
 * Intact `<artifact>` / `<question-form>` are handled elsewhere. This is the
 * leftover after the open tag was lost.
 */
export function looksLikeTagStrippedSlideBodyDump(text: string): boolean {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  if (/<(?:question-form|ask-question)\b/i.test(raw)) return false;
  if (/<artifact\b/i.test(raw)) return false;
  if (lineIsChatProseProtocolMarkup(raw)) return false;
  if (/^#{1,6}\s+\S/.test(raw) && raw.length < 80) return false;
  if (/^(?:[-*+]|\d+[.)])\s+\S/.test(raw) && raw.length < 80) return false;

  const hasOpener = TAG_STRIPPED_LEFTOVER_OPENER_RE.test(raw);
  const hasCloser = TAG_STRIPPED_LEFTOVER_CLOSER_RE.test(raw);
  const hasDoctype = /(?:^|\n)\s*<!doctype\s+html/i.test(raw);
  const hasChrome = TAG_STRIPPED_LEFTOVER_CHROME_RE.test(raw);
  const hasGlue = TAG_STRIPPED_HANGUL_LATIN_GLUE_RE.test(raw);

  if (hasOpener && (hasCloser || hasGlue || hasChrome || raw.length >= 40)) return true;
  if (hasDoctype && (hasCloser || hasOpener || hasGlue || hasChrome)) return true;
  if (hasCloser && (hasOpener || hasDoctype || hasChrome)) return true;
  if (hasChrome && hasGlue && raw.length >= 40) return true;
  if (
    /^(?:section|div|main|article|header|footer|aside|body|nav|p|h[1-6]|ul|ol|li)\b[^<\n]{0,96}>/i.test(
      raw,
    )
    && /(?:\bslide\b|class\s*=)/i.test(raw)
  ) {
    return true;
  }
  // Round 23/25: Hangul-titled leftovers without leftover tags / lecture tokens.
  if (
    raw.length >= 24
    && hasGlue
    && /(?:TRACK|HTML|CSS|SEO|\bsvg\b|\bvideo\b|critical|LECTURE|COVER)/i.test(raw)
  ) {
    return true;
  }
  return false;
}

/**
 * Tag-stripped slide copy left after reload (`html>WD · LECTURE…</artifact>`).
 * Live streaming hides the intact `<artifact>` block; persist/cold-load often
 * keeps only the inner text nodes plus an orphan closer.
 *
 * Round 23: Hangul-titled dumps (`반응형 UIvideo·svg…SEO`) must also match —
 * they used to early-return false because status lines also start with Hangul.
 */
function looksLikeTagStrippedSlideBody(line: string): boolean {
  const trimmed = String(line ?? "").trim().replace(/<\/artifact\s*>/gi, "").trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s+\S/.test(trimmed)) return false;
  if (/^(?:[-*+]|\d+[.)])\s+\S/.test(trimmed)) return false;
  if (lineIsChatProseProtocolMarkup(trimmed)) return false;
  // Status+dump on one line (`완료됨.TRACK…`) must keep the status — the
  // glue cut in findTrailingSameLine / orphan strip owns the chop. Treating
  // the whole line as dump would wipe the Hangul status in the debris pass.
  if (
    /^[\uac00-\ud7af\u3000-\u9fff]/.test(trimmed)
    && findHangulGluedTagStrippedSlideBodyCut(trimmed) != null
  ) {
    return false;
  }
  if (/^(?:html|body|head|section|article|main)\s*>/i.test(trimmed)) return true;
  // Soft-CSS inline cuts can leave `WD ·` after chopping at `LECTURE 01`.
  if (/^WD\s*[·•\-–—]\s*$/i.test(trimmed)) return true;
  // Short track chrome (`WD · OUTRO`, `PAGE 01 · COVER`, `WD - INTRO`).
  if (SHORT_DECK_TRACK_CHROME_RE.test(trimmed) && trimmed.length <= 48) return true;
  if (/^INTRO\s*[·•\-–—]\s*FRONT-END\b/i.test(trimmed)) return true;
  // Index-badge chrome (`05 / CHECKLIST`, `05 · CHECKLIST`, `05/CHECKLIST`).
  if (SHORT_DECK_INDEX_BADGE_RE.test(trimmed)) return true;
  if (
    /(?:prefers-reduced-motion|axe-core|data-slide-index|FRONT-END TRACK|LECTURE\s+\d+)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  // Incomplete opener leftovers: `section class=slide>COVER…` / `aside class=slide>`
  if (
    /^(?:section|div|main|article|header|footer|aside|body|nav|p|h[1-6]|ul|ol|li)\b[^<\n]{0,96}>/i.test(
      trimmed,
    )
    && /(?:\bslide\b|class\s*=)/i.test(trimmed)
  ) {
    return true;
  }
  const hangulLatinGlue = TAG_STRIPPED_HANGUL_LATIN_GLUE_RE.test(trimmed);
  const techCue =
    /(?:TRACK|HTML|CSS|SEO|\bsvg\b|\bvideo\b|critical|axe-core|prefers-reduced-motion|LECTURE|COVER)/i.test(
      trimmed,
    );
  return trimmed.length >= 24 && hangulLatinGlue && techCue;
}

/** Status glued to a Hangul-titled slide dump (`슬라이드 추가 중반응형 UIvideo…`). */
function findHangulGluedTagStrippedSlideBodyCut(line: string): number | null {
  if (!line || line.length < 28) return null;
  if (!/^[\uac00-\ud7af\u3000-\u9fff]/.test(line)) return null;
  // Only cut when the prefix looks like a status (`…추가 중`), never when the
  // dump itself is Hangul-titled (`반응형 UIvideo…` must drop entirely).
  // Prefer the longest status (`완료됨.` over `완료` inside `완료됨.TRACK`).
  let best: number | null = null;
  for (let i = 1; i < line.length - 23; i += 1) {
    const prev = line[i - 1]!;
    if (!/[\uac00-\ud7af\u3000-\u9fff]/.test(prev)) continue;
    let cut = i;
    if (/[.\u3002…]/.test(line[i] ?? "")) cut = i + 1;
    if (cut >= line.length - 23) continue;
    if (/\s/.test(line[cut - 1] ?? "")) continue;
    const prefixForStatus = line.slice(0, i);
    if (!isMeaningfulHangulStatusPrefix(prefixForStatus)) {
      continue;
    }
    const dump = line.slice(cut);
    if (!/^[\uac00-\ud7afA-Za-z<!]/.test(dump)) continue;
    if (looksLikeTagStrippedSlideBody(dump) || looksLikeTagStrippedSlideBodyDump(dump)) {
      // Opener leftovers (`body>` / `<!doctype`) drop the glue period
      // (`완료되었습니다.body>` → keep status without `.`). Latin TRACK dumps
      // keep it (`완료됨.TRACK…` → `완료됨.`).
      const openerDump =
        /^(?:html|body|head|section|article|main)\s*>/i.test(dump)
        || /^<!doctype\b/i.test(dump);
      best = openerDump ? i : cut;
    }
  }
  return best;
}

/** True when a Hangul prefix is a real status phrase, not a 1-char crumb (`다`). */
function isMeaningfulHangulStatusPrefix(prefix: string): boolean {
  const raw = String(prefix ?? "").trim();
  const p = raw.replace(/[.\u3002…]+$/u, "");
  if (!p) return false;
  if (/(?:추가|작업|완료|진행|생성|수정).{0,6}[중됨요다]$/u.test(p)) return true;
  if (p.length >= 3 && /[중됨요다]$/u.test(p)) return true;
  // Short chat status (`초안.` / `진행.` / `요약.` / `질문`) — 2 syllables.
  if (
    p.length >= 2
    && p.length <= 6
    && /[.\u3002…]/.test(raw)
    && /^[\uac00-\ud7af\s]+$/u.test(p)
  ) {
    return true;
  }
  return /^(?:초안|진행|요약|질문|완료|준비)$/u.test(p);
}

function stripOrphanArtifactCloserDump(input: string): string {
  if (!input) return input;
  let text = String(input);
  if (/<artifact\b/i.test(text)) {
    text = text.replace(/<artifact\b[\s\S]*?<\/artifact\s*>/gi, "");
  }
  text = text.replace(
    /(?:^|\n)[^\S\n]*(?:html|body|head|section|article|main)\s*>[\s\S]*?(?:<\/(?:artifact|html|body|head|section|article|main)\s*>|$)/gi,
    "\n",
  );
  // Lone Hangul crumb + opener (`다.body>…`) — must not use the status-expand
  // path below, which would keep `중` from `슬라이드 추가 중body>`.
  text = text.replace(
    /(?:^|\n)[^\S\n]*[\uac00-\ud7af\u3000-\u9fff]{1,2}[.\u3002…]?\s*(?:html|body|head|section|article|main)\s*>[\s\S]*?(?:<\/(?:artifact|html|body|head|section|article|main)\s*>|$)/gi,
    "\n",
  );
  text = text.replace(
    /([\uac00-\ud7af\u3000-\u9fff]+)[.\u3002…]?\s*(?:html|body|head|section|article|main)\s*>[\s\S]*?(?:<\/(?:artifact|html|body|head|section|article|main)\s*>|$)/gi,
    (match, hangulPrefix: string) => {
      // Only chop when this Hangul run alone is a status (`완료되었습니다`).
      // Short tails like `중` in `슬라이드 추가 중body>` stay for glue-cut.
      if (!isMeaningfulHangulStatusPrefix(hangulPrefix)) return match;
      return hangulPrefix;
    },
  );
  text = text.replace(
    /(?:^|\n)[^\S\n]*[\uac00-\ud7af\u3000-\u9fff]{1,2}[.\u3002…]?\s*<!doctype\s+html[\s\S]*?(?:<\/(?:artifact|html|body)\s*>|$)/gi,
    "\n",
  );
  text = text.replace(
    /([\uac00-\ud7af\u3000-\u9fff]+)[.\u3002…]?\s*<!doctype\s+html[\s\S]*?(?:<\/(?:artifact|html|body)\s*>|$)/gi,
    (match, hangulPrefix: string) => {
      if (!isMeaningfulHangulStatusPrefix(hangulPrefix)) return match;
      return hangulPrefix;
    },
  );
  text = text.replace(
    /(?:^|\n)[^\S\n]*<!doctype\s+html[\s\S]*?(?:<\/(?:artifact|html|body)\s*>|$)/gi,
    "\n",
  );
  text = text.replace(/<\/artifact\s*>/gi, "");
  const kept = text.split("\n").map((line) => {
    const glued = findHangulGluedTagStrippedSlideBodyCut(line);
    if (glued != null) {
      const prefix = line.slice(0, glued);
      return isMeaningfulHangulStatusPrefix(prefix) || prefix.trim().length >= 4
        ? prefix
        : "";
    }
    return line;
  }).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    // Drop lone Hangul crumbs (`다` / `중.`) left after opener cuts — never
    // 2-syllable prose like `요약.` / `질문`.
    if (/^[\uac00-\ud7af\u3000-\u9fff][.\u3002…]?$/u.test(trimmed)) return false;
    return !looksLikeTagStrippedSlideBody(trimmed);
  });
  text = kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  // Persist often drops `html>` from the first chunk, leaving a Hangul-titled
  // slide body (`반응형 UIvideo·svg…SEO`) as one blob.
  if (looksLikeTagStrippedSlideBodyDump(text) || looksLikeTagStrippedSlideBodyBlock(text)) {
    const status = leadingHangulStatusFromDump(text);
    const withoutDump = text.split("\n").filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !looksLikeTagStrippedSlideBodyDump(trimmed)
        && !looksLikeTagStrippedSlideBody(trimmed);
    });
    text = withoutDump.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
    if (
      !text.trim()
      || looksLikeTagStrippedSlideBodyDump(text)
      || looksLikeTagStrippedSlideBodyBlock(text)
      || looksLikeCssOrHtmlDebrisRemainder(text)
    ) {
      return status;
    }
    if (status && !text.startsWith(status)) return `${status}\n${text}`.trim();
  }
  return text;
}

function looksLikeTagStrippedSlideBodyBlock(text: string): boolean {
  const trimmed = String(text ?? "").replace(/<\/artifact\s*>/gi, "").trim();
  if (trimmed.length < 24) return false;
  return looksLikeTagStrippedSlideBody(trimmed) || looksLikeTagStrippedSlideBodyDump(trimmed);
}

function looksLikeCssOrHtmlDebrisRemainder(text: string): boolean {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return true;
  if (/^#(?:[0-9A-Fa-f]{3,8})\b/.test(trimmed)) return true;
  if (/^(?:font-size|padding|margin|transform|box-shadow|border|line-height)\s*:/.test(trimmed)) {
    return true;
  }
  if (/^['"]:[A-Za-z]/.test(trimmed)) return true;
  return false;
}

/** Keep `슬라이드 추가 중` when it is glued to leftover CSS/HTML on the same line. */
function leadingHangulStatusFromDump(text: string): string {
  const trimmed = String(text ?? "").trim();
  const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
  if (
    firstLine
    && firstLine.length < 160
    && !looksLikeTagStrippedSlideBodyDump(firstLine)
    && !looksLikeTagStrippedSlideBody(firstLine)
    && isMeaningfulHangulStatusPrefix(firstLine)
  ) {
    return firstLine;
  }
  const glued = /^((?:[\uac00-\ud7af\u3000-\u9fff]|[\s.,!?…·])+)(?=[A-Za-z#<"'`]|(?:html|body|head|section|article|main)\s*>|--[\w-]+)/u.exec(
    trimmed,
  );
  const prefix = glued?.[1]?.trim() ?? "";
  if (prefix && !looksLikeTagStrippedSlideBodyDump(prefix) && isMeaningfulHangulStatusPrefix(prefix)) {
    const after = trimmed.slice(trimmed.indexOf(prefix) + prefix.length).trimStart();
    const openerDump =
      /^(?:html|body|head|section|article|main)\s*>/i.test(after)
      || /^<!doctype\b/i.test(after);
    return openerDump
      ? prefix.replace(/[.\u3002…]+$/u, "").trimEnd()
      : prefix.replace(/[\s]+$/u, "");
  }
  return "";
}

function stripOrphanArtifactCloserDumpRespectingArtifacts(
  input: string,
  preserveArtifactBodies: boolean,
): string {
  if (!input) return input;
  if (!preserveArtifactBodies) return stripOrphanArtifactCloserDump(input);
  let result = "";
  let cursor = 0;
  while (cursor < input.length) {
    const open = findArtifactOpenIndex(input, cursor);
    if (open === -1) {
      result += stripOrphanArtifactCloserDump(input.slice(cursor));
      break;
    }
    const prose = stripOrphanArtifactCloserDump(input.slice(cursor, open));
    result += prose;
    if (
      prose.length > 0
      && !prose.endsWith("\n")
      && open > cursor
      && input[open - 1] === "\n"
    ) {
      result += "\n";
    }
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
    result += input.slice(open, close + "</artifact>".length);
    cursor = close + "</artifact>".length;
  }
  return result;
}

/**
 * True when a single chat line is deck CSS/HTML chrome rather than prose.
 * Used as a catch-all after named regex scrapers so unknown utility classes
 * (`.tag.inv`, `.chip.on`, …) and multi-line `color:\n#hex}` splits cannot
 * re-enter the bubble.
 */
export function looksLikeDeckCodeDebrisLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return false;

  if (/^#{1,6}\s+\S/.test(trimmed)) return false;
  if (/^(?:[-*+]|\d+[.)])\s+\S/.test(trimmed)) return false;
  if (/^<https?:\/\//i.test(trimmed)) return false;
  if (lineIsChatProseProtocolMarkup(trimmed)) return false;
  if (/^<\?(?:xml\b|[\w:-]+)/i.test(trimmed) || /^<!\[CDATA\[/.test(trimmed)) return true;
  if (/^<!\[(?:if\b|endif)/i.test(trimmed)) return true;
  if (/^\{\{[#/][\w.-]+/.test(trimmed)) return true;
  if (/^<%[=#@-]/.test(trimmed)) return true;
  if (/^\{#(?:each|if|await|key)\b/.test(trimmed)) return true;
  if (/^\{\/(?:each|if|await|key)\}/.test(trimmed)) return true;
  if (/^\{%\s*(?:for|if|endif|endfor|assign|set|block)\b/.test(trimmed)) return true;
  if (/^\]\]>\s*$/.test(trimmed)) return true;
  if (/^\/\*[\s\S]*\*\/\s*$/.test(trimmed) && trimmed.length <= 120) return true;
  if (
    /^\/\*/.test(trimmed)
    && !/\*\//.test(trimmed)
    && trimmed.length <= 120
    && !/[\uac00-\ud7af]{6,}/.test(trimmed)
  ) {
    return true;
  }
  if (/^!important\s*;?\s*$/i.test(trimmed)) return true;
  if (/^\$[a-zA-Z_-][\w-]*\s*:/.test(trimmed) && /(?:#|rgba?\(|hsla?\(|px|em|rem|%)/.test(trimmed)) {
    return true;
  }
  if (/^!\[[^\]]*\]\(\s*data:image\//i.test(trimmed)) return true;
  if (looksLikeBrStackedHeadingLine(trimmed)) return true;
  if (looksLikeHtmlAttrDumpLine(trimmed)) return true;
  if (looksLikeCssFunctionDebrisLine(trimmed)) return true;
  if (/^html\s*>/i.test(trimmed)) return true;
  if (looksLikeTagStrippedSlideBody(trimmed)) return true;
  if (looksLikeTailwindArbitraryDebrisLine(trimmed)) return true;
  if (looksLikeHtmlAttrContinuationLine(trimmed)) return true;
  if (/^&amp;lt;\/?[A-Za-z]/.test(trimmed)) return true;
  if (/^rgba?\([^)]*\)\s*;\s*[a-zA-Z-]+\s*:/.test(trimmed)) return true;

  if (/^[}\]\uFF5D]+\s*$/u.test(trimmed)) return true;
  if (/^(?:[}\]\uFF5D]\s*|<\/?(?:pre|code|div|span|p)>\s*)+$/iu.test(trimmed)) return true;
  if (/^\}?\s*<\/pre>\s*\}?/i.test(trimmed) && !/[\uac00-\ud7af]{3,}/.test(trimmed)) {
    return true;
  }
  if (
    /^<[a-zA-Z][\w:-]{0,12}(?:\s|$)/.test(trimmed)
    && !/>/.test(trimmed)
    && (/(?:transition|transform|background|animation|opacity|cubic-bezier|filter|will-change)\b/i.test(trimmed)
      || /[\uac00-\ud7af]/.test(trimmed))
  ) {
    return true;
  }
  if (looksLikeSoftCssDeclarationLine(trimmed)) return true;
  // Standalone `color: tomato;` / `margin: 0;` prop dumps (continuation RE
  // only fires inside an already-open debris block).
  if (
    /^[a-zA-Z-]+\s*:\s*[^;{]+;?\s*$/u.test(trimmed)
    && !/[\uac00-\ud7af]/.test(trimmed)
    && trimmed.length <= 96
  ) {
    return true;
  }
  if (/^cubic-bezier\s*\(/i.test(trimmed)) return true;
  if (
    /^[\d.]+(?:ms|s)\b/i.test(trimmed)
    && /(?:ease|cubic-bezier|\(|,|;)/i.test(trimmed)
  ) {
    return true;
  }
  if (looksLikeDeckJsDebrisLine(trimmed)) return true;
  if (/-->\s*$/.test(trimmed) && trimmed.length <= 80 && !/[\uac00-\ud7af]{8,}/.test(trimmed)) {
    return true;
  }

  if (/^<!--/.test(trimmed) || /<!--[\s\S]*-->/.test(trimmed)) {
    return true;
  }
  if (/^(?:<\/?div>\s*)+$/i.test(trimmed)) {
    return true;
  }
  if (/^(?:[\w\s/·.\-]{1,40}|[\uac00-\ud7af\s/·.\-]{1,20})<\/(?:p|div|h[1-6]|span|li|ul|ol)>\s*$/iu.test(trimmed)) {
    return true;
  }
  if (/^(?:<\/(?:div|span|section|header|footer|nav|aside|main|article|h[1-6]|p|ul|ol|li|table|tr|td|th|button|svg|style|script|pre|code)+>\s*)+$/i.test(trimmed)) {
    return true;
  }
  if (
    /^<\/?(?:div|li|ul|ol|p|span|section|header|footer|nav|aside|main|article|h[1-6]|strong|em|button|table|thead|tbody|tr|td|th|figure|figcaption|pre|code)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (
    /(?:<!--|<(?:li|div|ul|ol|table|tr|td|th|section|pre)\b)/i.test(trimmed)
    && /(?:-->|<\/(?:li|div|ul|ol|p|td|tr|th|section|pre)|<br\b)/i.test(trimmed)
  ) {
    return true;
  }
  if (/^#[0-9A-Fa-f]{3,8}\s*["']\s*>/.test(trimmed)) {
    return true;
  }
  if (
    /^(?:#[0-9A-Fa-f]{3,8}\s*;|(?:none|solid|inherit|px|em|rem|%)\s*;)/i.test(trimmed)
    && /(?:[a-zA-Z-]+\s*:|<\/?[a-zA-Z]|["']\s*>)/.test(trimmed)
  ) {
    return true;
  }
  if (/^(?:#[0-9A-Fa-f]{3,8}\s*;\s*)?--[A-Za-z_][\w-]*\s*:/.test(trimmed)) {
    return true;
  }
  if (/^#[0-9A-Fa-f]{3,8}\s*;\s*--[A-Za-z_]/.test(trimmed)) {
    return true;
  }
  // Mid-style hex dump: `#2d2a26;padding:28px;transform:…">`.
  if (/^#(?:[0-9A-Fa-f]{3,8})\s*;\s*[a-zA-Z-]+\s*:/.test(trimmed)) {
    return true;
  }
  // Split gradient token: `9c9,#ff9f9f);border:2px solid`.
  if (/^#(?:[0-9A-Fa-f]{3,8})\s*\)\s*;\s*[a-zA-Z-]+\s*:/.test(trimmed)) {
    return true;
  }
  // Style-attribute closer leftover: `">Syft로…` / `">Observability` / `"> 5px 0`.
  if (/^["']\s*>/.test(trimmed)) {
    return true;
  }
  if (
    /^:['"][A-Za-z]/.test(trimmed)
    && /(?:Slab|Serif|Sans|Caveat|Grotesk|Quicksand|Fredoka|Zilla|Playfair|cursive)/i.test(trimmed)
  ) {
    return true;
  }
  // Bare font-stack leftover: `'Zilla Slab',cursive;` / `Caveat',cursive;font-size:`.
  // Unquoted names cannot include spaces — otherwise `Adding slideCaveat'` is
  // treated as a stack and the human prefix is dropped.
  if (
    /^(?:['"][A-Za-z][\w\s]{0,24}['"]|[A-Za-z][\w]{0,24}['"])\s*,\s*(?:cursive|sans-serif|serif|monospace|fantasy|system-ui)\s*;/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^(?:hsla?|hwb|lch|oklch|lab|color|light-dark)\s*\([^)]*\)\s*;\s*[a-zA-Z-]+\s*:/.test(trimmed)) {
    return true;
  }
  if (/^var\s*\(\s*--[^)]+\)\s*;\s*[a-zA-Z-]+\s*:/.test(trimmed)) {
    return true;
  }
  if (/^currentColor\s*;\s*[a-zA-Z-]+\s*:/i.test(trimmed)) {
    return true;
  }
  if (/^(?:deg|turn|rad|grad)\s*,\s*#(?:[0-9A-Fa-f]{3,8})/.test(trimmed)) {
    return true;
  }
  if (/^#[0-9A-Fa-f]{3,8}\s*;?\s*$/.test(trimmed)) {
    return true;
  }
  if (/^[0-9A-Fa-f]{3,8}\s*,\s*$/.test(trimmed)) {
    return true;
  }
  if (/^[\d.]+(?:px|em|rem)\s+(?:solid|dashed|dotted)\s*$/i.test(trimmed)) {
    return true;
  }
  if (
    /^<\/?[a-zA-Z][\w:-]*\b/.test(trimmed)
    && /(?:\bstyle\s*=|\bclass\s*=|data-(?:slide|deck)|role\s*=\s*["']presentation|aria-hidden\s*=\s*["']true|<(?:svg|path|circle|rect|video|canvas|iframe|object|embed|picture|source|math|foreignObject)\b|<\/(?:div|section|span|svg|h[1-6]|style|pre)\b|<br\b)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (
    /^(?:(?:\.[A-Za-z_-][\w-]*){1,8}|#[A-Za-z_-][\w-]*|@(?:keyframes|font-face|media|import|supports|layer|page|charset|namespace|property|scope|starting-style|container|counter-style)\b|:(?:root|from|to)\b|(?:from|to|\d+%)\s*\{)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^--[A-Za-z_][\w-]*\s*:/.test(trimmed) && /(?:#|rgba?\(|hsla?\()/i.test(trimmed)) {
    return true;
  }
  if (
    /^(?:-?[a-zA-Z]+(?:-[a-zA-Z0-9]+)*)\s*:\s*\S/.test(trimmed)
    && /(?:rgba?\(|hsla?\(|#[0-9A-Fa-f]{3,8}|\d+(?:px|em|rem|%|vh|vw|cqw|cqh|cqi|cqb|ms|s)|border|padding|margin|font-|display\s*:|transform|opacity|background|filter|transition|content\s*:|aspect-ratio\s*:|color-scheme\s*:|unicode-range\s*:|font-display\s*:|view-transition-name\s*:|anchor-name\s*:|position-anchor\s*:|interpolate-size\s*:|offset-path\s*:|mask-image\s*:|contain\s*:|isolation\s*:|mix-blend-mode\s*:|url\s*\(|format\s*\(|local\s*\(|tech\s*\(|woff2?|\\[Aa]|!important)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/^src\s*:\s*(?:url|local|tech)\s*\(/i.test(trimmed)) return true;
  if (/^U\+[0-9A-Fa-f]{1,6}\b/.test(trimmed)) return true;
  if (/^[A-Za-z0-9._/-]+\.woff2?\b/i.test(trimmed)) return true;
  if (/^from-font\s*;?\s*$/i.test(trimmed)) return true;
  if (
    /^(?:-?(?:webkit|moz|ms)-)?[a-z][\w-]*-[a-z][\w-]*\s*:\s*\S/i.test(trimmed)
    && !/[\uac00-\ud7af]/.test(trimmed)
    && (/;\s*$/.test(trimmed)
      || /(?:url\s*\(|var\s*\(|#[0-9A-Fa-f]{3,8}|\d+(?:px|em|rem|%|vh|vw|cqw)|--[\w-]+)/.test(trimmed))
  ) {
    return true;
  }
  if (
    !/[\uac00-\ud7af]/.test(trimmed)
    && /^(?:[a-z][\w-]*\s*:\s*[^;]+;\s*){2,}$/i.test(trimmed)
    && /(?:--|url\s*\(|var\s*\(|#[0-9A-Fa-f]{3,8}|\d+(?:px|em|rem|%|vh|vw|cqw)|timeline|wrap|sizing|font-)/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  const cssSignals = (trimmed.match(/[{};:\uFF5D]/gu) ?? []).length;
  const hangul = (trimmed.match(/[\uac00-\ud7af]/g) ?? []).length;
  if (cssSignals >= 3 && hangul < 2 && /[{}\uFF5D]/u.test(trimmed) && /:/.test(trimmed)) {
    return true;
  }
  const htmlTags = (trimmed.match(/<\/?[a-zA-Z][\w:-]*\b/g) ?? []).length;
  if (htmlTags >= 2 && /<\/?(?:li|div|ul|ol|p|span|strong|pre)\b/i.test(trimmed)) {
    return true;
  }
  if (/^&lt;\/?[a-zA-Z]/.test(trimmed) && /(?:style\s*=|class\s*=|&gt;)/i.test(trimmed)) {
    return true;
  }
  if (
    /^<\/?([A-Za-z][\w:-]*)\b/.test(trimmed)
    && !lineIsChatProseProtocolMarkup(trimmed)
    && !/^<https?:\/\//i.test(trimmed)
  ) {
    return true;
  }
  return false;
}

/**
 * Colon-less CSS property dumps (`background 200ms`, `filter blur(8px)`,
 * `will-change transform`, `transition all 200ms`). Prefer shape over allowlist.
 */
export function looksLikeSoftCssDeclarationLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || /:/.test(trimmed)) return false;
  const shaped =
    /^(?:-?(?:webkit|moz|ms)-)?[a-z][\w-]*((?:\s+[^\n:;{}]{1,64}){1,6});?\s*$/i.exec(
      trimmed,
    );
  if (!shaped) return false;
  if (/[\uac00-\ud7af]/.test(trimmed)) return false;
  // ALL-CAPS first token (`LECTURE 01 · FRONT-END…`) is slide chrome, not CSS.
  const propToken = /^(?:-?(?:webkit|moz|ms)-)?([A-Za-z][\w-]*)/.exec(trimmed)?.[1] ?? "";
  if (propToken.length >= 3 && propToken === propToken.toUpperCase()) return false;
  const cssValueSignal =
    /(?:\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|ms|s|deg|fr|ch)\b|\b(?:ease(?:-in|-out|-in-out)?|linear|infinite|alternate|forwards|backwards|both|none|auto|inherit|initial|unset|cover|contain|blur|circle|ellipse|closest-side|farthest-side|all|transform|opacity|scroll|contents|fixed|absolute|relative|sticky|flex|grid|block|inline|row|column|wrap|nowrap|hidden|visible|solid|dashed|dotted)\b|rgba?\(|hsla?\(|#[0-9A-Fa-f]{3,8}\b|cubic-bezier\s*\(|linear-gradient\s*\(|matrix3d?\s*\(|(?:translate|scale|rotate|skew)[XYZxyz3d]?\s*(?:\(|$))/i;
  // Score the value tokens only — "Visible intro" must not trip on the
  // property-shaped first word matching a CSS keyword. Bare `01` without a
  // unit must not cut `WD · LECTURE 01 · …` into a `WD ·` leftover.
  if (cssValueSignal.test(shaped[1] ?? "")) return true;
  const two = /^(?:-?(?:webkit|moz|ms)-)?([a-z][\w-]*)\s+([a-z0-9.#%()-][\w.#%()-]*)\s*;?\s*$/i.exec(
    trimmed,
  );
  if (!two) return false;
  const prop = (two[1] ?? "").toLowerCase();
  return prop.includes("-")
    || /^(?:opacity|transform|filter|transition|animation|display|position|overflow|float|clear|cursor|visibility|content|appearance|isolation|resize|left|right|top|bottom|width|height|margin|padding|border|color|background|outline|flex|grid|gap|order|scale|rotate|skew)$/i.test(
      prop,
    );
}

/** Hex / unit / brace-only continuations of a prior CSS dump line. */
export function looksLikeDeckCssContinuationLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return false;
  if (/^#[0-9A-Fa-f]{3,8}\s*;?\s*[}\uFF5D]?\s*$/u.test(trimmed)) return true;
  if (/^#[0-9A-Fa-f]{3,8}\s*;\s*(?:--|[a-zA-Z-]+\s*:)/.test(trimmed)) return true;
  if (/^rgba?\([^)]*\)\s*;?\s*[}\uFF5D]?\s*$/iu.test(trimmed)) return true;
  if (/^rgba?\([^)]*\)\s*;\s*[a-zA-Z-]+\s*:/.test(trimmed)) return true;
  if (/^[\d.]+(?:px|em|rem|%|vh|vw|ms|s)?\s*;?\s*[}\uFF5D]?\s*$/iu.test(trimmed)) return true;
  // Split box-shadow / spacing residue: `5px 0`.
  if (/^[\d.]+(?:px|em|rem|%)\s+[\d.]+\s*;?\s*$/i.test(trimmed)) return true;
  // Split hex list residue: `9c9,`.
  if (/^[0-9A-Fa-f]{3,8}\s*,\s*$/.test(trimmed)) return true;
  if (/^["']\s*>/.test(trimmed)) return true;
  if (/^(?:hsla?|hwb|lch|oklch|oklab|lab|color|light-dark|device-cmyk)\s*\(/.test(trimmed)) return true;
  if (/^var\s*\(\s*--/.test(trimmed)) return true;
  if (/^currentColor\s*;/i.test(trimmed)) return true;
  if (/^(?:deg|turn|rad|grad)\s*,/.test(trimmed)) return true;
  if (/^[a-zA-Z-]+\s*:\s*[^;{]+;?\s*[}\uFF5D]?\s*$/u.test(trimmed)) return true;
  if (/^--[A-Za-z_][\w-]*\s*:/.test(trimmed)) return true;
  if (/^[}\]\uFF5D]+\s*$/u.test(trimmed)) return true;
  if (/^cubic-bezier\s*\(/i.test(trimmed)) return true;
  if (looksLikeSoftCssDeclarationLine(trimmed)) return true;
  if (/^\);?\s*$/.test(trimmed)) return true;
  if (/^[(){};,\s\uFF5D]+$/u.test(trimmed)) return true;
  return false;
}

/** Web Animations / DOM / GSAP-ish scraps leaked from deck demos. */
export function looksLikeDeckJsDebrisLine(line: string): boolean {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return false;
  // Hangul/CJK status glued to JS (`슬라이드 추가 중document.querySelector`)
  // is a prefix+dump line — keep the status and let hangul glue cut the dump.
  if (/^[\uac00-\ud7af\u3000-\u9fff]/.test(trimmed)) return false;
  if (/\b(?:document|window)\.\w+\s*\(/.test(trimmed)) return true;
  if (/\brequestAnimationFrame\s*\(/.test(trimmed)) return true;
  if (/\bnew\s+(?:Animation|KeyframeEffect)\s*\(/.test(trimmed)) return true;
  if (/\.(?:innerHTML|outerHTML)\s*=/.test(trimmed)) return true;
  if (/\.insertAdjacentHTML\s*\(/.test(trimmed)) return true;
  if (/\.classList\.(?:add|remove|toggle|replace)\s*\(/.test(trimmed)) return true;
  if (/\.setAttribute\s*\(/.test(trimmed)) return true;
  if (/\.className\s*=/.test(trimmed)) return true;
  if (
    /\.(?:appendChild|prepend|replaceChildren|replaceWith|insertBefore|insertAdjacentElement|removeAttribute|toggleAttribute)\s*\(/.test(
      trimmed,
    )
  ) {
    return true;
  }
  if (/\.style\.(?:cssText|setProperty)\s*[=(]/.test(trimmed)) return true;
  if (/\bDOMParser\b/.test(trimmed)) return true;
  if (/\.createContextualFragment\s*\(/.test(trimmed)) return true;
  if (/\badoptedStyleSheets\b/.test(trimmed)) return true;
  if (/\b(?:new\s+)?CSSStyleSheet\b/.test(trimmed)) return true;
  if (/\.replaceSync\s*\(/.test(trimmed)) return true;
  if (/\.setAttributeNS\s*\(/.test(trimmed)) return true;
  if (/\.srcdoc\s*=/.test(trimmed)) return true;
  if (/\bgetComputedStyle\s*\(/.test(trimmed)) return true;
  if (/\.scrollIntoView\s*\(/.test(trimmed)) return true;
  if (/\.dataset\.\w+\s*=/.test(trimmed)) return true;
  if (/\.insertAdjacentText\s*\(/.test(trimmed)) return true;
  if (/\.removeChild\s*\(/.test(trimmed)) return true;
  if (/\.(?:before|after)\s*\(/.test(trimmed)) return true;
  if (/\bstyled\.\w+/.test(trimmed)) return true;
  if (/\bcss\s*`/.test(trimmed)) return true;
  if (/^(?:querySelector(?:All)?|getElementById|getElementsBy(?:ClassName|TagName)|closest)\s*\(/.test(trimmed)) {
    return true;
  }
  if (/\w+\.(?:animate|cancel|addEventListener|getAnimations)\s*\(/.test(trimmed)) return true;
  if (/^(?:const|let|var)\s+\w+\s*=\s*(?:document\.|window\.|\w+\.(?:animate|querySelector))/.test(trimmed)) {
    return true;
  }
  if (/\b(?:morphSVG|gsap|ScrollTrigger|KeyframeEffect)\b/i.test(trimmed)) return true;
  if (/^CSS\.supports\s*\(/.test(trimmed)) return true;
  if (/\bTrigger\s*,\s*timeline\b/i.test(trimmed)) return true;
  if (/<\/pre>/i.test(trimmed) && /(?:animate|querySelector|morphSVG|timeline|const\s+\w+|addEventListener)/i.test(trimmed)) {
    return true;
  }
  return false;
}

function lineOpensUnclosedCssBlock(line: string): boolean {
  const open = (line.match(/[{([]/g) ?? []).length;
  const close = (line.match(/[})\]]/g) ?? []).length;
  return open > close;
}

/**
 * Remove CSS/HTML chrome lines from assistant chat prose. Specific scrapers
 * handle known dialects; this catch-all drops unknown utility-class dumps and
 * multi-line color splits so they cannot paint the bubble after reload.
 */
export function stripLeakedDeckCodeDebrisBlocks(input: string): string {
  if (!input) return input;
  const lines = String(input).split("\n");
  const kept: string[] = [];
  let inCssContinuation = false;
  let inHtmlAttrContinuation = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed) {
      kept.push(line);
      continue;
    }

    if (inHtmlAttrContinuation && looksLikeHtmlAttrContinuationLine(trimmed)) {
      if (/>/.test(trimmed)) inHtmlAttrContinuation = false;
      continue;
    }
    inHtmlAttrContinuation = false;

    const inlineCut = cutInlineDeckHtmlPrefix(line);
    if (inlineCut !== undefined) {
      inCssContinuation = false;
      if (inlineCut === null) {
        while (kept.length > 0 && !(kept[kept.length - 1] ?? "").trim()) {
          kept.pop();
        }
        continue;
      }
      kept.push(inlineCut);
      continue;
    }

    const isDebris =
      looksLikeDeckCodeDebrisLine(trimmed)
      || (inCssContinuation && looksLikeDeckCssContinuationLine(trimmed));

    if (isDebris) {
      inCssContinuation =
        lineOpensUnclosedCssBlock(trimmed)
        || (inCssContinuation && !/[})\]\uFF5D]/u.test(trimmed));
      inHtmlAttrContinuation = looksLikeIncompleteHtmlOpenLine(trimmed);
      while (kept.length > 0 && !(kept[kept.length - 1] ?? "").trim()) {
        kept.pop();
      }
      continue;
    }

    inCssContinuation = false;
    kept.push(line);
  }

  while (kept.length > 0 && !(kept[kept.length - 1] ?? "").trim()) {
    kept.pop();
  }
  const collapsed: string[] = [];
  for (const line of kept) {
    if (!(line ?? "").trim()) {
      if (collapsed.length === 0) continue;
      if (!(collapsed[collapsed.length - 1] ?? "").trim()) continue;
    }
    collapsed.push(line);
  }
  return collapsed.join("\n").replace(/\n+$/g, "");
}

/**
 * When Hangul/status prose is glued to a deck HTML/CSS/JS dump on the same
 * line, keep the human prefix and drop the dump.
 */
function cutInlineDeckHtmlPrefix(line: string): string | null | undefined {
  const leadScrap = /^(?:[\s}\]\uFF5D]+|<\/?(?:pre|code)(?:\s[^>]*)?>)+/iu.exec(line);
  if (leadScrap) {
    const rest = line.slice(leadScrap[0].length).trimStart();
    if (
      rest
      && /[\uac00-\ud7af]/.test(rest)
      && !looksLikeDeckCodeDebrisLine(rest)
      && !looksLikeDeckJsDebrisLine(rest)
    ) {
      return rest;
    }
  }

  const softCut =
    /^(.*?)(\s+)(?=(?:-?(?:webkit|moz|ms)-)?[a-z][\w-]*(?:\s+[^\n:;{}]{1,64}){1,6};?\s*$|(?:document|window)\.\w+\s*\(|requestAnimationFrame\s*\(|cubic-bezier\s*\(|\w+\.(?:innerHTML|outerHTML|insertAdjacentHTML|classList)\b)/i.exec(
      line,
    );
  if (softCut) {
    const prefixRaw = softCut[1] ?? "";
    const ticksBefore = (prefixRaw.match(/`/g) ?? []).length;
    if (ticksBefore % 2 !== 1) {
      const prefix = prefixRaw.trimEnd();
      const dump = line.slice(prefixRaw.length).trimStart();
      if (
        prefix
        && /[\p{L}\p{N}]/u.test(prefix)
        && !looksLikeDeckCodeDebrisLine(prefix)
        && (looksLikeSoftCssDeclarationLine(dump) || looksLikeDeckJsDebrisLine(dump) || /^cubic-bezier\s*\(/i.test(dump))
      ) {
        return prefix;
      }
    }
  }

  const match = new RegExp(
    `^(.*?)(\\s*)(<!--|<[?][\\w:-]*|<!\\[(?:CDATA\\[|if\\b|endif\\])|<(?!\\/?(?:${CHAT_PROSE_PROTOCOL_TAG_ALT}|https?|br|wbr)\\b)([A-Za-z][\\w:-]*)(?:\\s|\\/?>|$))`,
    "i",
  ).exec(line);
  if (!match || match.index === undefined) return undefined;
  const tagName = match[4];
  if (tagName && isShortStreamingHtmlPrefix(tagName)) return undefined;
  const prefixRaw = match[1] ?? "";
  const ticksBefore = (prefixRaw.match(/`/g) ?? []).length;
  if (ticksBefore % 2 === 1) return undefined;
  const prefix = prefixRaw.trimEnd();
  const dump = line.slice(prefixRaw.length);
  if (!prefix) return undefined;
  if (looksLikeDeckCodeDebrisLine(prefix)) return undefined;
  if (!/[\p{L}\p{N}]/u.test(prefix)) return undefined;
  if (
    !looksLikeDeckCodeDebrisLine(dump.trim())
    && !new RegExp(
      `<!--|<\\/(?!${CHAT_PROSE_PROTOCOL_TAG_ALT}\\b)[A-Za-z][\\w:-]*\\b|<(?!\\/?(?:${CHAT_PROSE_PROTOCOL_TAG_ALT}|https?)\\b)[A-Za-z][\\w:-]*\\b[^>]*>[\\s\\S]*<\\/`,
      "i",
    ).test(dump)
  ) {
    return undefined;
  }
  return prefix;
}

/**
 * Absolute last-pass: strip residual deck HTML comments/tags that line
 * scrapers left (single-line glued dumps, table rows, entity-encoded tags).
 */
export function stripResidualDeckHtmlMarkupFromProse(input: string): string {
  if (!input) return input;
  let text = String(input);

  const fences: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (m) => {
    fences.push(m);
    return `\0FENCE${fences.length - 1}\0`;
  });
  const inlines: string[] = [];
  text = text.replace(/`[^`\n]+`/g, (m) => {
    inlines.push(m);
    return `\0INLINE${inlines.length - 1}\0`;
  });

  text = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  // Normalize encoded / fullwidth angle brackets before PI and tag scrapers.
  text = text.replace(/&(?:amp;)+lt;/gi, "<");
  text = text.replace(/&(?:amp;)+gt;/gi, ">");
  text = text.replace(/&#0*60;/g, "<");
  text = text.replace(/&#0*62;/g, ">");
  text = text.replace(/&#x0*3c;/gi, "<");
  text = text.replace(/&#x0*3e;/gi, ">");
  text = text.replace(/\\u003c/gi, "<");
  text = text.replace(/\\u003e/gi, ">");
  text = text.replace(/%3c/gi, "<");
  text = text.replace(/%3e/gi, ">");
  text = text.replace(/\\x3c/gi, "<");
  text = text.replace(/\\x3e/gi, ">");
  text = text.replace(/\\u\{0*3c\}/gi, "<");
  text = text.replace(/\\u\{0*3e\}/gi, ">");
  text = text.replace(/\\074/g, "<");
  text = text.replace(/\\076/g, ">");
  text = text.replace(/\uFF1C/g, "<");
  text = text.replace(/\uFF1E/g, ">");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  text = text.replace(/<!--[\s\S]*$/g, "");
  text = text.replace(/<!doctype\b[^>]*>/gi, "");
  text = text.replace(/<\?[\w:-]+[^\n]*\?>/g, "");
  text = text.replace(/<\?[\w:-]+[^\n]*$/g, "");
  text = text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  text = text.replace(/<!\[CDATA\[[\s\S]*$/g, "");
  text = text.replace(/<!\[if\b[\s\S]*?\]>/gi, "");
  text = text.replace(/<!\[endif\]>/gi, "");
  text = text.replace(/^\s*]]>\s*$/gm, "");
  text = text.replace(/!\[[^\]]*\]\(\s*data:image\/[^)]+\)/gi, "");
  text = text.replace(/&amp;lt;\/?[A-Za-z][\w:-]*[\s\S]*?(?:&amp;gt;|&gt;|>)/gi, "");
  text = text.replace(
    /(?:^|\n)\s*(?:[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*')\s*)+\/?>[^\n]*/g,
    "\n",
  );
  text = text.replace(/[ \t]+\/>/g, "");

  const notProtocol = `(?!\\/?(?:${CHAT_PROSE_PROTOCOL_TAG_ALT}|https?)\\b)`;
  const htmlName = "[A-Za-z][\\w:-]*";
  for (let pass = 0; pass < 6; pass += 1) {
    const before = text;
    text = text.replace(
      new RegExp(`<${notProtocol}(${htmlName})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, "gi"),
      "",
    );
    if (text === before) break;
  }
  text = text.replace(new RegExp(`<\\/?${notProtocol}${htmlName}\\b[^>]*\\/?>`, "gi"), "");
  text = text.replace(
    new RegExp(
      `&lt;\\/?(?!${CHAT_PROSE_PROTOCOL_TAG_ALT}\\b)${htmlName}\\b[\\s\\S]*?(?:&gt;|>)`,
      "gi",
    ),
    "",
  );
  text = text.replace(
    /(?:^|\n)[^\n]*(?:dark|left|right|col\s*\d|layout|statement|registration|tips)\s*-->[^\n]*/gi,
    "\n",
  );
  text = text.replace(/(?:^|\n)\s*[}\]\uFF5D]+\s*(?=\n|$)/gu, "\n");
  text = text.replace(/\}?\s*<\/?pre\b[^>]*>\s*\}?/gi, "");

  text = text.replace(/\0FENCE(\d+)\0/g, (_, i) => fences[Number(i)] ?? "");
  text = text.replace(/\0INLINE(\d+)\0/g, (_, i) => inlines[Number(i)] ?? "");

  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

export function stripResidualDeckHtmlMarkupRespectingArtifacts(
  input: string,
  preserveArtifactBodies: boolean,
): string {
  if (!preserveArtifactBodies) return stripResidualDeckHtmlMarkupFromProse(input);
  let result = "";
  let cursor = 0;
  while (cursor < input.length) {
    const open = findArtifactOpenIndex(input, cursor);
    if (open === -1) {
      result += stripResidualDeckHtmlMarkupFromProse(input.slice(cursor));
      break;
    }
    const prose = stripResidualDeckHtmlMarkupFromProse(input.slice(cursor, open));
    result += prose;
    if (
      prose.length > 0
      && !prose.endsWith("\n")
      && open > cursor
      && input[open - 1] === "\n"
    ) {
      result += "\n";
    }
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

export function stripLeakedDeckCodeDebrisBlocksRespectingArtifacts(
  input: string,
  preserveArtifactBodies: boolean,
): string {
  if (!preserveArtifactBodies) return stripLeakedDeckCodeDebrisBlocks(input);
  let result = "";
  let cursor = 0;
  while (cursor < input.length) {
    const open = findArtifactOpenIndex(input, cursor);
    if (open === -1) {
      result += stripLeakedDeckCodeDebrisBlocks(input.slice(cursor));
      break;
    }
    const prose = stripLeakedDeckCodeDebrisBlocks(input.slice(cursor, open));
    result += prose;
    // Re-insert the newline that commonly separates chat prose from `<artifact`
    // when the line scrubber trimmed it off the prose slice.
    if (
      prose.length > 0
      && !prose.endsWith("\n")
      && open > cursor
      && input[open - 1] === "\n"
    ) {
      result += "\n";
    }
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
  // Keep short Hangul/Latin prefixes (`초안.` / `Done.`) — only wipe when the
  // residue after token/hex scrub has no real prose.
  const residue = text
    .replace(/:root|--[\w-]+|#[0-9A-Fa-f]+|var\([^)]*\)|[{};:,()\s]/gi, " ")
    .trim();
  if (
    looksLikeLeakedCssCustomPropertyBlock(text)
    && !/<[a-z]/i.test(text)
    && !/[가-힣]{2,}/.test(residue)
    && !/[A-Za-z]{3,}/.test(residue)
  ) {
    return "";
  }
  // Trailing / mid-message bare `--token:#hex;` dumps (no `:root{…}` wrapper).
  text = text.replace(
    /(?:\n|^)\s*(?:--[\w-]+\s*:\s*[^;\n]+;\s*){2,}[^\n]*/g,
    (block, offset) => {
      if (!looksLikeLeakedCssCustomPropertyBlock(block)) return block;
      return offset > 0 ? "" : "";
    },
  );
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
  options: Omit<SanitizeAssistantProseOptions, "streaming"> & {
    preserveOpenArtifact?: boolean;
  } = {},
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
