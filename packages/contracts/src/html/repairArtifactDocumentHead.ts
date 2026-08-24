import {
  ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE,
  ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE,
  ARTIFACT_VIEWPORT_TEXT_LEAK_RE,
  repairMangledDeckFrameworkScript,
  stripArtifactPreviewBodyTextLeaks,
  stripOrphanVoidTailsFromHeadInner,
} from "./artifactPreviewTextLeaks.js";
import {
  ARTIFACT_CDN_ORPHAN_VOID_ENDING,
  artifactCdnHostWithOptionalPathAlternation,
  artifactCdnHrefTokenAlternation,
} from "./artifactCdnHosts.js";
import {
  countDeckSlideHostOpens,
  findFirstDeckSlideHostIndex,
} from "./deck-slide-class.js";

/**
 * Repair common agent-emitted `<head>` corruption where a truncated viewport
 * meta tag becomes visible body text (e.g. `<head>-width, initial-scale=1" />`).
 */
const CORRUPTED_HEAD_VIEWPORT_CAPTURE_RE =
  /<head(\s[^>]*)?>\s*(?:viewport\s*=\s*width\s*=\s*device-width|device-width|-width)\s*,\s*initial-scale=([\d.]+)\s*"?\s*\/?>/gi;

const HEAD_VIEWPORT_FRAGMENT_RE =
  /^\s*(?:(?:viewport\s*=\s*width\s*=\s*device-width|device-width|-width)\s*,\s*initial-scale=[^<\n]+"?\s*\/?>|name\s*=\s*["']viewport["']\s+content\s*=\s*["'][^"']*["']\s*\/?>)\s*/im;

/**
 * Truncated font/CDN/link tails immediately after `<head>` (same class of
 * corruption as Hermes viewport leaks — opening `<link href="https://fonts.`
 * is lost and `googleapis.com…" />` paints as text).
 * Host list comes from `artifactCdnHosts.ts`.
 */
const HEAD_ORPHAN_VOID_FRAGMENT_RE = new RegExp(
  `^\\s*(?:(?:https?:\\/\\/)?(?:${artifactCdnHostWithOptionalPathAlternation()})|(?:css2\\?)?family=[A-Za-z0-9_+:;,=%&.@\\-]+(?:(?:&amp;|&)[A-Za-z0-9_+:;,=%&.@\\-]*)*|href\\s*=\\s*["']https?:\\/\\/[^"']*(?:${artifactCdnHrefTokenAlternation()})[^"']*["'][^<\\n]{0,80}|rel\\s*=\\s*["'](?:stylesheet|preconnect|preload)["'][^<\\n]{0,120}|crossorigin(?:\\s*=\\s*["']anonymous["'])?[^<\\n]{0,80}|charset\\s*=\\s*["'][^"']*["'][^<\\n]{0,40})${ARTIFACT_CDN_ORPHAN_VOID_ENDING}\\s*`,
  "im",
);

const BODY_VIEWPORT_FRAGMENT_RE =
  /(<body[^>]*>)\s*(?:(?:viewport\s*=\s*width\s*=\s*device-width|device-width|-width)\s*,\s*initial-scale=[^<\n]+"?\s*\/?>|name\s*=\s*["']viewport["']\s+content\s*=\s*["'][^"']*["']\s*\/?>)\s*/gi;

const BODY_ORPHAN_VOID_FRAGMENT_RE = new RegExp(
  `(<body[^>]*>)\\s*(?:(?:https?:\\/\\/)?(?:${artifactCdnHostWithOptionalPathAlternation()})|(?:css2\\?)?family=[A-Za-z0-9_+:;,=%&.@\\-]+(?:(?:&amp;|&)[A-Za-z0-9_+:;,=%&.@\\-]*)*|href\\s*=\\s*["']https?:\\/\\/[^"']*(?:${artifactCdnHrefTokenAlternation()})[^"']*["'][^<\\n]{0,80}|rel\\s*=\\s*["'](?:stylesheet|preconnect|preload)["'][^<\\n]{0,120})${ARTIFACT_CDN_ORPHAN_VOID_ENDING}\\s*`,
  "gi",
);

function stripLeakedViewportFragments(doc: string): string {
  let out = doc.replace(HEAD_VIEWPORT_FRAGMENT_RE, "");
  out = out.replace(HEAD_ORPHAN_VOID_FRAGMENT_RE, "");
  out = out.replace(BODY_VIEWPORT_FRAGMENT_RE, "$1");
  out = out.replace(BODY_ORPHAN_VOID_FRAGMENT_RE, "$1");
  ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE, (match) => (match.startsWith(">") ? ">" : ""));
  return out;
}

const TRAILING_RAW_BLOCK_OPEN_RE = /<(script|style)\b(?![^>]*\/>)[^>]*>/gi;
const TRAILING_DOCUMENT_CLOSERS_RE = /((?:\s*<\/body\s*>)?(?:\s*<\/html\s*>)?)\s*$/i;
/** HTML that proves the model left a raw block and resumed document markup. */
const STRUCTURAL_HTML_AFTER_RAW_RE =
  /<\/head\s*>|<body\b|<section\b|<div\b(?=[^>]*\b(?:class\s*=\s*["'][^"']*\b(?:slide|deck)|id\s*=\s*["']deck))/i;
function regionHasSlideOrDeckMarkup(region: string): boolean {
  if (findFirstDeckSlideHostIndex(region) >= 0) return true;
  return /<(?:section|div)\b[^>]*\bid\s*=\s*["']deck/i.test(region);
}

type RawBlockOpen = { index: number; tag: string; openEnd: number };

function findRawBlockOpens(html: string): RawBlockOpen[] {
  const opens: RawBlockOpen[] = [];
  TRAILING_RAW_BLOCK_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TRAILING_RAW_BLOCK_OPEN_RE.exec(html)) !== null) {
    const tag = String(match[1] ?? "").toLowerCase();
    if (tag !== "script" && tag !== "style") continue;
    opens.push({
      index: match.index,
      tag,
      openEnd: match.index + match[0].length,
    });
  }
  return opens;
}

function isRawBlockClosed(html: string, open: RawBlockOpen): boolean {
  const closeRe = new RegExp(`</${open.tag}\\s*>`, "i");
  return closeRe.test(html.slice(open.openEnd));
}

/**
 * When `end_turn` truncates a head `<style>` / `<script>` and the model
 * continues with `<body>` / slides, the open raw span swallows that markup.
 * Blindly cutting from the open tag would delete the slides. Insert the
 * missing closer immediately before the first structural HTML resume point.
 */
function closeRawBlocksTruncatedBeforeStructuralHtml(html: string): string {
  let out = html;
  // Earliest-first so nested truncations (style then later script) settle.
  for (let guard = 0; guard < 8; guard += 1) {
    const opens = findRawBlockOpens(out);
    let changed = false;
    for (const open of opens) {
      if (isRawBlockClosed(out, open)) continue;
      const after = out.slice(open.openEnd);
      const structural = STRUCTURAL_HTML_AFTER_RAW_RE.exec(after);
      if (!structural || structural.index === undefined) continue;
      const insertAt = open.openEnd + structural.index;
      out = `${out.slice(0, insertAt)}</${open.tag}>${out.slice(insertAt)}`;
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return out;
}

function stripOneTrailingUnclosedRawBlock(html: string): string {
  const opens = findRawBlockOpens(html);
  let lastOpen: RawBlockOpen | null = null;
  for (const open of opens) {
    if (!isRawBlockClosed(html, open)) lastOpen = open;
  }
  if (!lastOpen) return html;

  const suffix = html.slice(lastOpen.index);
  const closersMatch = TRAILING_DOCUMENT_CLOSERS_RE.exec(suffix);
  const preservedClosers = closersMatch?.[1] ?? "";
  const region = suffix.slice(0, suffix.length - (preservedClosers.length)).replace(/\s*$/u, "");
  // Never cut through slide markup (unclosed head style that still embeds body).
  // `closeRawBlocksTruncatedBeforeStructuralHtml` should have closed those first;
  // if it could not, refuse to destroy slides.
  if (regionHasSlideOrDeckMarkup(region) || /<body\b/i.test(region)) {
    return html;
  }

  const before = html.slice(0, lastOpen.index).replace(/[ \t]+$/u, "").replace(/\n{3,}$/u, "\n\n");
  return `${before}${preservedClosers}`;
}

/**
 * Drop trailing unclosed `<script>` / `<style>` that agents leave when
 * `end_turn` lands mid-block. Slides are usually already complete; the open
 * raw block alone keeps `isArtifactHtmlStableForPreview` false forever
 * (preview stuck on "loading…"). Preserve any salvage-appended
 * `</body></html>` closers after the cut point.
 *
 * Also closes raw blocks that were truncated before structural HTML resumed
 * (unclosed head `<style>` then `<body>` / slides) so slide content is kept.
 * Loops so dual trailing unclosed `<style>`+`<script>` both clear.
 *
 * Intact closed scripts/styles are left alone. Mid-stream docs without
 * document closers stay incomplete after the strip, so the stable gate
 * still rejects them until the turn finishes or salvage closes them.
 */
export function stripTrailingUnclosedRawBlocks(html: string): string {
  if (!html) return html;

  let out = closeRawBlocksTruncatedBeforeStructuralHtml(html);
  for (let guard = 0; guard < 8; guard += 1) {
    const next = stripOneTrailingUnclosedRawBlock(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * Drop mid-document incomplete open tags where the agent stuttered mid-attribute
 * and restarted the same (or next) tag, e.g.:
 *
 *   `<section class="\n<section class="slide" …>`
 *
 * HTML5 will treat the first open as a mangled tag whose quoted attribute
 * swallows the real slide opener, nesting later slides into slide 1 and
 * painting "ghost" content through transparent regions.
 *
 * Newline + next markup tag while still inside a quoted attribute is treated
 * as a hard stutter boundary. `<` before `>` outside quotes is also incomplete.
 * `script` / `style` bodies and HTML comments are left alone.
 */
export function stripIncompleteOpenTags(html: string): string {
  if (!html || html.indexOf("<") === -1) return html;

  let out = "";
  let i = 0;
  const n = html.length;

  while (i < n) {
    if (html[i] !== "<") {
      out += html[i];
      i += 1;
      continue;
    }

    if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      if (end === -1) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, end + 3);
      i = end + 3;
      continue;
    }

    if (html.startsWith("<!", i) || html.startsWith("<?", i)) {
      const end = html.indexOf(">", i + 2);
      if (end === -1) break;
      out += html.slice(i, end + 1);
      i = end + 1;
      continue;
    }

    const tagMatch = /^<\/?([A-Za-z][\w:-]*)/.exec(html.slice(i));
    if (!tagMatch) {
      out += html[i];
      i += 1;
      continue;
    }

    const tagName = String(tagMatch[1] ?? "").toLowerCase();
    const isClose = html.startsWith("</", i);
    let j = i + tagMatch[0].length;
    let quote: '"' | "'" | null = null;
    let incompleteAt = -1;
    let closed = false;

    while (j < n) {
      const c = html[j];
      if (quote) {
        if (c === quote) {
          quote = null;
          j += 1;
          continue;
        }
        // Quoted attr cut mid-value, then a new tag starts on the next line.
        if (c === "\n" || c === "\r") {
          let k = j;
          while (k < n && (html[k] === "\n" || html[k] === "\r" || html[k] === " " || html[k] === "\t")) {
            k += 1;
          }
          if (k < n && html[k] === "<" && /^<\/?[A-Za-z]/.test(html.slice(k))) {
            incompleteAt = k;
            break;
          }
        }
        j += 1;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        j += 1;
        continue;
      }
      if (c === ">") {
        j += 1;
        closed = true;
        break;
      }
      if (c === "<") {
        incompleteAt = j;
        break;
      }
      j += 1;
    }

    if (incompleteAt >= 0) {
      i = incompleteAt;
      continue;
    }
    if (!closed) {
      // Trailing incomplete open at EOF — drop it.
      break;
    }

    const tagText = html.slice(i, j);
    out += tagText;
    i = j;

    if (
      !isClose
      && (tagName === "script" || tagName === "style")
      && !/\/\s*>$/.test(tagText)
    ) {
      const closeRe = new RegExp(`</${tagName}\\s*>`, "i");
      const rest = html.slice(i);
      const closeMatch = closeRe.exec(rest);
      if (!closeMatch) {
        out += rest;
        break;
      }
      out += rest.slice(0, closeMatch.index + closeMatch[0].length);
      i += closeMatch.index + closeMatch[0].length;
    }
  }

  return out;
}

export function repairArtifactDocumentHead(html: string): string {
  if (!html) return html;

  const keepSlideHosts = (before: string, after: string): string => {
    const beforeSlides = countDeckSlideHostOpens(before);
    if (beforeSlides <= 0) return after;
    return countDeckSlideHostOpens(after) < beforeSlides ? before : after;
  };

  let doc = stripIncompleteOpenTags(html);
  doc = keepSlideHosts(html, doc);
  doc = keepSlideHosts(doc, stripLeakedViewportFragments(doc));
  doc = keepSlideHosts(doc, stripArtifactPreviewBodyTextLeaks(doc));
  if (!/<head/i.test(doc)) {
    doc = repairMangledDeckFrameworkScript(doc);
    return keepSlideHosts(doc, stripTrailingUnclosedRawBlocks(doc));
  }

  doc = keepSlideHosts(doc, doc.replace(
    CORRUPTED_HEAD_VIEWPORT_CAPTURE_RE,
    '<head$1>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=$2" />',
  ));

  doc = keepSlideHosts(doc, doc.replace(/<head([^>]*)>([\s\S]*?)<\/head>/i, (_match, attrs, inner) => {
    let headInner = String(inner).replace(HEAD_VIEWPORT_FRAGMENT_RE, "");
    headInner = headInner.replace(HEAD_ORPHAN_VOID_FRAGMENT_RE, "");
    ARTIFACT_VIEWPORT_TEXT_LEAK_RE.lastIndex = 0;
    headInner = headInner.replace(ARTIFACT_VIEWPORT_TEXT_LEAK_RE, "");
    // Scrub orphan CDN/link tails anywhere between intact head tags — never
    // run void-strip across whole head raw (would mutilate intact font links).
    headInner = stripOrphanVoidTailsFromHeadInner(headInner);
    if (!/<meta\s+charset/i.test(headInner)) {
      headInner = `\n  <meta charset="utf-8" />${headInner}`;
    }
    if (!/<meta\s+name=["']viewport["']/i.test(headInner)) {
      headInner = `${headInner}\n  <meta name="viewport" content="width=device-width, initial-scale=1" />`;
    }
    return `<head${attrs}>${headInner}</head>`;
  }));

  doc = keepSlideHosts(doc, stripLeakedViewportFragments(doc));
  doc = keepSlideHosts(doc, stripArtifactPreviewBodyTextLeaks(doc));
  doc = keepSlideHosts(doc, repairMangledDeckFrameworkScript(doc));
  return keepSlideHosts(doc, stripTrailingUnclosedRawBlocks(doc));
}
