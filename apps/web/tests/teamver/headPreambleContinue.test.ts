import { describe, expect, it } from 'vitest';
import { listTemplateCloneSlideShells } from '@open-design/contracts';

import { looksLikeHeadOpenedDeckPreamble } from '../../src/artifacts/deck-html-content';
import {
  HEAD_PREAMBLE_CONTINUE_MAX,
  HEAD_PREAMBLE_CONTINUE_SENTINEL,
  buildHeadPreambleContinuePrompt,
  countHeadPreambleBannerEmits,
  countHeadPreambleContinueAttempts,
  decideHeadPreambleRecovery,
  isHeadPreambleContinuePrompt,
  persistPadShortDeckToSeed,
  shouldBlockSecondHeadPreambleContinue,
  shouldEmitHeadPreambleBanner,
} from '../../src/teamver/headPreambleContinue';
import { formatProjectArtifactShortResponsePersistedNotice } from '../../src/teamver/projectErrorMessages';
import { STALLED_HEAD_PREAMBLE_STATUS_CODE } from '../../src/teamver/stalledRunDeckSalvage';
import { excerptPartialHtmlForAutoContinue } from '../../src/runtime/resume';

const headOnly = [
  '작성 중입니다.',
  '<artifact type="deck" identifier="deck">',
  '<!doctype html>',
  '<html lang="ko">',
  '<head>',
  '<style>.slide-1{} .slide-2{} .slide-3{} .slide-4{} .slide-5{} .slide-6{} .slide-7{} .slide-8{} .slide-9{} .slide-10{}</style>',
  '</head>',
].join('\n');

const headPlusTwoSlides = [
  headOnly,
  '<body>',
  '<section class="slide slide-1"><h1>표지</h1><p>리드 문장입니다.</p></section>',
  '<section class="slide slide-2"><h2>본문</h2><p>두 번째 장 본문입니다.</p></section>',
  '</body>',
].join('\n');

function tenShellSeed(): string {
  const slides = Array.from({ length: 10 }, (_, index) => {
    const n = index + 1;
    return `<section class="slide slide-${n}"><h2>Seed ${n}</h2><p>Seed body ${n} with enough copy.</p></section>`;
  }).join('');
  return `<!doctype html><html><body>${slides}</body></html>`;
}

function twoSlideModel(): string {
  return [
    '<!doctype html><html><body>',
    '<section class="slide slide-1"><h1>Teamver 표지</h1><p>팀이 같은 맥락에서 초안을 만듭니다.</p></section>',
    '<section class="slide slide-2"><h2>문제</h2><p>문서가 흩어지면 검토가 늦어집니다.</p></section>',
    '</body></html>',
  ].join('');
}

describe('0917-N25 head preamble continue', () => {
  it('head+style only (0 slides) triggers continue once', () => {
    expect(looksLikeHeadOpenedDeckPreamble(headOnly)).toBe(true);
    expect(decideHeadPreambleRecovery({
      streamedText: headOnly,
      priorHeadPreambleContinues: 0,
    })).toBe('continue');
    expect(HEAD_PREAMBLE_CONTINUE_MAX).toBe(1);
    const prompt = buildHeadPreambleContinuePrompt();
    expect(isHeadPreambleContinuePrompt(prompt)).toBe(true);
    expect(prompt).toContain(HEAD_PREAMBLE_CONTINUE_SENTINEL);
    expect(prompt).toContain('</head> already emitted');
    expect(prompt).toContain('Output ONLY <body> slides starting with <section class="slide"');
    expect(prompt).not.toMatch(/<style>/i);
  });

  it('continue 후에도 슬라이드 0이면 두 번째 continue 없이 fallback', () => {
    expect(decideHeadPreambleRecovery({
      streamedText: headOnly,
      priorHeadPreambleContinues: 1,
    })).toBe('fallback');
    expect(shouldBlockSecondHeadPreambleContinue({
      stillHeadPreamble: true,
      priorHeadPreambleContinues: 1,
    })).toBe(true);
    expect(countHeadPreambleContinueAttempts([
      { role: 'user', content: buildHeadPreambleContinuePrompt() },
    ])).toBe(1);
  });

  it('head+2 slides is not a head-preamble continue', () => {
    expect(looksLikeHeadOpenedDeckPreamble(headPlusTwoSlides)).toBe(false);
    expect(decideHeadPreambleRecovery({
      streamedText: headPlusTwoSlides,
      priorHeadPreambleContinues: 0,
    })).toBe('none');
  });

  it('배너 문구는 같은 생성에서 0회', () => {
    expect(shouldEmitHeadPreambleBanner(0)).toBe(false);
    expect(shouldEmitHeadPreambleBanner(1)).toBe(false);
    expect(countHeadPreambleBannerEmits([
      { events: [{ code: STALLED_HEAD_PREAMBLE_STATUS_CODE }] },
      { events: [{ code: STALLED_HEAD_PREAMBLE_STATUS_CODE }] },
    ])).toBe(2);
    expect(shouldEmitHeadPreambleBanner(
      countHeadPreambleBannerEmits([
        { events: [{ code: STALLED_HEAD_PREAMBLE_STATUS_CODE }] },
      ]),
    )).toBe(false);
  });

  it('generic auto-continue after a head stall counts as the one continue', () => {
    expect(countHeadPreambleContinueAttempts([
      { role: 'assistant', content: headOnly },
      { role: 'user', content: '<!--od:auto_continue_incomplete_output-->\n이어서' },
    ])).toBe(1);
    expect(decideHeadPreambleRecovery({
      streamedText: headOnly,
      priorHeadPreambleContinues: 1,
    })).toBe('fallback');
    expect(decideHeadPreambleRecovery({
      streamedText: '작성 중입니다.\n<artifact type="deck">\n<!-- head kit dump abandoned -->',
      priorHeadPreambleContinues: 0,
    })).toBe('continue');
    expect(decideHeadPreambleRecovery({
      streamedText: '작성 중입니다.\n<artifact type="deck">\n<!-- head kit dump abandoned -->',
      priorHeadPreambleContinues: 1,
    })).toBe('fallback');
  });

  it('head-only (0 slides) forcePad persists the complete seed document', () => {
    const recovered = persistPadShortDeckToSeed({
      seedHtml: tenShellSeed(),
      modelHtml: [
        '<!doctype html><html lang="ko"><head><meta charset="utf-8">',
        `<style>${'.slide-1{} .slide-10{}'.repeat(12)}</style></head>`,
      ].join(''),
      brief: 'Teamver 소개 슬라이드 만들어줘',
      deckTitle: 'Teamver',
    });
    expect(recovered).not.toBeNull();
    expect(recovered!.producedCount).toBe(0);
    expect(listTemplateCloneSlideShells(recovered!.html).length).toBe(10);
    expect(recovered!.html).toMatch(/<\/html\s*>/i);
  });

  it('head-only → continue → 2 slides persist pads to seed 10 with pad marker', () => {
    expect(decideHeadPreambleRecovery({
      streamedText: headOnly,
      priorHeadPreambleContinues: 0,
    })).toBe('continue');
    const afterContinue = twoSlideModel();
    expect(decideHeadPreambleRecovery({
      streamedText: afterContinue,
      priorHeadPreambleContinues: 1,
    })).toBe('none');
    const recovered = persistPadShortDeckToSeed({
      seedHtml: tenShellSeed(),
      modelHtml: afterContinue,
      brief: 'Teamver 소개 슬라이드 만들어줘',
      deckTitle: 'Teamver',
    });
    expect(recovered).not.toBeNull();
    expect(recovered!.producedCount).toBe(2);
    expect(recovered!.paddedCount).toBe(10);
    expect(listTemplateCloneSlideShells(recovered!.html).length).toBe(10);
    expect(recovered!.html).toMatch(/data-teamver-pad="short-response"/);
    const notice = formatProjectArtifactShortResponsePersistedNotice(
      'deck.html',
      10,
      2,
      { paddedCount: recovered!.paddedCount },
    );
    expect(notice).toMatch(/10/);
    expect(notice).not.toMatch(/10 → 2/);
    expect(notice).toMatch(/초안으로 채|filled from the draft/i);
  });

  it('does not re-fence a head-only excerpt for the next request', () => {
    expect(excerptPartialHtmlForAutoContinue(headOnly)).toBe('');
    expect(excerptPartialHtmlForAutoContinue(
      '<!doctype html><html><head><style>.kit{}</style></head>',
    )).toBe('');
  });
});
