import { describe, expect, it } from 'vitest';

import {
  findClientArtifactRegression,
  shouldFailRunForArtifactPersistResult,
} from '../src/components/ProjectView';

const compactThree =
  '<!doctype html><html lang="ko"><body>'
  + '<section class="slide"><h1>시장 기회</h1><p>국내 SaaS 전환이 가속화되고 있습니다.</p></section>'
  + '<section class="slide"><h2>도입 장벽</h2><p>보안 검토가 병목입니다.</p></section>'
  + '<section class="slide"><h2>다음 단계</h2><p>파일럿으로 검증하세요.</p></section>'
  + '</body></html>';

const fullEight = [
  '<!doctype html><html lang="ko"><body>',
  ...Array.from({ length: 8 }, (_, i) =>
    `<section class="slide"><h2>슬라이드 ${i + 1}</h2><p>${'본문입니다. '.repeat(20)}</p></section>`,
  ),
  '</body></html>',
].join('');

describe('shouldFailRunForArtifactPersistResult', () => {
  it('treats skipped-duplicate as failure for scoped comment edits', () => {
    expect(
      shouldFailRunForArtifactPersistResult(
        { kind: 'skipped-duplicate', fileName: 'deck.html' },
        { scopedCommentEdit: true },
      ),
    ).toBe(true);
  });

  it('does not treat skipped-duplicate as failure for unscoped runs', () => {
    expect(
      shouldFailRunForArtifactPersistResult(
        { kind: 'skipped-duplicate', fileName: 'deck.html' },
        { scopedCommentEdit: false },
      ),
    ).toBe(false);
  });

  it('still fails skipped-incomplete without scoped flag', () => {
    expect(
      shouldFailRunForArtifactPersistResult({
        kind: 'skipped-incomplete',
        fileName: 'deck.html',
      }),
    ).toBe(true);
  });

  it('allows a MiniMax 3-slide draft to replace a thin prior draft', () => {
    expect(
      findClientArtifactRegression({
        fileName: 'deck.html',
        htmlBody: compactThree,
        priorHtml: compactThree,
        projectFiles: [{ name: 'deck.html', path: 'deck.html', size: 12_000 } as never],
      }),
    ).toBeNull();
  });

  it('still blocks a 3-slide rewrite of a full 8-slide deck', () => {
    const blocked = findClientArtifactRegression({
      fileName: 'deck.html',
      htmlBody: compactThree,
      priorHtml: fullEight,
      projectFiles: [{ name: 'deck.html', path: 'deck.html', size: 40_000 } as never],
    });
    expect(blocked).not.toBeNull();
    expect(blocked?.newSize).toBeLessThan(blocked?.priorSize ?? 0);
  });

  it('does not fail skipped-noop (avoids auto-continue churn)', () => {
    expect(
      shouldFailRunForArtifactPersistResult(
        {
          kind: 'skipped-noop',
          fileName: 'deck.html',
          reason: 'scoped comment edit did not change the deck on disk',
        },
        { scopedCommentEdit: true },
      ),
    ).toBe(false);
  });
});
