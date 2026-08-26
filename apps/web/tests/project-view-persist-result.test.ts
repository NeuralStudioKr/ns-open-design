import { describe, expect, it } from 'vitest';

import {
  findClientArtifactRegression,
  findClientSlideCountRegression,
  priorDeckAllowsCompactReplacement,
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

const parrotThree =
  '<!doctype html><html lang="ko"><body>'
  + '<section class="slide"><h1>시장 기회 PPT 만들어줘</h1><p>국내 SaaS 전환이 가속화되고 있습니다.</p></section>'
  + '<section class="slide"><h2>도입 장벽 슬라이드 만들어줘</h2><p>보안 검토가 병목입니다.</p></section>'
  + '<section class="slide"><h2>다음 단계 피피티 만들어줘</h2><p>파일럿으로 검증하세요.</p></section>'
  + '</body></html>';

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

  it('allows a MiniMax 6-slide first-fill to replace a thin prior draft', () => {
    const compactSix =
      '<!doctype html><html lang="ko"><body>'
      + Array.from({ length: 6 }, (_, i) =>
        `<section class="slide"><h2>슬라이드 ${i + 1}</h2><p>본문입니다.</p></section>`,
      ).join('')
      + '</body></html>';
    expect(
      findClientArtifactRegression({
        fileName: 'deck.html',
        htmlBody: compactSix,
        priorHtml: compactThree,
        projectFiles: [{ name: 'deck.html', path: 'deck.html', size: 12_000 } as never],
      }),
    ).toBeNull();
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

  it('allows a healable 3-slide instruction-copy draft to replace a thin prior', () => {
    expect(
      findClientArtifactRegression({
        fileName: 'deck.html',
        htmlBody: parrotThree,
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

  it('still blocks a healable 3-slide instruction-copy rewrite of a full 8-slide deck', () => {
    const blocked = findClientArtifactRegression({
      fileName: 'deck.html',
      htmlBody: parrotThree,
      priorHtml: fullEight,
      projectFiles: [{ name: 'deck.html', path: 'deck.html', size: 40_000 } as never],
    });
    expect(blocked).not.toBeNull();
  });

  it('allows a compact topical fill to replace leftover IB catalog example', () => {
    const leftoverIb = [
      '<!doctype html><html><body>',
      ...Array.from({ length: 10 }, (_, i) =>
        `<section class="slide"><h2>SECTION ${i + 1} · DCF</h2>`
        + '<p>Hartfield &amp; Co. WACC (base) Implied EV for NorthPeak Industries.</p></section>',
      ),
      '</body></html>',
    ].join('');
    const brief = '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘';
    expect(priorDeckAllowsCompactReplacement(leftoverIb, brief)).toBe(true);
    expect(
      findClientArtifactRegression({
        fileName: 'deck.html',
        htmlBody: compactThree,
        priorHtml: leftoverIb,
        healBrief: brief,
        projectFiles: [{ name: 'deck.html', path: 'deck.html', size: 35_000 } as never],
      }),
    ).toBeNull();
    expect(
      findClientSlideCountRegression({
        fileName: 'deck.html',
        htmlBody: compactThree,
        priorHtml: leftoverIb,
        healBrief: brief,
      }),
    ).toBeNull();
  });

  it('allows a compact topical fill to replace a scrubbed IB catalog shell', () => {
    const pad = `/* ${'ib-chassis '.repeat(500)} */`;
    const scrubbedIb = [
      '<!doctype html><html><head><style>',
      pad,
      '.slide { min-width:100vw; height:100vh } #stage { display:flex }',
      '</style></head><body>',
      '<div class="deck" id="deck">',
      '<div class="chrome"><span id="now">01</span> / <span id="total">10</span></div>',
      '<div class="stage" id="stage">',
      ...Array.from({ length: 10 }, (_, i) => {
        const title = i === 0 ? '영어 회화' : i === 1 ? '개요' : i === 2 ? '핵심 포인트' : '다음 단계';
        return `<section class="slide"><h2>${title}</h2><p>…</p></section>`;
      }),
      '</div></div>',
      '<script>stage.style.transform = `translateX(-${i*100}vw)`</script>',
      '</body></html>',
    ].join('');
    const brief = '영어 회화 표현 공부 팁, 예시에 대한 발표자료 만들어줘';
    expect(priorDeckAllowsCompactReplacement(scrubbedIb, brief)).toBe(true);
    expect(
      findClientArtifactRegression({
        fileName: 'deck.html',
        htmlBody: compactThree,
        priorHtml: scrubbedIb,
        healBrief: brief,
        projectFiles: [{ name: 'deck.html', path: 'deck.html', size: 32_000 } as never],
      }),
    ).toBeNull();
    expect(
      findClientSlideCountRegression({
        fileName: 'deck.html',
        htmlBody: compactThree,
        priorHtml: scrubbedIb,
        healBrief: brief,
      }),
    ).toBeNull();
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
