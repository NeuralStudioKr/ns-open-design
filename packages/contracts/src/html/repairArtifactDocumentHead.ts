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

/**
 * Drop a trailing unclosed `<script>` / `<style>` that agents leave when
 * `end_turn` lands mid-block. Slides are usually already complete; the open
 * raw block alone keeps `isArtifactHtmlStableForPreview` false forever
 * (preview stuck on "loading…"). Preserve any salvage-appended
 * `</body></html>` closers after the cut point.
 *
 * Intact closed scripts/styles are left alone. Mid-stream docs without
 * document closers stay incomplete after the strip, so the stable gate
 * still rejects them until the turn finishes or salvage closes them.
 */
export function stripTrailingUnclosedRawBlocks(html: string): string {
  if (!html) return html;

  TRAILING_RAW_BLOCK_OPEN_RE.lastIndex = 0;
  let lastOpen: { index: number; tag: string; openEnd: number } | null = null;
  let match: RegExpExecArray | null;
  while ((match = TRAILING_RAW_BLOCK_OPEN_RE.exec(html)) !== null) {
    const tag = String(match[1] ?? "").toLowerCase();
    if (tag !== "script" && tag !== "style") continue;
    lastOpen = {
      index: match.index,
      tag,
      openEnd: match.index + match[0].length,
    };
  }
  if (!lastOpen) return html;

  const closeRe = new RegExp(`</${lastOpen.tag}\\s*>`, "i");
  if (closeRe.test(html.slice(lastOpen.openEnd))) return html;

  const suffix = html.slice(lastOpen.index);
  const closersMatch = TRAILING_DOCUMENT_CLOSERS_RE.exec(suffix);
  const preservedClosers = closersMatch?.[1] ?? "";
  const before = html.slice(0, lastOpen.index).replace(/[ \t]+$/u, "").replace(/\n{3,}$/u, "\n\n");
  return `${before}${preservedClosers}`;
}

export function repairArtifactDocumentHead(html: string): string {
  if (!html) return html;

  let doc = stripLeakedViewportFragments(html);
  doc = stripArtifactPreviewBodyTextLeaks(doc);
  if (!/<head/i.test(doc)) {
    doc = repairMangledDeckFrameworkScript(doc);
    return stripTrailingUnclosedRawBlocks(doc);
  }

  doc = doc.replace(
    CORRUPTED_HEAD_VIEWPORT_CAPTURE_RE,
    '<head$1>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=$2" />',
  );

  doc = doc.replace(/<head([^>]*)>([\s\S]*?)<\/head>/i, (_match, attrs, inner) => {
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
  });

  doc = stripLeakedViewportFragments(doc);
  doc = stripArtifactPreviewBodyTextLeaks(doc);
  doc = repairMangledDeckFrameworkScript(doc);
  return stripTrailingUnclosedRawBlocks(doc);
}
