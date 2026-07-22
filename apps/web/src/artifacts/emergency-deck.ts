import type { Artifact, ChatMessage } from '../types';
import { validateHtmlArtifact } from './validate';

export const EMERGENCY_DECK_FALLBACK_STATUS_CODE = 'emergency_deck_fallback';

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

/** Parse slide titles from assistant plan/outline prose. */
export function extractSlideOutlineItems(text: string): EmergencySlide[] {
  const lines = String(text || '').split(/\r?\n/);
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

  return dedupeSlides(slides);
}

function inferTopicFromText(text: string): string | null {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const ko = trimmed.match(
    /(?:프레젠테이션|발표\s*자료|슬라이드|피피티|덱)(?:\s*(?:주제|제목|about))?\s*[:：]?\s*["']?([^"'\n.]{4,80})/i,
  );
  if (ko?.[1]) return cleanSlideTitle(ko[1]);
  const en = trimmed.match(
    /(?:presentation|deck|slides?)\s+(?:about|on|for)\s+["']?([^"'\n.]{4,80})/i,
  );
  if (en?.[1]) return cleanSlideTitle(en[1]);
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim().length > 4);
  if (!firstLine) return null;
  const cleaned = firstLine.replace(/^\[form answers[^\]]*\]\s*/i, '').trim();
  return cleaned.length >= 4 && cleaned.length <= 80 ? cleaned : null;
}

function buildStandardSixSlides(topic: string): EmergencySlide[] {
  return [
    { title: topic, body: '발표 개요' },
    { title: '배경 및 문제', body: `${topic}의 핵심 맥락과 해결해야 할 과제를 정리합니다.` },
    { title: '핵심 메시지', body: '청중이 기억해야 할 한 가지 메시지를 명확히 전달합니다.' },
    { title: '근거 및 사례', body: '데이터, 사례, 비교를 통해 메시지를 뒷받침합니다.' },
    { title: '실행 방안', body: '다음 단계와 실행 계획을 구체적으로 제시합니다.' },
    { title: '마무리', body: '핵심 요약과 다음 행동을 제안합니다.' },
  ];
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
 * Synthesize a minimal but valid HTML slide deck from plan/outline prose when
 * the model never shipped a previewable artifact after auto-continue retries.
 */
export function buildEmergencySlideDeckFromOutline(
  outlineText: string,
  options?: { deckTitle?: string; lang?: string },
): string | null {
  const source = String(outlineText || '').trim();
  if (!source) return null;

  let slides = extractSlideOutlineItems(source);
  const lang = options?.lang || (/[가-힣]/.test(source) ? 'ko' : 'en');
  const topic = options?.deckTitle?.trim() || inferTopicFromText(source) || (lang === 'ko' ? '발표 자료' : 'Presentation');

  if (slides.length < 2) {
    slides = buildStandardSixSlides(topic);
  } else if (slides.length < 6) {
    while (slides.length < 6) {
      slides.push({
        title: lang === 'ko' ? '추가 슬라이드' : 'Additional slide',
        body: lang === 'ko' ? '세부 내용을 보완하세요.' : 'Add supporting details here.',
      });
    }
  }

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
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(deckTitle)}</title>
  <style>
    html, body { margin: 0; background: #0b0c10; color: #1c1b1a; font: 18px/1.5 system-ui, sans-serif; }
    .slide { min-height: 100vh; padding: 64px 72px; box-sizing: border-box; background: #fff; page-break-after: always; }
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
  const html = buildEmergencySlideDeckFromOutline(outline);
  if (!html) return null;
  return {
    identifier: 'deck',
    artifactType: 'deck',
    title: 'deck',
    html,
  };
}
