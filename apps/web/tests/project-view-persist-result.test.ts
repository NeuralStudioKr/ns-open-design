// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import {
  artifactPersistAllowsTemplateCloneReplacement,
  findClientArtifactRegression,
  findClientSlideCountRegression,
  priorDeckAllowsCompactReplacement,
  shouldFailRunForArtifactPersistResult,
} from '../src/components/ProjectView';
import {
  classifySlideCountRegressionPersist,
  SLIDE_COUNT_REGRESSION_CONTINUE_FILL_REASON,
  SLIDE_COUNT_REGRESSION_KEEP_PRIOR_REASON,
  COMMENT_SCOPED_MERGE_MISS_KEEP_PRIOR_REASON,
} from '../src/teamver/slideCountTopUp';
import {
  shouldKeepPriorOnCommentScopedMergeMiss,
} from '../src/edit-mode/scoped-comment-persist';
import {
  extractDeckBodyContent,
  extractTopLevelSlideSections,
} from '../src/artifacts/deck-patch';
import {
  graftLocalCommentStyleOntoPrior,
  mergeCommentEditIncomingIntoPrior,
  shouldSurfaceEmptyApiResponseChatError,
} from '../src/edit-mode/scoped-deck-patch';
import type { ChatCommentAttachment } from '../src/types';

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
  it('keeps a captured Clone fill replacement allowance after mutable refs change', () => {
    const captured = artifactPersistAllowsTemplateCloneReplacement({
      capturedTemplateCloneHostFill: true,
      currentContentFill: false,
      currentPromptFill: false,
      priorIsCloneLookSeed: false,
    });
    expect(captured).toBe(true);
    expect(findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: fullEight,
      priorHtml: [
        '<!doctype html><html><body>',
        ...Array.from({ length: 20 }, (_, i) => (
          `<section class="slide"><h2>Template shell ${i + 1}</h2><p>Example copy</p></section>`
        )),
        '</body></html>',
      ].join(''),
      allowSlideCountReduction: captured,
    })).toBeNull();
    expect(artifactPersistAllowsTemplateCloneReplacement({
      capturedTemplateCloneHostFill: false,
      currentContentFill: false,
      currentPromptFill: false,
      priorIsCloneLookSeed: false,
    })).toBe(false);
  });

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

  it('allows replacing a legacy deck with several auto-padded slides', () => {
    const paddedPrior = [
      '<!doctype html><html lang="ko"><body>',
      ...Array.from({ length: 20 }, (_, index) =>
        `<section class="slide"${index >= 11 ? ' data-teamver-pad="short-response"' : ''}>`
        + `<h2>Teamver ${index + 1}</h2><p>팀의 업무 맥락을 연결합니다.</p></section>`,
      ),
      '</body></html>',
    ].join('');
    expect(priorDeckAllowsCompactReplacement(paddedPrior, null, fullEight)).toBe(true);
    expect(priorDeckAllowsCompactReplacement(paddedPrior, null, compactThree)).toBe(false);
    expect(findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: fullEight,
      priorHtml: paddedPrior,
    })).toBeNull();
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

  it('1007-N01 T · 8-slide prior + 1-slide cover still trips the gate, persist is continue-fill not user error', () => {
    const oneSlideCover =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide s-cover"><h1>표지</h1><p>한 줄 표지.</p></section>'
      + '</body></html>';
    const gate = findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: oneSlideCover,
      priorHtml: fullEight,
    });
    expect(gate).toMatchObject({
      priorCount: 8,
      newCount: 1,
      severity: 'reject',
    });
    const persist = classifySlideCountRegressionPersist({
      severity: gate!.severity,
      strict: false,
      continueFillOrRewriteTurn: true,
      incomingCoverOnlyOrThin: true,
      stillShort: false,
    });
    expect(persist.kind).toBe('skipped-noop');
    expect(persist.reason).toBe(SLIDE_COUNT_REGRESSION_CONTINUE_FILL_REASON);
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'skipped-noop',
      fileName: 'deck.html',
      reason: persist.reason,
    })).toBe(false);
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'artifact-regression',
      fileName: 'deck.html',
      reason: gate!.reason,
      bannerKind: 'slide-count',
    })).toBe(true);
  });

  it('1007-N01 U · comment 8→1 still trips the gate but persist is keep-prior not chat error', () => {
    const oneSlideBlue =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide" style="background:#2563eb"><h2>다른 제목</h2></section>'
      + '</body></html>';
    const gate = findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: oneSlideBlue,
      priorHtml: fullEight,
      strict: true,
    });
    expect(gate).toMatchObject({
      priorCount: 8,
      newCount: 1,
      severity: 'reject',
    });
    const persist = classifySlideCountRegressionPersist({
      severity: gate!.severity,
      strict: true,
      commentScoped: true,
      continueFillOrRewriteTurn: false,
      incomingCoverOnlyOrThin: true,
      stillShort: false,
    });
    expect(persist.kind).not.toBe('artifact-regression');
    expect(persist).toEqual({
      kind: 'skipped-noop',
      reason: SLIDE_COUNT_REGRESSION_KEEP_PRIOR_REASON,
    });
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'skipped-noop',
      fileName: 'deck.html',
      reason: persist.reason,
    }, { scopedCommentEdit: true })).toBe(false);
  });

  it('1007-N01 X · comment 폰트를 두배 키우자 + empty MiniMax keeps 8 slides and does not fail', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      ...Array.from({ length: 8 }, (_, i) =>
        `<section class="slide" data-slide-index="${i}">`
        + `<h2 style="font-size:32px">슬라이드 ${i + 1}</h2>`
        + `<p style="font-size:16px">${'본문입니다. '.repeat(8)}</p>`
        + '</section>',
      ),
      '</body></html>',
    ].join('');
    const fontComment: ChatCommentAttachment = {
      id: 'c-font',
      order: 1,
      filePath: 'deck.html',
      elementId: 'title-2',
      selector: 'h2',
      label: 'h2',
      comment: '폰트를 두배 키우자',
      currentText: '슬라이드 3',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 2,
    };
    const grafted = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(grafted.ok, JSON.stringify(grafted)).toBe(true);
    if (!grafted.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(grafted.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*64px/i);
    expect(slides[2]?.outerHtml).toContain('슬라이드 3');
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'persisted',
      fileName: 'deck.html',
    }, { scopedCommentEdit: true })).toBe(false);
  });

  it('1007-N01 X · non-comment empty_response still surfaces as a chat fail', () => {
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: false,
      localStyleGraftSucceeded: false,
    })).toBe(true);
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'skipped-incomplete',
      fileName: 'deck.html',
      reason: 'empty_response',
    })).toBe(true);
  });

  it('1007-N01 X · persist then empty_response retry does not 64→128', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      ...Array.from({ length: 8 }, (_, i) =>
        `<section class="slide" data-slide-index="${i}">`
        + `<h2 style="font-size:32px">슬라이드 ${i + 1}</h2>`
        + `<p style="font-size:16px">${'본문입니다. '.repeat(8)}</p>`
        + '</section>',
      ),
      '</body></html>',
    ].join('');
    const fontComment: ChatCommentAttachment = {
      id: 'c-font-retry',
      order: 1,
      filePath: 'deck.html',
      elementId: 'title-2',
      selector: 'h2',
      label: 'h2',
      comment: '폰트를 두배 키우자',
      currentText: '슬라이드 3',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 2,
    };
    const first = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) return;
    const retry = graftLocalCommentStyleOntoPrior({
      priorHtml: first.html,
      commentAttachments: [fontComment],
      instructionText: '폰트를 두배 키우자',
    });
    expect(retry.ok, JSON.stringify(retry)).toBe(true);
    if (!retry.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(retry.html));
    expect(slides).toHaveLength(8);
    expect(slides[2]?.outerHtml).toMatch(/font-size:\s*64px/i);
    expect(slides[2]?.outerHtml).not.toMatch(/font-size:\s*128px/i);
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
  });

  it('1007-N01 Y · comment 맨 아래 Teamver 칩 배경 빨간색 + empty MiniMax keeps 8 slides', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide" data-slide-index="0"><h2>표지</h2></section>',
      '<section class="slide" data-slide-index="1">',
      '<h2>문제</h2>',
      '<p>Teamver 워크스페이스에서 초안을 고친다</p>',
      '<div style="position:relative;display:flex;align-items:center;gap:24px">',
      '<div>→</div>',
      '<div style="background:#99E885;font-size:32px;font-weight:800">Teamver</div>',
      '</div>',
      '</section>',
      '<section class="slide" data-slide-index="2"><h2>슬라이드 3</h2><p>Teamver 워크스페이스</p></section>',
      ...Array.from({ length: 4 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 3}"><h2>슬라이드 ${i + 4}</h2><p>본문입니다. </p></section>`,
      ),
      '<section class="slide" data-slide-index="7"><h2>Closing</h2><span style="margin-left:auto">© teamver</span></section>',
      '</body></html>',
    ].join('');
    const comment: ChatCommentAttachment = {
      id: 'c-teamver-red',
      order: 1,
      filePath: 'deck.html',
      elementId: 'chip-1',
      selector: 'div',
      label: 'div',
      comment: '맨 아래에 있는 Teamver를 빨간색으로',
      currentText: 'Teamver',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
    const grafted = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [comment],
      instructionText: '맨 아래에 있는 Teamver를 빨간색으로',
    });
    expect(grafted.ok, JSON.stringify(grafted)).toBe(true);
    if (!grafted.ok) return;
    expect(grafted.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(grafted.html));
    expect(slides).toHaveLength(8);
    const chip = slides[1]?.outerHtml.match(/<div[^>]*>\s*Teamver\s*<\/div>/i)?.[0] ?? '';
    expect(chip).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(chip).not.toMatch(/background(?:-color)?:\s*#99E885/i);
    expect(chip).toContain('Teamver');
    expect(slides[1]?.outerHtml).toContain('<div>→</div>');
    expect(slides[1]?.outerHtml).toContain('Teamver 워크스페이스에서 초안을 고친다');
    expect(slides[1]?.outerHtml).not.toMatch(/<p[^>]*(?:color|background(?:-color)?):\s*#dc2626/i);
    expect(slides[1]?.outerHtml).not.toMatch(/--paper:\s*#dc2626/i);
    expect(slides[2]?.outerHtml).toContain('Teamver 워크스페이스');
    expect(slides[2]?.outerHtml).not.toMatch(/#dc2626/i);
    expect(slides[7]?.outerHtml).not.toMatch(/#dc2626/i);
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'persisted',
      fileName: 'deck.html',
    }, { scopedCommentEdit: true })).toBe(false);
  });

  it('1007-N01 Z · selected chip 빨간색으로 paints chip fill, not slide --paper', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide" data-slide-index="0"><h2>표지</h2></section>',
      '<section class="slide" data-slide-index="1" style="--paper:#f4efe4;background-color:#f4efe4;background-image:radial-gradient(circle, #111 1.2px, transparent 1.2px)">',
      '<h2>문제</h2>',
      '<p>대화는 메신저에</p>',
      '<div data-od-id="chip-teamver" style="background:#99E885;font-size:32px;font-weight:800">Teamver</div>',
      '</section>',
      '<section class="slide" data-slide-index="2"><h2>슬라이드 3</h2><p>Teamver 워크스페이스</p></section>',
      ...Array.from({ length: 4 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 3}"><h2>슬라이드 ${i + 4}</h2><p>본문입니다. </p></section>`,
      ),
      '<section class="slide" data-slide-index="7"><h2>Closing</h2><span>© teamver</span></section>',
      '</body></html>',
    ].join('');
    const comment: ChatCommentAttachment = {
      id: 'c-chip-red',
      order: 1,
      filePath: 'deck.html',
      elementId: 'chip-teamver',
      selector: '[data-od-id="chip-teamver"]',
      label: 'div',
      comment: '빨간색으로',
      currentText: 'Teamver',
      htmlHint: '<div data-od-id="chip-teamver" style="background:#99E885">Teamver</div>',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
    const grafted = graftLocalCommentStyleOntoPrior({
      priorHtml: prior,
      commentAttachments: [comment],
      instructionText: '빨간색으로',
    });
    expect(grafted.ok, JSON.stringify(grafted)).toBe(true);
    if (!grafted.ok) return;
    expect(grafted.kind).toBe('chip-fill');
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(grafted.html));
    expect(slides).toHaveLength(8);
    const chip = slides[1]?.outerHtml.match(/<div[^>]*data-od-id="chip-teamver"[^>]*>\s*Teamver\s*<\/div>/i)?.[0] ?? '';
    expect(chip).toMatch(/background(?:-color)?:\s*#dc2626/i);
    expect(chip).not.toMatch(/background(?:-color)?:\s*#99E885/i);
    expect(chip).toContain('Teamver');
    expect(slides[1]?.openTag).toMatch(/--paper:\s*#f4efe4/i);
    expect(slides[1]?.openTag).not.toMatch(/--paper:\s*#dc2626/i);
    expect(slides[1]?.outerHtml).toMatch(/radial-gradient/i);
    expect(slides[1]?.outerHtml).toContain('대화는 메신저에');
    expect(slides[2]?.outerHtml).not.toMatch(/#dc2626/i);
    expect(shouldSurfaceEmptyApiResponseChatError({
      commentScoped: true,
      localStyleGraftSucceeded: true,
    })).toBe(false);
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'persisted',
      fileName: 'deck.html',
    }, { scopedCommentEdit: true })).toBe(false);
  });

  it('1007-N01 AA · 2페이지 지워줘 + cover-only keeps prior, not artifact_regression', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide" data-slide-index="0"><h1>표지 타이틀</h1></section>',
      '<section class="slide" data-slide-index="1">',
      '<h2 data-od-id="page2-title">지금 팀의 일은 너무 많이 흩어져 있습니다.</h2>',
      '<p>대화는 메신저에</p>',
      '</section>',
      ...Array.from({ length: 6 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 2}"><h2>슬라이드 ${i + 3}</h2>`
        + `<p>${'본문입니다. '.repeat(8)}</p></section>`,
      ),
      '</body></html>',
    ].join('');
    const coverOnly =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide s-cover" data-slide-index="0"><h1>표지 타이틀</h1><p>한 줄 표지.</p></section>'
      + '</body></html>';
    const comment: ChatCommentAttachment = {
      id: 'c-delete-p2',
      order: 1,
      filePath: 'deck.html',
      elementId: 'pin-slide-1',
      selector: 'section.slide',
      label: 'section',
      comment: '지워줘',
      currentText: '',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
    const merged = mergeCommentEditIncomingIntoPrior({
      priorHtml: prior,
      incomingHtml: coverOnly,
      commentAttachments: [comment],
      instructionText: '2페이지 지워줘',
    });
    expect(merged.ok).toBe(false);
    const htmlBody = coverOnly;
    const gate = findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody,
      priorHtml: prior,
      strict: true,
    });
    expect(gate).toMatchObject({
      priorCount: 8,
      newCount: 1,
      severity: 'reject',
    });
    const persist = classifySlideCountRegressionPersist({
      severity: gate!.severity,
      strict: true,
      commentScoped: true,
      continueFillOrRewriteTurn: false,
      incomingCoverOnlyOrThin: true,
      stillShort: false,
    });
    expect(persist.kind).not.toBe('artifact-regression');
    expect(persist).toEqual({
      kind: 'skipped-noop',
      reason: SLIDE_COUNT_REGRESSION_KEEP_PRIOR_REASON,
    });
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'skipped-noop',
      fileName: 'deck.html',
      reason: persist.reason,
    }, { scopedCommentEdit: true })).toBe(false);
    const kept = extractTopLevelSlideSections(extractDeckBodyContent(prior));
    expect(kept).toHaveLength(8);
    expect(kept[1]?.outerHtml).toContain('지금 팀의 일은 너무 많이 흩어져 있습니다.');
    expect(kept[1]?.outerHtml).not.toMatch(/\bs-cover\b/i);
  });

  it('1007-N01 AA · identity-matching 1-slide comment still merges onto the pin', () => {
    const prior = [
      '<!doctype html><html lang="ko"><body>',
      '<section class="slide" data-slide-index="0"><h1>표지 타이틀</h1></section>',
      '<section class="slide" data-slide-index="1">',
      '<h2 data-od-id="page2-title">지금 팀의 일은 너무 많이 흩어져 있습니다.</h2>',
      '<p data-od-id="page2-body">대화는 메신저에</p>',
      '</section>',
      ...Array.from({ length: 6 }, (_, i) =>
        `<section class="slide" data-slide-index="${i + 2}"><h2>슬라이드 ${i + 3}</h2>`
        + `<p>${'본문입니다. '.repeat(8)}</p></section>`,
      ),
      '</body></html>',
    ].join('');
    const incoming =
      '<!doctype html><html lang="ko"><body>'
      + '<section class="slide">'
      + '<h2 data-od-id="page2-title">지금 팀의 일은 너무 많이 흩어져 있습니다.</h2>'
      + '<p data-od-id="page2-body">같은 장 수정본</p>'
      + '</section></body></html>';
    const comment: ChatCommentAttachment = {
      id: 'c-edit-p2',
      order: 1,
      filePath: 'deck.html',
      elementId: 'pin-slide-1',
      selector: 'section.slide',
      label: 'section',
      comment: '지워줘',
      currentText: '',
      pagePosition: { x: 0, y: 0, width: 10, height: 10 },
      selectionKind: 'element',
      slideIndex: 1,
    };
    const merged = mergeCommentEditIncomingIntoPrior({
      priorHtml: prior,
      incomingHtml: incoming,
      commentAttachments: [comment],
      instructionText: '2페이지 지워줘',
    });
    expect(merged.ok, JSON.stringify(merged)).toBe(true);
    if (!merged.ok) return;
    const slides = extractTopLevelSlideSections(extractDeckBodyContent(merged.html));
    expect(slides).toHaveLength(8);
    expect(slides[1]?.outerHtml).toContain('같은 장 수정본');
    expect(findClientSlideCountRegression({
      fileName: 'deck.html',
      htmlBody: merged.html,
      priorHtml: prior,
      strict: true,
    })).toBeNull();
  });

  it('1007-N01 AB · comment merge miss keep-prior is skipped-noop, not incomplete_output', () => {
    expect(shouldKeepPriorOnCommentScopedMergeMiss(
      'deck_patch_merge_failed',
      'No matching targets found to merge.',
    )).toBe(true);
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'skipped-noop',
      fileName: 'deck.html',
      reason: COMMENT_SCOPED_MERGE_MISS_KEEP_PRIOR_REASON,
    }, { scopedCommentEdit: true })).toBe(false);
    expect(shouldFailRunForArtifactPersistResult({
      kind: 'skipped-incomplete',
      fileName: 'deck.html',
      reason: 'No matching targets found to merge.',
    }, { scopedCommentEdit: true })).toBe(true);
  });
});
