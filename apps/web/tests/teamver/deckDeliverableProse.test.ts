import { describe, expect, it } from 'vitest';

import {
  looksLikeDeckCreateCompletionProse,
  shouldHideDeckCreateCompletionProseOnEditTurn,
} from '../../src/teamver/deckDeliverableProse';

describe('looksLikeDeckCreateCompletionProse', () => {
  it('matches UI create lead and common create claims', () => {
    expect(looksLikeDeckCreateCompletionProse('슬라이드 초안이 생성되었습니다.')).toBe(true);
    expect(looksLikeDeckCreateCompletionProse('The slide deck draft is ready.')).toBe(true);
    expect(looksLikeDeckCreateCompletionProse('I created the slide deck for you.')).toBe(true);
  });

  it('does not match edit/apply claims', () => {
    expect(looksLikeDeckCreateCompletionProse('슬라이드 수정이 반영되었습니다.')).toBe(false);
    expect(looksLikeDeckCreateCompletionProse('Slide updates have been applied.')).toBe(false);
    expect(looksLikeDeckCreateCompletionProse('I updated the slide titles.')).toBe(false);
  });
});

describe('shouldHideDeckCreateCompletionProseOnEditTurn', () => {
  it('hides create prose only on Teamver edit turns', () => {
    expect(
      shouldHideDeckCreateCompletionProseOnEditTurn({
        text: '슬라이드 초안이 생성되었습니다.',
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
    expect(
      shouldHideDeckCreateCompletionProseOnEditTurn({
        text: '슬라이드 초안이 생성되었습니다.',
        isSlideEditTurn: true,
        teamverSlideUi: false,
      }),
    ).toBe(false);
  });
});
