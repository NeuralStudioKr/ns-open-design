import {
  classifyIncompleteHtmlDocumentShell,
  isCompleteCollapseHtmlDocumentShell,
  isIncompleteHtmlDocumentShell,
  type IncompleteHtmlDocumentShellReason,
} from '../artifacts/validate';
import {
  decideHeadPreambleRecovery,
  persistPadShortDeckToSeed,
} from './headPreambleContinue';

export type IncompleteHtmlShellPersistRecovery =
  | 'head-preamble-continue'
  | 'pad-to-seed'
  | 'keep-seed'
  | 'scoped'
  | 'skip';

export type IncompleteHtmlShellPersistResult =
  | {
    kind: 'needs-short-response-retry';
    fileName: string;
    producedCount: number;
    expectedCount: number;
    reason: string;
    retryKind: 'head-preamble';
  }
  | {
    kind: 'padded';
    html: string;
    producedCount: number;
    paddedCount: number;
    seedCount: number;
  }
  | {
    kind: 'skipped-incomplete';
    fileName: string;
    reason: string;
  };

export function decideIncompleteHtmlShellPersistRecovery(input: {
  scopedEdit: boolean;
  isCreateOrFullFill: boolean;
  hasLookSeed: boolean;
  completeCollapse: boolean;
  headPreambleContinueAvailable: boolean;
}): IncompleteHtmlShellPersistRecovery {
  if (input.scopedEdit) return 'scoped';
  if (input.completeCollapse) return input.hasLookSeed ? 'keep-seed' : 'skip';
  if (
    input.isCreateOrFullFill
    && input.hasLookSeed
    && input.headPreambleContinueAvailable
  ) {
    return 'head-preamble-continue';
  }
  if (input.isCreateOrFullFill && input.hasLookSeed) return 'pad-to-seed';
  return input.hasLookSeed ? 'keep-seed' : 'skip';
}

/**
 * Persist-time recovery for `incomplete-html-document-shell`.
 * Continue (1회, 배너 없음) → forcePad → 그때만 seed skip.
 * 32자/빈 셸은 deck.html에 쓰지 않는다.
 */
export async function resolveIncompleteHtmlShellPersist(input: {
  html: string;
  fileName: string;
  brief?: string | null;
  deckTitle?: string | null;
  scopedEdit: boolean;
  isCreateOrFullFill: boolean;
  alreadyHeadPreambleContinue: boolean;
  priorHeadPreambleContinues: number;
  templateId?: string | null;
  readSeedHtml: () => Promise<string | null>;
}): Promise<IncompleteHtmlShellPersistResult | null> {
  const shellReason = classifyIncompleteHtmlDocumentShell(
    input.html,
    input.brief,
    input.deckTitle,
  );
  if (!shellReason) return null;

  let seedHtml: string | null = null;
  try {
    seedHtml = await input.readSeedHtml();
  } catch {
    seedHtml = null;
  }
  const hasLookSeed = String(seedHtml ?? '').trim().length >= 64
    && /<section\b[^>]*class=["'][^"']*\bslide\b/i.test(String(seedHtml ?? ''));
  const headDecision = decideHeadPreambleRecovery({
    streamedText: input.html,
    priorHeadPreambleContinues: input.priorHeadPreambleContinues,
  });
  const recovery = decideIncompleteHtmlShellPersistRecovery({
    scopedEdit: input.scopedEdit,
    isCreateOrFullFill: input.isCreateOrFullFill,
    hasLookSeed,
    completeCollapse: isCompleteCollapseHtmlDocumentShell(input.html),
    headPreambleContinueAvailable:
      !input.alreadyHeadPreambleContinue
      && headDecision === 'continue',
  });

  if (recovery === 'head-preamble-continue') {
    return {
      kind: 'needs-short-response-retry',
      fileName: input.fileName,
      producedCount: 0,
      expectedCount: 1,
      reason: 'incomplete-html-document-shell',
      retryKind: 'head-preamble',
    };
  }

  if (recovery === 'pad-to-seed') {
    const padded = persistPadShortDeckToSeed({
      modelHtml: input.html,
      seedHtml,
      templateId: input.templateId,
      brief: input.brief,
      deckTitle: input.deckTitle,
    });
    if (
      padded?.html
      && padded.paddedCount >= 2
      && !isIncompleteHtmlDocumentShell(padded.html, input.brief, input.deckTitle)
    ) {
      return {
        kind: 'padded',
        html: padded.html,
        producedCount: padded.producedCount,
        paddedCount: padded.paddedCount,
        seedCount: padded.seedCount,
      };
    }
    return {
      kind: 'skipped-incomplete',
      fileName: input.fileName,
      reason: 'incomplete-html-document-shell',
    };
  }

  if (recovery === 'keep-seed' || recovery === 'scoped' || recovery === 'skip') {
    return {
      kind: 'skipped-incomplete',
      fileName: input.fileName,
      reason: 'incomplete-html-document-shell',
    };
  }

  return {
    kind: 'skipped-incomplete',
    fileName: input.fileName,
    reason: 'incomplete-html-document-shell',
  };
}

export function incompleteHtmlShellReasonLabel(
  reason: IncompleteHtmlDocumentShellReason | null,
): string {
  return reason ?? 'complete';
}
