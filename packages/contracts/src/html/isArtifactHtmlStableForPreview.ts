import { hasArtifactPreviewBodyTextLeaks } from "./artifactPreviewTextLeaks.js";
import {
  ARTIFACT_BARE_CDN_HOST_LINE_RE,
  artifactCdnImportUrlTokenAlternation,
} from "./artifactCdnHosts.js";
import { findFirstDeckSlideHostIndex } from "./deck-slide-class.js";

function countTagBalance(html: string, openRe: RegExp, closeRe: RegExp): boolean {
  const opens = (html.match(openRe) ?? []).length;
  const closes = (html.match(closeRe) ?? []).length;
  return opens <= closes;
}

/**
 * Tag-balance heuristics must ignore instructional copies of `<style>` /
 * `<script>` that live inside HTML comments, CSS block comments, or the
 * *bodies* of already-closed script/style tags (e.g. `const tip = "<script>"`).
 * Counting those as open tags permanently rejects complete decks and leaves
 * the preview on "loading…" even after refresh.
 */
export function stripCommentsForArtifactTagBalance(html: string): string {
  // Closed HTML comments first.
  let out = html.replace(/<!--[\s\S]*?-->/g, "");
  // Blank closed script/style bodies so string literals like
  // `const tip = "<script>"` cannot inflate open-tag counts.
  out = out
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>");
  // Unclosed trailing <style>: scrub CSS comments on the open tail only.
  out = out.replace(/<style\b[^>]*>(?![\s\S]*<\/style>)[\s\S]*$/i, (block) =>
    block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\*[\s\S]*$/g, ""),
  );
  // Remaining closed CSS comments outside style (rare prose/docs).
  out = out.replace(/\/\*[\s\S]*?\*\//g, "");
  return out;
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

  const forBalance = stripCommentsForArtifactTagBalance(trimmed);
  if (!countTagBalance(forBalance, /<style\b/gi, /<\/style>/gi)) return false;
  if (!countTagBalance(forBalance, /<script\b/gi, /<\/script>/gi)) return false;
  if (!countTagBalance(forBalance, /<svg\b/gi, /<\/svg>/gi)) return false;
  if (!countTagBalance(forBalance, /<math\b/gi, /<\/math>/gi)) return false;

  // Unclosed HTML comments leave the rest of the document inside a comment
  // node in some parsers / paint oddly in others. Ignore `<!--` / `-->`
  // that only appear inside closed <script>/<style> (JS/CSS string literals).
  const outsideRawBlocks = trimmed
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  const commentOpens = (outsideRawBlocks.match(/<!--/g) ?? []).length;
  const commentCloses = (outsideRawBlocks.match(/-->/g) ?? []).length;
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
      findFirstDeckSlideHostIndex(bodyWithoutBlocks) >= 0
      || /<(?:section|div)[^>]*(?:deck-shell|deck-stage|\bid=["']deck)/i.test(
        bodyWithoutBlocks,
      )
      || /<(?:main|article|h1|h2|p|img|canvas)\b/i.test(bodyWithoutBlocks);
    if (
      !hasSlideOrRoot
      && new RegExp(
        `(?:${artifactCdnImportUrlTokenAlternation()})|initial-scale\\s*=|integrity\\s*=\\s*["']sha|rel\\s*=\\s*["'](?:stylesheet|preconnect|preload)["']|type\\s*=\\s*["']module["']\\s*\\/?>`,
        "i",
      ).test(bodyWithoutBlocks)
    ) {
      return false;
    }
    // Bare CDN host or host+path lines inside an otherwise complete body still
    // paint as visible text — reject until they are scrubbed or the document settles.
    if (ARTIFACT_BARE_CDN_HOST_LINE_RE.test(bodyWithoutBlocks)) {
      return false;
    }
    // Truncated head tags that never received `>` (e.g. `<link …fonts.google`).
    if (/<(?:link|meta|base|script)\b[^>\n]*$/im.test(bodyWithoutBlocks.trimEnd())) {
      return false;
    }
  }

  return true;
}
