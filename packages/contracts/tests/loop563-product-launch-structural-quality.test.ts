import { describe, expect, it } from 'vitest';

import {
  healBlockFrameLeftoverCatalogCopy,
  healProductLaunchLeftoverCatalogCopy,
  listTemplateCloneSlideShells,
} from '../src/template-clone-fill';

const BRIEF = 'Teamver 서비스 소개';

function productLaunchDeck(slides: string): string {
  return [
    '<!doctype html>',
    '<html lang="en" data-od-block-frame-hangul-type="1"><head>',
    '<style>.tpl-product-launch .hero-shot{} .tpl-product-launch .price-card{}</style>',
    '<style data-od-block-frame-hangul-type-css>.card{font-size:18px}</style>',
    '</head><body class="tpl-product-launch">',
    slides,
    '</body></html>',
  ].join('');
}

describe('루프563 · Product Launch cross-kit / structural quality', () => {
  it('Product Launch를 Block Frame healer가 다시 표시하지 않는다', () => {
    const html = productLaunchDeck([
      '<section class="slide">',
      '<h2 class="h2">Teamver 핵심 가치</h2>',
      '<div class="feature-card"><h4>같은 보드</h4><p>파일과 대화를 연결한다.</p></div>',
      '</section>',
    ].join(''));
    const healed = healBlockFrameLeftoverCatalogCopy(html, BRIEF);
    expect(healed).toBe(html);
  });

  it('foreign Block Frame CSS를 제거하고 빈·숫자 제목과 반복 step body를 복구한다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">반복 작업을 바로 공유한다</h2>',
      '<div class="step"><div><h4>파일과 대화를 같은 보드에 모은다</h4><p class="dim">같은 설명</p></div></div>',
      '<div class="step"><div><h4>보기와 고치기 권한을 나눈다</h4><p class="dim">같은 설명</p></div></div>',
      '<div class="step"><div><h4>보낸 뒤에도 이어서 고친다</h4><p class="dim">같은 설명</p></div></div>',
      '</section>',
      '<section class="slide center tc"><p class="kicker">다음 액션</p><h1 class="h1"></h1></section>',
      '<section class="slide dark"><p class="kicker">02</p><h2 class="h2">02</h2>',
      '<div class="card"><h4>핵심 근거</h4><p>AI를 매일 활용하는</p></div></section>',
      '<section class="slide dark"><p class="kicker">도입 로드맵</p>',
      '<div class="row"><div style="flex:1"></div><div><div class="amount">₩0</div>',
      '<a class="cta-btn">지금 시작하기</a></div></div></section>',
    ].join(''));

    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).not.toMatch(/data-od-block-frame-hangul-type/);
    expect(healed).not.toMatch(/<h[12][^>]*>\s*<\/h[12]>/);
    expect(healed).not.toMatch(/<h[12][^>]*>\s*02\s*<\/h[12]>/);
    expect(healed).not.toMatch(/₩0/);
    expect(healed).toMatch(/Teamver가 묶는 일/);
    expect(healed).toMatch(/Teamver 서비스 핵심 근거/);
    expect(healed).toMatch(/Teamver에서 바로 쓰는 것/);
    expect(healed).toMatch(/AI를 매일 활용하는 핵심 사용자층/);
    expect(healed).toMatch(/맥락 전환과 중복 작업을 줄인다/);
    expect(healed).toMatch(/협업 경계를 분명히 한다/);
    expect(healed).toMatch(/변경 이력을 남긴다/);
    expect((healed.match(/같은 설명/g) ?? []).length).toBe(0);
    expect(listTemplateCloneSlideShells(healed)).toHaveLength(4);
  });

  it('인접한 cover/introducing 제목이 같으면 두 번째 제목을 문제 정의로 분리한다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h1 class="h1">Teamver 소개</h1></section>',
      '<section class="slide center tc"><p class="kicker">문제 정의</p><h1 class="h1">Teamver 소개</h1></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect((healed.match(/>Teamver 소개<\/h1>/g) ?? [])).toHaveLength(1);
    expect(healed).toMatch(/Teamver 서비스가 해결하는 문제/);
  });

  it('떨어진 카드 슬라이드의 중복 제목도 서로 다른 역할로 분리한다', () => {
    const cardSlide = '<section class="slide"><h2 class="h2">Teamver 서비스 핵심 근거</h2><div class="card"><h4>항목</h4><p>근거</p></div></section>';
    const html = productLaunchDeck([
      cardSlide,
      '<section class="slide"><h2 class="h2">중간 내용</h2></section>',
      cardSlide,
      cardSlide,
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect((healed.match(/>Teamver 서비스 핵심 근거<\/h2>/g) ?? [])).toHaveLength(1);
    expect(healed).toMatch(/Teamver 서비스 운영 근거/);
    expect(healed).toMatch(/Teamver 서비스 적용 사례/);
  });

  it('price-card 숫자형 슬라이드는 도입 로드맵이 아니라 활용 시나리오로 복구한다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">주제에서 초안이 열린다</h2>',
      '<div class="price-card"><h4>실무</h4><div class="amount">01</div><p class="dim">업무 장면</p></div>',
      '</section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).toMatch(/Teamver 서비스 활용 시나리오/);
    expect(healed).not.toMatch(/Teamver 서비스 도입 로드맵/);
  });
});
