import { stripClosedStyleAndScriptBlocks } from "./artifactPreviewTextLeaks.js";
import { hasArtifactViewportMetaTextLeak } from "./artifactPreviewTextLeaks.js";

/** Remove closed style/script blocks so body scans ignore legitimate CSS/JS. */
export { stripClosedStyleAndScriptBlocks } from "./artifactPreviewTextLeaks.js";

function previewLeakScanSurface(html: string): string {
  const withoutBlocks = stripClosedStyleAndScriptBlocks(html);
  const bodyMatch = withoutBlocks.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyMatch?.[1] ?? withoutBlocks;
}

/**
 * Detect deck scaffold CSS/JS rendered as visible body text while `<style>` /
 * `<script>` tags are still streaming closed. Used to gate live iframe updates.
 */
export function hasArtifactPreviewBodyTextLeaks(html: string): boolean {
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

function stripPreviewTextLeakMatches(doc: string, re: RegExp): string {
  return doc.replace(re, (match) => (match.startsWith(">") ? ">" : ""));
}

export function stripArtifactPreviewBodyTextLeaks(html: string): string {
  let out = html;
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_STYLE_TEXT_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_CSS_SECTION_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_CSS_RULE_BLOCK_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_SCRIPT_SNIPPET_BODY_RE);
  return out;
}
