/**
 * Class-token helpers for deck slide hosts vs chrome.
 *
 * `\bslide\b` matches the prefix of `slide-counter` / `slide-chrome` because
 * `-` is a word boundary. Catalog PreviewModal then treats inner chrome as a
 * body-first slide, flips official presenters onto the compact letterbox
 * path, pins wrappers to 1920×1080, and host `display:none` blanks page 2+.
 *
 * Host tokens are an allowlist: `slide`, `ppt-slide`, `deck-slide`, `slide-N`.
 * Do not treat every `slide-*` class as a page — Studio/Signal nest
 * `slide-chrome` / `slide-body` / `slide-foot` / `slide-inner` inside each page.
 */

/** Documented chrome / wrappers — never hosts, even if a caller reintroduces prefix matching. */
export const DECK_SLIDE_CHROME_CLASS_TOKENS = new Set([
  'slide-counter',
  'slide-number',
  'slide-num',
  'slide-nav',
  'slides-container',
  'slide-progress',
  'slide-hint',
  'slide-deck',
  'slide-wrap',
  'slide-wrapper',
  'slide-host',
  'slide-stage',
  'slide-track',
  'slide-row',
  'slide-strip',
  'slide-list',
  'slide-chrome',
  'slide-body',
  'slide-foot',
  'slide-footer',
  'slide-header',
  'slide-meta',
  'slide-content',
  'slide-inner',
]);

/**
 * `.slide {` / `.slide.active` — not `.slide-chrome` / `.slide-counter`.
 * CSS `.slide\b` is unsafe: `-` is a word boundary.
 */
export const DECK_SLIDE_HOST_CSS_CLASS = String.raw`\.slide(?![\w-])`;

export function isDeckSlideClassToken(token: string): boolean {
  const normalized = String(token ?? '').trim().toLowerCase();
  if (!normalized || DECK_SLIDE_CHROME_CLASS_TOKENS.has(normalized)) return false;
  if (
    normalized === 'slide'
    || normalized === 'ppt-slide'
    || normalized === 'deck-slide'
    || normalized === 'slide-frame'
  ) {
    return true;
  }
  return /^slide-\d+$/.test(normalized);
}

export function classAttrHasDeckSlideToken(classAttr: string): boolean {
  return String(classAttr ?? '').split(/\s+/).some(isDeckSlideClassToken);
}

export function classAttrFromOpenTag(openOrAttrs: string): string {
  return /\bclass\s*=\s*(["'])([\s\S]*?)\1/i.exec(String(openOrAttrs ?? ''))?.[2] ?? '';
}

export function openTagHasDeckSlideClass(openOrAttrs: string): boolean {
  return classAttrHasDeckSlideToken(classAttrFromOpenTag(openOrAttrs));
}

const SLIDE_HOST_OPEN_RE =
  /<(section|div|main|article)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/** Count page hosts only — ignores `slide-chrome` / `slide-counter` wrappers. */
export function countDeckSlideHostOpens(html: string): number {
  let n = 0;
  SLIDE_HOST_OPEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLIDE_HOST_OPEN_RE.exec(String(html ?? ''))) !== null) {
    if (classAttrHasDeckSlideToken(classAttrFromOpenTag(match[2] ?? ''))) n += 1;
  }
  return n;
}

/** Author CSS hides inactive pages; host display:none traps native next. */
export function looksLikeAuthorClassToggleDeck(html: string): boolean {
  const dest = String(html ?? '');
  if (!dest) return false;
  const host = DECK_SLIDE_HOST_CSS_CLASS;
  if (
    new RegExp(`${host}[^{]*\\{[^}]*opacity\\s*:\\s*0`, 'i').test(dest)
    && /\.slide\.(?:active|is-active|current)(?![\w-])[^{]*\{[^}]*opacity\s*:\s*1/i.test(dest)
  ) {
    return true;
  }
  return (
    new RegExp(`${host}[^{]*\\{[^}]*display\\s*:\\s*none`, 'i').test(dest)
    && /\.slide\.(?:active|is-active|current)(?![\w-])[^{]*\{[^}]*display\s*:\s*(?:flex|block|grid)/i.test(dest)
  );
}
