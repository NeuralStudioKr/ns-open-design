/**
 * Truncated viewport meta tails agents stream as visible text. Matches
 * `device-width, …` and the shorter `-width, …` suffix — but not the
 * `device-width` substring inside valid `content="width=device-width, …"`.
 */
export const ARTIFACT_VIEWPORT_TEXT_LEAK_RE =
  /(?<![\w=])(?:device-width|-width)\s*,\s*initial-scale=[^<\n]+"?\s*\/?>/gi;

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
  return ARTIFACT_VIEWPORT_TEXT_LEAK_RE.test(scan);
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

/** Apply leak-stripping regexes to body inner HTML only — never `<head><style>`. */
export function stripBodyInnerPreviewTextLeaks(bodyInner: string): string {
  let out = bodyInner;
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_STYLE_TEXT_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_CSS_SECTION_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_CSS_RULE_BLOCK_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_SCRIPT_SNIPPET_BODY_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_CSS_TOKEN_BLOCK_RE);
  out = stripPreviewTextLeakMatches(out, LEAKED_DECK_SCRIPT_SNIPPET_RE);
  ARTIFACT_VIEWPORT_TEXT_LEAK_RE.lastIndex = 0;
  out = out.replace(ARTIFACT_VIEWPORT_TEXT_LEAK_RE, "");
  return out;
}

export function stripArtifactPreviewBodyTextLeaks(html: string): string {
  const bodyMatch = html.match(/(<body[^>]*>)([\s\S]*?)(<\/body>)/i);
  if (!bodyMatch) return html;
  const [, open, inner, close] = bodyMatch;
  const cleaned = stripBodyInnerPreviewTextLeaks(inner);
  if (cleaned === inner) return html;
  return html.replace(bodyMatch[0], `${open}${cleaned}${close}`);
}
