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
 * Source string for a DOM `RegExp` that tests a single text node's content.
 * Keep in sync with the string-level patterns above — used by preview iframe
 * guards and headless Chromium export cleanup.
 */
export const ARTIFACT_VIEWPORT_DOM_TEXT_LEAK_SOURCE =
  '^\\s*(?:viewport\\s*=\\s*width\\s*=\\s*device-width|(?:device-width|-width))\\s*,\\s*initial-scale=[^<\\n]+"?\\s*\\/?>\\s*$'
  + '|^\\s*name\\s*=\\s*["\']viewport["\']\\s+content\\s*=\\s*["\'][^"\']*["\']\\s*\\/?>\\s*$';

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

/** Detect truncated viewport meta rendered as visible body/head text. */
export function hasArtifactViewportMetaTextLeak(html: string): boolean {
  const scan = stripClosedStyleAndScriptBlocks(html);
  ARTIFACT_VIEWPORT_TEXT_LEAK_RE.lastIndex = 0;
  if (ARTIFACT_VIEWPORT_TEXT_LEAK_RE.test(scan)) return true;
  const bodyMatch = scan.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyScan = bodyMatch?.[1] ?? "";
  if (!bodyScan) return false;
  ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE.lastIndex = 0;
  if (ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE.test(bodyScan)) return true;
  ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE.lastIndex = 0;
  return ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE.test(bodyScan);
}

/**
 * Detect deck scaffold CSS/JS rendered as visible body text while `<style>` /
 * `<script>` tags are still streaming closed. Used to gate live iframe updates.
 */
export function hasArtifactPreviewBodyTextLeaks(html: string): boolean {
  if (hasArtifactViewportMetaTextLeak(html)) return true;

  const scan = previewLeakScanSurface(html);
  if (!scan.trim()) return false;

  if (/@import\s+url\s*\(/i.test(scan)) return true;
  if (/\/\s*──\s*(?:Per-deck|Shared layout|Cover slide|Section divider|Standard content|Tool grid|Process timeline|PR guide)/i.test(scan)) {
    return true;
  }
  if (/\.(?:slide-inner|slide-main|slide-footer|s-cover|s-section|s-content|tool-grid|tool-card|proc-step|eyebrow)\b/i.test(scan)) {
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
  CLOSED_BODY_SCRIPT_OR_STYLE_RE.lastIndex = 0;
  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLOSED_BODY_SCRIPT_OR_STYLE_RE.exec(bodyInner)) !== null) {
    if (match.index > lastIndex) {
      out += stripLeakedPreviewTextFromUnprotectedHtml(bodyInner.slice(lastIndex, match.index));
    }
    out += match[0];
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < bodyInner.length) {
    out += stripUnprotectedBodyTail(bodyInner.slice(lastIndex));
  }
  return out;
}

export function stripArtifactPreviewBodyTextLeaks(html: string): string {
  const bodyMatch = html.match(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i);
  if (!bodyMatch) return html;
  const open = bodyMatch[1];
  const inner = bodyMatch[2];
  const close = bodyMatch[3];
  if (open === undefined || inner === undefined || close === undefined) return html;
  const cleaned = stripBodyInnerPreviewTextLeaks(inner);
  if (cleaned === inner) return html;
  return html.replace(bodyMatch[0], `${open}${cleaned}${close}`);
}

/** Shared DOM leak detection used by preview iframe guards and headless export. */
export const ARTIFACT_PREVIEW_DOM_LEAK_DETECTION_JS = `
  var viewportLeak = new RegExp(${JSON.stringify(ARTIFACT_VIEWPORT_DOM_TEXT_LEAK_SOURCE)}, 'i');
  var cssLeak = /^\\s*--(?:bg|fg|muted|accent|accent2|surface|surface2|border|success|warn|shell|font|mono)\\s*:/i;
  var scriptLeak = /^\\s*\\(function\\s*\\(\\)\\s*\\{\\s*var\\s+stage\\s*=\\s*document\\.getElementById\\(['"]deck-stage['"]\\)/i;
  var boxLeak = /^\\s*\\{\\s*box-sizing\\s*:\\s*border-box/i;
  var importLeak = /@import\\s+url\\s*\\(/i;
  var deckSectionLeak = /\\/\\s*──\\s*(?:Per-deck|Shared layout|Cover slide|Section divider|Standard content|Tool grid|Process timeline|PR guide)/i;
  var deckClassLeak = /\\.(?:slide-inner|slide-main|slide-footer|s-cover|s-section|s-content|tool-grid|tool-card|proc-step|eyebrow)\\b/i;
  function isLeakedText(text){
    var trimmed = (text || '').trim();
    if (!trimmed) return false;
    if (viewportLeak.test(trimmed)) return true;
    if (cssLeak.test(trimmed)) return true;
    if (scriptLeak.test(trimmed)) return true;
    if (boxLeak.test(trimmed)) return true;
    if (importLeak.test(trimmed)) return true;
    if (deckSectionLeak.test(trimmed)) return true;
    if (deckClassLeak.test(trimmed)) return true;
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
    return isLeakedText(node.textContent || '');
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
        if (tag === 'script' || tag === 'style' || tag === 'noscript') continue;
        if (tag === 'meta' && isLeakedMetaElement(node)) { node.remove(); continue; }
        stripLeakedNodes(node);
      }
    }
  }
`;

/** Preview iframe guard — strips leaked text on load and while streaming. */
export function buildArtifactPreviewDomLeakGuardScript(): string {
  return `(function(){${ARTIFACT_PREVIEW_DOM_LEAK_DETECTION_JS}
  function run(){
    stripLeakedNodes(document.head);
    stripLeakedNodes(document.body);
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
})();`;
}
