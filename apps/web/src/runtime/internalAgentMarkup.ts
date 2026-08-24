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
  stripIncompleteTrailingMarkupToken,
  stripLeakedDeckCodeDebrisBlocksRespectingArtifacts,
  stripResidualDeckHtmlMarkupRespectingArtifacts,
  type SanitizeAssistantProseOptions,
} from "@open-design/contracts";

const DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE =
  /<(?:div|span|header|footer|nav|img|aside)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?position\s*:\s*(?:absolute|fixed)[\s\S]*$/i;
const DECK_MOTIF_PILL_RADIUS_TAIL_RE =
  /<(?:div|span|button)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?border-radius\s*:\s*9999px[\s\S]*$/i;
/** Daisy badge pills (`border-radius:20px` + box-shadow / font-family). */
const DECK_MOTIF_STYLED_BADGE_TAIL_RE =
  /<(?:div|span|button)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?border-radius\s*:\s*\d+px[\s\S]*?(?:box-shadow|font-family|font-weight|padding)\s*:[\s\S]*$/i;
/** Eyebrow / hero typography chrome without border-radius (Barlow reload leak). */
const DECK_MOTIF_STYLED_TYPOGRAPHY_TAIL_RE =
  /<(?:div|span|strong|em|b|p|h[1-6]|button|label)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?font-family\s*:[\s\S]*?(?:letter-spacing|text-transform|font-size\s*:\s*\d{2,}px|font-weight\s*:\s*(?:[5-9]00|bold))[\s\S]*$/i;
const DECK_ORPHAN_FLEX_LAYOUT_DIV_TAIL_RE =
  /<\/div>\s*<div\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:display\s*:\s*flex|flex\s*:|flex-direction|justify-content|gap\s*:)[\s\S]*$/i;
const DECK_FLEX_OR_GRID_LAYOUT_TAIL_RE =
  /<(?:div|section|header|footer|nav|main|article)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:display\s*:\s*(?:flex|grid)|flex-direction|grid-template|justify-content|align-items|gap\s*:\s*\d)[\s\S]*$/i;
const DECK_FULL_FRAME_SIZE_TAIL_RE =
  /<(?:section|div|main|article)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:width\s*:\s*1920px|height\s*:\s*1080px)[\s\S]*$/i;
const DECK_DATA_ATTR_TAIL_RE =
  /<(?:div|section|main|article)\b[^>]*\bdata-(?:deck|slide)[\w-]*\s*=/i;
const DECK_POSITIONED_PCT_TAIL_RE =
  /<(?:div|span)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:(?:top|right|bottom|left)\s*:\s*[\d.]+%|(?:transform\s*:\s*translate)|(?:position\s*:\s*(?:relative|absolute|fixed)[\s\S]*?(?:top|left|right|bottom|inset)\s*:))[\s\S]*$/i;
const DECK_TABLE_OR_LIST_TAIL_RE =
  /<(?:table|ul|ol)\b[^>]*\bstyle\s*=\s*["'][\s\S]*$/i;
const DECK_IMG_TAIL_RE =
  /<img\b[^>]*(?:\bstyle\s*=|src\s*=\s*["'][^"']*(?:motif|deco|\.svg)|object-fit\s*:)[\s\S]*$/i;
const DECK_PICTURE_TAIL_RE =
  /<(?:picture|source)\b[\s\S]*$/i;
const DECK_MEDIA_EMBED_TAIL_RE =
  /<(?:video|canvas|iframe|audio|object|embed)\b[^>]*(?:\bstyle\s*=|width\s*=\s*["']?1920|height\s*=\s*["']?1080|poster\s*=|object-fit|data\s*=|type\s*=\s*["']image\/)[\s\S]*$/i;
const DECK_A11Y_DECO_SHELL_TAIL_RE =
  /<(?:div|span|section)\b[^>]*(?:\brole\s*=\s*["']presentation["']|\baria-hidden\s*=\s*["']true["'])[^>]*(?:\bstyle\s*=)?[\s\S]*$/i;
const DECK_FIGURE_TAIL_RE =
  /<(?:figure|figcaption)\b[^>]*\bstyle\s*=\s*["'][\s\S]*$/i;
const DECK_VISUAL_EFFECT_STYLE_TAIL_RE =
  /<(?:div|span|section|aside|header|footer)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:(?:linear|radial|conic)-gradient\s*\(|clip-path\s*:|(?:-webkit-)?backdrop-filter\s*:|mix-blend-mode\s*:|(?:-webkit-)?mask-image\s*:|filter\s*:\s*blur|aspect-ratio\s*:|background-image\s*:\s*url\s*\(\s*data:|box-shadow\s*:[\s\S]*border-radius\s*:|height\s*:\s*\d+px[\s\S]*width\s*:\s*\d+%|will-change\s*:|writing-mode\s*:|column-count\s*:)[\s\S]*$/i;
const DECK_ESCAPED_STYLE_ATTR_TAIL_RE =
  /(?:\n|^)\s*<(?:span|div|strong|em|p|h[1-6]|button)\b[^>]*\bstyle\s*=\s*\\["'][\s\S]*$/i;
const DECK_HTML_ENTITY_TAG_TAIL_RE =
  /(?:\n|^)\s*&lt;\/?(?:span|div|section|style|svg|h[1-6]|p|button)\b[\s\S]*$/i;
const DECK_BARE_CSS_MOTION_TAIL_RE =
  /(?:\n|^)\s*(?:(?:\.[A-Za-z_-][\w-]*)+(?:::?(?:before|after))?\s*\{|animation\s*:[\s\S]*?(?:infinite|forwards|ease|linear)|transform-origin\s*:)[\s\S]*$/i;
const DECK_CLASS_RULE_CSS_TAIL_RE =
  /(?:\n|^)\s*(?:\.[A-Za-z_-][\w-]*){1,6}\s*\{[\s\S]*?(?:(?:border(?:-color|-radius|-width)?|color|padding|margin|background|font|display|opacity)\s*:|rgba?\(|hsla?\(|#[0-9A-Fa-f]{3,8})[\s\S]*$/i;
const DECK_MATH_OR_FOREIGN_TAIL_RE =
  /<(?:math|foreignObject|mi|mo|mn|mrow)\b[\s\S]*$/i;
const DECK_CHROME_LANDMARK_TAIL_RE =
  /<(?:header|footer|nav|aside)\b[^>]*\bstyle\s*=\s*["'][\s\S]*$/i;
const DECK_ORPHAN_CLOSE_TAGS_TAIL_RE =
  /(?:\n|^)\s*(?:<\/(?:div|span|section|header|footer|nav|aside|main|article|h[1-6]|p|ul|ol|li|table|tr|td|th|button)+>\s*)+\s*$/i;
const DECK_CSS_CUSTOM_PROP_DUMP_TAIL_RE =
  /(?:\n|^)\s*(?:--[\w-]+\s*:\s*[^;\n]+;\s*){2,}[\s\S]*$/i;
const DECK_BR_STACKED_HEADING_TAIL_RE =
  /(?:\n|^)(?![^\n]*[\uac00-\ud7af])[^\n]*<br\b[\s\S]*?<\/h[1-6]>/i;
const DECK_TRAILING_INLINE_MARKUP_RE =
  /(?:\n|^)\s*<(?:p|span|div|strong|em|b|i|button|label)\b[^>]*\bstyle\s*=\s*["'][\s\S]*?(?:font|letter-spacing|margin|text-transform|display\s*:\s*flex)[\s\S]*$/i;
const DECK_TRAILING_HEADING_MARKUP_RE =
  /(?:\n|^)\s*<h[1-6]\b[^>]*(?:style\s*=)?[^>]*>[\s\S]*$/i;
const DECK_CARD_STYLE_DIV_TAIL_RE =
  /<(?:div|article)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:card|pill|chip|deco)[^"']*["'][^>]*\bstyle\s*=[\s\S]*$/i;
const DECK_DECO_CLASS_TAIL_RE =
  /<(?:div|span|svg|g|i)\b[^>]*\bclass\s*=\s*["'][^"']*\b(?:deco-|floating-pill|pixel-glitch|win-titlebar)[\s\S]*$/i;
const DECK_MOTIF_SVG_TAIL_RE =
  /<svg\b[^>]*(?:class\s*=\s*["'][^"']*\b(?:deco-|floating-pill)|viewBox\s*=|style\s*=\s*["'][^"']*position\s*:\s*absolute)[\s\S]*$/i;
const DECK_MOTIF_PATH_TAIL_RE =
  /<path\b[^>]*\bd\s*=\s*["'][\s\S]*$/i;
const DECK_MOTIF_SVG_PRIMITIVE_TAIL_RE =
  /<(?:circle|rect|ellipse|polygon|polyline|line|g|defs|linearGradient|radialGradient|stop|use|text|tspan|foreignObject)\b/i;
const DECK_MOTIF_SVG_CLOSE_TAIL_RE = /<\/svg\b/i;
const DECK_MOTIF_HTML_COMMENT_TAIL_RE =
  /(?:^|\n)\s*<!--[\s\S]*$/;
const DECK_ORPHAN_LI_DUMP_TAIL_RE =
  /(?:^|\n)\s*<li\b[\s\S]*$/i;
const DECK_BARE_DIV_OR_MISMATCH_TAIL_RE =
  /(?:^|\n)\s*(?:(?:<\/?div>\s*){2,}|(?:<div\b[^>]*>[\s\S]*?<\/p>))[\s\S]*$/i;
const DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE =
  /<\/(?:section|div)>\s*[-a-z]*weight\s*:[\s\S]*$/i;
/** Mid-attribute style debris, including quoted font-family / flex props. */
const DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE =
  /(?:^|\n)(?:(?:px|em|rem|%|vh|vw|#(?:[0-9A-Fa-f]{3,8}))\s*;\s*)?(?:[a-zA-Z-]+\s*:\s*[^;]*;?\s*){2,}[\s\S]*?["']\s*>[\s\S]*$/i;
/** Truncated SVG style body: `none;stroke:…` (with or without `</style>`). */
const DECK_ORPHAN_MID_SVG_CSS_STYLE_TAIL_RE =
  /(?:^|\n)(?:(?:none|solid|inherit|round|butt|miter|bevel)\s*;\s*)?(?:(?:stroke(?:-[\w]+)?|fill|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit)\s*:[^;]*;?\s*){2,}[\s\S]*$/i;
/** Stale-dist last pass for kit CSS at-rules contracts already strip. */
const DECK_FRAMEWORK_CSS_TAIL_RE =
  /(?:^|\n\n|\n)((?::root\s*\{|@(?:-webkit-)?(?:keyframes\s+[\w-]+|font-face)\s*\{|@(?:media|page|supports|layer)\b[^{]*\{|@import\s+(?:url\(|["'])|<style\b[^>]*>|(?:from|to|\d+%)\s*\{|(?:\.slide|(?:(?:\.[A-Za-z_-][\w-]*)+|#[A-Za-z_-][\w-]*|h[1-6]|p|ul|li|body|section(?:\.[\w-]+)?)\s*\{))[\s\S]*)$/i;

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
    || /(?:^|\n)\s*(?:\.[A-Za-z_-][\w-]*){1,6}\s*\{[\s\S]*(?:border(?:-color)?|color|padding|background|rgba?\(|#[0-9A-Fa-f]{3,8})/i.test(tail)
    || /@(?:keyframes|font-face|media|import|page|supports|layer)\b/i.test(tail)
    || /(?:^|\n)(?:from|to|\d+%)\s*\{[\s\S]*(?:transform|opacity|translate|rotate)/i.test(tail)
  );
}

function findHangulGluedStyleDumpCut(line: string): number | null {
  const match = /^(.*[\uac00-\ud7af\u3000-\u9fff][.\u3002…]?)([\s\S]+)$/u.exec(line);
  if (!match?.[1] || !match[2] || match[2].length < 8) return null;
  const prefix = match[1];
  const dump = match[2];
  if (/\s$/.test(prefix)) return null;
  const decls = dump.match(/[a-zA-Z-]+\s*:\s*[^;\n]{1,96};/g) ?? [];
  const fontStack = /(?:cursive|sans-serif|serif|monospace|fantasy|system-ui)\s*;/i.test(dump);
  const styleClose = /["']\s*>/.test(dump);
  const fontLeftover =
    /^(?:['"][A-Za-z][\w\s]+['"]|[A-Za-z][\w\s]{0,24}['"])\s*,\s*(?:cursive|sans-serif|serif|monospace)/i.test(
      dump,
    );
  if (decls.length >= 2 && (styleClose || fontStack || fontLeftover)) return prefix.length;
  if (fontStack && decls.length >= 1) return prefix.length;
  if ((fontStack || fontLeftover) && styleClose) return prefix.length;
  if (fontLeftover && (fontStack || styleClose || decls.length >= 1)) return prefix.length;
  return null;
}

function findTrailingSameLineDeckHtmlCut(line: string): number | null {
  // Hangul/CJK glued to stacked hero: `제목 넣는 중CLOUD<br>NATIVE</h1>`
  const hangulBrHero = line.match(
    /^(.*?[\uac00-\ud7af\u3000-\u9fff])\s*([A-Za-z][\s\S]*<br\b[\s\S]*<\/h[1-6]>)/u,
  );
  if (hangulBrHero?.[1] !== undefined) return hangulBrHero[1].length;
  const hangulStyleGlue = findHangulGluedStyleDumpCut(line);
  if (hangulStyleGlue != null) return hangulStyleGlue;
  // Same guards as contracts SSOT — never carve intact `style="…"` tags down
  // to `<span style="` residues. Fail fast without attr-close to avoid ReDoS.
  if (/["']\s*>|<\/(?:div|span|p|h[1-6])\b|<br\b/i.test(line)) {
    const midCss = line.match(
      /^(.*?)((?:[A-Za-z][\w\s]{0,24}['"]\s*,\s*)?(?:[a-z]{2,14};)?(?:[a-zA-Z-]+\s*:\s*[^;]*;){2,}[\s\S]*?["']\s*>[\s\S]*)$/i,
    );
    if (midCss?.[1] !== undefined && midCss[2]) {
      let prefix = midCss[1];
      const css = midCss[2];
      const endsInStyleAttr = /\bstyle\s*=\s*["']\s*$/i.test(prefix);
      const openTagPrefix = /<[a-z][\w:-]*\b[^>]*$/i.test(prefix);
      const cjkGlue = /[\u3000-\u9fff\uac00-\ud7af]/u.test(prefix.slice(-12));
      const midWordCssFrag =
        /^(?:[A-Za-z][\w\s]{0,24}['"]\s*,\s*)?(?:[a-z]{2,14};)/i.test(css);
      if (
        !endsInStyleAttr
        && !openTagPrefix
        && (cjkGlue || midWordCssFrag)
        && /(?:font-size|letter-spacing|text-transform|opacity|margin|font-family|line-height)\s*:/i.test(css)
        && (/(?:<\/(?:div|span|p|h[1-6])>|<br\b)/i.test(css) || /["']\s*>/.test(css))
        && /[\p{L}\p{N}]/u.test(prefix.slice(-8))
      ) {
        prefix = prefix.replace(/[A-Za-z][\w\s]{0,24}['"]\s*,\s*$/u, "");
        return prefix.length;
      }
    }
  }
  const brokenAttr = line.match(
    /^(.*?)((?:font-size|width|height|padding|margin)\s*:\s*[\d.]+)\s+style\s*=\s*["'][\s\S]*$/i,
  );
  if (brokenAttr?.[1] !== undefined) return brokenAttr[1].length;
  return null;
}

function stripLeakedDeckMotifHtmlTail(input: string): string {
  if (!input) return input;
  let cut: number | null = null;
  for (const re of [
    DECK_TRAILING_HEADING_MARKUP_RE,
    DECK_TRAILING_INLINE_MARKUP_RE,
    DECK_MOTIF_ABSOLUTE_DIV_TAIL_RE,
    DECK_MOTIF_PILL_RADIUS_TAIL_RE,
    DECK_MOTIF_STYLED_BADGE_TAIL_RE,
    DECK_MOTIF_STYLED_TYPOGRAPHY_TAIL_RE,
    DECK_ORPHAN_FLEX_LAYOUT_DIV_TAIL_RE,
    DECK_FLEX_OR_GRID_LAYOUT_TAIL_RE,
    DECK_FULL_FRAME_SIZE_TAIL_RE,
    DECK_DATA_ATTR_TAIL_RE,
    DECK_POSITIONED_PCT_TAIL_RE,
    DECK_TABLE_OR_LIST_TAIL_RE,
    DECK_IMG_TAIL_RE,
    DECK_PICTURE_TAIL_RE,
    DECK_MEDIA_EMBED_TAIL_RE,
    DECK_A11Y_DECO_SHELL_TAIL_RE,
    DECK_FIGURE_TAIL_RE,
    DECK_VISUAL_EFFECT_STYLE_TAIL_RE,
    DECK_ESCAPED_STYLE_ATTR_TAIL_RE,
    DECK_HTML_ENTITY_TAG_TAIL_RE,
    DECK_BARE_CSS_MOTION_TAIL_RE,
    DECK_CLASS_RULE_CSS_TAIL_RE,
    DECK_MATH_OR_FOREIGN_TAIL_RE,
    DECK_CHROME_LANDMARK_TAIL_RE,
    DECK_ORPHAN_CLOSE_TAGS_TAIL_RE,
    DECK_CSS_CUSTOM_PROP_DUMP_TAIL_RE,
    DECK_BR_STACKED_HEADING_TAIL_RE,
    DECK_CARD_STYLE_DIV_TAIL_RE,
    DECK_DECO_CLASS_TAIL_RE,
    DECK_MOTIF_SVG_TAIL_RE,
    DECK_MOTIF_PATH_TAIL_RE,
    DECK_MOTIF_SVG_PRIMITIVE_TAIL_RE,
    DECK_MOTIF_SVG_CLOSE_TAIL_RE,
    DECK_MOTIF_HTML_COMMENT_TAIL_RE,
    DECK_ORPHAN_LI_DUMP_TAIL_RE,
    DECK_BARE_DIV_OR_MISMATCH_TAIL_RE,
    DECK_BROKEN_SECTION_CSS_DEBRIS_TAIL_RE,
    DECK_ORPHAN_MID_STYLE_ATTR_TAIL_RE,
    DECK_ORPHAN_MID_SVG_CSS_STYLE_TAIL_RE,
  ]) {
    const match = re.exec(input);
    if (match?.index === undefined) continue;
    if (cut == null || match.index < cut) cut = match.index;
  }
  let offset = 0;
  const lines = input.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const lineCut = findTrailingSameLineDeckHtmlCut(line);
    if (lineCut != null) {
      const abs = offset + lineCut;
      if (cut == null || abs < cut) cut = abs;
    }
    offset += line.length + (i < lines.length - 1 ? 1 : 0);
  }
  if (cut != null) input = input.slice(0, cut).trimEnd();
  const css = DECK_FRAMEWORK_CSS_TAIL_RE.exec(input);
  if (css?.index !== undefined && looksLikeLeakedDeckFrameworkCss(css[1] ?? "")) {
    input = input.slice(0, css.index).trimEnd();
  }
  // Stale-dist belt for the Caveat/Zilla dump family: closer + font-stack lines.
  const kept: string[] = [];
  for (const line of input.split("\n")) {
    const trimmed = line.trim();
    if (
      trimmed
      && (/^["']\s*>/.test(trimmed)
        || /^(?:['"][A-Za-z][\w\s]{0,24}['"]|[A-Za-z][\w]{0,24}['"])\s*,\s*(?:cursive|sans-serif|serif|monospace)/i.test(
          trimmed,
        )
        || /^(?:hsla?|hwb|lch|oklch)\s*\([^)]*\)\s*;\s*[a-zA-Z-]+\s*:/.test(trimmed)
        || /^var\s*\(\s*--[^)]+\)\s*;\s*[a-zA-Z-]+\s*:/.test(trimmed)
        || /^currentColor\s*;\s*[a-zA-Z-]+\s*:/i.test(trimmed)
        || /^(?:deg|turn|rad|grad)\s*,\s*#(?:[0-9A-Fa-f]{3,8})/.test(trimmed))
    ) {
      continue;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
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

// Stale-dist belt: re-run contracts heuristic strip (no local duplicate logic).
function stripLeakedDeckCodeDebrisBlocksForDisplayFallback(
  input: string,
  preserveArtifactBodies: boolean,
): string {
  return stripLeakedDeckCodeDebrisBlocksRespectingArtifacts(input, preserveArtifactBodies);
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
  // Stale-dist safety: re-run heuristic debris strip + motif last-pass even if
  // contracts dist is older than this web bundle.
  const afterMotif = stripLeakedDeckMotifHtmlForDisplay(
    stripHardDeckNavJsFingerprints(fromContracts),
    preservingArtifacts,
  );
  const afterHeuristic = stripLeakedDeckCodeDebrisBlocksForDisplayFallback(
    stripLeakedDeckCodeDebrisBlocksRespectingArtifacts(
      afterMotif,
      preservingArtifacts,
    ),
    preservingArtifacts,
  );
  return stripIncompleteTrailingMarkupToken(
    stripResidualDeckHtmlMarkupRespectingArtifacts(
      afterHeuristic,
      preservingArtifacts,
    ),
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

export type { SanitizeAssistantProseOptions };

/** @deprecated Prefer sanitizeAssistantProseForDisplay. */
export function sanitizeStreamingAssistantVisibleText(input: string): string {
  return sanitizeLeakedAgentProse(input);
}
