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

export function slideSectionInnerLooksLikeStatusOnly(innerHtml: string): boolean {
  const text = visibleTextFromHtmlFragment(innerHtml);
  if (!text) return true;
  if (DECK_STATUS_PROSE_RE.test(text)) return true;
  // Leaked streaming tail such as "을 만들고 있어요" without real deck copy.
  if (/^을\s+만들/.test(text) && text.length < 48) return true;
  return false;
}

function slideInnerHasDeliverableCopy(innerHtml: string): boolean {
  if (slideSectionInnerLooksLikeStatusOnly(innerHtml)) return false;
  if (HAS_MEDIA_CONTENT_RE.test(innerHtml)) return true;
  if (/<(?:p|li|td|th|blockquote)\b/i.test(innerHtml) && HAS_VISIBLE_TEXT_IN_SLIDE_RE.test(innerHtml)) {
    return true;
  }
  return visibleTextFromHtmlFragment(innerHtml).length >= 12;
}

/** At least one slide section carries real deliverable content. */
export function hasFilledSlideSection(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  SLIDE_SECTION_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLIDE_SECTION_BLOCK_RE.exec(withoutComments)) !== null) {
    const inner = match[1] ?? "";
    if (slideInnerHasDeliverableCopy(inner)) return true;
  }
  return false;
}

/**
 * Deck salvage/persist gates: refuse prose-only bodies and status sentences
 * that never reached real `<section class="slide">` content.
 */
export function hasSalvageableDeckSlideContent(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (documentContainsSlideSection(withoutComments)) {
    return hasFilledSlideSection(withoutComments);
  }
  if (HAS_MEDIA_CONTENT_RE.test(withoutComments)) return true;
  const text = visibleTextFromHtmlFragment(withoutComments);
  if (!text || text.length < 8) return false;
  if (DECK_STATUS_PROSE_RE.test(text)) return false;
  if (/^을\s+만들/.test(text) && text.length < 48) return false;
  return true;
}

export function isDeckStatusProseOnlyBody(html: string): boolean {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (documentContainsSlideSection(withoutComments)) {
    return !hasFilledSlideSection(withoutComments);
  }
  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(withoutComments);
  const body = bodyMatch ? bodyMatch[1]! : withoutComments;
  const text = visibleTextFromHtmlFragment(body);
  if (!text) return true;
  if (DECK_STATUS_PROSE_RE.test(text)) return true;
  if (/^을\s+만들/.test(text) && text.length < 48) return true;
  return false;
}
