import {
  ARTIFACT_BARE_CDN_HOST_LINE_RE,
  artifactBareCdnHostLineSource,
  artifactCdnHrefTokenAlternation,
  artifactCdnHostWithOptionalPathAlternation,
  artifactCdnScriptSrcHostAlternation,
  artifactHeadCdnHostSource,
} from "./artifactCdnHosts.js";

/**
 * Truncated viewport / meta tails agents stream as visible text.
 *
 * Covers:
 *   - `device-width, initial-scale=1" />` (Hermes-class corruption)
 *   - `-width, initial-scale=1" />` (shorter suffix)
 *   - `viewport=width=device-width, initial-scale=1" />` (prefixed variant)
 *   - `name="viewport" content="width=device-width, …" />` (meta attrs without `<meta`)
 *
 * The lookbehind rejects matches inside valid `content="width=device-width, …"`
 * attribute values on real `<meta name="viewport">` tags.
 */
export const ARTIFACT_VIEWPORT_TEXT_LEAK_RE =
  /(?<![\w="/])(?:viewport\s*=\s*width\s*=\s*device-width|(?:device-width|-width))\s*,\s*initial-scale=[^<\n]+"?\s*\/?>/gi;

/** Meta viewport attribute fragment leaked without the opening `<meta` tag. */
export const ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE =
  /(?:^|>)\s*name\s*=\s*["']viewport["']\s+content\s*=\s*["'][^"']*["']\s*\/?>\s*/gim;

/** Full `<meta name="viewport" …>` appearing as raw body text (never valid slide content). */
export const ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE =
  /<meta\s+[^>]*\bname\s*=\s*["']viewport["'][^>]*\/?>/gi;

/**
 * Host fragments for DOM/string detectors — derived from `artifactCdnHosts.ts`.
 */
export const ARTIFACT_HEAD_CDN_HOST_SOURCE = artifactHeadCdnHostSource();

/**
 * Truncated / orphaned head void-tag tails (link, meta charset, CDN fonts/scripts).
 *
 * Agents often stream `<link href="https://fonts.googleapis.com/css2?…">` and
 * lose the opening `<link href="https://fonts.` — the browser then paints the
 * remainder as body text (`googleapis.com" />`), blanking the slide preview.
 *
 * Require a void-tag-like ending (`/>` or trailing `"` + `>`) so real slide
 * copy that merely mentions Google Fonts is not stripped.
 */
export const ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE = new RegExp(
  "(?:"
    // CDN host/path tails. Lookbehind avoids matching inside href="https://…".
    + "(?<![\\w=\"/.-])(?:https?:\\/\\/)?(?:"
    + artifactCdnHostWithOptionalPathAlternation()
    + ")\\s*\"?\\s*\\/?>"
    // Google Fonts query tails. display=swap optional.
    + "|(?<![\\w=\"/.-])(?:css2\\?)?family=[A-Za-z0-9_+:;,=%&.@\\-]+(?:(?:&amp;|&)[A-Za-z0-9_+:;,=%&.@\\-]*)*\\s*\"?\\s*\\/?>"
    + "|(?:^|(?<=\\n)|(?<=>))\\s*(?:"
    + "href\\s*=\\s*[\"']https?:\\/\\/[^\"']*(?:"
    + artifactCdnHrefTokenAlternation()
    + ")[^\"']*[\"'][^<\\n]{0,80}"
    + "|rel\\s*=\\s*[\"'](?:stylesheet|preconnect|preload|dns-prefetch|modulepreload|icon)[\"'][^<\\n]{0,120}"
    + "|crossorigin(?:\\s*=\\s*[\"']anonymous[\"'])?[^<\\n]{0,80}"
    + "|charset\\s*=\\s*[\"'][^\"']*[\"'][^<\\n]{0,40}"
    + "|type\\s*=\\s*[\"']module[\"'][^<\\n]{0,80}"
    + "|integrity\\s*=\\s*[\"']sha\\d+-[^\"']+[\"'][^<\\n]{0,40}"
    + ")\\s*\"?\\s*\\/?>"
    + ")",
  "gi",
);

/** Truncated external `<script src=…>` tails painted as body text. */
export const ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE = new RegExp(
  "(?<![\\w=\"/.-])(?:(?:https?:\\/\\/)?(?:"
    + artifactCdnScriptSrcHostAlternation()
    + ")\\/[^<\\n]*?)\\s*\"?\\s*>\\s*(?:<\\/script>)?",
  "gi",
);

/** Attribute-only link fragments without the opening `<link` tag. */
export const ARTIFACT_ORPHAN_LINK_ATTR_LEAK_RE = new RegExp(
  "(?:^|>)\\s*(?:href\\s*=\\s*[\"']https?:\\/\\/[^\"']*(?:"
    + artifactCdnHrefTokenAlternation()
    + ")[^\"']*[\"']\\s*)?(?:rel\\s*=\\s*[\"'](?:stylesheet|preconnect|preload)[\"']\\s*)+(?:crossorigin(?:\\s*=\\s*[\"'][^\"']*[\"'])?\\s*)?\\/?>\\s*",
  "gim",
);

/** Full `<link …>` tags that only belong in `<head>` but leaked into body text/HTML. */
export const ARTIFACT_LEAKED_HEAD_LINK_TAG_RE = new RegExp(
  "<link\\s+[^>]*(?:\\brel\\s*=\\s*[\"'](?:stylesheet|preconnect|preload)[\"']|(?:"
    + artifactCdnHrefTokenAlternation()
    + "))[^>]*\\/?>",
  "gi",
);

/** Full `<meta charset=…>` leaked into body (never valid slide content). */
export const ARTIFACT_LEAKED_META_CHARSET_TAG_RE =
  /<meta\s+[^>]*\bcharset\s*=\s*["']?[^"'>\s]+["']?[^>]*\/?>/gi;

/** Full head-only `<script src=CDN…>` tags leaked into body. */
export const ARTIFACT_LEAKED_EXTERNAL_SCRIPT_TAG_RE = new RegExp(
  "<script\\s+[^>]*\\bsrc\\s*=\\s*[\"']https?:\\/\\/[^\"']*(?:"
    + artifactCdnScriptSrcHostAlternation()
    + "|googleapis\\.com)[^\"']*[\"'][^>]*>\\s*<\\/script>",
  "gi",
);

/**
 * Source string for a DOM `RegExp` that tests a single text node's content.
 * Keep in sync with the string-level patterns above — used by preview iframe
 * guards and headless Chromium export cleanup.
 */
export const ARTIFACT_VIEWPORT_DOM_TEXT_LEAK_SOURCE =
  '^\\s*(?:viewport\\s*=\\s*width\\s*=\\s*device-width|(?:device-width|-width))\\s*,\\s*initial-scale=[^<\\n]+"?\\s*\\/?>\\s*$'
  + '|^\\s*name\\s*=\\s*["\']viewport["\']\\s+content\\s*=\\s*["\'][^"\']*["\']\\s*\\/?>\\s*$';

/** DOM text-node patterns for orphaned font/CDN/link/script tails (single-node match). */
export const ARTIFACT_ORPHAN_HEAD_VOID_DOM_TEXT_LEAK_SOURCE =
  "^\\s*(?:(?:https?:\\/\\/)?(?:"
  + artifactCdnHostWithOptionalPathAlternation()
  + ")|(?:css2\\?)?family=[A-Za-z0-9_+:;,=%&.@\\-]+(?:(?:&amp;|&)[A-Za-z0-9_+:;,=%&.@\\-]*)*\\S*|href\\s*=\\s*[\"']https?:\\/\\/[^\"']*(?:"
  + artifactCdnHrefTokenAlternation()
  + ")[^\"']*[\"'][^<]{0,80}|rel\\s*=\\s*[\"'](?:stylesheet|preconnect|preload)[\"'][^<]{0,120}|crossorigin(?:\\s*=\\s*[\"']anonymous[\"'])?[^<]{0,80}|charset\\s*=\\s*[\"'][^\"']*[\"'][^<]{0,40}|type\\s*=\\s*[\"']module[\"'][^<]{0,80}|integrity\\s*=\\s*[\"']sha\\d+-[^\"']+[\"'][^<]{0,40})\\s*\"?\\s*\\/?>\\s*$"
  + "|^\\s*(?:(?:https?:\\/\\/)?(?:"
  + artifactCdnScriptSrcHostAlternation()
  + ")\\/\\S*)\\s*\"?\\s*>\\s*(?:<\\/script>)?\\s*$"
  + "|^\\s*"
  + artifactBareCdnHostLineSource()
  + "\\s*$";

/** Remove closed style/script blocks so body scans ignore legitimate CSS/JS. */
export function stripClosedStyleAndScriptBlocks(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function previewLeakScanSurface(html: string): string {
  const withoutBlocks = stripClosedStyleAndScriptBlocks(html);
  const bodyMatch = withoutBlocks.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch?.[1] ?? withoutBlocks;
}

function resetAndTest(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  return re.test(text);
}

/** Detect truncated viewport meta rendered as visible body/head text. */
export function hasArtifactViewportMetaTextLeak(html: string): boolean {
  const scan = stripClosedStyleAndScriptBlocks(html);
  if (resetAndTest(ARTIFACT_VIEWPORT_TEXT_LEAK_RE, scan)) return true;
  const bodyMatch = scan.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyScan = bodyMatch?.[1] ?? "";
  if (!bodyScan) return false;
  if (resetAndTest(ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE, bodyScan)) return true;
  return resetAndTest(ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE, bodyScan);
}

/** Strip intact head tags so residual orphan tails can be detected/removed. */
export function stripIntactHeadTagsForLeakScan(headInner: string): string {
  return headInner
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

/** Detect truncated Google Fonts / CDN / link / charset / script tails as visible text. */
export function hasArtifactOrphanHeadVoidTextLeak(html: string): boolean {
  const rawBody = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
  // Full CDN <script src> tags must be checked before style/script block strip.
  if (rawBody.trim() && resetAndTest(ARTIFACT_LEAKED_EXTERNAL_SCRIPT_TAG_RE, rawBody)) {
    return true;
  }

  const scan = stripClosedStyleAndScriptBlocks(html);
  // Head: ignore intact <link>/<meta>/<title>, then look for leftover void-tag
  // tails (e.g. `<head>googleapis.com/css2?…" />` or mid-head residue).
  const headMatch = scan.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headScan = stripIntactHeadTagsForLeakScan(headMatch?.[1] ?? "");
  if (headScan.trim() && resetAndTest(ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE, headScan)) {
    return true;
  }
  if (headScan.trim() && resetAndTest(ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE, headScan)) {
    return true;
  }

  const bodyMatch = scan.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyScan = bodyMatch?.[1] ?? "";
  if (!bodyScan.trim()) return false;
  if (resetAndTest(ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE, bodyScan)) return true;
  if (resetAndTest(ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE, bodyScan)) return true;
  if (resetAndTest(ARTIFACT_ORPHAN_LINK_ATTR_LEAK_RE, bodyScan)) return true;
  if (resetAndTest(ARTIFACT_LEAKED_HEAD_LINK_TAG_RE, bodyScan)) return true;
  if (resetAndTest(ARTIFACT_LEAKED_META_CHARSET_TAG_RE, bodyScan)) return true;
  // Bare CDN host or host+path lines without a void terminator.
  return ARTIFACT_BARE_CDN_HOST_LINE_RE.test(bodyScan);
}

/**
 * Remove orphan void/script tails from `<head>` without touching intact
 * `<link>` / `<meta>` / `<script src>` tags (those are stripped from the scan
 * surface first, then residue is scrubbed and the intact tags stay in place).
 */
export function stripOrphanVoidTailsFromHeadInner(headInner: string): string {
  // Walk the head: keep intact tags, scrub unprotected text between them.
  const HEAD_KEEP_RE = /<(?:link|meta|base)\b[^>]*>|<(?:title|style|script)\b[^>]*>[\s\S]*?<\/(?:title|style|script)\s*>/gi;
  let out = "";
  let last = 0;
  let match: RegExpExecArray | null;
  HEAD_KEEP_RE.lastIndex = 0;
  while ((match = HEAD_KEEP_RE.exec(headInner)) !== null) {
    if (match.index > last) {
      out += scrubOrphanHeadResidue(headInner.slice(last, match.index));
    }
    out += match[0];
    last = match.index + match[0].length;
  }
  if (last < headInner.length) {
    out += scrubOrphanHeadResidue(headInner.slice(last));
  }
  return out;
}

function scrubOrphanHeadResidue(text: string): string {
  let out = text;
  ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE, "");
  ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE, "");
  ARTIFACT_ORPHAN_LINK_ATTR_LEAK_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_ORPHAN_LINK_ATTR_LEAK_RE, (m) => (m.startsWith(">") ? ">" : ""));
  return out;
}

/**
 * Detect deck scaffold CSS/JS rendered as visible body text while `<style>` /
 * `<script>` tags are still streaming closed. Used to gate live iframe updates.
 */
export function hasArtifactPreviewBodyTextLeaks(html: string): boolean {
  if (hasArtifactViewportMetaTextLeak(html)) return true;
  if (hasArtifactOrphanHeadVoidTextLeak(html)) return true;

  const scan = previewLeakScanSurface(html);
  if (!scan.trim()) return false;

  if (/@import\s+url\s*\(/i.test(scan)) return true;
  if (/\/\s*──\s*(?:Per-deck|Shared layout|Cover slide|Section divider|Standard content|Tool grid|Process timeline|PR guide)/i.test(scan)) {
    return true;
  }
  if (/\.(?:slide-inner|slide-main|slide-footer|s-cover|s-section|s-content|tool-grid|tool-card|proc-step|eyebrow)\b/i.test(scan)) {
    return true;
  }
  // Generic CSS reset fragments painted as body text (DOM guard already strips these).
  if (/^\s*\{\s*box-sizing\s*:\s*border-box/im.test(scan) || /\*\s*\{\s*box-sizing\s*:\s*border-box/i.test(scan)) {
    return true;
  }
  // Truncated document skeleton tails (`html>`, `lang="en">`, `!DOCTYPE html>`).
  if (/(?:^|>)\s*(?:!DOCTYPE\s+html|html(?:\s+lang\s*=\s*["'][^"']*["'])?|\/?head)\s*>/im.test(scan)) {
    return true;
  }
  if (/\(function\s*\(\)\s*\{[\s\S]{0,120}?document\.getElementById\(['"]deck-stage['"]\)/i.test(scan)) {
    return true;
  }
  if (/function\s+fit\s*\(\)\s*\{[\s\S]{0,200}?(?:deck-stage|innerWidth)/i.test(scan)) {
    return true;
  }
  if (/document\.getElementById\(['"]deck-(?:stage|prev|next|cur|total)['"]\)/i.test(scan)) {
    return true;
  }
  return false;
}

/** Strip leaked deck CSS/JS fragments that agents emit as raw body text mid-stream. */
const LEAKED_DECK_STYLE_TEXT_RE =
  /(?:^|>)\s*(?:\/\s*──[\s\S]{0,120}?──\s*\/\s*)?@import\s+url\([^)]+\)[\s\S]{0,16000}?(?=<(?:[a-z/!])|$)/gim;

const LEAKED_DECK_CSS_SECTION_RE =
  /(?:^|>)\s*\/\s*──\s*[^<\n]{3,80}──\s*\/[\s\S]{0,16000}?(?=<(?:div|section|script|style|\/body|\/html)|$)/gim;

const LEAKED_DECK_SCRIPT_SNIPPET_BODY_RE =
  /(?:^|>)\s*\(function\s*\(\)\s*\{\s*var\s+stage\s*=\s*document\.getElementById\(['"]deck-stage['"]\)[\s\S]{0,4000}?(?=<(?:div|section|script|style|\/body|\/html)|$)/gim;

/** Residual CSS rule blocks when section-level strip leaves a trailing selector. */
const LEAKED_DECK_CSS_RULE_BLOCK_RE =
  /(?:^|>)\s*\.(?:slide-inner|slide-main|slide-footer|s-cover|s-section|s-content|tool-grid|tool-card|proc-step|eyebrow)[^{]*\{[^}]{0,8000}\}\s*/gim;

/** Raw CSS variable lines leaked into body when `<style>` opens late during streaming. */
export const LEAKED_CSS_TOKEN_BLOCK_RE =
  /(?:^|>)\s*--(?:bg|fg|muted|accent|accent2|surface|surface2|border|success|warn|shell|font|mono)\s*:[^<]{0,400}\}\s*/gim;

/** Truncated deck-framework script bodies that render as visible text. */
export const LEAKED_DECK_SCRIPT_SNIPPET_RE =
  /(?:^|>)\s*\(function\s*\(\)\s*\{\s*var\s+stage\s*=\s*document\.getElementById\(['"]deck-stage['"]\)[\s\S]{0,1200}?onKey\(e\)\s*\{[\s\S]{0,200}?/gim;

function stripPreviewTextLeakMatches(text: string, re: RegExp): string {
  return text.replace(re, (match) => (match.startsWith(">") ? ">" : ""));
}

function stripOrphanHeadVoidLeaks(text: string): string {
  let out = text;
  // Full tags BEFORE orphan attr/void — same invariant as chat stripChatProseHtmlDebris.
  ARTIFACT_LEAKED_HEAD_LINK_TAG_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_LEAKED_HEAD_LINK_TAG_RE, "");
  ARTIFACT_LEAKED_META_CHARSET_TAG_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_LEAKED_META_CHARSET_TAG_RE, "");
  ARTIFACT_LEAKED_EXTERNAL_SCRIPT_TAG_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_LEAKED_EXTERNAL_SCRIPT_TAG_RE, "");
  ARTIFACT_ORPHAN_LINK_ATTR_LEAK_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_ORPHAN_LINK_ATTR_LEAK_RE, (match) => (match.startsWith(">") ? ">" : ""));
  ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_ORPHAN_HEAD_VOID_TAIL_RE, "");
  ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_ORPHAN_SCRIPT_SRC_TAIL_RE, "");
  return out;
}

/** Closed `<script>` / `<style>` blocks — leak regexes must not scan inside these. */
const CLOSED_BODY_SCRIPT_OR_STYLE_RE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Opening of a deck-framework script body after the leak stripper removed the IIFE prefix. */
const MANGLED_DECK_FRAMEWORK_SCRIPT_OPEN_RE =
  /(<script\b[^>]*>)(\s*)var slides = Array\.prototype\.slice\.call\(document\.querySelectorAll\(['"]\.slide['"]\)\);/gi;

function stripLeakedPreviewTextFromUnprotectedHtml(text: string): string {
  let out = text;
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_STYLE_TEXT_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_CSS_SECTION_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_CSS_RULE_BLOCK_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_SCRIPT_SNIPPET_BODY_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_CSS_TOKEN_BLOCK_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_SCRIPT_SNIPPET_RE);
  ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE, (match) => (match.startsWith(">") ? ">" : ""));
  ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE, "");
  ARTIFACT_VIEWPORT_TEXT_LEAK_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_VIEWPORT_TEXT_LEAK_RE, "");
  out = stripOrphanHeadVoidLeaks(out);
  return out;
}

function stripUnprotectedBodyTail(tail: string): string {
  const unclosedMatch = tail.match(/<(script|style)\b[^>]*>[\s\S]*$/i);
  if (!unclosedMatch || unclosedMatch.index === undefined) {
    return stripLeakedPreviewTextFromUnprotectedHtml(tail);
  }
  const splitAt = unclosedMatch.index;
  return stripLeakedPreviewTextFromUnprotectedHtml(tail.slice(0, splitAt)) + tail.slice(splitAt);
}

/**
 * Restore deck-framework navigation scripts that were persisted after the leak
 * stripper removed the IIFE prefix (`(function(){ var stage = …`) from inside
 * a closed `<script>` tag. Idempotent on intact framework scripts.
 */
export function repairMangledDeckFrameworkScript(html: string): string {
  MANGLED_DECK_FRAMEWORK_SCRIPT_OPEN_RE.lastIndex = 0;
  return html.replace(
    MANGLED_DECK_FRAMEWORK_SCRIPT_OPEN_RE,
    (match, open: string, ws: string, offset: number, whole: string) => {
      const scriptEnd = whole.indexOf("</script>", offset);
      if (scriptEnd < 0) return match;
      const inner = whole.slice(offset + open.length, scriptEnd);
      if (/^\s*\(function\s*\(\)/.test(inner)) return match;
      if (!/function\s+fit\s*\(\)/.test(inner) || !/stage\.style\.transform/.test(inner)) {
        return match;
      }
      return `${open}${ws}(function () {
      var stage = document.getElementById('deck-stage');
      var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));`;
    },
  );
}

/**
 * Apply leak-stripping regexes to body inner HTML only — never `<head><style>`,
 * and never inside closed `<script>` / `<style>` tags in the body. The leak
 * patterns use `(?m)^` so they would otherwise mutilate deck-framework `fit()`
 * scripts that legitimately live in `<script>` blocks.
 */
export function stripBodyInnerPreviewTextLeaks(bodyInner: string): string {
  ARTIFACT_LEAKED_EXTERNAL_SCRIPT_TAG_RE.lastIndex = 0;
  let work = bodyInner.replace(ARTIFACT_LEAKED_EXTERNAL_SCRIPT_TAG_RE, "");
  CLOSED_BODY_SCRIPT_OR_STYLE_RE.lastIndex = 0;
  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLOSED_BODY_SCRIPT_OR_STYLE_RE.exec(work)) !== null) {
    if (match.index > lastIndex) {
      out += stripLeakedPreviewTextFromUnprotectedHtml(work.slice(lastIndex, match.index));
    }
    out += match[0];
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < work.length) {
    out += stripUnprotectedBodyTail(work.slice(lastIndex));
  }
  return out;
}

const DECK_ROOT_OPEN_RE =
  /<(?:div|section)\s[^>]*(?:class=["'][^"']*\b(?:deck-shell|deck-stage|deck)\b|id=["'](?:deck-stage|deck)["'])/i;

const VOID_HTML_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const RAW_HTML_TAGS = new Set(["script", "style", "textarea"]);

/**
 * Agents emit deck titles as bare text direct children of `<body>`
 * (e.g. `<body>AI 도입 효과 — 2024<div class="deck-shell">…`). Slide markup
 * never uses top-level text nodes — safe to strip at depth 0 only.
 */
export function stripTopLevelBareTextFromBodyInner(bodyInner: string): string {
  return scanBodyInnerStrippingDeckLeaks(bodyInner, false);
}

function scanBodyInnerStrippingDeckLeaks(bodyInner: string, stripOrphanElements: boolean): string {
  let out = "";
  let i = 0;
  let depth = 0;
  let pendingText = "";

  const flushPendingText = () => {
    if (depth === 0) {
      pendingText = pendingText.replace(/[^\s\r\n]/g, "");
    }
    out += pendingText;
    pendingText = "";
  };

  while (i < bodyInner.length) {
    if (bodyInner[i] !== "<") {
      pendingText += bodyInner[i++];
      continue;
    }
    flushPendingText();
    const close = bodyInner.indexOf(">", i);
    if (close < 0) {
      out += bodyInner.slice(i);
      break;
    }
    const tagContent = bodyInner.slice(i + 1, close);
    const tag = bodyInner.slice(i, close + 1);
    const isClosing = /^\/[\w-]/.test(tagContent);
    const nameMatch = tagContent.match(/^\/?\s*([\w-]+)/);
    const name = nameMatch?.[1]?.toLowerCase() ?? "";
    const isVoid = !isClosing && (/\/\s*$/.test(tagContent) || VOID_HTML_TAGS.has(name));
    const isRaw = !isClosing && RAW_HTML_TAGS.has(name);

    if (isClosing) {
      out += tag;
      depth = Math.max(0, depth - 1);
      i = close + 1;
      continue;
    }

    if (depth === 0 && stripOrphanElements && isOrphanDeckTitleElementOpen(tag, name)) {
      const endTag = new RegExp(`</${name}\\s*>`, "i");
      const rest = bodyInner.slice(close + 1);
      const endMatch = endTag.exec(rest);
      if (endMatch && endMatch.index !== undefined) {
        i = close + 1 + endMatch.index + endMatch[0].length;
        continue;
      }
    }

    out += tag;

    if (isRaw) {
      const endTag = new RegExp(`</${name}\\s*>`, "i");
      const rest = bodyInner.slice(close + 1);
      const endMatch = endTag.exec(rest);
      if (endMatch && endMatch.index !== undefined) {
        const rawEnd = close + 1 + endMatch.index + endMatch[0].length;
        out += bodyInner.slice(close + 1, rawEnd);
        i = rawEnd;
        continue;
      }
    }

    if (!isVoid) depth++;
    i = close + 1;
  }
  flushPendingText();
  return out;
}

function isOrphanDeckTitleElementOpen(tag: string, name: string): boolean {
  if (/^(?:p|span|h[1-6])$/i.test(name)) return true;
  if (name !== "div") return false;
  if (/\b(?:deck-shell|deck-stage|deck|slide)\b/i.test(tag)) return false;
  if (/\bid=["'](?:deck-stage|deck)["']/i.test(tag)) return false;
  return true;
}

/** Remove orphan title elements and bare text that appear before the deck root. */
export function stripDeckOrphansBeforeRootFromBodyInner(bodyInner: string): string {
  const deckMatch = bodyInner.match(DECK_ROOT_OPEN_RE);
  if (!deckMatch || deckMatch.index === undefined || deckMatch.index === 0) {
    return stripTopLevelBareTextFromBodyInner(bodyInner);
  }
  const prefix = bodyInner.slice(0, deckMatch.index);
  const suffix = bodyInner.slice(deckMatch.index);
  const cleanedPrefix = scanBodyInnerStrippingDeckLeaks(prefix, true);
  return cleanedPrefix + suffix;
}

export function stripArtifactPreviewBodyTextLeaks(html: string): string {
  const bodyMatch = html.match(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i);
  if (!bodyMatch) return html;
  const open = bodyMatch[1];
  const inner = bodyMatch[2];
  const close = bodyMatch[3];
  if (open === undefined || inner === undefined || close === undefined) return html;
  const cleaned = stripDeckOrphansBeforeRootFromBodyInner(stripBodyInnerPreviewTextLeaks(inner));
  if (cleaned === inner) return html;
  return html.replace(bodyMatch[0], `${open}${cleaned}${close}`);
}

/** Shared DOM leak detection used by preview iframe guards and headless export. */
export const ARTIFACT_PREVIEW_DOM_LEAK_DETECTION_JS = `
  var viewportLeak = new RegExp(${JSON.stringify(ARTIFACT_VIEWPORT_DOM_TEXT_LEAK_SOURCE)}, 'i');
  var orphanHeadVoidLeak = new RegExp(${JSON.stringify(ARTIFACT_ORPHAN_HEAD_VOID_DOM_TEXT_LEAK_SOURCE)}, 'i');
  var cssLeak = /^\\s*--(?:bg|fg|muted|accent|accent2|surface|surface2|border|success|warn|shell|font|mono)\\s*:/i;
  var scriptLeak = /^\\s*\\(function\\s*\\(\\)\\s*\\{\\s*var\\s+stage\\s*=\\s*document\\.getElementById\\(['"]deck-stage['"]\\)/i;
  var boxLeak = /^\\s*\\{\\s*box-sizing\\s*:\\s*border-box/i;
  var importLeak = /@import\\s+url\\s*\\(/i;
  var deckSectionLeak = /\\/\\s*──\\s*(?:Per-deck|Shared layout|Cover slide|Section divider|Standard content|Tool grid|Process timeline|PR guide)/i;
  var deckClassLeak = /\\.(?:slide-inner|slide-main|slide-footer|s-cover|s-section|s-content|tool-grid|tool-card|proc-step|eyebrow)\\b/i;
  var fontCdnLeak = new RegExp(${JSON.stringify(ARTIFACT_HEAD_CDN_HOST_SOURCE)}, 'i');
  function isLeakedText(text){
    var trimmed = (text || '').trim();
    if (!trimmed) return false;
    if (viewportLeak.test(trimmed)) return true;
    if (orphanHeadVoidLeak.test(trimmed)) return true;
    if (cssLeak.test(trimmed)) return true;
    if (scriptLeak.test(trimmed)) return true;
    if (boxLeak.test(trimmed)) return true;
    if (importLeak.test(trimmed)) return true;
    if (deckSectionLeak.test(trimmed)) return true;
    if (deckClassLeak.test(trimmed)) return true;
    if (fontCdnLeak.test(trimmed) && /\\/?>\\s*$/.test(trimmed)) return true;
    if (fontCdnLeak.test(trimmed) && />\\s*(?:<\\/script>)?\\s*$/i.test(trimmed)) return true;
    if (trimmed.indexOf("document.getElementById('deck-stage')") >= 0) return true;
    if (trimmed.indexOf('document.getElementById("deck-stage")') >= 0) return true;
    if (trimmed.indexOf("document.getElementById('deck-prev')") >= 0) return true;
    if (trimmed.indexOf('document.getElementById("deck-prev")') >= 0) return true;
    return false;
  }
  function isLeakedMetaElement(node){
    if (!node || !node.getAttribute) return false;
    var name = node.getAttribute('name') || '';
    if (/^viewport$/i.test(name)) return true;
    if (node.getAttribute('charset')) return true;
    return isLeakedText(node.textContent || '');
  }
  function isLeakedLinkElement(node){
    if (!node || !node.getAttribute) return false;
    var rel = (node.getAttribute('rel') || '').toLowerCase();
    if (/\\b(?:stylesheet|preconnect|preload)\\b/.test(rel)) return true;
    var href = node.getAttribute('href') || '';
    return fontCdnLeak.test(href);
  }
  function isLeakedExternalScriptElement(node){
    if (!node || !node.getAttribute) return false;
    var src = node.getAttribute('src') || '';
    return fontCdnLeak.test(src);
  }
  function stripLeakedNodes(root){
    if (!root) return;
    for (var i = root.childNodes.length - 1; i >= 0; i--) {
      var node = root.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        if (isLeakedText(node.textContent)) node.remove();
        continue;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        var tag = node.tagName ? node.tagName.toLowerCase() : '';
        if (tag === 'style' || tag === 'noscript') continue;
        if (tag === 'script') {
          if (root === document.body && isLeakedExternalScriptElement(node)) node.remove();
          continue;
        }
        if (tag === 'meta' && isLeakedMetaElement(node)) { node.remove(); continue; }
        if (tag === 'link' && isLeakedLinkElement(node) && root === document.body) {
          node.remove();
          continue;
        }
        stripLeakedNodes(node);
      }
    }
  }
  function stripDeckLoosePageFlow(root){
    if (!root || !root.childNodes) return;
    for (var i = root.childNodes.length - 1; i >= 0; i--) {
      var node = root.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent || '').trim().length > 0) node.remove();
      }
    }
  }
  function isDeckRootElement(node){
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    var cls = node.className || '';
    var id = node.id || '';
    if (/\\b(?:deck-shell|deck-stage|deck)\\b/i.test(cls)) return true;
    return /^deck(?:-stage)?$/i.test(id);
  }
  function isOrphanDeckTitleElement(node){
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    var tag = node.tagName ? node.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'noscript') return false;
    if (isDeckRootElement(node)) return false;
    if (/deck|slide/i.test((node.className || '') + (node.id || ''))) return false;
    if (/^(?:p|span|h[1-6])$/i.test(tag)) return true;
    if (tag === 'div') {
      if (node.querySelector && node.querySelector('.slide, [data-slide], .deck-shell, #deck-stage, .deck-stage, .deck')) {
        return false;
      }
      var text = (node.textContent || '').trim();
      return text.length > 0 && text.length < 400;
    }
    return false;
  }
  function stripOrphanDeckTitleSiblingsBeforeRoot(){
    var body = document.body;
    if (!body) return;
    var deckRoot = body.querySelector('.deck-shell, #deck-stage, .deck-stage, .deck');
    if (!deckRoot) return;
    var node = body.firstChild;
    while (node && node !== deckRoot) {
      var next = node.nextSibling;
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node.textContent || '').trim().length > 0) node.remove();
      } else if (isOrphanDeckTitleElement(node)) {
        node.remove();
      }
      node = next;
    }
  }
  function stripDeckBodyLooseFlow(){
    stripDeckLoosePageFlow(document.documentElement);
    stripDeckLoosePageFlow(document.body);
    stripOrphanDeckTitleSiblingsBeforeRoot();
  }
`;

/** Preview iframe guard — strips leaked text on load and while streaming. */
export function buildArtifactPreviewDomLeakGuardScript(): string {
  return `(function(){${ARTIFACT_PREVIEW_DOM_LEAK_DETECTION_JS}
  function run(){
    stripLeakedNodes(document.head);
    stripLeakedNodes(document.body);
    stripDeckBodyLooseFlow();
  }
  run();
  try {
    var obs = new MutationObserver(function(){ run(); });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  } catch (_) {}
})();`;
}

/** One-shot DOM strip for headless PDF/image export after string repair. */
export function buildArtifactPreviewDomLeakStripScript(): string {
  return `(function(){${ARTIFACT_PREVIEW_DOM_LEAK_DETECTION_JS}
  if (document.head) stripLeakedNodes(document.head);
  if (document.body) stripLeakedNodes(document.body);
  stripDeckBodyLooseFlow();
})();`;
}
