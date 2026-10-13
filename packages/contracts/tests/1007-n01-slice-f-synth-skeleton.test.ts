import { describe, it, expect } from 'vitest';

import {
  briefLooksLikeGeneralKnowledgeHowToTopic,
  healProductLaunchLeftoverCatalogCopy,
  looksLikeDeterministicSynthSkeletonCopy,
  recoverShortDeckByPaddingToSeed,
  stripDeterministicSynthSkeletonTextNodes,
  synthesizeTemplateCloneOutlineFromBrief,
} from '../src/template-clone-fill';

/**
 * 1007-N01 슬라이스 F — 합성 스켈레톤 근절 + v1.4.16 덱 대조.
 *
 * 사용자 보고 덱(v1416-regression-deck-2-synthetic.html)은
 * `templatesForSynthTemplateTopic` generic preset 이 주제 문자열을
 * '…에 대한 X' 로 전개한 결정론적 카피였다. 일반/교육/팁 주제는
 * official-rich 로 라우팅되고, thin 해도 이 카피를 주입하지 않는다.
 */

const WRITING_TIPS = '글을 매력적으로 쓰는 팁';

function buildSyntheticSkeletonDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${WRITING_TIPS}</title></head>`,
    '<body class="tpl-product-launch">',
    `<section class="slide dark" data-title="Cover"><h1 class="h1">${WRITING_TIPS}</h1>`,
    '<div class="hero-shot"></div></section>',
    '<section class="slide center tc" data-title="Introducing"><div>',
    `<p class="kicker">왜 ${WRITING_TIPS}에 대한을 지금 다뤄야 하는가</p>`,
    `<h1 class="h1">${WRITING_TIPS}에 대한 2</h1></div></section>`,
    '<section class="slide" data-title="Sound">',
    `<h2 class="h2">${WRITING_TIPS}에 대한 핵심 포인트</h2>`,
    '<div class="grid g3 mt-l">',
    `<div class="feature-card"><h4>개념</h4><p class="dim">${WRITING_TIPS}에 대한에서 자주 쓰이는 용어와 원리를 짧고 정확하게 정의</p></div>`,
    `<div class="feature-card"><h4>구조</h4><p class="dim">${WRITING_TIPS}에 대한을 이루는 구성 요소와 서로 연결되는 방식을 설명</p></div>`,
    `<div class="feature-card"><h4>영향</h4><p class="dim">${WRITING_TIPS}에 대한이 실제 의사결정이나 업무에 만드는 변화를 정리</p></div>`,
    '</div></section>',
    '<section class="slide dark" data-title="Fit">',
    `<h2 class="h2">${WRITING_TIPS}에 대한 핵심 내용</h2>`,
    '<div class="grid g3 mt-l">',
    `<div class="card"><h4>이해</h4><p>${WRITING_TIPS}에 대한의 전체 지도를 먼저 그리고 세부 개념을 그 위에 위치시킨다</p></div>`,
    `<div class="card"><h4>비교</h4><p>${WRITING_TIPS}에 대한의 대안·사례·실패 패턴을 비교해 차이를 명확히 드러낸다</p></div>`,
    `<div class="card"><h4>적용</h4><p>${WRITING_TIPS}에 대한을 실제 상황에 적용할 기준과 다음 행동을 한 문장으로 제안</p></div>`,
    '</div></section>',
    '<section class="slide dark" data-title="Ship">',
    `<p class="kicker">${WRITING_TIPS}에 대한 정리와 다음 단계</p><h2 class="h2">고객 경험</h2>`,
    '<div style="font-size:96px;font-weight:900">지금</div>',
    '<a class="cta-btn mt-l" href="#">시작하기</a></section>',
    '</body></html>',
  ].join('');
}

function productLaunchSeed(slideCount = 3): string {
  const slides = Array.from({ length: slideCount }, (_, i) => (
    i === 0
      ? '<section class="slide dark"><h1 class="h1">Cover</h1><div class="hero-shot"></div></section>'
      : `<section class="slide"><h2 class="h2">Slide ${i + 1}</h2><div class="grid g3 mt-l"><div class="feature-card"><h4></h4><p class="dim"></p></div></div></section>`
  )).join('');
  return `<!doctype html><html><head><title>seed</title></head><body class="tpl-product-launch">${slides}</body></html>`;
}

describe('1007-N01 슬라이스 F — 합성 스켈레톤 지문', () => {
  it('사용자 보고 보일러플레이트 문구를 합성 스켈레톤으로 판정한다', () => {
    expect(looksLikeDeterministicSynthSkeletonCopy(
      '왜 글을 매력적으로 쓰는 팁에 대한을 지금 다뤄야 하는가',
    )).toBe(true);
    expect(looksLikeDeterministicSynthSkeletonCopy(
      '글을 매력적으로 쓰는 팁에서 자주 쓰이는 용어와 원리를 짧고 정확하게 정의',
    )).toBe(true);
    expect(looksLikeDeterministicSynthSkeletonCopy(
      '글을 매력적으로 쓰는 팁의 전체 지도를 먼저 그리고 세부 개념을 그 위에 위치시킨다',
    )).toBe(true);
    expect(looksLikeDeterministicSynthSkeletonCopy(
      '첫 문장에서 결론을 말해 독자의 기대를 잡는다',
    )).toBe(false);
  });

  it('글쓰기 팁·공부법·기초는 일반 지식/교육 주제로 본다', () => {
    expect(briefLooksLikeGeneralKnowledgeHowToTopic(WRITING_TIPS)).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('독자를 사로잡는 한 문장')).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('영어 회화 공부법')).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('React 기초 정리')).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('삼성전자 소개 발표자료')).toBe(false);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic('')).toBe(false);
  });
});

describe('1007-N01 슬라이스 F — persist heal 이 합성 카피를 비우고 박스를 줄인다', () => {
  it('합성 스켈레톤 덱에서 보일러플레이트·에 대한 2·CTA 가 사라진다', () => {
    const out = healProductLaunchLeftoverCatalogCopy(
      buildSyntheticSkeletonDeck(),
      `${WRITING_TIPS} 슬라이드 만들어줘`,
    );
    expect(out).not.toContain('지금 다뤄야 하는가');
    expect(out).not.toContain('자주 쓰이는 용어와 원리');
    expect(out).not.toContain('전체 지도를 먼저 그리고');
    expect(out).not.toContain('구성 요소와 서로 연결');
    expect(out).not.toContain('에 대한 2');
    expect(out).not.toContain('에 대한을');
    expect(out).not.toMatch(/cta-btn/);
    expect(out).not.toMatch(/font-size\s*:\s*96px[^>]*>\s*지금/);
    // 커버 실 제목은 보존(모델/사용자 주제, 합성 아님).
    expect(out).toContain(`<h1 class="h1">${WRITING_TIPS}</h1>`);
    // 주제 문자열을 카드 제목으로 이어붙인 price-plan 폴백이 없다.
    expect(out).not.toContain(`${WRITING_TIPS} 실무`);
  });

  it('strip 헬퍼는 지문 텍스트만 비우고 다른 본문은 남긴다', () => {
    const html = '<p>지금 다뤄야 하는가</p><p>첫 문장에서 결론을 말한다</p>';
    const out = stripDeterministicSynthSkeletonTextNodes(html);
    expect(out).not.toContain('지금 다뤄야 하는가');
    expect(out).toContain('첫 문장에서 결론을 말한다');
  });

  it('두 번 heal 해도 합성 문구가 되살아나지 않는다', () => {
    const once = healProductLaunchLeftoverCatalogCopy(
      buildSyntheticSkeletonDeck(),
      WRITING_TIPS,
    );
    const twice = healProductLaunchLeftoverCatalogCopy(once, WRITING_TIPS);
    // 두 번째 패스는 빈 <p></p> 같은 잔여 노드만 더 줄일 수 있다. 카피 재주입 없음.
    expect(twice).not.toContain('지금 다뤄야 하는가');
    expect(twice).not.toContain('자주 쓰이는 용어와 원리');
    expect(twice).not.toContain('에 대한 2');
    expect(twice).not.toContain(`${WRITING_TIPS} 실무`);
    expect(twice.length).toBeLessThanOrEqual(once.length);
  });
});

describe('1007-N01 슬라이스 F — thin 폴백이 합성 스켈레톤을 주입하지 않는다', () => {
  it('글쓰기 팁 + 빈 모델 HTML → recover 가 null (합성 주입 거부)', () => {
    const recovered = recoverShortDeckByPaddingToSeed({
      seedHtml: productLaunchSeed(3),
      modelHtml: '<!doctype html><html lang="ko"><head><title>empty</title></head><body></body></html>',
      brief: `${WRITING_TIPS} 슬라이드 만들어줘`,
      deckTitle: WRITING_TIPS,
    });
    expect(recovered).toBeNull();
  });

  it('엔티티 소개 브리프는 기존 json 시드 합성을 유지한다(경로 불변)', () => {
    const recovered = recoverShortDeckByPaddingToSeed({
      seedHtml: productLaunchSeed(3),
      modelHtml: '<!doctype html><html lang="ko"><head><title>empty</title></head><body></body></html>',
      brief: '삼성전자 소개 발표자료 만들어줘',
      deckTitle: '삼성전자',
    });
    // json/엔티티 소개 강등 경로는 기존처럼 시드를 채울 수 있다.
    // 합성 시드가 나와도 최종 덱 지문(지금 다뤄야)은 일반 지식 preset 전용이라
    // 서비스 인트로 pack 이면 다른 문장이다. null 이어도 기존 호출부 seed 유지.
    if (recovered?.html) {
      expect(recovered.html).not.toContain('지금 다뤄야 하는가');
      expect(recovered.html).not.toContain('자주 쓰이는 용어와 원리');
    }
  });
});

describe('1007-N01 슬라이스 F — json 시드 빌더는 엔티티 소개에서만 스켈레톤을 써도 된다', () => {
  it('합성 outline 함수 자체는 남아 있고, 글쓰기 팁 outline 을 persist 하면 지문이 제거된다', () => {
    const outline = synthesizeTemplateCloneOutlineFromBrief({
      userBrief: WRITING_TIPS,
      deckTitle: WRITING_TIPS,
      slideCount: 6,
    });
    expect(outline).not.toBeNull();
    const joined = (outline?.slides ?? [])
      .map((slide) => `${slide.lead ?? ''} ${slide.body ?? ''}`)
      .join('\n');
    // 시드 빌더는 여전히 지문을 만들 수 있다(json AI rewrite 전 시드).
    // persist heal 이 최종본에서 제거하는 것이 계약.
    expect(looksLikeDeterministicSynthSkeletonCopy(joined)).toBe(true);
    const seed = productLaunchSeed(6);
    const filled = healProductLaunchLeftoverCatalogCopy(
      // persist 직후 형태: 시드 문장이 슬롯에 박힌 상태.
      seed.replace(
        'Slide 2',
        '왜 글을 매력적으로 쓰는 팁을 지금 다뤄야 하는가',
      ).replace(
        '<p class="dim"></p>',
        '<p class="dim">글을 매력적으로 쓰는 팁에서 자주 쓰이는 용어와 원리를 짧고 정확하게 정의</p>',
      ),
      WRITING_TIPS,
    );
    expect(filled).not.toContain('지금 다뤄야 하는가');
    expect(filled).not.toContain('자주 쓰이는 용어와 원리');
  });
});
