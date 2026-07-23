import { describe, expect, it } from 'vitest';

import { createArtifactParser } from '../../src/artifacts/parser';
import { isIncompleteHtmlDocumentShell, validateHtmlArtifact } from '../../src/artifacts/validate';
import { recoverBestHtmlDocumentFromText } from '../../src/artifacts/recover';
import {
  resolveTerminalArtifactToPersist,
  shouldFailSlideRunForMissingHtmlDeliverable,
} from '../../src/components/ProjectView';

/** Minimal slice of the user's complete marketing deck stream pattern. */
function buildMarketingDeckHtml(): string {
  return [
    '<!doctype html><html lang="ko">',
    '<body style="margin:0;font-family:sans-serif">',
    '<section class="slide" data-screen-label="01 Cover" style="min-height:100vh">',
    '<h1>2026년 상반기 마케팅 전략</h1>',
    '<p>시장 기회를 선점하고 채널 효율을 극대화하는 전략 청사진</p>',
    '</section>',
    '<section class="slide" data-screen-label="08 Roadmap" style="min-height:100vh">',
    '<h2>실행 로드맵</h2>',
    '<ul><li>스택 통합 완료</li><li>SEO 1차 런칭</li><li>H1 결산</li></ul>',
    '</section>',
    '<style>',
    'html,body{margin:0;scroll-snap-type:x mandatory;display:flex;overflow-x:auto;width:100vw}',
    '.slide{min-width:100vw;scroll-snap-align:start;min-height:100vh}',
    '</style>',
    '</body></html>',
  ].join('');
}

function parseStreamedDeckArtifact(wrapped: string): string | null {
  const parser = createArtifactParser();
  let content: string | null = null;
  for (const ev of parser.feed(wrapped)) {
    if (ev.type === 'artifact:end') content = ev.fullContent;
  }
  for (const ev of parser.flush()) {
    if (ev.type === 'artifact:end') content = ev.fullContent;
  }
  return content;
}

describe('complete API deck stream (user reproduction)', () => {
  const html = buildMarketingDeckHtml();
  const wrapped = `<artifact type="deck" identifier="deck">${html}</artifact>`;

  it('parses a closed deck artifact with trailing in-body style', () => {
    const parsed = parseStreamedDeckArtifact(wrapped);
    expect(parsed).toContain('</html>');
    expect(validateHtmlArtifact(parsed!)).toEqual({ ok: true });
    expect(isIncompleteHtmlDocumentShell(parsed!)).toBe(false);
  });

  it('resolves terminal persist candidate from the wrapped stream', () => {
    const parsed = parseStreamedDeckArtifact(wrapped);
    const artifact = {
      identifier: 'deck',
      artifactType: 'deck',
      title: '',
      html: parsed!,
    };
    const resolved = resolveTerminalArtifactToPersist(artifact, wrapped, () => null);
    expect(resolved?.html).toContain('마케팅 전략');
    expect(isIncompleteHtmlDocumentShell(resolved!.html!)).toBe(false);
  });

  it('recovers the deck from raw assistant text when the parser buffer was flushed late', () => {
    expect(recoverBestHtmlDocumentFromText(wrapped)).toContain('마케팅 전략');
  });

  it('does not fail when a valid streamed deck is present even if disk verify lags', () => {
    const parsed = parseStreamedDeckArtifact(wrapped)!;
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: { html: parsed },
        liveHtml: parsed,
        finalText: wrapped,
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(false);
  });

  it('does not fail when persist landed a previewable html file', () => {
    const parsed = parseStreamedDeckArtifact(wrapped)!;
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: 'deck.html',
        parsedArtifact: { html: parsed },
        liveHtml: parsed,
        finalText: wrapped,
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(false);
  });

  it('still fails when only plan prose streamed with no artifact html', () => {
    expect(
      shouldFailSlideRunForMissingHtmlDeliverable({
        slideOnlyMvp: true,
        producedHtmlToOpen: null,
        parsedArtifact: null,
        liveHtml: '',
        finalText: '기업 AI 도입 효과에 대한 프레젠테이션을 바로 제작하겠습니다.',
        terminalArtifactPersistFailed: false,
      }),
    ).toBe(true);
  });
});
