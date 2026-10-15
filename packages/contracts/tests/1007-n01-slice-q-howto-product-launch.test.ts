import { describe, expect, it } from 'vitest';

import {
  briefLooksLikeGeneralKnowledgeHowToTopic,
  dropDuplicateProductLaunchLayoutClones,
  headingHasDanglingInstructionParticle,
  healAiGeneratedDeckMarkup,
  healProductLaunchLeftoverCatalogCopy,
  looksLikeDeterministicSynthSkeletonCopy,
  polishInstructionCoverTitle,
  polishTruncatedInstructionTitles,
  productLaunchSlideLayoutFingerprint,
} from '../src/index.js';

const WRITING_TIPS = '글을 매력적으로 쓰는 팁';

/**
 * Mirrors `.cursor/scratch/v1416-regression-deck-5-howto-product-launch.html`
 * (not committed). User HTML uses `지금 다뤄야` — not the `다뤘야` typo.
 */
function loadUserFixture(): string {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"/>',
    `<title>${WRITING_TIPS}에 대한</title></head>`,
    '<body class="tpl-product-launch">',
    '<section class="slide dark slide-title" data-title="Cover">',
    `<p class="kicker">${WRITING_TIPS} — 핵심 맥락과 다음 단계를 정리합니다</p>`,
    `<h1 class="h1">${WRITING_TIPS}에 대한</h1>`,
    '<div class="deck-footer"></div><div class="hero-shot"></div></section>',
    '<section class="slide center tc" data-title="Introducing"><div>',
    `<p class="kicker">왜 ${WRITING_TIPS}을 지금 다뤄야 하는가</p>`,
    `<h1 class="h1" style="font-size:140px">${WRITING_TIPS}에 대한 2</h1></div></section>`,
    '<section class="slide" data-title="Sound"><p class="kicker">01 · The sound</p>',
    '<h2 class="h2">핵심 포인트</h2><div class="grid g3 mt-l">',
    '<div class="feature-card"><div class="icon">♪</div><h4>개념</h4><p class="dim">팁에서 자주 쓰이는 용어와 원리를 짧고 정확하게 정의</p></div>',
    '<div class="feature-card"><div class="icon">◈</div><h4>구조</h4><p class="dim">팁을 이루는 구성 요소와 서로 연결되는 방식을 설명</p></div>',
    '<div class="feature-card"><div class="icon">◐</div><h4>영향</h4><p class="dim">팁이 실제 의사결정이나 업무에 만드는 변화를 정리</p></div>',
    '</div></section>',
    '<section class="slide dark" data-title="Fit"><h2 class="h2">핵심 내용</h2>',
    '<div class="grid g3 mt-l"><div class="card"><h4>이해</h4><p>팁의 전체 지도를 먼저 그리고 세부 개념을 그 위에 위치시킨다</p></div>',
    '<div class="card"><h4>비교</h4><p>팁의 대안·사례·실패 패턴을 비교해 차이를 명확히 드러낸다</p></div>',
    '<div class="card"><h4>적용</h4><p>팁을 실제 상황에 적용할 기준과 다음 행동을 한 문장으로 제안</p></div></div></section>',
    '<section class="slide" data-title="Pricing"><h2 class="h2">사례로 보는 차이</h2>',
    '<div class="grid g3 mt-l">',
    '<div class="price-card"><h4>좋은 사례</h4><div class="amount"></div><ul><li>좋은 사례</li></ul></div>',
    '<div class="price-card"><h4>주의 사례</h4><div class="amount"></div><ul><li>주의 사례</li></ul></div>',
    '<div class="price-card"><h4>전환점</h4><div class="amount"></div><ul><li>전환점</li></ul></div>',
    '</div></section>',
    '<section class="slide" data-title="Steps"><h2 class="h2">실행 체크리스트</h2>',
    '<div class="stack"><div class="step"><div class="n">1</div><div><h4>준비</h4>',
    '<p class="dim">팁에 필요한 자료·이해관계자·현재 상태를 먼저 확인</p></div></div>',
    '<div class="step"><div class="n">2</div><div><h4>운영</h4>',
    '<p class="dim">팁을 작은 범위에서 실행하고 피드백을 빠르게 반영</p></div></div>',
    '<div class="step"><div class="n">3</div><div><h4>검증</h4>',
    '<p class="dim">팁의 성과 지표와 실패 신호를 함께 정의해 다음 단계를 결정</p></div></div></div></section>',
    '<section class="slide dark" data-title="Ship"><p class="kicker">— ,  · early review</p>',
    '<h2 class="h2"></h2><div style="font-size:96px;font-weight:900"></div>',
    '<p> · from</p><a class="cta-btn mt-l" href="#">정리와 다음 단계 시작하기</a>',
    '<p class="warranty">· 2-year warranty</p></section>',
    '<section class="slide" data-title="Intelligence"><p class="kicker">03 · The intelligence</p>',
    '<h2 class="h2">핵심 질문</h2><div class="grid g2 mt-l">',
    '<div class="feature-card"><h4>배경</h4><p class="dim">팁의 배경과 현재 논의가 필요한 이유를 한두 문장으로 정리</p></div>',
    '<div class="feature-card"><h4>핵심 질문</h4><p class="dim">팁에서 청중이 가장 먼저 이해해야 할 핵심 질문을 제시</p></div>',
    '</div></section>',
    '<section class="slide" data-title="Sound"><p class="kicker">01 · The sound</p>',
    '<h2 class="h2">경로</h2><div class="grid g3 mt-l">',
    '<div class="feature-card"><div class="icon">♪</div><h4>개념</h4><p class="dim">팁에서 자주 쓰이는 용어와 원리를 짧고 정확하게 정의</p></div>',
    '<div class="feature-card"><div class="icon">◈</div><h4>구조</h4><p class="dim">팁을 이루는 구성 요소와 서로 연결되는 방식을 설명</p></div>',
    '<div class="feature-card"><div class="icon">◐</div><h4>영향</h4><p class="dim">팁이 실제 의사결정이나 업무에 만드는 변화를 정리</p></div>',
    '</div></section>',
    '<section class="slide center tc" data-title="Introducing"><h1 class="h1">성과 지표</h1></section>',
    '</body></html>',
  ].join('');
}

function persistHeal(html: string, brief = `${WRITING_TIPS} 슬라이드 만들어줘`): string {
  return healAiGeneratedDeckMarkup(
    healProductLaunchLeftoverCatalogCopy(html, brief),
    brief,
  );
}

describe('1007-N01 슬라이스 Q — how-to 가 product-launch 킷에 살지 않는다', () => {
  it('글쓰기 팁은 여전히 how-to 다', () => {
    expect(briefLooksLikeGeneralKnowledgeHowToTopic(WRITING_TIPS)).toBe(true);
    expect(briefLooksLikeGeneralKnowledgeHowToTopic(`${WRITING_TIPS}에 대한`)).toBe(true);
  });

  it('에 대한 / 에 대한 2 는 끝 조사만 벗기고 온토픽 구절을 남긴다', () => {
    expect(headingHasDanglingInstructionParticle(`${WRITING_TIPS}에 대한`)).toBe(true);
    expect(headingHasDanglingInstructionParticle(`${WRITING_TIPS}에 대한 2`)).toBe(true);
    expect(headingHasDanglingInstructionParticle('개인정보에 대한 안내')).toBe(false);
    expect(polishInstructionCoverTitle(`${WRITING_TIPS}에 대한`)).toBe(WRITING_TIPS);
    expect(polishInstructionCoverTitle(`${WRITING_TIPS}에 대한 2`)).toBe(WRITING_TIPS);
    const polished = polishTruncatedInstructionTitles(
      `<h1 class="h1">${WRITING_TIPS}에 대한 2</h1>`,
    );
    expect(polished).toContain(WRITING_TIPS);
    expect(polished).not.toMatch(/에\s*대한/);
    const kept = persistHeal(
      [
        '<!doctype html><html><body class="tpl-product-launch">',
        '<section class="slide dark" data-title="Cover"><h1 class="h1">개인정보에 대한 안내</h1></section>',
        '<section class="slide"><h2>실전 원칙</h2><p>수집 최소와 목적 외 이용 금지를 한 화면에 둔다.</p></section>',
        '<section class="slide"><h2>적용 순서</h2><p>동의 범위부터 확인하고 로그를 남긴다.</p></section>',
        '</body></html>',
      ].join(''),
      '개인정보에 대한 안내 슬라이드 만들어줘',
    );
    expect(kept).toContain('개인정보에 대한 안내');
  });

  it('다뤄야 스켈레톤과 팁에서/을 정의 지문을 합성으로 본다', () => {
    expect(looksLikeDeterministicSynthSkeletonCopy(
      '왜 글을 매력적으로 쓰는 팁을 지금 다뤄야 하는가',
    )).toBe(true);
    expect(looksLikeDeterministicSynthSkeletonCopy(
      '팁에서 자주 쓰이는 용어와 원리를 짧고 정확하게 정의',
    )).toBe(true);
    expect(looksLikeDeterministicSynthSkeletonCopy(
      '첫 문장에서 결론을 말해 독자의 기대를 잡는다',
    )).toBe(false);
  });
});

describe('1007-N01 슬라이스 Q — 사용자 회귀 픽스처 persist heal', () => {
  it('how-to 덱에서 price-card·Ship warranty·에 대한·Sound 클론이 사라진다', () => {
    const source = loadUserFixture();
    expect(source).toContain('price-card');
    expect(source).toContain('2-year warranty');
    expect(source).toContain('early review');
    expect(source).toContain('지금 다뤄야');
    expect(source).not.toContain('지금 다뤘야');
    expect((source.match(/data-title="Sound"/g) ?? []).length).toBe(2);

    const out = persistHeal(source);
    expect(out).toContain(WRITING_TIPS);
    expect(out).not.toMatch(/에\s*대한(?:\s*\d+)?/);
    expect(out).not.toContain('2-year warranty');
    expect(out).not.toContain('early review');
    expect(out).not.toMatch(/font-size\s*:\s*96px[^>]*>\s*</);
    expect(out).not.toMatch(/cta-btn/);
    expect(out).not.toContain('price-card');
    expect((out.match(/data-title="Sound"/g) ?? []).length).toBeLessThan(2);
    expect(out).not.toContain('지금 다뤄야 하는가');
    expect(out).not.toContain('자주 쓰이는 용어와 원리');
    expect(out).not.toMatch(/첫 문장에서 결론을|한 문장 한 메시지/);
  });

  it('같은 Sound g3 트리플릿 클론은 1장만 남긴다', () => {
    const source = loadUserFixture();
    const soundFp = productLaunchSlideLayoutFingerprint(
      source.match(/<section class="slide"[^>]*data-title="Sound"[\s\S]*?<\/section>/i)?.[0] ?? '',
    );
    expect(soundFp).toContain('sound::');
    expect(soundFp).toContain('개념');
    expect(soundFp).toContain('자주 쓰이는 용어와 원리');
    const deduped = dropDuplicateProductLaunchLayoutClones(source);
    expect((deduped.match(/data-title="Sound"/g) ?? []).length).toBe(1);
    expect(deduped).toContain('핵심 포인트');
    expect((deduped.match(/<h2 class="h2">경로<\/h2>/g) ?? []).length).toBe(0);
  });

  it('같은 레이아웃이어도 카드 본문이 다른 장은 유지한다', () => {
    const html = [
      '<body class="tpl-product-launch">',
      '<section class="slide dark" data-title="Cover"><h1>글을 매력적으로 쓰는 팁</h1></section>',
      '<section class="slide" data-title="Sound"><h2>핵심 포인트</h2><div class="grid g3">',
      '<div class="feature-card"><h4>개념</h4><p class="dim">첫 문장에서 결론을 말해 기대를 잡는다.</p></div>',
      '<div class="feature-card"><h4>구조</h4><p class="dim">한 문단은 한 생각만 담는다.</p></div>',
      '<div class="feature-card"><h4>영향</h4><p class="dim">독자가 끝까지 읽게 된다.</p></div>',
      '</div></section>',
      '<section class="slide" data-title="Sound"><h2>연습</h2><div class="grid g3">',
      '<div class="feature-card"><h4>개념</h4><p class="dim">제목 없이 본문만 쓰고 나중에 붙인다.</p></div>',
      '<div class="feature-card"><h4>구조</h4><p class="dim">소리 내어 읽고 걸리는 곳을 고친다.</p></div>',
      '<div class="feature-card"><h4>영향</h4><p class="dim">다음 초안이 짧아진다.</p></div>',
      '</div></section>',
      '</body>',
    ].join('');
    const out = dropDuplicateProductLaunchLayoutClones(html);
    expect((out.match(/data-title="Sound"/g) ?? []).length).toBe(2);
    expect(out).toContain('첫 문장에서 결론을 말해 기대를 잡는다.');
    expect(out).toContain('제목 없이 본문만 쓰고 나중에 붙인다.');
  });

  it('모델이 채운 CTA·96px 는 비우지 않는다', () => {
    const html = [
      '<!doctype html><html><body class="tpl-product-launch">',
      '<section class="slide dark" data-title="Cover"><h1 class="h1">글을 매력적으로 쓰는 팁</h1></section>',
      '<section class="slide"><h2>오늘 연습</h2><p>소리 내어 읽고 걸리는 문장만 고친다.</p></section>',
      '<section class="slide dark" data-title="Ship">',
      '<div style="font-size:96px;font-weight:900">지금 한 문장</div>',
      '<a class="cta-btn mt-l" href="#">소리 내어 읽고 고치기</a>',
      '<p class="testimonial">독자가 끝까지 읽었다는 회신이 왔다.</p>',
      '</section>',
      '</body></html>',
    ].join('');
    const out = persistHeal(html);
    expect(out).toContain('소리 내어 읽고 고치기');
    expect(out).toContain('지금 한 문장');
    expect(out).toContain('독자가 끝까지 읽었다는 회신이 왔다.');
  });
});

describe('1007-N01 슬라이스 R — 커버만 있는 how-to 첫 persist', () => {
  it('커버 제목을 유지하고 합성 글쓰기 팁을 넣지 않는다', () => {
    const html = [
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
      `<title>${WRITING_TIPS}</title></head>`,
      '<body class="tpl-product-launch">',
      '<section class="slide s-cover">',
      '<div data-od-slide-flow><div class="blocks"><div class="b1"></div><div class="b2"></div>',
      '<div class="b3"></div><div class="b4"></div></div>',
      `<div class="titlewrap"><h1 class="title">글을 매력적으로<br><em>쓰는 팁</em></h1></div>`,
      '<div class="sunglow"></div></div>',
      '<div data-od-official-motif-html class="hero-shot"></div>',
      '</section></body></html>',
    ].join('');
    const out = persistHeal(html);
    expect(out).toContain(WRITING_TIPS);
    expect(out).toMatch(/<em>쓰는 팁<\/em>/);
    expect(out).not.toMatch(/첫 문장에서 결론을|한 문장 한 메시지|지금 다뤄야/);
    expect((out.match(/<section\b[^>]*class="[^"]*\bslide\b/gi) ?? []).length).toBe(1);
  });
});
