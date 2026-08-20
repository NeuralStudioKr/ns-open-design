import { describe, expect, it } from 'vitest';

import {
  looksLikeDeckCreateCompletionProse,
  looksLikeDeckCreateProgressProse,
  looksLikeDeckInFlightStatusResidue,
  shouldHideDeckCreateCompletionProseOnEditTurn,
  shouldHideDeckCreateProgressProseWhenSettled,
  stripDeckInFlightStatusResidue,
} from '../../src/teamver/deckDeliverableProse';

describe('looksLikeDeckCreateCompletionProse', () => {
  it('matches UI create lead and common create claims', () => {
    expect(looksLikeDeckCreateCompletionProse('슬라이드 초안이 생성되었습니다.')).toBe(true);
    expect(looksLikeDeckCreateCompletionProse('The slide deck draft is ready.')).toBe(true);
    expect(looksLikeDeckCreateCompletionProse('I created the slide deck for you.')).toBe(true);
    expect(looksLikeDeckCreateCompletionProse('I built the slide deck for you.')).toBe(true);
    expect(looksLikeDeckCreateCompletionProse('Your slides are ready.')).toBe(true);
    expect(looksLikeDeckCreateCompletionProse('덱을 완성했습니다.')).toBe(true);
    expect(looksLikeDeckCreateCompletionProse('Here is your deck.')).toBe(true);
  });

  it('does not match pure edit/apply claims', () => {
    expect(looksLikeDeckCreateCompletionProse('슬라이드 수정이 반영되었습니다.')).toBe(false);
    expect(looksLikeDeckCreateCompletionProse('Slide updates have been applied.')).toBe(false);
    expect(looksLikeDeckCreateCompletionProse('I updated the slide titles.')).toBe(false);
  });

  it('treats mixed create+edit wording as create mislabel', () => {
    expect(looksLikeDeckCreateCompletionProse('I created and updated the slides.')).toBe(true);
  });
});

describe('looksLikeDeckCreateProgressProse', () => {
  it('matches create-toned in-flight status', () => {
    expect(looksLikeDeckCreateProgressProse('슬라이드 초안을 작성 중입니다. 잠시만 기다려 주세요.')).toBe(true);
    expect(looksLikeDeckCreateProgressProse('Creating the slide deck now. Please wait a moment.')).toBe(true);
    expect(looksLikeDeckCreateProgressProse('making your deck')).toBe(true);
    expect(looksLikeDeckCreateProgressProse('작성 중')).toBe(true);
    expect(looksLikeDeckCreateProgressProse('Writing')).toBe(true);
  });

  it('does not match edit-toned progress', () => {
    expect(looksLikeDeckCreateProgressProse('슬라이드 수정을 반영하고 있습니다.')).toBe(false);
    expect(looksLikeDeckCreateProgressProse('Applying slide updates. Please wait a moment.')).toBe(false);
  });
});

describe('looksLikeDeckInFlightStatusResidue', () => {
  it('matches bare status and synthetic live-lead copy only', () => {
    expect(looksLikeDeckInFlightStatusResidue('작성 중')).toBe(true);
    expect(looksLikeDeckInFlightStatusResidue('수정 반영 중')).toBe(true);
    expect(
      looksLikeDeckInFlightStatusResidue('슬라이드 초안을 작성 중입니다. 잠시만 기다려 주세요.'),
    ).toBe(true);
    expect(
      looksLikeDeckInFlightStatusResidue('슬라이드 수정을 반영하고 있습니다. 잠시만 기다려 주세요.'),
    ).toBe(true);
  });

  it('does not match long progressive explanations', () => {
    expect(
      looksLikeDeckInFlightStatusResidue(
        '신입사원 온보딩 흐름에 맞춰 핵심 업무와 협업 문화를 담은 덱을 작성하고 있습니다.',
      ),
    ).toBe(false);
  });
});

describe('stripDeckInFlightStatusResidue', () => {
  it('removes status lines and keeps explanations', () => {
    expect(stripDeckInFlightStatusResidue('작성 중')).toBe('');
    expect(
      stripDeckInFlightStatusResidue('작성 중\n\n표지 다음에 문제 정의를 두었어요.'),
    ).toBe('표지 다음에 문제 정의를 두었어요.');
  });
});

describe('shouldHideDeckCreateProgressProseWhenSettled', () => {
  it('hides residue-only prose after the stream settles on Teamver slide UI', () => {
    expect(
      shouldHideDeckCreateProgressProseWhenSettled({
        text: '작성 중',
        streaming: false,
        teamverSlideUi: true,
      }),
    ).toBe(true);
    expect(
      shouldHideDeckCreateProgressProseWhenSettled({
        text: '작성 중',
        streaming: true,
        teamverSlideUi: true,
      }),
    ).toBe(false);
    expect(
      shouldHideDeckCreateProgressProseWhenSettled({
        text: '작성 중',
        streaming: false,
        teamverSlideUi: false,
      }),
    ).toBe(false);
    expect(
      shouldHideDeckCreateProgressProseWhenSettled({
        text: '신입사원 온보딩 흐름에 맞춰 핵심 업무와 협업 문화를 담은 덱을 작성하고 있습니다.',
        streaming: false,
        teamverSlideUi: true,
      }),
    ).toBe(false);
  });
});

describe('shouldHideDeckCreateCompletionProseOnEditTurn', () => {
  it('hides create completion and progress only on Teamver edit turns', () => {
    expect(
      shouldHideDeckCreateCompletionProseOnEditTurn({
        text: '슬라이드 초안이 생성되었습니다.',
        isSlideEditTurn: true,
        teamverSlideUi: true,
      }),
    ).toBe(true);
    expect(
      shouldHideDeckCreateCompletionProseOnEditTurn({
        text: '슬라이드 초안을 작성 중입니다.',
        isSlideEditTurn: true,
        teamverSlideUi: true,
      }),
    ).toBe(true);
    expect(
      shouldHideDeckCreateCompletionProseOnEditTurn({
        text: '슬라이드 초안이 생성되었습니다.',
        isSlideEditTurn: false,
        teamverSlideUi: true,
      }),
    ).toBe(false);
  });
});
