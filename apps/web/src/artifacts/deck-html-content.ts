import {
  attrsLookLikeDeckOrTemplateSlideHost,
  htmlHasDeckSlideHost,
  htmlLooksLikeSlideDeliverableStream,
  indexOfFirstDeckSlideHost,
  looksLikeDeckSlideHostAttrs,
  healInstructionCopyCoverHeading,
  looksLikeInstructionCopy,
  looksLikeTemplateMarketingTitle,
} from '@open-design/contracts';

const SLIDE_HOST_OPEN_RE = /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/** Official catalog hosts plus cover dialects (`data-slide` / `data-slide-index`). */
function attrsLookLikeSlideHost(attrs: string): boolean {
  return looksLikeDeckSlideHostAttrs(attrs) || attrsLookLikeDeckOrTemplateSlideHost(attrs);
}

type SlideHostBlock = {
  tag: string;
  inner: string;
  start: number;
  end: number;
};

/**
 * Official catalog hosts are `<section class="slide">` *or* `<div class="slide">`
 * (Bold Poster, retro-windows, many html-ppt decks). Chrome like `.slide-inner`
 * is not a host — require an exact `slide` class token.
 */
function extractSlideHostBlocks(html: string): SlideHostBlock[] {
  const raw: SlideHostBlock[] = [];
  const openRe = new RegExp(SLIDE_HOST_OPEN_RE.source, "gi");
  let searchFrom = 0;
  while (searchFrom < html.length) {
    openRe.lastIndex = searchFrom;
    const openMatch = openRe.exec(html);
    if (!openMatch) break;
    const tag = (openMatch[1] ?? "section").toLowerCase();
    const attrs = openMatch[2] ?? "";
    const openStart = openMatch.index;
    const openEnd = openStart + openMatch[0].length;
    if (!attrsLookLikeSlideHost(attrs)) {
      searchFrom = openEnd;
      continue;
    }
    const closeRe = new RegExp(`<\\/${tag}\\s*>`, "gi");
    const nestedOpenRe = new RegExp(`<${tag}\\b(?:[^>"']|"[^"]*"|'[^']*')*>`, "gi");
    let depth = 1;
    let cursor = openEnd;
    let matchedCloseStart = -1;
    let matchedCloseEnd = -1;
    while (cursor < html.length && depth > 0) {
      nestedOpenRe.lastIndex = cursor;
      closeRe.lastIndex = cursor;
      const nextOpen = nestedOpenRe.exec(html);
      const nextClose = closeRe.exec(html);
      if (!nextClose) break;
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        cursor = nextClose.index + nextClose[0].length;
        if (depth === 0) {
          matchedCloseStart = nextClose.index;
          matchedCloseEnd = cursor;
        }
      }
    }
    if (matchedCloseEnd === -1 || matchedCloseStart === -1) {
      raw.push({
        tag,
        inner: html.slice(openEnd),
        start: openStart,
        end: html.length,
      });
      break;
    }
    raw.push({
      tag,
      inner: html.slice(openEnd, matchedCloseStart),
      start: openStart,
      end: matchedCloseEnd,
    });
    searchFrom = matchedCloseEnd;
  }
  return raw.filter(
    (slide, index) =>
      !raw.some(
        (other, otherIndex) =>
          otherIndex !== index && other.start < slide.start && other.end >= slide.end,
      ),
  );
}

export function startsWithSlideHost(html: string): boolean {
  const match = /^<(section|div)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/i.exec(String(html ?? "").trim());
  return Boolean(match && attrsLookLikeSlideHost(match[2] ?? ""));
}

export function eachSlideHostOpenIndex(html: string): number[] {
  const indexes: number[] = [];
  const openRe = new RegExp(SLIDE_HOST_OPEN_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    if (attrsLookLikeSlideHost(match[2] ?? "")) indexes.push(match.index);
  }
  return indexes;
}

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
  return eachSlideHostOpenIndex(html).length > 0;
}

function listSlideSectionInners(html: string): string[] {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  return extractSlideHostBlocks(withoutComments).map((block) => block.inner);
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
  // Title-first: any cover heading open before Motif SVG counts (allows
  // `<h1><span>…` nesting). Requiring immediate text after `>` false-aborted
  // valid title-first streams and left Motif dumps to continue.
  const headingAt = window.search(/<h[1-3]\b/i);
  if (headingAt < 0) return true;
  return svgAt < headingAt;
}

function extractStreamedDeckHtml(text: string): string {
  const raw = String(text ?? "");
  const artifact = /<artifact\b[^>]*>/i.exec(raw);
  if (artifact && artifact.index != null) return raw.slice(artifact.index);
  const doc = /<!doctype\s+html|<html\b|<body\b/i.exec(raw);
  const hostAt = indexOfFirstDeckSlideHost(raw);
  const starts = [doc?.index, hostAt >= 0 ? hostAt : undefined].filter(
    (n): n is number => typeof n === "number" && n >= 0,
  );
  if (starts.length > 0) return raw.slice(Math.min(...starts));
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
  slideCountTopUp?: boolean;
}): boolean {
  const text = String(options.streamedText ?? "");
  if (!htmlLooksLikeSlideDeliverableStream(text)) return false;
  const htmlish = extractStreamedDeckHtml(text);
  if (!deckArtifactStartsWithMotifSvgDump(htmlish)) return false;
  if (options.templateCloneContentFill || options.slideCountTopUp) return /<svg\b/i.test(htmlish);
  return motifSvgDumpLooksCommitted(htmlish);
}

const FILL_HEAD_KIT_DUMP_MIN_CHARS = 800;

function htmlishHasSlideWithHeading(html: string): boolean {
  if (!htmlHasDeckSlideHost(html) || !/<h[1-3]\b/i.test(html)) return false;
  return extractSlideHostBlocks(html).some((block) => /<h[1-3]\b/i.test(block.inner));
}

function firstHeadOrStyleIndex(html: string): number {
  const headAt = html.search(/<head\b/i);
  const styleAt = html.search(/<style\b/i);
  if (headAt < 0) return styleAt;
  if (styleAt < 0) return headAt;
  return Math.min(headAt, styleAt);
}

/**
 * Abort when the model dumps a long `<head>` / prelude `<style>` without a
 * titled slide — burns max_tokens on Daisy CSS and never reaches body copy.
 * Applies to Clone fill, slide-count top-up, AND Teamver slide-only greenfield
 * (BYOK/API) — greenfield was previously exempt and still hit
 * incomplete-html-document-shell (§0.76).
 */
export function shouldAbortStreamForHeadOnlyKitDump(options: {
  streamedText: string;
  templateCloneContentFill?: boolean;
  slideCountTopUp?: boolean;
  /** Teamver slide-only / Canvas→Slide greenfield (no Clone fill flag). */
  slideOnlyDeck?: boolean;
}): boolean {
  if (
    !options.templateCloneContentFill
    && !options.slideCountTopUp
    && !options.slideOnlyDeck
  ) {
    return false;
  }
  const text = String(options.streamedText ?? "");
  if (!htmlLooksLikeSlideDeliverableStream(text)) return false;
  const htmlish = extractStreamedDeckHtml(text);
  const kitAt = firstHeadOrStyleIndex(htmlish);
  if (kitAt < 0) return false;
  if (htmlishHasSlideWithHeading(htmlish)) return false;
  return htmlish.slice(kitAt).length >= FILL_HEAD_KIT_DUMP_MIN_CHARS;
}

/** Drop an in-progress head/style kit dump so auto-continue cannot resume CSS. */
export function stripAbandonedHeadKitDumpFromStreamedText(text: string): string {
  const raw = String(text ?? "");
  const htmlish = extractStreamedDeckHtml(raw);
  if (htmlishHasSlideWithHeading(htmlish)) return raw;
  const kitAt = firstHeadOrStyleIndex(htmlish);
  if (kitAt < 0) return raw;
  const prefix = htmlish.slice(0, kitAt);
  const cut = prefix.length === 0
    ? raw.search(/<head\b|<style\b/i)
    : raw.indexOf(prefix) >= 0
      ? raw.indexOf(prefix) + prefix.length
      : raw.search(/<head\b|<style\b/i);
  if (cut < 0) return raw;
  return `${raw.slice(0, cut)}<!-- head kit dump abandoned -->`;
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

  // Compact API first-fill is 3 titled slides this turn (top-up appends).
  // Korean title+lead copy is often 36–80 chars — do not require the 64-char
  // 4+ slide bar or MiniMax closed drafts fail as low-substance.
  if (totalSlides === 3) {
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
 * First-fill cover drafts are often 1 slide with a short title. Persist used
 * to re-reject those as incomplete-html-document-shell (meetsMinimum wants
 * ≥12 chars / a `<p>`). Top-up appends the rest — do not flash
 * incomplete_output over a titled cover.
 */
function slideInnerHasPersistableDraftCopy(innerHtml: string): boolean {
  if (slideSectionInnerLooksLikeStatusOnly(innerHtml)) return false;
  const text = visibleTextFromHtmlFragment(innerHtml);
  if (text.length < 2) return false;
  // Reject outline labels ("발표 개요") but allow short real titles ("AI").
  if (GENERIC_OUTLINE_HEADING_RE.test(text)) return false;
  return true;
}

export function isPersistableShortDeckDraft(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (!documentContainsSlideSection(withoutComments)) return false;
  if (deckArtifactStartsWithMotifSvgDump(withoutComments)) return false;
  if (deckSlideHeadingsLookLikeFailedGenerate(withoutComments)) return false;
  const inners = listSlideSectionInners(withoutComments);
  // Compact API first-fill is 1–3 titled slides (top-up appends the rest).
  // Sparse 4+ shells stay on the soft-salvage / incomplete trust path.
  if (inners.length === 0 || inners.length > 3) return false;
  const titled = inners.filter(slideInnerHasPersistableDraftCopy);
  // MiniMax compact first-fill often lands cover + two empty placeholders.
  // One persistable titled slide is enough — hidden top-up appends the rest.
  return titled.length >= 1;
}

/** Same gate persist uses after `healInstructionCopyCoverHeading`. */
export function isPersistableShortDeckDraftAfterHeal(
  html: string,
  brief?: string | null,
  deckTitle?: string | null,
): boolean {
  if (isPersistableShortDeckDraft(html)) return true;
  const healed = healInstructionCopyCoverHeading(
    html,
    String(brief ?? ''),
    deckTitle || '슬라이드',
  );
  return healed !== html && isPersistableShortDeckDraft(healed);
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
  const bodyInner = /<body\b[^>]*>([\s\S]*?)(?:<\/body>|$)/i.exec(withoutComments)?.[1]
    ?? '';
  if (HAS_MEDIA_CONTENT_RE.test(bodyInner)) {
    if (deckArtifactStartsWithMotifSvgDump(withoutComments)) return false;
    const mediaText = visibleTextFromHtmlFragment(bodyInner);
    if (!mediaText || mediaText.length < 8) return false;
    if (DECK_STATUS_PROSE_RE.test(mediaText)) return false;
    return true;
  }
  // Head / <title> chrome is not slide copy — a kit CSS shell with a
  // brief title used to look "salvageable" and persist as a blank body.
  const text = visibleTextFromHtmlFragment(bodyInner);
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
 * Close unmatched slide hosts (`section|div.slide`) so a max_tokens cut in the
 * middle of the first (or last) slide can still be content-scored and persisted.
 * Nested same-tag hosts inside a slide are depth-counted.
 */
export function closeUnclosedSlideSectionsForSalvage(html: string): string {
  if (!html) return html;
  const openRe = new RegExp(SLIDE_HOST_OPEN_RE.source, "gi");
  const opens: { tag: string; openStart: number; contentStart: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    if (!attrsLookLikeSlideHost(match[2] ?? "")) continue;
    opens.push({
      tag: (match[1] ?? "section").toLowerCase(),
      openStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  if (opens.length === 0) return html;

  const insertions: { at: number; text: string }[] = [];
  for (let i = 0; i < opens.length; i += 1) {
    const tag = opens[i]!.tag;
    const contentStart = opens[i]!.contentStart;
    const contentEnd = i + 1 < opens.length ? opens[i + 1]!.openStart : html.length;
    const chunk = html.slice(contentStart, contentEnd);
    let depth = 1;
    const tagRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRe.exec(chunk)) !== null) {
      if (new RegExp(`^<\\/${tag}`, "i").test(tagMatch[0])) {
        depth -= 1;
        if (depth === 0) break;
      } else if (!/^<\//.test(tagMatch[0])) {
        depth += 1;
      }
    }
    if (depth > 0) {
      insertions.push({ at: contentEnd, text: `</${tag}>`.repeat(depth) });
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
    // 1–2 slide titled covers are first-fill drafts, not status prose (§0.76).
    if (isPersistableShortDeckDraft(withoutComments)) return false;
    if (isPersistableShortDeckDraftAfterHeal(withoutComments)) return false;
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
