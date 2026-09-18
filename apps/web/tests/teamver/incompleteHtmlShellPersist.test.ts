import { describe, expect, it } from 'vitest';
import { listTemplateCloneSlideShells } from '@open-design/contracts';

import {
  classifyIncompleteHtmlDocumentShell,
  isIncompleteHtmlDocumentShell,
} from '../../src/artifacts/validate';
import {
  decideIncompleteHtmlShellPersistRecovery,
  resolveIncompleteHtmlShellPersist,
} from '../../src/teamver/incompleteHtmlShellPersist';
import { persistPadShortDeckToSeed } from '../../src/teamver/headPreambleContinue';

function tenShellSeed(): string {
  const slides = Array.from({ length: 10 }, (_, index) => {
    const n = index + 1;
    return `<section class="slide slide-${n}"><h2>Seed ${n}</h2><p>Seed body ${n} with enough copy.</p></section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>${slides}</body></html>`;
}

const headOnlyNoBody = [
  '<!doctype html>',
  '<html lang="ko">',
  '<head>',
  '<meta charset="utf-8">',
  `<style>${'.slide-1{} .slide-2{} .slide-3{} .slide-4{} .slide-5{} .slide-6{} .slide-7{} .slide-8{} .slide-9{} .slide-10{}'.repeat(3)}</style>`,
  '</head>',
].join('');

const tenSlideComplete = tenShellSeed();

describe('0918-N01 incomplete-html-document-shell persist recovery', () => {
  it('head-only (no body) is an incomplete shell, not a complete collapse', () => {
    expect(headOnlyNoBody.length).toBeGreaterThanOrEqual(64);
    expect(headOnlyNoBody).not.toMatch(/<body\b/i);
    expect(isIncompleteHtmlDocumentShell(headOnlyNoBody)).toBe(true);
    expect(classifyIncompleteHtmlDocumentShell(headOnlyNoBody)).toMatch(
      /^(?:missing-html-close|head-only-no-body)$/,
    );
  });

  it('create/full fill + seed + head-preamble continue available → continue first', () => {
    expect(decideIncompleteHtmlShellPersistRecovery({
      scopedEdit: false,
      isCreateOrFullFill: true,
      hasLookSeed: true,
      completeCollapse: false,
      headPreambleContinueAvailable: true,
    })).toBe('head-preamble-continue');
  });

  it('after continue, pad-to-seed is next — not skipped_incomplete_retry', () => {
    expect(decideIncompleteHtmlShellPersistRecovery({
      scopedEdit: false,
      isCreateOrFullFill: true,
      hasLookSeed: true,
      completeCollapse: false,
      headPreambleContinueAvailable: false,
    })).toBe('pad-to-seed');
  });

  it('scoped edit is excluded from retry/pad', () => {
    expect(decideIncompleteHtmlShellPersistRecovery({
      scopedEdit: true,
      isCreateOrFullFill: true,
      hasLookSeed: true,
      completeCollapse: false,
      headPreambleContinueAvailable: true,
    })).toBe('scoped');
  });

  it('head-only + seed pads to seed section count and is no longer incomplete', async () => {
    const padded = persistPadShortDeckToSeed({
      modelHtml: headOnlyNoBody,
      seedHtml: tenShellSeed(),
      brief: 'Teamver 소개 슬라이드 만들어줘',
      deckTitle: 'Teamver',
    });
    expect(padded).not.toBeNull();
    expect(listTemplateCloneSlideShells(padded!.html).length).toBe(10);
    expect(isIncompleteHtmlDocumentShell(padded!.html)).toBe(false);

    const resolved = await resolveIncompleteHtmlShellPersist({
      html: headOnlyNoBody,
      fileName: 'deck.html',
      brief: 'Teamver 소개 슬라이드 만들어줘',
      deckTitle: 'Teamver',
      scopedEdit: false,
      isCreateOrFullFill: true,
      alreadyHeadPreambleContinue: true,
      priorHeadPreambleContinues: 1,
      readSeedHtml: async () => tenShellSeed(),
    });
    expect(resolved?.kind).toBe('padded');
    if (resolved?.kind === 'padded') {
      expect(listTemplateCloneSlideShells(resolved.html).length).toBe(10);
      expect(isIncompleteHtmlDocumentShell(resolved.html)).toBe(false);
      expect(resolved.html).toContain('Teamver');
      expect(resolved.html).not.toContain('Seed body 1 with enough copy.');
    }
  });

  it('head-only + seed + continue available arms body-only continue, not skip', async () => {
    const resolved = await resolveIncompleteHtmlShellPersist({
      html: headOnlyNoBody,
      fileName: 'deck.html',
      scopedEdit: false,
      isCreateOrFullFill: true,
      alreadyHeadPreambleContinue: false,
      priorHeadPreambleContinues: 0,
      readSeedHtml: async () => tenShellSeed(),
    });
    expect(resolved).toMatchObject({
      kind: 'needs-short-response-retry',
      retryKind: 'head-preamble',
      reason: 'incomplete-html-document-shell',
    });
  });

  it('완전 collapse (32자) + seed → seed 유지 fallback, 쓰레기 미저장', async () => {
    const thirtyTwo = "I'll generate the slides now!!";
    expect(thirtyTwo.length).toBeLessThan(64);
    expect(isIncompleteHtmlDocumentShell(thirtyTwo)).toBe(false);
    const emptyShell = '<html><head></head><body></body></html>';
    expect(emptyShell.length).toBeLessThan(64);
    const resolved = await resolveIncompleteHtmlShellPersist({
      html: emptyShell,
      fileName: 'deck.html',
      scopedEdit: false,
      isCreateOrFullFill: true,
      alreadyHeadPreambleContinue: false,
      priorHeadPreambleContinues: 0,
      readSeedHtml: async () => tenShellSeed(),
    });
    expect(resolved).toEqual({
      kind: 'skipped-incomplete',
      fileName: 'deck.html',
      reason: 'incomplete-html-document-shell',
    });
    expect(resolved && 'html' in resolved ? resolved.html : undefined).toBeUndefined();
  });

  it('정상 10장 HTML은 skip/pad 대상이 아니다', async () => {
    expect(isIncompleteHtmlDocumentShell(tenSlideComplete)).toBe(false);
    const resolved = await resolveIncompleteHtmlShellPersist({
      html: tenSlideComplete,
      fileName: 'deck.html',
      scopedEdit: false,
      isCreateOrFullFill: true,
      alreadyHeadPreambleContinue: false,
      priorHeadPreambleContinues: 0,
      readSeedHtml: async () => tenShellSeed(),
    });
    expect(resolved).toBeNull();
  });
});
