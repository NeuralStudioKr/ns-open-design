/**
 * 루프480 — Heading promises N items, the slide renders fewer.
 *
 * MiniMax writes「4가지 핵심 기능」and then emits three cards (or a pricing tier
 * whose body never arrives). `shrinkOverAllocatedRepeatGrid` rebalances the row
 * so the layout looks intentional, which leaves the *copy* lying: the reader
 * counts three cards under a heading that says four (사용자 리포트 2026-09-08).
 *
 * Two jobs, deliberately split:
 *  - `reconcileHeadingItemCounts` renumbers the heading down to what actually
 *    rendered and records the shortfall on the heading, so the deck never
 *    contradicts itself. It never invents content.
 *  - `findDeckSparseContentEvidence` reads those records (plus title-only
 *    cards) so the host can decide whether the run was truncated and deserves
 *    a top-up turn.
 */

export const HEADING_COUNT_RECONCILED_ATTR = 'data-od-heading-count-reconciled';
/**
 * Recorded instead of a renumber when the heading itself lists the promised
 * items («미적분의 세 기둥: 극한 · 도함수 · 적분»). Counting it down to «두 기둥»
 * would contradict the list that follows the colon, so the copy is left alone
 * and only the shortfall is reported — the top-up turn writes the missing card.
 */
export const HEADING_COUNT_SHORTFALL_ATTR = 'data-od-heading-count-shortfall';

/** Counter words that really do count slide items. */
const HANGUL_COUNTERS = [
  '가지', '개', '단계', '축', '원칙', '기둥', '요소', '포인트', '전략', '이유', '특징', '기능', '스텝',
];
const LATIN_COUNTERS = [
  'features', 'steps', 'pillars', 'ways', 'reasons', 'principles', 'benefits', 'phases',
  'stages', 'points', 'strategies',
];

const HANGUL_NUMERALS: Record<string, number> = {
  한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};
const HANGUL_NUMERAL_WORDS: Record<number, string> = {
  1: '한', 2: '두', 3: '세', 4: '네', 5: '다섯', 6: '여섯', 7: '일곱', 8: '여덟', 9: '아홉', 10: '열',
};

/** Guard rails — a "20가지" list is not a card row we can reason about. */
const MIN_PROMISE = 2;
const MAX_PROMISE = 12;
/** Below this a card body reads as "the model never wrote it". */
const MIN_CARD_BODY_CHARS = 6;

const SLIDE_SECTION_RE = /<section\b[^>]*>[\s\S]*?<\/section>/gi;
const HEADING_RE = /<h([1-3])\b([^>]*)>([\s\S]*?)<\/h\1>/i;

function visibleText(html: string): string {
  return String(html ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

type CountPromise = { value: number; token: string; hangulWord: boolean };

function readHeadingPromise(headingText: string): CountPromise | null {
  const text = visibleText(headingText);
  if (!text) return null;

  const counters = [...HANGUL_COUNTERS, ...LATIN_COUNTERS].join('|');
  const digit = new RegExp(`(\\d{1,2})\\s*(?:${counters})`, 'i').exec(text);
  const digitToken = digit?.[1];
  if (digitToken) {
    const value = Number.parseInt(digitToken, 10);
    if (value >= MIN_PROMISE && value <= MAX_PROMISE) {
      return { value, token: digitToken, hangulWord: false };
    }
    return null;
  }

  const words = Object.keys(HANGUL_NUMERALS).join('|');
  const word = new RegExp(`(${words})\\s*(${HANGUL_COUNTERS.join('|')})`).exec(text);
  const wordToken = word?.[1];
  if (wordToken) {
    const value = HANGUL_NUMERALS[wordToken];
    if (value !== undefined && value >= MIN_PROMISE && value <= MAX_PROMISE) {
      return { value, token: wordToken, hangulWord: true };
    }
  }
  return null;
}

const VOID_TAG_RE =
  /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;

/** Element children of a fragment, as raw outer HTML. */
function elementChildren(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let startIndex = -1;
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(inner))) {
    const closing = tag[1] === '/';
    const name = tag[2] ?? '';
    const selfClosing = tag[4] === '/' || VOID_TAG_RE.test(name);
    if (!closing) {
      if (depth === 0) startIndex = tag.index;
      if (!selfClosing) depth += 1;
      else if (depth === 0) out.push(inner.slice(tag.index, tagRe.lastIndex));
      continue;
    }
    if (depth === 0) continue;
    depth -= 1;
    if (depth === 0 && startIndex >= 0) {
      out.push(inner.slice(startIndex, tagRe.lastIndex));
      startIndex = -1;
    }
  }
  return out;
}

function innerOf(elementHtml: string): string {
  const open = /^<[a-zA-Z][^>]*>/.exec(elementHtml);
  if (!open) return '';
  const closeIndex = elementHtml.lastIndexOf('</');
  if (closeIndex <= open[0].length) return '';
  return elementHtml.slice(open[0].length, closeIndex);
}

type ItemRow = { count: number; children: string[] };

/** The dominant repeated-item container in a slide (card row, grid, or list). */
function findItemRow(slideHtml: string): ItemRow | null {
  let best: ItemRow | null = null;
  const containerRe =
    /<(div|ul|ol)\b((?:"[^"]*"|'[^']*'|[^>"'])*?)>/gi;
  let match: RegExpExecArray | null;
  while ((match = containerRe.exec(slideHtml))) {
    const tag = (match[1] ?? '').toLowerCase();
    const attrs = match[2] ?? '';
    const isList = tag === 'ul' || tag === 'ol';
    const style = /\bstyle\s*=\s*(['"])([\s\S]*?)\1/i.exec(attrs)?.[2] ?? '';
    const rowish = isList
      || /display\s*:\s*(?:grid|flex)/i.test(style)
      || /\b(?:grid|cards|card-row|row|columns)\b/i.test(
        /\bclass\s*=\s*(['"])([\s\S]*?)\1/i.exec(attrs)?.[2] ?? '',
      );
    if (!rowish) continue;

    // Slice out this element's inner HTML by depth-matching its close tag.
    const rest = slideHtml.slice(match.index);
    const openLength = match[0].length;
    let depth = 0;
    const tagRe = new RegExp(`<(/?)(${tag})\\b[^>]*>`, 'gi');
    let inner = '';
    let scan: RegExpExecArray | null;
    while ((scan = tagRe.exec(rest))) {
      if (scan[1] === '/') {
        depth -= 1;
        if (depth === 0) {
          inner = rest.slice(openLength, scan.index);
          break;
        }
      } else {
        depth += 1;
      }
    }
    if (!inner) continue;
    const children = elementChildren(inner).filter((child) => visibleText(child).length > 0);
    if (children.length < 2) continue;
    if (!best || children.length > best.count) {
      best = { count: children.length, children };
    }
  }
  return best;
}

/** Does the heading spell the promised items out after a colon or dash? */
function headingEnumeratesItems(headingText: string, promise: CountPromise): boolean {
  const text = visibleText(headingText);
  const tail = text.split(/[:：—–-]/).slice(1).join(' ').trim() || text;
  const segments = tail
    .split(/[·•,、/|]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return segments.length >= promise.value;
}

function renumberHeading(headingInner: string, promise: CountPromise, actual: number): string {
  const replacement = promise.hangulWord
    ? HANGUL_NUMERAL_WORDS[actual] ?? String(actual)
    : String(actual);
  let done = false;
  return headingInner.replace(
    new RegExp(promise.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    (whole) => {
      if (done) return whole;
      done = true;
      return replacement;
    },
  );
}

/**
 * Renumber headings that promise more items than the slide renders. Records
 * `data-od-heading-count-reconciled="promised:actual"` so the host can still
 * tell a truncated run from a deliberately short one.
 */
export function reconcileHeadingItemCounts(html: string): string {
  const source = String(html ?? '');
  if (!source.trim()) return source;

  return source.replace(SLIDE_SECTION_RE, (slide) => {
    const heading = HEADING_RE.exec(slide);
    if (!heading) return slide;
    const headingAttrs = heading[2] ?? '';
    if (new RegExp(HEADING_COUNT_RECONCILED_ATTR, 'i').test(headingAttrs)) return slide;
    if (new RegExp(HEADING_COUNT_SHORTFALL_ATTR, 'i').test(headingAttrs)) return slide;
    const headingInner = heading[3] ?? '';
    const promise = readHeadingPromise(headingInner);
    if (!promise) return slide;
    const row = findItemRow(slide);
    if (!row || row.count < MIN_PROMISE) return slide;
    if (row.count >= promise.value) return slide;

    const level = heading[1];
    if (headingEnumeratesItems(headingInner, promise)) {
      return slide.replace(
        heading[0],
        `<h${level}${headingAttrs} ${HEADING_COUNT_SHORTFALL_ATTR}="${promise.value}:${row.count}">`
        + `${headingInner}</h${level}>`,
      );
    }

    const nextInner = renumberHeading(headingInner, promise, row.count);
    if (nextInner === headingInner) return slide;
    const attrs = `${headingAttrs} ${HEADING_COUNT_RECONCILED_ATTR}="${promise.value}:${row.count}"`;
    return slide.replace(
      heading[0],
      `<h${level}${attrs}>${nextInner}</h${level}>`,
    );
  });
}

export type DeckSparseContentEvidence = {
  reason: 'heading_count_shortfall' | 'title_only_card';
  detail: string;
  slideIndex: number;
};

/**
 * Evidence that a run stopped short: a heading we had to renumber, or a card
 * that carries a title with no body. Read by the host to decide on a top-up
 * turn — deliberately conservative so a genuinely short deck is left alone.
 */
export function findDeckSparseContentEvidence(
  html: string,
): DeckSparseContentEvidence[] {
  const source = String(html ?? '');
  if (!source.trim()) return [];
  const evidence: DeckSparseContentEvidence[] = [];
  const slides = source.match(SLIDE_SECTION_RE) ?? [];

  slides.forEach((slide, index) => {
    const reconciled = new RegExp(
      `(?:${HEADING_COUNT_RECONCILED_ATTR}|${HEADING_COUNT_SHORTFALL_ATTR})="(\\d+):(\\d+)"`,
      'i',
    ).exec(slide);
    if (reconciled) {
      evidence.push({
        reason: 'heading_count_shortfall',
        detail: `${visibleText(HEADING_RE.exec(slide)?.[3] ?? '')} (${reconciled[1]}→${reconciled[2]})`,
        slideIndex: index,
      });
    }
    const row = findItemRow(slide);
    if (!row) return;
    for (const child of row.children) {
      const text = visibleText(child);
      if (!text) continue;
      const heading = /<(h[1-6]|p|strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(innerOf(child));
      const titleText = visibleText(heading?.[2] ?? '');
      if (!titleText) continue;
      const bodyText = text.slice(titleText.length).trim();
      if (bodyText.length >= MIN_CARD_BODY_CHARS) continue;
      evidence.push({
        reason: 'title_only_card',
        detail: titleText.slice(0, 40),
        slideIndex: index,
      });
      break;
    }
  });

  return evidence;
}
