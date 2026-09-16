import { describe, expect, it } from 'vitest';

import {
  classifyTooShortHtmlSnippet,
  decideTooShortHtmlPersistRecovery,
  isLargeSlideCountShortfall,
  isShortResponseAutoRetryPrompt,
  parseTooShortHtmlCharCount,
  renderShortResponseAutoRetryPrompt,
  renderTooShortHtmlAutoRetryPrompt,
  shouldAutoRetryShortSlideResponse,
  shouldAutoRetryTooShortHtmlResponse,
} from '../../src/teamver/shortResponseAutoRetry';
import { resolveTooShortHtmlArtifactPersist } from '../../src/teamver/tooShortHtmlPersist';
import {
  isTooShortHtmlArtifact,
  validateHtmlArtifact,
} from '../../src/artifacts/validate';
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

describe('루프552 too-short HTML persist recovery', () => {
  const thirtyTwo = "I'll generate the slides now!!".padEnd(32, '!');

  it('classifies a 32-char self-talk response as too short', () => {
    expect(thirtyTwo.length).toBe(32);
    expect(isTooShortHtmlArtifact(thirtyTwo)).toBe(true);
    const validation = validateHtmlArtifact(thirtyTwo);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.reason).toMatch(/got 32 chars, need ≥64/);
    }
    expect(classifyTooShortHtmlSnippet(thirtyTwo)).toMatchObject({
      length: 32,
      kind: 'self-talk',
    });
  });

  it('32자 + LOOK seed → 재시도 트리거', () => {
    expect(decideTooShortHtmlPersistRecovery({
      alreadyRetried: false,
      scopedEdit: false,
      isCreateOrFullFill: true,
      hasLookSeed: true,
      hasPrior: false,
    })).toBe('retry');
    expect(shouldAutoRetryTooShortHtmlResponse({
      alreadyRetried: false,
      scopedEdit: false,
      isCreateOrFullFill: true,
      hasLookSeedOrPrior: true,
    })).toBe(true);
  });

  it('재시도 성공 경로는 persist 결과만 저장하고 notice 없음 (결정 함수는 retry 아님)', () => {
    // 재시도 턴이 온전한 HTML이면 이 게이트를 타지 않는다.
    const valid =
      '<!doctype html><html><body><section class="slide"><h1>Cover</h1></section></body></html>';
    expect(valid.length).toBeGreaterThanOrEqual(64);
    expect(validateHtmlArtifact(valid).ok).toBe(true);
  });

  it('재시도도 32자면 seed 유지 (32자 저장 안 함)', () => {
    expect(decideTooShortHtmlPersistRecovery({
      alreadyRetried: true,
      scopedEdit: false,
      isCreateOrFullFill: true,
      hasLookSeed: true,
      hasPrior: false,
    })).toBe('keep-seed');
    expect(shouldAutoRetryTooShortHtmlResponse({
      alreadyRetried: true,
      scopedEdit: false,
      isCreateOrFullFill: true,
      hasLookSeedOrPrior: true,
    })).toBe(false);
  });

  it('32자 + seed 없음 + prior 없음 → reject incomplete_output', () => {
    expect(decideTooShortHtmlPersistRecovery({
      alreadyRetried: false,
      scopedEdit: false,
      isCreateOrFullFill: true,
      hasLookSeed: false,
      hasPrior: false,
    })).toBe('reject');
  });

  it('scoped edit 32자 → 재시도 없음', () => {
    expect(decideTooShortHtmlPersistRecovery({
      alreadyRetried: false,
      scopedEdit: true,
      isCreateOrFullFill: true,
      hasLookSeed: true,
      hasPrior: true,
    })).toBe('scoped');
    expect(shouldAutoRetryTooShortHtmlResponse({
      alreadyRetried: false,
      scopedEdit: true,
      isCreateOrFullFill: true,
      hasLookSeedOrPrior: true,
    })).toBe(false);
  });

  it('autoRetryForShortResponse 이미 true면 재재시도 없음', () => {
    expect(shouldAutoRetryTooShortHtmlResponse({
      alreadyRetried: true,
      scopedEdit: false,
      isCreateOrFullFill: true,
      hasLookSeedOrPrior: true,
    })).toBe(false);
  });

  it('32자 + LOOK seed persist helper arms retry and never returns the short body', async () => {
    const seed = '<!doctype html><html><body>'
      + '<section class="slide"><h1>One</h1></section>'.repeat(8)
      + '</body></html>';
    const result = await resolveTooShortHtmlArtifactPersist({
      reason: 'content too short to be HTML (got 32 chars, need ≥64)',
      html: thirtyTwo,
      fileName: 'deck.html',
      artifactType: 'deck',
      scopedEdit: false,
      isCreateOrFullFill: true,
      alreadyRetried: false,
      readSeedHtml: async () => seed,
      readPriorHtml: async () => seed,
      countSeedSlides: () => 8,
    });
    expect(result).toMatchObject({
      kind: 'needs-short-response-retry',
      retryKind: 'too-short-html',
      producedCount: 0,
    });
    expect(result && 'previousSnippet' in result ? result.previousSnippet : '').not.toContain('<!doctype');
  });

  it('재시도 후에도 32자면 persist helper keeps seed and does not write the snippet', async () => {
    const seed = '<!doctype html><html><body>'
      + '<section class="slide"><h1>One</h1></section>'.repeat(8)
      + '</body></html>';
    const result = await resolveTooShortHtmlArtifactPersist({
      reason: 'content too short to be HTML (got 32 chars, need ≥64)',
      html: thirtyTwo,
      fileName: 'deck.html',
      artifactType: 'deck',
      scopedEdit: false,
      isCreateOrFullFill: true,
      alreadyRetried: true,
      readSeedHtml: async () => seed,
      readPriorHtml: async () => seed,
      countSeedSlides: () => 8,
    });
    expect(result).toEqual({
      kind: 'skipped-incomplete',
      fileName: 'deck.html',
      reason: 'content too short to be HTML (got 32 chars, need ≥64)',
    });
  });

  it('32자 + seed 없음 + prior 없음 persist helper returns null so caller rejects', async () => {
    const result = await resolveTooShortHtmlArtifactPersist({
      reason: 'content too short to be HTML (got 32 chars, need ≥64)',
      html: thirtyTwo,
      fileName: 'deck.html',
      artifactType: 'deck',
      scopedEdit: false,
      isCreateOrFullFill: true,
      alreadyRetried: false,
      readSeedHtml: async () => null,
      readPriorHtml: async () => null,
      countSeedSlides: () => 0,
    });
    expect(result).toBeNull();
  });

  it('retry prompt names previous output was not HTML', () => {
    const prompt = renderTooShortHtmlAutoRetryPrompt({
      charCount: 32,
      seedCount: 10,
      previousSnippet: thirtyTwo,
    });
    expect(prompt).toContain('The previous output was not HTML (got 32 chars, need ≥64)');
    expect(prompt).toContain('Return EXACTLY 10');
    expect(prompt).toContain(thirtyTwo);
    expect(isShortResponseAutoRetryPrompt(prompt)).toBe(true);
    expect(parseTooShortHtmlCharCount('content too short to be HTML (got 32 chars, need ≥64)')).toBe(32);
  });
});
