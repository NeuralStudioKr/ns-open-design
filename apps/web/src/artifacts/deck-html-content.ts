import {
  looksLikeInstructionCopy,
  looksLikeTemplateMarketingTitle,
} from '@open-design/contracts';

const SLIDE_SECTION_OPEN_RE =
  /<section\b[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'|[^\s"'`=<>]*\bslide\b[^\s"'`=<>]*)/gi;

const SLIDE_SECTION_BLOCK_RE =
  /<section\b[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'|[^\s"'`=<>]*\bslide\b[^\s"'`=<>]*)[^>]*>([\s\S]*?)<\/section>/gi;

const HAS_MEDIA_CONTENT_RE = /<(?:img|video|audio|canvas|svg|iframe|picture|object|embed)\b/i;

const HAS_VISIBLE_TEXT_IN_SLIDE_RE =
  /<(?:h[1-6]|p|li|td|th|blockquote|figcaption)\b[^>]*>\s*[^<\s][\s\S]*?<\/(?:h[1-6]|p|li|td|th|blockquote|figcaption)\s*>/i;

/** Model status sentences that must not count as deck deliverable content. */
const DECK_STATUS_PROSE_RE =
  /(?:작성\s*중|만들고\s*있어요|작성하고\s*있|준비\s*중|작성하고\s*있어|generating|making\s+(?:your\s+)?deck|creating\s+(?:the\s+)?(?:slide|deck))/i;

const GENERIC_OUTLINE_HEADING_RE =
  /^(?:발표\s*개요|overview|agenda|목차|구성|intro|title\s*slide|cover|표지|contents|table\s*of\s*contents)$/i;

const MIN_MULTI_SLIDE_FILLED_COUNT = 2;
const MIN_TWO_SLIDE_TOTAL_TEXT = 36;
const MIN_MULTI_SLIDE_TOTAL_TEXT = 64;
const MIN_FILLED_SLIDE_RATIO = 0.34;

function visibleTextFromHtmlFragment(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function documentContainsSlideSection(html: string): boolean {
  SLIDE_SECTION_OPEN_RE.lastIndex = 0;
  return SLIDE_SECTION_OPEN_RE.test(html);
}

function listSlideSectionInners(html: string): string[] {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const inners: string[] = [];
  SLIDE_SECTION_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLIDE_SECTION_BLOCK_RE.exec(withoutComments)) !== null) {
    inners.push(match[1] ?? "");
  }
  return inners;
}

function firstSlideHeading(innerHtml: string): string {
  const heading = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(innerHtml)?.[1];
  const raw = heading ?? visibleTextFromHtmlFragment(innerHtml);
  return visibleTextFromHtmlFragment(raw).slice(0, 120);
}

/**
 * Persist-time anti-parroting: a deck whose cover (or most headings) is the
 * user's "만들어줘" instruction or the template marketing name is a failed
 * generate — even if the HTML is structurally complete.
 */
/**
 * Fill hang detector: the model opened Motif `<svg>` (often with nested
 * `<style>`) before any cover heading. Those streams stall at ~5 visible
 * lines while path data is generated.
 */
export function deckArtifactStartsWithMotifSvgDump(html: string): boolean {
  const window = String(html ?? "").replace(/^﻿/, "").slice(0, 1200);
  const svgAt = window.search(/<svg\b/i);
  if (svgAt < 0) return false;
  const headingAt = window.search(/<h[1-3]\b[^>]*>\s*[^<\s]/i);
  if (headingAt < 0) return true;
  return svgAt < headingAt;
}

const DECK_STREAM_OPEN_RE =
  /<artifact\b|<!doctype\s+html|<html\b|<body\b|<section\b[^>]*slide/i;

function extractStreamedDeckHtml(text: string): string {
  const raw = String(text ?? "");
  const artifact = /<artifact\b[^>]*>/i.exec(raw);
  if (artifact && artifact.index != null) return raw.slice(artifact.index);
  const doc = /<!doctype\s+html|<html\b|<body\b|<section\b[^>]*slide/i.exec(raw);
  if (doc && doc.index != null) return raw.slice(doc.index);
  return raw;
}

function motifSvgDumpLooksCommitted(html: string): boolean {
  const svgAt = html.search(/<svg\b/i);
  if (svgAt < 0) return false;
  const after = html.slice(svgAt);
  if (after.length >= 400) return true;
  if (/<style\b/i.test(after.slice(0, 240))) return true;
  if (/\bd\s*=\s*["'][^"']{80,}/i.test(after)) return true;
  return false;
}

/**
 * Mid-stream abort gate. Fill turns abort as soon as Motif `<svg>` opens
 * before a heading (ZERO-svg contract). Other deck turns wait until the
 * dump looks committed so a tiny post-title icon is not cancelled.
 */
export function shouldAbortStreamForMotifSvgDump(options: {
  streamedText: string;
  templateCloneContentFill?: boolean;
}): boolean {
  const text = String(options.streamedText ?? "");
  if (!DECK_STREAM_OPEN_RE.test(text)) return false;
  const htmlish = extractStreamedDeckHtml(text);
  if (!deckArtifactStartsWithMotifSvgDump(htmlish)) return false;
  if (options.templateCloneContentFill) return /<svg\b/i.test(htmlish);
  return motifSvgDumpLooksCommitted(htmlish);
}

/** Auto-continue must not fence Motif-SVG-first partials — the model continues the path dump. */
export function shouldDiscardPartialHtmlForMotifSvgDump(html: string): boolean {
  return deckArtifactStartsWithMotifSvgDump(html);
}

/**
 * Drop an in-progress Motif `<svg>` from streamed assistant text so the next
 * turn's history cannot continue path/`d=` data. Persist still sees an
 * incomplete shell and auto-continues.
 */
export function stripAbandonedMotifSvgDumpFromStreamedText(text: string): string {
  const raw = String(text ?? "");
  const htmlish = extractStreamedDeckHtml(raw);
  if (!deckArtifactStartsWithMotifSvgDump(htmlish)) return raw;
  return raw.replace(/<svg\b[\s\S]*$/i, "<!-- motif svg dump abandoned -->");
}

export function deckSlideHeadingsLookLikeFailedGenerate(html: string): boolean {
  const headings = listSlideSectionInners(html)
    .map((inner) => firstSlideHeading(inner))
    .filter(Boolean);
  if (headings.length === 0) return false;
  const failed = (title: string) =>
    looksLikeInstructionCopy(title) || looksLikeTemplateMarketingTitle(title);
  if (failed(headings[0]!)) return true;
  const bad = headings.filter(failed).length;
  return bad >= Math.ceil(headings.length / 2);
}

export function slideSectionInnerLooksLikeStatusOnly(innerHtml: string): boolean {
  const text = visibleTextFromHtmlFragment(innerHtml);
  if (!text) return true;
  if (DECK_STATUS_PROSE_RE.test(text)) return true;
  // Leaked streaming tail such as "을 만들고 있어요" without real deck copy.
  if (/^을\s+만들/.test(text) && text.length < 48) return true;
  return false;
}

function isGenericOutlineOnlySlide(innerHtml: string): boolean {
  if (/<(?:p|li|td|th|blockquote|ul|ol)\b/i.test(innerHtml)) return false;
  if (HAS_MEDIA_CONTENT_RE.test(innerHtml)) return false;
  const text = visibleTextFromHtmlFragment(innerHtml);
  if (!text) return true;
  return GENERIC_OUTLINE_HEADING_RE.test(text) || text.length <= 8;
}

function slideInnerHasVisibleCopy(innerHtml: string): boolean {
  return visibleTextFromHtmlFragment(innerHtml).length >= 2;
}

function slideInnerHasDeliverableCopy(innerHtml: string): boolean {
  if (slideSectionInnerLooksLikeStatusOnly(innerHtml)) return false;
  if (isGenericOutlineOnlySlide(innerHtml)) return false;
  // Motif SVG / img without a title or lead is not deliverable copy — treating
  // any `<svg>` as filled made SVG-first hangs look "salvageable".
  if (HAS_MEDIA_CONTENT_RE.test(innerHtml) && slideInnerHasVisibleCopy(innerHtml)) {
    return true;
  }
  if (/<(?:p|li|td|th|blockquote)\b/i.test(innerHtml) && HAS_VISIBLE_TEXT_IN_SLIDE_RE.test(innerHtml)) {
    return true;
  }
  return visibleTextFromHtmlFragment(innerHtml).length >= 12;
}

/** At least one slide section carries real deliverable content. */
export function hasFilledSlideSection(html: string): boolean {
  return listSlideSectionInners(html).some(slideInnerHasDeliverableCopy);
}

function countFilledSlideSections(html: string): number {
  return listSlideSectionInners(html).filter(slideInnerHasDeliverableCopy).length;
}

function totalFilledSlideVisibleText(html: string): number {
  return listSlideSectionInners(html)
    .filter(slideInnerHasDeliverableCopy)
    .reduce((sum, inner) => sum + visibleTextFromHtmlFragment(inner).length, 0);
}

/**
 * Minimum bar for persisting/previewing a deck artifact. Rejects status prose,
 * outline-only headings, and sparse multi-slide shells where only one slide has
 * real copy while the rest are empty placeholders.
 */
export function meetsMinimumDeckDeliverableQuality(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (!documentContainsSlideSection(withoutComments)) {
    return false;
  }

  const inners = listSlideSectionInners(withoutComments);
  const totalSlides = inners.length;
  const filledSlides = countFilledSlideSections(withoutComments);
  const totalText = totalFilledSlideVisibleText(withoutComments);

  if (totalSlides === 0 || filledSlides === 0) return false;

  if (totalSlides === 1) {
    return slideInnerHasDeliverableCopy(inners[0]!);
  }

  if (filledSlides < MIN_MULTI_SLIDE_FILLED_COUNT) return false;

  if (totalSlides === 2) {
    return totalText >= MIN_TWO_SLIDE_TOTAL_TEXT;
  }

  if (totalText < MIN_MULTI_SLIDE_TOTAL_TEXT) return false;

  if (totalSlides >= 4) {
    const requiredFilled = Math.max(
      MIN_MULTI_SLIDE_FILLED_COUNT,
      Math.ceil(totalSlides * MIN_FILLED_SLIDE_RATIO),
    );
    if (filledSlides < requiredFilled) return false;
  }

  return true;
}

/**
 * Deck salvage/persist gates: refuse prose-only bodies and status sentences
 * that never reached real `<section class="slide">` content.
 */
export function hasSalvageableDeckSlideContent(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (documentContainsSlideSection(withoutComments)) {
    return meetsMinimumDeckDeliverableQuality(html);
  }
  if (HAS_MEDIA_CONTENT_RE.test(withoutComments)) {
    if (deckArtifactStartsWithMotifSvgDump(withoutComments)) return false;
    const mediaText = visibleTextFromHtmlFragment(withoutComments);
    if (!mediaText || mediaText.length < 8) return false;
    if (DECK_STATUS_PROSE_RE.test(mediaText)) return false;
    return true;
  }
  const text = visibleTextFromHtmlFragment(withoutComments);
  if (!text || text.length < 8) return false;
  if (DECK_STATUS_PROSE_RE.test(text)) return false;
  if (/^을\s+만들/.test(text) && text.length < 48) return false;
  return true;
}

/**
 * True when HTML is already closed but only passes the soft truncation bar
 * (strict incomplete/low-substance would still reject). Used so upstream
 * salvage → persist does not re-fail the same body after `salvageTruncated`
 * returns null on already-closed documents.
 */
export function isClosedSoftSalvageDeckHtml(html: string): boolean {
  const trimmed = String(html ?? "").replace(/^﻿/, "").trim();
  if (trimmed.length < 128) return false;
  if (!/<\/html\s*>/i.test(trimmed) || !/<\/body\s*>/i.test(trimmed)) return false;
  if (!documentContainsSlideSection(trimmed)) return false;
  return meetsTruncationSalvageQuality(trimmed);
}

/**
 * Truncation-only content sniff. Accepts short real titles the strict
 * deliverable bar rejects (e.g. "온보딩 킥오프") so a max_tokens cut on the
 * cover slide can persist. Still refuses status prose, SLOT/empty bodies, and
 * generic outline-only headings ("표지" / "발표 개요") that are not a deck.
 */
function slideInnerHasTruncationSalvageCopy(innerHtml: string): boolean {
  if (slideSectionInnerLooksLikeStatusOnly(innerHtml)) return false;
  if (HAS_MEDIA_CONTENT_RE.test(innerHtml)) {
    return slideInnerHasVisibleCopy(innerHtml);
  }
  const text = visibleTextFromHtmlFragment(innerHtml);
  if (text.length < 2) return false;
  if (GENERIC_OUTLINE_HEADING_RE.test(text)) return false;
  return true;
}

/**
 * Softer quality bar used ONLY while closing mid-stream truncated decks
 * (`salvageTruncatedHtmlDocument`). A max_tokens cut often leaves 1–2 strong
 * filled slides plus empty trailing placeholders — the strict 34% multi-slide
 * ratio would discard previewable content. Already-closed "success" persists
 * still use `meetsMinimumDeckDeliverableQuality`.
 */
export function meetsTruncationSalvageQuality(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (!documentContainsSlideSection(withoutComments)) {
    return hasSalvageableDeckSlideContent(html);
  }
  const inners = listSlideSectionInners(withoutComments);
  const salvageable = inners.filter(slideInnerHasTruncationSalvageCopy);
  if (salvageable.length === 0) return false;
  const totalText = salvageable.reduce(
    (sum, inner) => sum + visibleTextFromHtmlFragment(inner).length,
    0,
  );
  if (salvageable.length === 1) {
    return totalText >= 2;
  }
  // Prefer any two titled slides over incomplete_output, even when copy is thin.
  return totalText >= 8;
}

/**
 * Close unmatched `<section class="slide">` openers so a max_tokens cut in the
 * middle of the first (or last) slide can still be content-scored and persisted.
 * Nested non-slide `<section>` tags inside a slide are depth-counted.
 */
export function closeUnclosedSlideSectionsForSalvage(html: string): string {
  if (!html) return html;
  const openRe =
    /<section\b[^>]*\bclass\s*=\s*(?:"[^"]*\bslide\b[^"]*"|'[^']*\bslide\b[^']*'|[^\s"'`=<>]*\bslide\b[^\s"'`=<>]*)[^>]*>/gi;
  const opens: { openStart: number; contentStart: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    opens.push({ openStart: match.index, contentStart: match.index + match[0].length });
  }
  if (opens.length === 0) return html;

  const insertions: { at: number; text: string }[] = [];
  for (let i = 0; i < opens.length; i += 1) {
    const contentStart = opens[i]!.contentStart;
    const contentEnd = i + 1 < opens.length ? opens[i + 1]!.openStart : html.length;
    const chunk = html.slice(contentStart, contentEnd);
    let depth = 1;
    const tagRe = /<\/?section\b[^>]*>/gi;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRe.exec(chunk)) !== null) {
      if (/^<\/section/i.test(tagMatch[0])) {
        depth -= 1;
        if (depth === 0) break;
      } else if (!/^<\//.test(tagMatch[0])) {
        depth += 1;
      }
    }
    if (depth > 0) {
      insertions.push({ at: contentEnd, text: "</section>".repeat(depth) });
    }
  }
  if (insertions.length === 0) return html;

  let out = html;
  for (let i = insertions.length - 1; i >= 0; i -= 1) {
    const { at, text } = insertions[i]!;
    out = `${out.slice(0, at)}${text}${out.slice(at)}`;
  }
  return out;
}

export function isDeckStatusProseOnlyBody(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (documentContainsSlideSection(withoutComments)) {
    return !meetsMinimumDeckDeliverableQuality(html);
  }
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(withoutComments);
  const body = bodyMatch ? bodyMatch[1]! : withoutComments;
  const text = visibleTextFromHtmlFragment(body);
  if (!text) return true;
  if (DECK_STATUS_PROSE_RE.test(text)) return true;
  if (/^을\s+만들/.test(text) && text.length < 48) return true;
  return false;
}
