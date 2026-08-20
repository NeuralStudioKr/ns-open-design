/**
 * @deprecated Import from `@open-design/contracts` — kept for stable web import paths.
 */
export {
  LEAKED_AGENT_PROSE_TAG_NAMES,
  sanitizeLeakedAgentProse,
  stripTrailingOpenInternalMarkup,
  stripIncompleteTrailingMarkupToken,
  stripAssistantCodeFencesForDisplay,
  createStreamingAssistantProseGuard,
  stripHardDeckNavJsFingerprints,
} from "@open-design/contracts";

import {
  sanitizeAssistantProseForDisplay as sanitizeAssistantProseForDisplayContracts,
  sanitizeLeakedAgentProse,
  stripHardDeckNavJsFingerprints,
  type SanitizeAssistantProseOptions,
} from "@open-design/contracts";

const DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE =
  /<(?:div|span)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?position\s*:\s*absolute[\s\S]*$/i;
const DECK_MOTIF_PILL_RADIUS_TAIL_RE =
  /<(?:div|span)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?border-radius\s*:\s*9999px[\s\S]*$/i;
/** Daisy badge pills (`border-radius:20px` + box-shadow / font-family). */
const DECK_MOTIF_STYLED_BADGE_TAIL_RE =
  /<(?:div|span)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?border-radius\s*:\s*\d+px[\s\S]*?(?:box-shadow|font-family|font-weight|padding)\s*:[\s\S]*$/i;
const DECK_CARD_STYLE_DIV_TAIL_RE =
  /<(?:div|article)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:card|pill|chip|deco)[^"']*["'][^>]*\bstyle\s*=[\s\S]*$/i;
const DECK_DECO_CLASS_TAIL_RE =
  /<(?:div|span|svg|g|i)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:deco-|floating-pill|pixel-glitch|win-titlebar)[\s\S]*$/i;
const DECK_MOTIF_SVG_TAIL_RE =
  /<svg\b[^>]*(?:class\s*=\s*["'][^"']*\b(?:deco-|floating-pill)|viewBox\s*=|style\s*=\s*["'][^"']*position\s*:\s*absolute)[\s\S]*$/i;
const DECK_MOTIF_PATH_TAIL_RE =
  /<path\b[^>]*\bd\s*=\s*["'][\s\S]*$/i;
const DECK_MOTIF_SVG_PRIMITIVE_TAIL_RE =
  /<(?:circle|rect|ellipse|polygon|polyline|line|g|defs|linearGradient|radialGradient|stop|use|text|tspan)\b/i;
const DECK_MOTIF_SVG_CLOSE_TAIL_RE = /<\/svg\b/i;
const DECK_MOTIF_HTML_COMMENT_TAIL_RE =
  /<!--\s*(?:Daisy|motif|deco|SLIDE)\b[\s\S]*$/i;
const DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE =
  /<\/(?:section|div)>\s*[-a-z]*weight\s*:[\s\S]*$/i;
/** Mid-attribute style debris, including quoted font-family / flex props. */
const DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE =
  /(?:^|\n)(?:(?:px|em|rem|%|vh|vw)\s*;\s*)?(?:[a-zA-Z-]+\s*:\s*[^;]*;?\s*){2,}[\s\S]*?["']\s*>[\s\S]*$/i;
/** Truncated SVG style body: `none;stroke:…` (with or without `</style>`). */
const DECK_ORPHAN_MID_SVG_CSS_STYLE_TAIL_RE =
  /(?:^|\n)(?:(?:none|solid|inherit|round|butt|miter|bevel)\s*;\s*)?(?:(?:stroke(?:-[\w]+)?|fill|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit)\s*:[^;]*;?\s*){2,}[\s\S]*$/i;
/** Stale-dist last pass for kit CSS at-rules contracts already strip. */
const DECK_FRAMEWORK_CSS_TAIL_RE =
  /(?:^|\n\n|\n)((?::root\s*\{|@(?:-webkit-)?(?:keyframes\s+[\w-]+|font-face)\s*\{|@(?:media|page|supports|layer)\b[^{]*\{|@import\s+(?:url\(|["'])|<style\b[^>]*>|(?:from|to|\d+%)\s*\{|(?:\.slide|(?:\.[A-Za-z_-][\w-]*|#[A-Za-z_-][\w-]*|h[1-6]|p|ul|li|body|section(?:\.[\w-]+)?)\s*\{))[\s\S]*)$/i;

/**
 * Display-only last pass for Capsule motif pills / truncated slide HTML that
 * leaked outside `<artifact>`. Contracts SSOT already chops these; this copy
 * stays in the web bundle so a stale `@open-design/contracts` dist cannot
 * re-paint `position:absolute` pills or `</section>-weight:` debris in chat.
 */
function looksLikeLeakedDeckFrameworkCss(tail: string): boolean {
  return (
    /width:\s*1920px|height:\s*1080px|box-sizing:\s*border-box|\.grain::after/i.test(tail)
    || /<\/style>|<style\b|<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b|<!--\s*(?:SLIDE|Daisy|motif|deco)\b/i.test(tail)
    || /^\.slide\s*\{[\s\S]*/.test(tail.trim())
    || /\.deco-[\w-]+\s*\{/i.test(tail)
    || /\.cls-\d+\s*\{/i.test(tail)
    || /@(?:keyframes|font-face|media|import|page|supports|layer)\b/i.test(tail)
    || /(?:^|\n)(?:from|to|\d+%)\s*\{[\s\S]*(?:transform|opacity|translate|rotate)/i.test(tail)
  );
}

function stripLeakedDeckMotifHtmlTail(input: string): string {
  if (!input) return input;
  let cut: number | null = null;
  for (const re of [
    DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE,
    DECK_MOTIF_PILL_RADIUS_TAIL_RE,
    DECK_MOTIF_STYLED_BADGE_TAIL_RE,
    DECK_CARD_STYLE_DIV_TAIL_RE,
    DECK_DECO_CLASS_TAIL_RE,
    DECK_MOTIF_SVG_TAIL_RE,
    DECK_MOTIF_PATH_TAIL_RE,
    DECK_MOTIF_SVG_PRIMITIVE_TAIL_RE,
    DECK_MOTIF_SVG_CLOSE_TAIL_RE,
    DECK_MOTIF_HTML_COMMENT_TAIL_RE,
    DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE,
    DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE,
    DECK_ORPHAN_MID_SVG_CSS_STYLE_TAIL_RE,
  ]) {
    const match = re.exec(input);
    if (match?.index === undefined) continue;
    if (cut == null || match.index < cut) cut = match.index;
  }
  if (cut != null) return input.slice(0, cut).trimEnd();
  const css = DECK_FRAMEWORK_CSS_TAIL_RE.exec(input);
  if (css?.index !== undefined && looksLikeLeakedDeckFrameworkCss(css[1] ?? "")) {
    return input.slice(0, css.index).trimEnd();
  }
  return input;
}

function findArtifactOpenIndex(input: string, from: number): number {
  const slice = from > 0 ? input.slice(from) : input;
  const match = /<artifact(?=[\s>/])/i.exec(slice);
  return match?.index == null ? -1 : (from > 0 ? from : 0) + match.index;
}

function stripLeakedDeckMotifHtmlForDisplay(
  input: string,
  preserveArtifactBodies: boolean,
): string {
  if (!input) return input;
  if (!preserveArtifactBodies) return stripLeakedDeckMotifHtmlTail(input);
  let result = "";
  let cursor = 0;
  while (cursor < input.length) {
    const open = findArtifactOpenIndex(input, cursor);
    if (open === -1) {
      result += stripLeakedDeckMotifHtmlTail(input.slice(cursor));
      break;
    }
    result += stripLeakedDeckMotifHtmlTail(input.slice(cursor, open));
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
 * Display sanitizer with a web-local last pass for classic deck-nav JS and
 * leaked Capsule motif HTML.
 *
 * Contracts SSOT already strips these dialects; this wrapper keeps a hard
 * fingerprint chop in the web bundle so a stale `@open-design/contracts` dist
 * (or Next compile cache) cannot re-paint
 * `(function(){ document.addEventListener('keydown',function(e){ …` or
 * `<div style="position:absolute;border-radius:9999px">Nx</div>` in chat.
 */
export function sanitizeAssistantProseForDisplay(
  input: string,
  options: SanitizeAssistantProseOptions = {},
): string {
  const fromContracts = sanitizeAssistantProseForDisplayContracts(input, options);
  const preservingArtifacts =
    options.streaming === true || options.preserveClosedArtifact === true;
  return stripLeakedDeckMotifHtmlForDisplay(
    stripHardDeckNavJsFingerprints(fromContracts),
    preservingArtifacts,
  );
}

/**
 * Remove completed internal markup blocks and fake tool narration from prose.
 *
 * By default this ALSO strips closed `<artifact>` blocks — that matches the
 * old-loop-406 SSOT default and is what display paths want. Callers that
 * pre-process artifact blocks separately (e.g. transcript summarization,
 * which keeps unconfirmed-save bodies intact) must opt in to preservation
 * via `preserveClosedArtifact: true` — otherwise the SSOT strip would
 * silently discard those bodies here at the tail of the sanitizer chain,
 * leaving the next turn with no source to inspect or repair.
 */
export function stripInternalOpenDesignMarkup(
  input: string,
  options: { preserveClosedArtifact?: boolean } = {},
): string {
  return sanitizeLeakedAgentProse(input, options);
}
