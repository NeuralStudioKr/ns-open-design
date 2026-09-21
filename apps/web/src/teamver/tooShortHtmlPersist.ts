import { isNotHtmlDeliverableValidationReason } from '../artifacts/validate';
import {
  classifyTooShortHtmlSnippet,
  decideTooShortHtmlPersistRecovery,
} from './shortResponseAutoRetry';

export type TooShortHtmlPersistResult =
  | {
    kind: 'needs-short-response-retry';
    fileName: string;
    producedCount: number;
    expectedCount: number;
    reason: string;
    retryKind: 'too-short-html';
    previousSnippet: string;
  }
  | {
    kind: 'skipped-incomplete';
    fileName: string;
    reason: string;
  };

/**
 * 루프552 — `<64` / prose-as-HTML persist. 짧은 본문은 절대 쓰지 않는다.
 * reject는 null을 돌려 호출부가 기존 거절 배너를 띄운다.
 */
export async function resolveTooShortHtmlArtifactPersist(input: {
  reason: string;
  html: string;
  fileName: string;
  artifactType?: string | null;
  scopedEdit: boolean;
  isCreateOrFullFill: boolean;
  alreadyRetried: boolean;
  readSeedHtml: () => Promise<string | null>;
  readPriorHtml: () => Promise<string | null>;
  countSeedSlides: (html: string) => number;
}): Promise<TooShortHtmlPersistResult | null> {
  if (!isNotHtmlDeliverableValidationReason(input.reason)) return null;

  let seedHtml: string | null = null;
  if (input.isCreateOrFullFill && !input.scopedEdit) {
    try {
      seedHtml = await input.readSeedHtml();
    } catch {
      seedHtml = null;
    }
  }
  let priorHtml: string | null = null;
  try {
    priorHtml = await input.readPriorHtml();
  } catch {
    priorHtml = null;
  }
  const hasLookSeed = String(seedHtml ?? '').trim().length >= 64;
  const hasPrior = String(priorHtml ?? '').trim().length >= 64;
  const recovery = decideTooShortHtmlPersistRecovery({
    alreadyRetried: input.alreadyRetried,
    scopedEdit: input.scopedEdit,
    isCreateOrFullFill: input.isCreateOrFullFill,
    hasLookSeed,
    hasPrior,
  });
  const snippet = classifyTooShortHtmlSnippet(input.html);

  if (recovery === 'retry') {
    const seedCount = seedHtml
      ? input.countSeedSlides(seedHtml)
      : (priorHtml ? input.countSeedSlides(priorHtml) : 0);
    return {
      kind: 'needs-short-response-retry',
      fileName: input.fileName,
      producedCount: 0,
      expectedCount: seedCount || 1,
      reason: input.reason,
      retryKind: 'too-short-html',
      previousSnippet: snippet.preview,
    };
  }

  if (recovery === 'keep-seed') {
    return {
      kind: 'skipped-incomplete',
      fileName: input.fileName,
      reason: input.reason,
    };
  }

  if (recovery === 'scoped') {
    return {
      kind: 'skipped-incomplete',
      fileName: input.fileName,
      reason: input.reason,
    };
  }

  return null;
}
