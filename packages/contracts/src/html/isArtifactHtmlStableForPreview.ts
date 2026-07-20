import { hasArtifactPreviewBodyTextLeaks } from "./artifactPreviewTextLeaks.js";

function countTagBalance(html: string, openRe: RegExp, closeRe: RegExp): boolean {
  const opens = (html.match(openRe) ?? []).length;
  const closes = (html.match(closeRe) ?? []).length;
  return opens <= closes;
}

/**
 * Heuristic gate for live HTML preview updates during agent streaming.
 * Partial documents often render leaked CSS/JS / truncated head tags as
 * visible body text until the closing tags arrive — hold the iframe on the
 * last stable snapshot instead of painting `googleapis.com" />` alone.
 */
export function isArtifactHtmlStableForPreview(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (!lower.includes("</body>") || !lower.includes("</html>")) return false;
  if (hasArtifactPreviewBodyTextLeaks(trimmed)) return false;

  if (!countTagBalance(trimmed, /<style\b/gi, /<\/style>/gi)) return false;
  if (!countTagBalance(trimmed, /<script\b/gi, /<\/script>/gi)) return false;
  if (!countTagBalance(trimmed, /<svg\b/gi, /<\/svg>/gi)) return false;
  if (!countTagBalance(trimmed, /<math\b/gi, /<\/math>/gi)) return false;

  // Unclosed HTML comments leave the rest of the document inside a comment
  // node in some parsers / paint oddly in others.
  const commentOpens = (trimmed.match(/<!--/g) ?? []).length;
  const commentCloses = (trimmed.match(/-->/g) ?? []).length;
  if (commentOpens > commentCloses) return false;

  // Truncated void tags can appear outside <body> (e.g. after <head>) and still
  // paint; reject when the document is only leak debris with no slide/root.
  const bodyInner = trimmed.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
  const bodyWithoutBlocks = bodyInner
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, "")
    .trim();
  if (bodyWithoutBlocks.length > 0) {
    const hasSlideOrRoot =
      /<(?:section|div)[^>]*(?:\bclass=["'][^"']*\bslide\b|data-slide|data-screen-label|deck-shell|deck-stage|\bid=["']deck)/i.test(
        bodyWithoutBlocks,
      )
      || /<(?:main|article|h1|h2|p|img|canvas)\b/i.test(bodyWithoutBlocks);
    if (
      !hasSlideOrRoot
      && /(?:fonts\.)?googleapis\.com|fonts\.gstatic|fonts\.bunny|fontshare|typekit|fontawesome|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare|esm\.sh|initial-scale\s*=|integrity\s*=\s*["']sha|rel\s*=\s*["'](?:stylesheet|preconnect|preload)["']|type\s*=\s*["']module["']\s*\/?>/i.test(
        bodyWithoutBlocks,
      )
    ) {
      return false;
    }
    // Bare CDN host or host+path lines inside an otherwise complete body still
    // paint as visible text — reject until they are scrubbed or the document settles.
    if (
      /(?:^|\n)\s*(?:https?:\/\/)?(?:(?:fonts\.)?googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)(?:\/[^\s<>]*)?\s*(?:\n|$)/im.test(
        bodyWithoutBlocks,
      )
    ) {
      return false;
    }
    // Truncated head tags that never received `>` (e.g. `<link …fonts.google`).
    if (/<(?:link|meta|base|script)\b[^>\n]*$/im.test(bodyWithoutBlocks.trimEnd())) {
      return false;
    }
  }

  return true;
}
