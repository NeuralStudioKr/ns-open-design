import { describe, expect, it } from 'vitest';

import {
  isLargeSlideCountShortfall,
  isShortResponseAutoRetryPrompt,
  renderShortResponseAutoRetryPrompt,
  shouldAutoRetryShortSlideResponse,
} from '../../src/teamver/shortResponseAutoRetry';
import {
  applyQuantitativeSlideCountInstruction,
  buildTemplateClonePromptFillSeed,
  templateCloneContentFillHardRules,
} from '../../src/teamver/templateCloneContentFill';
import { SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION } from '@open-design/contracts';

describe('루프550 short-response auto-retry decision', () => {
  it('seed 10 + first 2 → auto-retry', () => {
    expect(shouldAutoRetryShortSlideResponse({
      seedCount: 10,
      returnedCount: 2,
      requestedSlideCount: 10,
      alreadyRetried: false,
      scopedEdit: false,
      isCreateOrFullFill: true,
    })).toBe(true);
    expect(isLargeSlideCountShortfall({ seedCount: 10, returnedCount: 2 })).toBe(true);
  });

  it('retry that still returns 2 is not retried again', () => {
    expect(shouldAutoRetryShortSlideResponse({
      seedCount: 10,
      returnedCount: 2,
      requestedSlideCount: 10,
      alreadyRetried: true,
      scopedEdit: false,
      isCreateOrFullFill: true,
    })).toBe(false);
  });

  it('unspecified 3 slides does not retry', () => {
    expect(shouldAutoRetryShortSlideResponse({
      seedCount: 10,
      returnedCount: 3,
      requestedSlideCount: null,
      alreadyRetried: false,
      scopedEdit: false,
      isCreateOrFullFill: true,
    })).toBe(false);
  });

  it('scoped 1 slide does not retry', () => {
    expect(shouldAutoRetryShortSlideResponse({
      seedCount: 10,
      returnedCount: 1,
      requestedSlideCount: 10,
      alreadyRetried: false,
      scopedEdit: true,
      isCreateOrFullFill: true,
    })).toBe(false);
  });

  it('renders the retry prompt with M and N', () => {
    const prompt = renderShortResponseAutoRetryPrompt({
      returnedCount: 2,
      seedCount: 10,
    });
    expect(prompt).toBe(
      'The previous response returned only 2 slides. Seed contains 10 slides. Return EXACTLY 10 <section class="slide">.',
    );
    expect(isShortResponseAutoRetryPrompt(prompt)).toBe(true);
  });
});

describe('루프550 quantitative slide-count prompt pins', () => {
  it('prompt-fill seed with seedShellCount 10 pins Return EXACTLY / Seed contains', () => {
    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: '10장짜리 서비스 소개 슬라이드 만들어줘',
      templateTitle: 'Html Ppt Zhangzara Daisy Days',
      slideCountHint: '10',
      seedShellCount: 10,
    });
    expect(seed).toContain('Return EXACTLY 10');
    expect(seed).toContain('Seed contains 10');
    expect(seed).not.toContain(SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION);
  });

  it('hard rules with seedShellCount 10 pin the same phrases', () => {
    const joined = templateCloneContentFillHardRules({ seedShellCount: 10 }).join('\n');
    expect(joined).toContain('Return EXACTLY 10');
    expect(joined).toContain('Seed contains 10');
  });

  it('null seedShellCount keeps the v1.4.15 fallback constant', () => {
    const seed = buildTemplateClonePromptFillSeed({
      userInstruction: '글을 매력적으로 쓰는 팁 정리해줘',
      slideCountHint: '6-8',
    });
    expect(seed).toContain(SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION);
    expect(templateCloneContentFillHardRules().join('\n')).toContain(
      SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION,
    );
  });

  it('handleSend helper replaces the fallback constant once N is known', () => {
    const before = [
      'Create the deck.',
      SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION,
    ].join('\n');
    const after = applyQuantitativeSlideCountInstruction(before, 10);
    expect(after).toContain('Return EXACTLY 10');
    expect(after).toContain('Seed contains 10');
    expect(after).not.toContain(SLIDE_DECK_KEEP_SLIDE_COUNT_INSTRUCTION);
  });
});
