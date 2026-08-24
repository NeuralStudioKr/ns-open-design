import type { Artifact, ChatMessage } from '../types';
import { validateHtmlArtifact } from './validate';

export { EMERGENCY_DECK_FALLBACK_STATUS_CODE } from '../runtime/deliverable-lifecycle-codes';

export type EmergencySlide = {
  title: string;
  body?: string;
};

const SLIDE_LINE_RE =
  /^\s*(?:(?:\d+)[\.\)]\s*|(?:0?\d{1,2})\s+|슬라이드\s*\d+\s*[:\.\-]\s*|#{1,3}\s+)(.+)$/i;

const OUTLINE_SECTION_RE =
  /(?:슬라이드\s*(?:구성|목차|개요)|slide\s*(?:outline|structure|plan)|deck\s*outline)/i;

const ARTIFACT_OR_FORM_RE = /<(?:artifact|question-form)\b/i;

function cleanSlideTitle(title: string): string {
  return title
    .replace(/^["'`]|["'`]$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeSlides(slides: EmergencySlide[]): EmergencySlide[] {
  const seen = new Set<string>();
  const out: EmergencySlide[] = [];
  for (const slide of slides) {
    const key = slide.title.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(slide);
  }
  return out;
}

/** True when prose looks like a numbered slide outline without an HTML deliverable. */
export function looksLikeSlideOutline(text: string): boolean {
  return extractSlideOutlineItems(text).length >= 3;
}

const CANVAS_SOURCE_HEADINGS_MARKER_RE =
  /(?:Visible headings|Canvas headings|Source headings)\s*[:：]\s*/i;

/**
 * Trailing Canvas / Drive brief fields sometimes land on the same compacted
 * line as `Visible headings:` (run prompt used to collapse newlines). Stop
 * the payload before those so "Source preview: …" is not treated as a title.
 */
const CANVAS_SOURCE_HEADINGS_PAYLOAD_STOP_RE =
  /\s+(?:Source preview|Canvas title|Canvas sections|Drive source(?: file| MIME)?|Drive asset id)\s*[:：]/i;

/**
 * Split a Canvas / Drive source brief "Visible headings: A / B / C" payload
 * into slide title candidates. The Canvas one-confirm compose collapses the
 * page's `<h1>`/`<h2>` list into a single ` / `-separated string; when the
 * agent never emits a usable HTML deck, those headings are our best (and
 * often only) outline signal for a graceful fallback deck.
 */
function parseCanvasSourceHeadingPayload(payload: string): EmergencySlide[] {
  const cleaned = payload.replace(CANVAS_SOURCE_HEADINGS_PAYLOAD_STOP_RE, '\n').split('\n')[0]?.trim()
    ?? '';
  if (!cleaned) return [];
  // Match `canvasCreateSlidesSourceBrief` which joins with " / ". Split ONLY
  // on " / " (spaces around slash) so headings that contain a middle-dot,
  // pipe, or bullet inside a single title (e.g. "지리 · 기본정보") stay whole.
  const parts = cleaned
    .split(/\s+\/\s+/)
    .map(cleanSlideTitle)
    .filter((title) => title.length > 1 && !looksLikeProgressOrFragmentTopic(title))
    .slice(0, 12);
  return parts.map((title) => ({ title }));
}

function extractCanvasSourceHeadingSlides(line: string): EmergencySlide[] {
  const match = line.match(
    /^\s*(?:Visible headings|Canvas headings|Source headings)\s*[:：]\s*(.+)$/i,
  );
  const payload = match?.[1]?.trim();
  if (!payload) return [];
  return parseCanvasSourceHeadingPayload(payload);
}

/**
 * Recover Canvas headings even when the source brief was whitespace-collapsed
 * into one line (`Canvas title: … Visible headings: A / B / C Source preview:`).
 * Line-anchored extractors miss that shape and outline fallback used to fail
 * after incomplete-html-document-shell.
 */
function extractCanvasSourceHeadingSlidesFromText(text: string): EmergencySlide[] {
  const match = CANVAS_SOURCE_HEADINGS_MARKER_RE.exec(text);
  if (!match || match.index == null) return [];
  const payload = text.slice(match.index + match[0].length);
  return parseCanvasSourceHeadingPayload(payload);
}

/** Parse slide titles from assistant plan/outline prose. */
export function extractSlideOutlineItems(text: string): EmergencySlide[] {
  const source = String(text || '');
  const lines = source.split(/\r?\n/);
  const slides: EmergencySlide[] = [];
  let inOutlineSection = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (ARTIFACT_OR_FORM_RE.test(line)) break;
    if (OUTLINE_SECTION_RE.test(line)) {
      inOutlineSection = true;
      continue;
    }

    // Canvas / Drive source brief always ships an inline
    // "Visible headings: A / B / C" line — treat those as slide-title
    // candidates so the emergency fallback can build a deck out of them
    // even when the assistant never produced HTML or a numbered outline.
    const canvasHeadings = extractCanvasSourceHeadingSlides(line);
    if (canvasHeadings.length >= 2) {
      slides.push(...canvasHeadings);
      continue;
    }

    const numbered = line.match(SLIDE_LINE_RE);
    if (numbered?.[1]) {
      const title = cleanSlideTitle(numbered[1]);
      if (title.length > 1) slides.push({ title });
      continue;
    }

    if (inOutlineSection) {
      const bullet = line.match(/^\s*[-*•]\s+(.+)$/);
      if (bullet?.[1]) {
        const title = cleanSlideTitle(bullet[1]);
        if (title.length > 1) slides.push({ title });
      }
    }
  }

  // Compacted Canvas→Slide prompts put "Visible headings:" mid-line. If the
  // per-line pass found nothing usable, recover from the full text once.
  if (slides.length < 3) {
    const compacted = extractCanvasSourceHeadingSlidesFromText(source);
    if (compacted.length >= 2) {
      slides.push(...compacted);
    }
  }

  return dedupeSlides(slides);
}

/** Reject progress sentences / particle fragments mistaken for deck titles. */
function looksLikeProgressOrFragmentTopic(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  // "덱을 만들고 있어요" → capture group often becomes "을 만들고 있어요".
  if (/^(?:을|를|이|가|은|는|의|과|와|로|으로)\s/.test(t)) return true;
  if (
    /(?:고\s*있어요|고\s*있습니다|중이에요|중입니다|생성\s*중|작성\s*중|만들고\s*있|생성하고|작성하고|작업\s*중|진행\s*중)/i
      .test(t)
  ) {
    return true;
  }
  return false;
}

function inferTopicFromHostRequest(text: string): string | null {
  const host = text.match(/https?:\/\/(?:www\.)?([a-z0-9-]+)\.[^\s/]+/i)?.[1];
  if (!host) return null;
  if (!/(?:회사|소개|발표|슬라이드|덱|피피티|ppt|presentation|deck|slides?)/i.test(text)) {
    return null;
  }
  const brand = host
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return /[가-힣]/.test(text) ? `${brand} 회사 소개` : `${brand} company overview`;
}

function inferTopicFromText(text: string): string | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const fromHost = inferTopicFromHostRequest(trimmed);
  if (fromHost) return fromHost;

  // Require an explicit topic marker or colon so "덱을 만들고 있어요" does not
  // treat the particle+verb tail as the deck title.
  const ko = trimmed.match(
    /(?:프레젠테이션|발표\s*자료|슬라이드|피피티|덱)(?:\s*(?:주제|제목|about))\s*[:：]?\s*["']?([^"'\n.]{4,80})|(?:프레젠테이션|발표\s*자료|슬라이드|피피티|덱)\s*[:：]\s*["']?([^"'\n.]{4,80})/i,
  );
  const koTitle = cleanSlideTitle(ko?.[1] || ko?.[2] || '');
  if (koTitle && !looksLikeProgressOrFragmentTopic(koTitle)) return koTitle;

  const en = trimmed.match(
    /(?:presentation|deck|slides?)\s+(?:about|on|for)\s+["']?([^"'\n.]{4,80})/i,
  );
  if (en?.[1]) {
    const title = cleanSlideTitle(en[1]);
    if (!looksLikeProgressOrFragmentTopic(title)) return title;
  }

  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim().length > 4);
  if (!firstLine) return null;
  const cleaned = firstLine.replace(/^\[form answers[^\]]*\]\s*/i, '').trim();
  if (cleaned.length < 4 || cleaned.length > 80) return null;
  if (looksLikeProgressOrFragmentTopic(cleaned)) return null;
  return cleaned;
}

function inferDeckTitleFromMessages(messages: readonly ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'user' || !message.content?.trim()) continue;
    // Auto-continue prompts are not topic sources.
    if (/\[Deliverable instruction\]/i.test(message.content)) continue;
    const topic = inferTopicFromText(message.content);
    if (topic) return topic;
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSlideBody(slide: EmergencySlide, lang: string): string {
  if (slide.body?.trim()) {
    const lines = slide.body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
    }
    return `<p>${escapeHtml(lines[0] ?? slide.body)}</p>`;
  }
  return lang === 'ko'
    ? `<p>${escapeHtml(slide.title)}에 대한 핵심 내용을 정리합니다.</p>`
    : `<p>Key points for ${escapeHtml(slide.title)}.</p>`;
}

/**
 * Build an HTML deck from an explicit slide outline.
 *
 * Product rule: never invent a generic six-slide skeleton from thin prose —
 * that path previously marked junk decks as succeeded and blocked auto-continue.
 * Callers that need a deliverable after a failed model turn must salvage
 * model-authored HTML or retry; they must not call this with progress chatter.
 */
export function buildEmergencySlideDeckFromOutline(
  outlineText: string,
  options?: { deckTitle?: string; lang?: string },
): string | null {
  const source = String(outlineText || '').trim();
  if (!source) return null;

  const slides = extractSlideOutlineItems(source);
  // Require a real multi-slide outline. Thin progress text used to fall through
  // to buildStandardSixSlides() and ship placeholder copy as a "success".
  if (slides.length < 3) return null;

  const lang = options?.lang || (/[가-힣]/.test(source) ? 'ko' : 'en');
  const topic = options?.deckTitle?.trim() || inferTopicFromText(source) || (lang === 'ko' ? '발표 자료' : 'Presentation');
  const deckTitle = options?.deckTitle?.trim() || slides[0]?.title || topic;
  const sections = slides
    .map((slide) => {
      const heading = escapeHtml(slide.title);
      return `<section class="slide"><h1>${heading}</h1>${renderSlideBody(slide, lang)}</section>`;
    })
    .join('\n  ');

  const html = `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1920, initial-scale=1, maximum-scale=1" />
  <title>${escapeHtml(deckTitle)}</title>
  <style>
    @page { size: 13.333333in 7.5in; margin: 0; }
    html, body { margin: 0; width: 1920px; background: #0b0c10; color: #1c1b1a; font: 18px/1.5 system-ui, sans-serif; }
    .slide { width: 1920px; height: 1080px; padding: 96px 112px; box-sizing: border-box; background: #fff; overflow: hidden; page-break-after: always; break-after: page; }
    .slide:last-child { page-break-after: auto; break-after: auto; }
    .slide h1 { font-size: 48px; margin: 0 0 16px; line-height: 1.1; }
    .slide p, .slide li { font-size: 20px; max-width: 48rem; }
    .slide ul { margin: 12px 0 0; padding-left: 1.25rem; }
  </style>
</head>
<body>
  ${sections}
</body>
</html>`;

  return validateHtmlArtifact(html).ok ? html : null;
}

function assistantTextFromMessage(message: Pick<ChatMessage, 'content' | 'events'>): string {
  const parts: string[] = [];
  if (message.content?.trim()) parts.push(message.content);
  for (const event of message.events ?? []) {
    if ((event.kind === 'text' || event.kind === 'thinking') && typeof event.text === 'string') {
      parts.push(event.text);
    }
  }
  return parts.join('\n');
}

/** Gather the richest outline text from a conversation for emergency deck synthesis. */
export function collectSlideOutlineFromMessages(
  messages: readonly ChatMessage[],
): string {
  const chunks: string[] = [];
  for (const message of messages) {
    if (message.role === 'user' && message.content?.trim()) {
      chunks.push(message.content);
    }
    if (message.role === 'assistant') {
      const text = assistantTextFromMessage(message);
      if (text.trim()) chunks.push(text);
    }
  }
  return chunks.join('\n\n');
}

/** Build a persistable emergency artifact from conversation outline prose. */
export function buildEmergencyArtifactFromMessages(
  messages: readonly ChatMessage[],
  finalText?: string | null,
): Artifact | null {
  const outline = [collectSlideOutlineFromMessages(messages), finalText?.trim() ?? '']
    .filter(Boolean)
    .join('\n\n');
  const deckTitle = inferDeckTitleFromMessages(messages) || undefined;
  const html = buildEmergencySlideDeckFromOutline(outline, { deckTitle });
  if (!html) return null;
  return {
    identifier: 'deck',
    artifactType: 'deck',
    title: 'deck',
    html,
  };
}
