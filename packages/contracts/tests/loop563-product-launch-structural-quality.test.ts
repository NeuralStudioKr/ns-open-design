import { describe, expect, it } from 'vitest';

import {
  healBlockFrameLeftoverCatalogCopy,
  healProductLaunchLeftoverCatalogCopy,
  listTemplateCloneSlideShells,
  synthesizeTemplateCloneSlideBody,
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
    expect(healed).toMatch(/AI를 매일 활용하는 팀을 기준으로 도입 범위를 정한다/);
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
    expect(healed).not.toMatch(/<div[^>]*\bamount\b[^>]*>\s*<\/div>/);
  });

  it('덱 전체에서 같은 카드 슬로건은 첫 장만 남기고 leftover kicker와 lang을 고친다', () => {
    const slogan = '파일과 대화를 같은 보드에 모은다';
    const html = productLaunchDeck([
      '<section class="slide"><p class="kicker">Teamver가 다루는 문제와 제공 가치</p>',
      `<h2 class="h2">첫 장면</h2><div class="feature-card"><h4>${slogan}</h4><p class="dim">파일과 대화를 한 맥락으로 연다.</p></div></section>`,
      '<section class="slide"><h2 class="h2">둘째 장면</h2>',
      `<div class="feature-card"><h4>${slogan}</h4><p class="dim">파일과 대화를 한 맥락으로 연다.</p></div></section>`,
      '<section class="slide"><h2 class="h2">셋째 장면</h2>',
      `<div class="card"><h4>${slogan}</h4><p>파일과 대화를 한 맥락으로 연다.</p></div></section>`,
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect((healed.match(new RegExp(slogan, 'g')) ?? [])).toHaveLength(1);
    expect(healed).toMatch(/같은 보드|권한 경계|결과 이력|초안/);
    expect(healed).not.toMatch(/다루는 문제와 제공 가치/);
    expect(healed).toMatch(/<html[^>]*lang="ko"/);
  });

  it('제목이 keepable이어도 leftover 카드·140px·g3 2칸·깨진 태그를 고친다', () => {
    const html = productLaunchDeck([
      '<section class="slide slide-title"><div data-od-slide-flow style="padding:56px 72px">',
      '<h1 class="h1">Teamver 소개</h1><div class="hero-shot"></div></div></section>',
      '<section class="slide"><h2 class="h2">Teamver가 모으는 일</h2>',
      '<div class="grid g3 mt-l">',
      '<div class="feature-card"><h4>핵심 가치</h4><p class="dim">사용자가 즉시 얻는 시간 절감, 품질 개선, 의사결정 지원</p></div>',
      '<div class="feature-card"><h4>사용 장면</h4><p class="dim">도입 전 탐색, 팀 협업, 결과물 생산, 운영 관리</p></div>',
      '</div></section>',
      '<section class="slide center tc"><h1 class="h1" style="font-size:140px;color:#111">Teamver가 해결하는 문제</h1></section>',
      '<section class="slide dark"><h2 class="h2">이어 쓰기</h2>',
      '<div class="card"><h4>쓰는 길</h4><p>랜딩에서 5초 안에 "문서</p></div>',
      '< div=""> <a class="cta-btn">지금 시작하기</a> <></div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).not.toMatch(/>\s*핵심 가치\s*</);
    expect(healed).not.toMatch(/>\s*사용 장면\s*</);
    expect(healed).not.toMatch(/사용자가 즉시 얻는 시간 절감/);
    expect(healed).not.toMatch(/font-size:\s*140px/);
    expect(healed).not.toMatch(/<\s+div\b|<\s*>|<\/\s*>/);
    expect(healed).toMatch(/class="[^"]*\bg2\b/);
    expect(healed).toMatch(/<\/div><div data-od-official-motif-html class="hero-shot"/);
    expect(healed).not.toMatch(/5초 안에 "문서/);
    expect(healed).toMatch(/data-od-slide-flow[^>]*padding:\s*80px 112px/);
    expect(healed).not.toMatch(/padding:\s*56px 72px/);
  });

  it('표지 chrome·영문 킷 잔재·빈 가격칸·센터 lede를 미리보기에 맞춘다', () => {
    const html = productLaunchDeck([
      '<section class="slide slide-title"><div data-od-slide-flow style="padding:56px 72px">',
      '<div class="brand">Teamver</div>',
      '<h1 class="h1">Teamver 소개</h1>',
      '<div class="hero-shot"></div></div></section>',
      '<section class="slide center tc"><p class="kicker">01 · The sound</p>',
      '<h1 class="h1">Teamver가 해결하는 문제</h1></section>',
      '<section class="slide"><h2 class="h2">활용</h2>',
      '<div class="price-card"><h4>실무</h4><div class="amount"></div><p class="dim">한 화면에서 초안을 고친다.</p></div>',
      '</section>',
      '<section class="slide dark"><h2 class="h2">이어 쓰기</h2>',
      '<p class="dim">지금 에이전트와 early review</p>',
      '<div style="font-size:96px;font-weight:900">14일</div>',
      '<p class="dim"> · from · 2-year warranty</p>',
      '<a class="cta-btn">지금 시작하기</a></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).toMatch(/<\/div><div data-od-official-motif-html class="hero-shot"><\/div><div class="brand" style="position:absolute;top:56px;left:112px">/);
    expect(healed).not.toMatch(/01 · The sound|The sound/);
    expect(healed).not.toMatch(/early review|2-year warranty|· from/);
    expect(healed).not.toMatch(/>\s*14일\s*</);
    expect(healed).toMatch(/>지금</);
    expect(healed).toMatch(/<div[^>]*\bamount\b[^>]*>한 화면<\/div>/);
    expect(healed).toMatch(/class="lede"/);
  });

  it('중복 style 속성을 하나로 병합하고 빈 style를 제거한다', () => {
    const html = productLaunchDeck([
      '<section class="slide center tc"><div data-od-slide-flow style="padding:80px 112px">',
      '<p class="kicker">Teamver 한눈에</p>',
      '<h1 class="h1" style="" style="color:#111111!important" style="color:#111111!important">Teamver 작업 흐름</h1>',
      '</div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect((healed.match(/<h1\b[^>]*>/) ?? [''])[0]).not.toMatch(/style=[^>]*style=/);
    expect(healed).not.toMatch(/style=""/);
    expect(healed).toMatch(/color:#111111!important/);
    expect(healed).toMatch(/class="lede"/);
  });

  it('service-intro synth가 leftover 카드 라벨을 다시 넣지 않는다', () => {
    const synth = synthesizeTemplateCloneSlideBody(
      'Teamver 소개',
      '서비스 가치 제안',
      2,
      'Teamver 소개',
    );
    const blob = JSON.stringify(synth);
    expect(blob).not.toMatch(/핵심 가치|사용 장면|차별점/);
    expect(blob).not.toMatch(/사용자가 즉시 얻는 시간 절감/);
    expect(blob).toMatch(/같은 보드|초안|수정|권한/);
  });
});
