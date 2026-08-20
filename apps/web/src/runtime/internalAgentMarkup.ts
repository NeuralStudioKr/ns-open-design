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
const DECK_CARD_STYLE_DIV_TAIL_RE =
  /<(?:div|article)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:card|pill|chip|deco)[^"']*["'][^>]*\bstyle\s*=[\s\S]*$/i;
const DECK_DECO_CLASS_TAIL_RE =
  /<(?:div|span|svg|g|i)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:deco-|floating-pill|pixel-glitch|win-titlebar)[\s\S]*$/i;
const DECK_MOTIF_SVG_TAIL_RE =
  /<svg\b[^>]*(?:class\s*=\s*["'][^"']*\b(?:deco-|floating-pill)|viewBox\s*=|style\s*=\s*["'][^"']*position\s*:\s*absolute)[\s\S]*$/i;
const DECK_MOTIF_PATH_TAIL_RE =
  /<path\b[^>]*\bd\s*=\s*["'][\s\S]*$/i;
const DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE =
  /<\/(?:section|div)>\s*[-a-z]*weight\s*:[\s\S]*$/i;
/** Mid-attribute style debris: `px;left:60px;…uppercase">Label</div>` */
const DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE =
  /(?:^|\n)(?:(?:px|em|rem|%|vh|vw)\s*;\s*)?(?:(?:left|top|right|bottom|width|height|font-size|font-weight|letter-spacing|line-height|color|background(?:-color)?|text-transform|opacity|margin(?:-\w+)?|padding(?:-\w+)?|border(?:-\w+)?|display|position|z-index)\s*:[^;\n"'<>]*;?\s*){1,}[\s\S]*?["']\s*>[\s\S]*$/i;

/**
 * Display-only last pass for Capsule motif pills / truncated slide HTML that
 * leaked outside `<artifact>`. Contracts SSOT already chops these; this copy
 * stays in the web bundle so a stale `@open-design/contracts` dist cannot
 * re-paint `position:absolute` pills or `</section>-weight:` debris in chat.
 */
function stripLeakedDeckMotifHtmlTail(input: string): string {
  if (!input) return input;
  for (const re of [
    DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE,
    DECK_MOTIF_PILL_RADIUS_TAIL_RE,
    DECK_CARD_STYLE_DIV_TAIL_RE,
    DECK_DECO_CLASS_TAIL_RE,
    DECK_MOTIF_SVG_TAIL_RE,
    DECK_MOTIF_PATH_TAIL_RE,
    DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE,
    DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE,
  ]) {
    const match = re.exec(input);
    if (!match || match.index === undefined) continue;
    return input.slice(0, match.index).trimEnd();
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
