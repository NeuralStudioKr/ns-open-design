import { describe, expect, it } from 'vitest';

import {
  looksLikeDeckDeliverablePromiseProse,
  looksLikePrematureDeckCompletionProse,
} from '../../src/teamver/deckDeliverableProse';

describe('deckDeliverableProse', () => {
  it('detects past-tense deck completion claims during streaming', () => {
    expect(
      looksLikePrematureDeckCompletionProse(
        '친근한 톤의 개발자 포트폴리오 2슬라이드 덱을 만들었어요!',
      ),
    ).toBe(true);
    expect(
      looksLikePrematureDeckCompletionProse('Created the presentation deck.'),
    ).toBe(true);
    expect(
      looksLikePrematureDeckCompletionProse('슬라이드를 완성했습니다.'),
    ).toBe(true);
  });

  it('keeps in-progress deck status prose visible during streaming', () => {
    expect(
      looksLikePrematureDeckCompletionProse(
        '신입사원 온보딩 흐름에 맞춰 핵심 업무와 협업 문화를 담은 덱을 작성하고 있습니다.',
      ),
    ).toBe(false);
    expect(
      looksLikePrematureDeckCompletionProse(
        '기업 AI 도입 효과에 대한 프레젠테이션을 바로 제작하겠습니다.',
      ),
    ).toBe(false);
    expect(
      looksLikePrematureDeckCompletionProse(
        '슬라이드 레이아웃을 완성하겠습니다.',
      ),
    ).toBe(false);
  });

  it('does not treat explanatory deck chat as premature completion', () => {
    expect(
      looksLikePrematureDeckCompletionProse(
        '이 슬라이드는 ROI와 비용 절감 메시지를 한 장에 함께 보여주는 구조입니다.',
      ),
    ).toBe(false);
  });

  it('shares promise/completion detection with terminal slide-only gates', () => {
    expect(looksLikeDeckDeliverablePromiseProse('바로 만들어 드리겠습니다!')).toBe(true);
    expect(
      looksLikeDeckDeliverablePromiseProse(
        '이 슬라이드는 ROI와 비용 절감 메시지를 한 장에 함께 보여주는 구조입니다.',
      ),
    ).toBe(false);
  });
});
