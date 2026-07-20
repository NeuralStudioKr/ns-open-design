import {
  ARTIFACT_LEAKED_META_VIEWPORT_TAG_RE,
  ARTIFACT_VIEWPORT_META_ATTR_LEAK_RE,
  ARTIFACT_VIEWPORT_TEXT_LEAK_RE,
  repairMangledDeckFrameworkScript,
  stripArtifactPreviewBodyTextLeaks,
  stripOrphanVoidTailsFromHeadInner,
} from "./artifactPreviewTextLeaks.js";
import {
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
  `^\\s*(?:(?:https?:\\/\\/)?(?:${artifactCdnHostWithOptionalPathAlternation()})|(?:css2\\?)?family=[A-Za-z0-9_+:;,=%&.@\\-]+(?:(?:&amp;|&)[A-Za-z0-9_+:;,=%&.@\\-]*)*|href\\s*=\\s*["']https?:\\/\\/[^"']*(?:${artifactCdnHrefTokenAlternation()})[^"']*["'][^<\\n]{0,80}|rel\\s*=\\s*["'](?:stylesheet|preconnect|preload)["'][^<\\n]{0,120}|crossorigin(?:\\s*=\\s*["']anonymous["'])?[^<\\n]{0,80}|charset\\s*=\\s*["'][^"']*["'][^<\\n]{0,40})\\s*"?\\s*\\/?>\\s*`,
  "im",
);

const BODY_VIEWPORT_FRAGMENT_RE =
  /(<body[^>]*>)\s*(?:(?:viewport\s*=\s*width\s*=\s*device-width|device-width|-width)\s*,\s*initial-scale=[^<\n]+"?\s*\/?>|name\s*=\s*["']viewport["']\s+content\s*=\s*["'][^"']*["']\s*\/?>)\s*/gi;

const BODY_ORPHAN_VOID_FRAGMENT_RE = new RegExp(
  `(<body[^>]*>)\\s*(?:(?:https?:\\/\\/)?(?:${artifactCdnHostWithOptionalPathAlternation()})|(?:css2\\?)?family=[A-Za-z0-9_+:;,=%&.@\\-]+(?:(?:&amp;|&)[A-Za-z0-9_+:;,=%&.@\\-]*)*|href\\s*=\\s*["']https?:\\/\\/[^"']*(?:${artifactCdnHrefTokenAlternation()})[^"']*["'][^<\\n]{0,80}|rel\\s*=\\s*["'](?:stylesheet|preconnect|preload)["'][^<\\n]{0,120})\\s*"?\\s*\\/?>\\s*`,
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

export function repairArtifactDocumentHead(html: string): string {
  if (!html) return html;

  let doc = stripLeakedViewportFragments(html);
  doc = stripArtifactPreviewBodyTextLeaks(doc);
  if (!/<head/i.test(doc)) return repairMangledDeckFrameworkScript(doc);

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
  return repairMangledDeckFrameworkScript(doc);
}
