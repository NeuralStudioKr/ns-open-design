import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  findClientArtifactRegression,
  findClientSlideCountRegression,
} from '../src/components/ProjectView';

/**
 * 루프273 — Substance-rich multi-slide replacements must not fire
 * `artifact_regression`.
 *
 * `isPersistableShortDeckDraft` / `isPersistableShortDeckDraftAfterHeal` /
 * `isClosedSoftSalvageDeckHtml` are permissive by design so the top-up
 * pipeline can keep appending onto a titled cover. That permissiveness
 * caused `findClientArtifactRegression` to treat a completed 5-slide fill
 * as a "compact draft" and reject the write with the short-draft banner
 * when the on-disk prior was a larger MiniMax deliverable.
 *
 * Fix: any incoming with 4+ slides that clears
 * `meetsMinimumDeckDeliverableQuality` and is not
 * `isLowSubstanceSlideDeckArtifact` is a full replacement, so byte-shrink
 * over a big prior is allowed.
 */

const NON_DECK_HTML = 'irrelevant text ignored';

function fillerParagraph(seed: string): string {
  return `${seed} `.repeat(24);
}

function makeSubstanceSlide(title: string, seed: string): string {
  return (
    `<section class="slide"><h2>${title}</h2>`
    + `<p>${fillerParagraph(seed)}</p>`
    + `<ul><li>${seed} 첫 번째 포인트</li><li>${seed} 두 번째 포인트</li></ul>`
    + `</section>`
  );
}

const priorFullEightSlides = [
  '<!doctype html><html lang="ko"><body>',
  ...Array.from({ length: 8 }, (_, i) =>
    makeSubstanceSlide(`슬라이드 ${i + 1}`, '본문 내용이 충분히 담긴 문단'),
  ),
  '</body></html>',
].join('');

const substanceRichFive = [
  '<!doctype html><html lang="ko"><body>',
  makeSubstanceSlide('시장 개관', '국내 SaaS 시장은 전환이 가속화 중'),
  makeSubstanceSlide('핵심 문제', '보안 검토와 데이터 이관이 여전한 병목'),
  makeSubstanceSlide('접근 방식', '파일럿 검증 후 단계적 확장 계획'),
  makeSubstanceSlide('예상 효과', '연간 30% 비용 절감과 배포 주기 단축'),
  makeSubstanceSlide('다음 단계', '이해관계자 승인 → 파일럿 킥오프'),
  '</body></html>',
].join('');

describe('findClientArtifactRegression · 루프273 substance-rich exemption', () => {
  it('4+ slide substance-rich replacement over a big prior does NOT fire regression', () => {
    const priorSize = new Blob([priorFullEightSlides]).size;
    const result = findClientArtifactRegression({
      fileName: 'deck.html',
      htmlBody: substanceRichFive,
      projectFiles: [
        { name: 'deck.html', path: 'deck.html', size: priorSize } as never,
      ],
      priorHtml: priorFullEightSlides,
    });
    expect(result).toBeNull();
  });

  it('사용자 fixture (5 slides · substance) round-trip · regression 무발생', () => {
    const raw = readFileSync(
      '/tmp/user-fixture-artifact-regression.html',
      'utf8',
    );
    const priorSize = new Blob([priorFullEightSlides]).size;
    const result = findClientArtifactRegression({
      fileName: 'deck.html',
      htmlBody: raw,
      projectFiles: [
        { name: 'deck.html', path: 'deck.html', size: priorSize } as never,
      ],
      priorHtml: priorFullEightSlides,
      healBrief: '삼각함수를 처음 배우는 학생을 위한 발표',
      healTitle: '삼각함수 소개',
    });
    expect(result).toBeNull();
  });

  it('1-slide title-only draft still fires regression over big prior (top-up-safe)', () => {
    const priorSize = new Blob([priorFullEightSlides]).size;
    const oneSlideTitleOnly =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>미분법 강의</h1></section>'
      + '</body></html>';
    const result = findClientArtifactRegression({
      fileName: 'deck.html',
      htmlBody: oneSlideTitleOnly,
      projectFiles: [
        { name: 'deck.html', path: 'deck.html', size: priorSize } as never,
      ],
      priorHtml: priorFullEightSlides,
    });
    // Title-only cover is still exempt from regression (compact draft →
    // priorCount>6 → byte-size shrink), so this stays null? No — 1 slide
    // with big prior enters byte-guard branch. Expected regression fire.
    expect(result).not.toBeNull();
  });

  it('non-deck HTML unaffected', () => {
    const result = findClientArtifactRegression({
      fileName: 'notes.html',
      htmlBody: NON_DECK_HTML,
      projectFiles: [],
      priorHtml: null,
    });
    expect(result).toBeNull();
  });

  it('3-slide compact draft (thin substance · below 4-slide bar) still blocked over big prior', () => {
    const priorSize = new Blob([priorFullEightSlides]).size;
    const threeSlide =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>시장 개관</h1><p>짧은 요약</p></section>'
      + '<section class="slide"><h2>문제</h2><p>병목이 있습니다.</p></section>'
      + '<section class="slide"><h2>다음</h2><p>파일럿 검증.</p></section>'
      + '</body></html>';
    const result = findClientArtifactRegression({
      fileName: 'deck.html',
      htmlBody: threeSlide,
      projectFiles: [
        { name: 'deck.html', path: 'deck.html', size: priorSize } as never,
      ],
      priorHtml: priorFullEightSlides,
    });
    // 3 slides < 4 → substance-rich exemption OFF → compact-draft branch
    // retained. Prior is big + full-substance, so byte-shrink triggers.
    expect(result).not.toBeNull();
  });
});

describe('findClientSlideCountRegression · 루프279 substance-rich exemption', () => {
  it('8→5 substance-rich greenfield rewrite does NOT fire slide-count regression', () => {
    const result = findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: substanceRichFive,
      priorHtml: priorFullEightSlides,
    });
    expect(result).toBeNull();
  });

  it('사용자 fixture (5 slides · substance) over 8-slide prior is allowed', () => {
    const raw = readFileSync(
      '/tmp/user-fixture-artifact-regression.html',
      'utf8',
    );
    const result = findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: raw,
      priorHtml: priorFullEightSlides,
      healBrief: '삼각함수를 처음 배우는 학생을 위한 발표',
      healTitle: '삼각함수 소개',
    });
    expect(result).toBeNull();
  });

  it('8→2 hard collapse is still blocked (below 4-slide bar)', () => {
    const twoSlide =
      '<!doctype html><html lang="ko"><body>'
      + makeSubstanceSlide('표지', '아주 짧은 표지 문장만 있는 장')
      + makeSubstanceSlide('끝', '마무리 문장만 있는 장')
      + '</body></html>';
    const result = findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: twoSlide,
      priorHtml: priorFullEightSlides,
    });
    expect(result).toMatchObject({ priorCount: 8, newCount: 2 });
  });

  it('strict image-embed turn still blocks 8→5 even when substance-rich', () => {
    const result = findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: substanceRichFive,
      priorHtml: priorFullEightSlides,
      strict: true,
    });
    expect(result).toMatchObject({ priorCount: 8, newCount: 5 });
  });

  it('3-slide thin rewrite over 8-slide prior is still blocked', () => {
    const threeSlide =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide"><h1>시장 개관</h1><p>짧은 요약</p></section>'
      + '<section class="slide"><h2>문제</h2><p>병목이 있습니다.</p></section>'
      + '<section class="slide"><h2>다음</h2><p>파일럿 검증.</p></section>'
      + '</body></html>';
    const result = findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: threeSlide,
      priorHtml: priorFullEightSlides,
    });
    expect(result).toMatchObject({ priorCount: 8, newCount: 3 });
  });
});
