import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  healBlockFrameLeftoverCatalogCopy,
  healProductLaunchLeftoverCatalogCopy,
  listTemplateCloneSlideShells,
  sanitizePersistedDeckHostLeaks,
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
    // 구조 복구는 유지: foreign CSS·빈/숫자 제목·₩0 제거, slide 수 보존.
    expect(healed).not.toMatch(/data-od-block-frame-hangul-type/);
    expect(healed).not.toMatch(/<h[12][^>]*>\s*<\/h[12]>/);
    expect(healed).not.toMatch(/<h[12][^>]*>\s*02\s*<\/h[12]>/);
    expect(healed).not.toMatch(/₩0/);
    // 1007-N01 — 임의 폴백 금지(Teamver 덱 포함): 지어낸 역할 카피/본문을 넣지
    // 않는다. 모델이 쓴 step 제목은 그대로 둔다.
    expect(healed).not.toMatch(/묶는 일|모으는 일|바로 쓰는 것/);
    expect(healed).not.toMatch(/맥락 전환과 중복 작업을 줄인다|협업 경계를 분명히 한다|변경 이력을 남긴다/);
    expect(healed).toMatch(/파일과 대화를 같은 보드에 모은다/);
    expect(listTemplateCloneSlideShells(healed)).toHaveLength(4);
  });

  it('인접한 cover/introducing 제목이 같으면 두 번째 제목을 문제 정의로 분리한다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h1 class="h1">Teamver 소개</h1></section>',
      '<section class="slide center tc"><p class="kicker">문제 정의</p><h1 class="h1">Teamver 소개</h1></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    // 중복 제목은 "지어낸 Teamver 문장"이 아니라 덱 topic 파생 라벨로만 분리한다.
    expect((healed.match(/>Teamver 소개<\/h1>/g) ?? [])).toHaveLength(1);
    expect(healed).toMatch(/핵심 내용|핵심 근거|활용 시나리오|이어 쓰기|실행 흐름|시작하세요/);
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
    // 1007-N01 — 중복 제목을 지어낸 라벨(운영 근거/적용 사례/실행 기준)로
    // 분리하지 않는다. 모델이 쓴 카드 내용은 그대로 둔다.
    expect(healed).not.toMatch(/운영 근거|적용 사례|실행 기준/);
    expect(healed).toMatch(/>\s*항목\s*</);
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
    // 1007-N01 — 중복 슬로건을 지어낸 라벨로 교체하지 않는다(모델 본문 보존).
    expect(healed).toMatch(new RegExp(slogan));
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
    // 제너릭 카드 제목은 topic 파생 라벨로 정리된다(원시 leftover 라벨 제거).
    expect(healed).not.toMatch(/>\s*핵심 가치\s*</);
    expect(healed).not.toMatch(/>\s*사용 장면\s*</);
    expect(healed).not.toMatch(/font-size:\s*140px/);
    expect(healed).not.toMatch(/<\s+div\b|<\s*>|<\/\s*>/);
    // 1007-N01 — 2카드 grid는 세 번째 카드를 지어내지 않고 g2로 맞춘다.
    expect((healed.match(/\bfeature-card\b/g) ?? []).length).toBe(2);
    expect(healed).toMatch(/class="[^"]*\bg2\b/);
    expect(healed).not.toMatch(/class="[^"]*\bg3\b/);
    expect(healed).toMatch(/<\/div><div data-od-official-motif-html class="hero-shot"/);
    expect(healed).toMatch(/data-od-slide-flow[^>]*padding:\s*80px 112px/);
    expect(healed).not.toMatch(/padding:\s*56px 72px/);
  });

  it('카드가 2개면 g3를 g2로 줄이고 세 번째 카드를 지어내지 않는다', () => {
    const titles = [
      '같은 보드',
      '권한 경계',
      '결과 이력',
      '초안',
      '수정',
      '공유',
      '혼자 시작',
      '팀과 고치기',
      '리뷰',
      '한 팀 보드',
      '리뷰 습관',
      '조직 기준',
    ];
    const sparse = [
      '<section class="slide"><h2 class="h2">쓰임</h2>',
      '<div class="grid g3 mt-l">',
      `<div class="feature-card"><h4>${titles[0]}</h4><p class="dim">파일과 대화를 한 보드에 둔다.</p></div>`,
      `<div class="feature-card"><h4>${titles[1]}</h4><p class="dim">보기와 고치기를 나눈다.</p></div>`,
      '</div></section>',
    ].join('');
    const rest = titles.slice(2).map((title) => (
      `<section class="slide"><h2 class="h2">${title} 장면</h2><div class="feature-card"><h4>${title}</h4><p class="dim">${title}을 같은 화면에서 둔다.</p></div></section>`
    )).join('');
    const healed = healProductLaunchLeftoverCatalogCopy(productLaunchDeck(sparse + rest), BRIEF);
    const sparseSlide = (healed.match(/<section\b[\s\S]*?<\/section>/gi) ?? [])
      .find((section) => section.includes('15분 회화') || section.includes('쓰임')) ?? '';
    // 1007-N01 — 2카드 grid는 g2로 맞추고 세 번째 카드를 지어내지 않는다.
    expect(sparseSlide).toMatch(/\bg2\b/);
    expect(sparseSlide).not.toMatch(/\bg3\b/);
    expect((sparseSlide.match(/\bfeature-card\b/g) ?? []).length).toBe(2);
    expect(healed).not.toMatch(/\$\s*\d|₩\s*\d/);
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
    // 1007-N01 — 빈 amount에 "한 화면" 라벨을 지어넣지 않는다(빈 노드는 제거).
    expect(healed).not.toMatch(/<div[^>]*\bamount\b[^>]*>\s*한 화면\s*<\/div>/);
    expect(healed).not.toMatch(/<div[^>]*\bamount\b[^>]*>\s*<\/div>/);
    // 모델이 쓴 price-card 본문은 보존한다.
    expect(healed).toMatch(/한 화면에서 초안을 고친다/);
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
    // 1007-N01 — 모델 lead가 없는 커버에 lede를 지어내지 않는다.
    expect(healed).not.toMatch(/class="lede"/);
  });

  it('pack close dump·반복 한눈에 kicker·표지 hero-shot·깨진 조사를 고친다', () => {
    const html = productLaunchDeck([
      '<section class="slide dark slide-title"><div data-od-slide-flow style="padding:80px 112px">',
      '<p class="kicker">Teamver 한눈에</p><h1 class="h1">Teamver 소개</h1></div>',
      '<div class="brand" style="position:relative">Teamver</div></section>',
      '<section class="slide"><p class="kicker">Teamver 한눈에</p><h2 class="h2">장면</h2>',
      '<div class="feature-card"><h4>초안</h4><p class="dim">Teamver 보드에 붙일 초안이 같은 자리에서 열린다.</p></div></section>',
      '<section class="slide"><h2 class="h2">활용</h2>',
      '<div class="price-card"><h4>팀과 고치기</h4><p class="dim">보기와 고치기를 나눠같이 고친다.</p></div></section>',
      '<section class="slide dark"><p class="kicker">Teamver에서 쓸 방을 열고 첫 보드에 팀을 초대한다.</p>',
      '<p class="testimonial">Teamver에서 쓸 방을 열고 첫 보드에 팀을 초대한다.를 쓰기 시작한 뒤, 작업이 한곳으로 모이기 시작했다.</p>',
      '<a class="cta-btn">Teamver에서 쓸 방을 열고 첫 보드에 팀을 초대한다. 시작하기</a></section>',
      '<section class="slide center tc"><p class="kicker">Teamver가 풀어야 하는 문제</p>',
      '<h1 class="h1">보드에서 이어 쓰기</h1>',
      '<p class="lede">Teamver에서 쓸 방을 열고 첫 보드에 팀을 초대한다.</p></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).toMatch(/data-od-official-motif-html class="hero-shot"/);
    expect((healed.match(/Teamver 한눈에/g) ?? []).length).toBeLessThanOrEqual(1);
    // 1007-N01 — 본문 문장이 샌 kicker/testimonial 덤프는 제거된다.
    expect(healed).not.toMatch(/<p[^>]*\b(?:kicker|testimonial)\b[^>]*>[^<]*쓸 방을 열고/);
    expect(healed).not.toMatch(/나눠같이/);
    expect(healed).toMatch(/나눠 같이/);
    // 1007-N01 — 덤프 CTA는 지어낸 문장 대신 중립 라벨만, lede 덤프는 비운다.
    expect(healed).toMatch(/시작하기/);
    expect(healed).not.toMatch(/초대한다\.를/);
    expect(healed).not.toMatch(/class="lede"[^>]*>[^<]*쓸 방을 열고/);
  });

  it('빈 dim-dot·Ship 좌캠·price-card 타이틀·kicker↔h1 중복을 persist에서 고친다', () => {
    const html = productLaunchDeck([
      '<section class="slide center tc"><p class="kicker">Teamver가 풀어야 하는 문제</p>',
      '<h1 class="h1">Teamver가 해결하는 문제</h1>',
      '<p class="lede">Teamver는 팀이 같은 맥락에서 AI 초안을 만들고 고치게 한다.</p></section>',
      '<section class="slide"><p class="kicker">쓰는 단위</p><h2 class="h2">Teamver가 남기는 증거</h2>',
      '<div class="price-card"><h4>혼자 시작</h4><div class="amount">한 화면</div><p class="dim">x</p></div>',
      '<div class="price-card pro"><h4>팀과 고치기</h4><div class="amount">한 팀</div><p class="dim">y</p></div>',
      '<div class="price-card"><h4>리뷰</h4><div class="amount">한 정책</div><p class="dim">z</p></div></section>',
      '<section class="slide dark"><p class="kicker">정착 순서</p><h2 class="h2">Teamver 운영</h2>',
      '<div class="row" style="gap:80px"><div style="flex:1"><p class="dim mt-m"> · </p></div>',
      '<div style="flex:0 0 auto;text-align:center">',
      '<div style="font-size:96px;font-weight:900">지금</div>',
      '<a class="cta-btn">지금 시작하기</a>',
      '<p class="dim mt-m" style="font-size:13px"> · </p></div></div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    // 중복 kicker/h1 — kicker가 역할별 라벨로 바뀐다 (brief → "Teamver 서비스").
    expect(healed).not.toMatch(/>\s*Teamver가 풀어야 하는 문제\s*</);
    expect(healed).toMatch(/>\s*Teamver가 해결하는 문제\s*</);
    // price-card 슬라이드 h2 복구 (topic prefix는 brief 파생이라 유연 허용).
    expect(healed).not.toMatch(/>\s*Teamver가 남기는 증거\s*</);
    expect(healed).toMatch(/>\s*Teamver(?:\s+\S+)?\s+쓰임새\s*</);
    // dim-dot orphan 캡션 제거.
    expect(healed).not.toMatch(/<p[^>]*\bdim\b[^>]*>\s*·\s*<\/p>/);
    // 1007-N01 — Ship 좌캠에 지어낸 lede를 넣지 않는다(빈 칸은 비운다).
    expect(healed).not.toMatch(/보드를 열고 함께 고칠 사람을 부른다/);
    // Ship CTA·숫자는 보존.
    expect(healed).toMatch(/>지금</);
    expect(healed).toMatch(/\bcta-btn\b/);
    expect(healed).toMatch(/>\s*혼자 시작\s*</);
  });

  it('이미지 좌캠과 브랜드만 겹치는 kicker는 유지하고 한다.를 조사를 고친다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><p class="kicker">Teamver 작업 흐름</p><h2 class="h2">오늘 할 일</h2>',
      '<p class="lede">팀을 초대한다.를 이 화면에서 정한다.</p></section>',
      '<section class="slide dark"><h2 class="h2">제품 사진</h2>',
      '<div class="row"><div style="flex:1"><img alt="제품" src="x.png"></div>',
      '<div><a class="cta-btn">지금 시작하기</a></div></div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).toMatch(/>\s*Teamver 작업 흐름\s*</);
    expect(healed).toMatch(/초대한 것을/);
    expect(healed).not.toMatch(/초대한다\.를/);
    expect(healed).toMatch(/<img\b[^>]*alt="제품"/);
    expect(healed).not.toMatch(/보드를 열고 함께 고칠 사람/);
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

  it('표지 hero-shot·lede가 persist strip 뒤에도 남고 빈 deck-footer는 없다', () => {
    const html = productLaunchDeck([
      '<style>.slide [data-od-official-motif-html].hero-shot{position:absolute}</style>',
      '<section class="slide dark slide-title"><div data-od-slide-flow style="padding:80px 112px">',
      '<p class="kicker">Teamver 한눈에</p>',
      '<h1 class="h1">Teamver 소개</h1>',
      '<div class="deck-footer"></div>',
      '</div></section>',
      '<section class="slide"><h2 class="h2">다음</h2>',
      '<div class="price-card"><h4>실무</h4><p class="dim">한 화면에서 고친다.</p></div></section>',
    ].join(''));
    const healed = sanitizePersistedDeckHostLeaks(html);
    expect(healed).toMatch(/<\/div><div data-od-official-motif-html class="hero-shot"><\/div>/);
    // 1007-N01 — 커버 lede를 지어내지 않는다(모델 lead 없음 → lede 없음).
    expect(healed).not.toMatch(/초안과 수정/);
    expect(healed).not.toMatch(/deck-footer/);
    expect(healed).toMatch(/class="hero-shot"/);
    // 모델 price-card 본문 보존.
    expect(healed).toMatch(/한 화면에서 고친다/);
  });

  it('pack 소스와 persist 결과 모두 나눠같이를 남기지 않는다', () => {
    const blobs: string[] = [];
    for (let index = 1; index <= 8; index += 1) {
      blobs.push(JSON.stringify(synthesizeTemplateCloneSlideBody(
        'Teamver 서비스 소개',
        '팀과 고치기',
        index,
        'Teamver 서비스 소개',
      )));
    }
    const blob = blobs.join('\n');
    expect(blob).not.toMatch(/나눠같이/);
    expect(blob).toMatch(/나눠 같이/);
    const html = productLaunchDeck(
      '<section class="slide"><div class="price-card"><h4>팀과 고치기</h4><p class="dim">Teamver에서 보기와 고치기를 나눠같이 고친다.</p></div></section>',
    );
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).not.toMatch(/나눠같이/);
    expect(healed).toMatch(/나눠 같이/);
  });

  it('dim/lede 끝의 떨어진 중점만 지우고 초안·리뷰는 유지한다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">보내기</h2>',
      '<p class="dim">팀 AI 워크스페이스 · </p>',
      '<p class="lede">초안·리뷰·버전</p></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).not.toMatch(/워크스페이스\s*·/);
    expect(healed).toMatch(/팀 AI 워크스페이스/);
    expect(healed).toMatch(/초안·리뷰·버전/);
  });

  it('feature-card의 헤드폰 데모 글리프를 제거한다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">기능</h2><div class="grid g3">',
      '<div class="feature-card"><div class="icon">♪</div><h4>초안</h4><p class="dim">보드에 붙일 초안이 열린다.</p></div>',
      '<div class="feature-card"><div class="icon">◈</div><h4>수정</h4><p class="dim">같은 화면에서 문장을 고친다.</p></div>',
      '<div class="feature-card"><div class="icon">◐</div><h4>공유</h4><p class="dim">필요한 사람만 초대한다.</p></div>',
      '</div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    expect(healed).not.toMatch(/[♪◈◐✦✧]/);
    expect(healed).toMatch(/>\s*초안\s*</);
  });

  it('step이 2개뿐이면 세 번째 항목을 지어내지 않고 2개를 유지한다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">도입 단계</h2>',
      '<div class="step"><div class="n">1</div><div><h4>한 팀 보드</h4><p class="dim">기존 문서를 Teamver 보드로 옮긴다.</p></div></div>',
      '<div class="step"><div class="n">2</div><div><h4>리뷰 습관</h4><p class="dim">댓글과 버전을 같은 화면에 고정한다.</p></div></div>',
      '</section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    // 1007-N01 — 세 번째 step을 Teamver 명사 풀에서 지어내지 않는다.
    expect((healed.match(/class="step"/g) ?? []).length).toBe(2);
    expect(healed).not.toMatch(/>\s*(?:같은 보드|권한 경계|결과 이력|조직 기준)\s*</);
    expect(healed).toMatch(/>\s*한 팀 보드\s*</);
    expect(healed).toMatch(/>\s*리뷰 습관\s*</);
  });

  it('flow 없는 flat 덱에서도 글리프·조사·2칸·표지 footer를 고치고 hero-shot은 복제하지 않는다', () => {
    const flat = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'fixtures/loop563-product-launch-flat.html'),
      'utf8',
    );
    expect(flat).not.toMatch(/data-od-slide-flow/);
    expect(flat).not.toMatch(/data-od-deck-fixed-canvas-pin/);
    expect(flat).not.toMatch(/slide-title/);
    expect(flat).toMatch(/나눠같이/);
    expect(flat).toMatch(/[♪◈◐✦✧]/);
    const html = productLaunchDeck(flat);
    const healed = healProductLaunchLeftoverCatalogCopy(html, BRIEF);
    const persisted = sanitizePersistedDeckHostLeaks(html);

    function sectionsOf(source: string): string[] {
      return source.match(/<section\b[\s\S]*?<\/section>/gi) ?? [];
    }
    function countExactClass(source: string, name: string): number {
      const re = /<div\b[^>]*\bclass\s*=\s*["']([^"']+)["'][^>]*>/gi;
      let count = 0;
      for (const match of source.matchAll(re)) {
        const tokens = (match[1] ?? '').trim().split(/\s+/);
        if (tokens.some((token) => token.toLowerCase() === name)) count += 1;
      }
      return count;
    }
    function assertFlatHealed(source: string): void {
      expect(listTemplateCloneSlideShells(source)).toHaveLength(10);
      expect(source).not.toMatch(/[♪◈◐✦✧]/);
      expect(source).not.toMatch(/나눠같이/);
      expect(source).toMatch(/나눠 같이/);
      expect(source).not.toMatch(/<div\b[^>]*\bdeck-footer\b/i);
      expect(source).not.toMatch(/\$\s*\d|₩\s*\d/);
      expect(countExactClass(source, 'hero-shot')).toBe(1);
      // 1007-N01 — 빈 카드 shell이 남지 않는다.
      expect(source).not.toMatch(/<div\b[^>]*\b(?:feature-card|price-card|step|card)\b[^>]*>\s*<\/div>/i);

      const sections = sectionsOf(source);
      expect(sections).toHaveLength(10);
      const cover = sections[0] ?? '';
      expect(cover).toMatch(/\bclass\s*=\s*["'][^"']*\bslide\b[^"']*\bdark\b/);
      expect(countExactClass(cover, 'hero-shot')).toBe(1);
      expect(cover).not.toMatch(/deck-footer/);
      // 커버에 lede를 지어내지 않는다.
      expect((cover.match(/\blede\b/gi) ?? []).length).toBe(0);

      // 1007-N01 — 세 번째 카드를 지어내지 않으므로 grid gN은 모델의 실제 카드
      // 수와 일치한다(빈 박스 없음). 3카드 grid는 g3, 2카드 grid는 g2.
      const seat = sections.find((section) => section.includes('모으는 일')) ?? '';
      expect(countExactClass(seat, 'feature-card')).toBe(3);
      expect(seat).toMatch(/\bg3\b/);
      expect(seat).not.toMatch(/\bg2\b/);

      const board = sections.find((section) => section.includes('바로 쓰는 것')) ?? '';
      expect(countExactClass(board, 'card')).toBe(3);
      expect(board).toMatch(/\bg3\b/);

      const pairFeature = sections.find((section) => section.includes('쓰는 자리')) ?? '';
      expect(countExactClass(pairFeature, 'feature-card')).toBe(2);
      expect(pairFeature).toMatch(/\bg2\b/);
      expect(pairFeature).not.toMatch(/\bg3\b/);

      const pairCard = sections.find((section) => section.includes('같은 자리에')) ?? '';
      expect(countExactClass(pairCard, 'card')).toBe(2);
      expect(pairCard).toMatch(/\bg2\b/);

      const steps = sections.find((section) => /class="step"/.test(section)) ?? '';
      // 2개뿐인 step은 세 번째를 지어내지 않는다.
      expect(countExactClass(steps, 'step')).toBe(2);

      // 1007-N01 — 가격이 아닌 synth amount('한 화면/한 팀/한 정책')를 가진 price-card는
      // feature-card로 격하하고 amount 노드를 제거한다(모델 카드 본문·불릿은 보존).
      const prices = sections.find((section) => section.includes('혼자 시작')) ?? '';
      expect(countExactClass(prices, 'price-card')).toBe(0);
      expect(countExactClass(prices, 'feature-card')).toBe(3);
      // amount(가격 전용) 노드는 제거된다. ('한 화면에서'처럼 본문/불릿에 쓰인 표현은 모델 콘텐츠이므로 보존)
      expect(prices).not.toMatch(/<div[^>]*\bamount\b/);
      expect(prices).toContain('Teamver에서 한 보드를 열고 초안을 붙인다');
    }

    assertFlatHealed(healed);
    assertFlatHealed(persisted);
  });
});

/**
 * 1007-N01 (topic contamination) — Product Launch Halo heal + genericSlideCopyPack
 * 가 모든 product-launch 덱을 Teamver 로 가정하고 Teamver 워크스페이스 카피
 * (같은 보드 · 권한 경계 · 워크스페이스 · 감사 로그 · 초안/수정 · 작업이 한곳으로
 * 모이기)를 주입하던 회귀. 브리프/토픽이 Teamver 가 아니면 heal 은 토픽-충실해야
 * 하고, 좋은 on-topic 본문을 덮어쓰거나 2칸 그리드를 Teamver 3번째 카드로
 * 패딩해서는 안 된다.
 */
describe('1007-N01 · 비-Teamver 토픽 오염 방지 (영어 회화 자가학습)', () => {
  const ENGLISH_BRIEF = '영어 회화 실력, 매일 15분 안에 끌어올리는 법';
  const TEAMVER_COPY_RE =
    /같은 보드|권한 경계|결과 이력|워크스페이스|감사 로그|초안과 수정을 같은 보드|작업이 한곳으로 모이기|파일 밖으로 흩어지지/;

  it('2칸 feature 그리드를 Teamver 카드로 패딩하지 않고 on-topic 본문을 유지한다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">15분 회화 루틴</h2>',
      '<div class="grid g2 mt-l">',
      '<div class="feature-card"><h4>Chunk로 묶어 말하기</h4><p class="dim">자주 쓰는 표현을 덩어리로 외워 말할 때 바로 꺼내 쓴다.</p></div>',
      '<div class="feature-card"><h4>섀도잉 10분</h4><p class="dim">원어민 음성을 따라 말하며 억양과 리듬을 몸에 익힌다.</p></div>',
      '</div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, ENGLISH_BRIEF);
    // Teamver 카피 주입 금지.
    expect(healed).not.toMatch(TEAMVER_COPY_RE);
    // 2칸 유지: 세 번째 Teamver 카드로 패딩하거나 g2→g3 로 넓히지 않는다.
    const seat = (healed.match(/<section\b[\s\S]*?<\/section>/gi) ?? [])
      .find((section) => section.includes('15분 회화 루틴')) ?? '';
    expect((seat.match(/\bfeature-card\b/g) ?? []).length).toBe(2);
    expect(seat).toMatch(/\bg2\b/);
    expect(seat).not.toMatch(/\bg3\b/);
    // on-topic 모델 본문/제목 보존.
    expect(healed).toMatch(/덩어리로 외워 말할 때 바로 꺼내 쓴다/);
    expect(healed).toMatch(/억양과 리듬을 몸에 익힌다/);
    expect(healed).toMatch(/Chunk로 묶어 말하기/);
    expect(healed).toMatch(/섀도잉 10분/);
  });

  it('빈 center 커버에 lede를 지어내지 않는다(모델 lead 없음)', () => {
    const html = productLaunchDeck([
      '<section class="slide center tc slide-title"><div data-od-slide-flow style="padding:80px 112px">',
      '<h1 class="h1">영어 회화 15분 루틴</h1></div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, ENGLISH_BRIEF);
    expect(healed).not.toMatch(TEAMVER_COPY_RE);
    expect(healed).not.toMatch(/AI 초안을 만들고 고치게|보드를 열고 함께 고칠 사람/);
    // 1007-N01 — 임의 폴백 금지: 모델 lead가 없으면 lede를 지어내지 않는다.
    expect(healed).not.toMatch(/class="lede"/);
    // 모델이 쓴 커버 제목은 보존한다.
    expect(healed).toMatch(/영어 회화 15분 루틴/);
  });

  it('price-card 슬라이드에 Teamver 요금/운영 bullet·금액을 주입하지 않는다', () => {
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">학습 플랜</h2>',
      '<div class="price-card"><h4>입문</h4><div class="amount">1주차</div><ul><li>기초 표현 50개를 소리 내어 익힌다</li></ul></div>',
      '<div class="price-card"><h4>중급</h4><div class="amount">4주차</div><ul><li>실전 상황별 대화를 반복 연습한다</li></ul></div>',
      '</section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, ENGLISH_BRIEF);
    expect(healed).not.toMatch(TEAMVER_COPY_RE);
    expect(healed).not.toMatch(/반복 작업을 한 화면|같은 워크스페이스에서 처리|기본 운영으로 둔다/);
    // 모델의 금액/본문 보존 (한 화면/한 팀/한 정책 Teamver 라벨로 교체 금지).
    expect(healed).not.toMatch(/>한 화면<|>한 팀<|>한 정책</);
    expect(healed).toMatch(/1주차/);
    expect(healed).toMatch(/4주차/);
    expect(healed).toMatch(/기초 표현 50개를 소리 내어 익힌다/);
  });

  it('Ship(cta) 슬라이드에 Teamver testimonial 을 지어내지 않는다', () => {
    const html = productLaunchDeck([
      '<section class="slide dark"><p class="kicker">마무리</p><h2 class="h2">오늘 시작하기</h2>',
      '<p class="testimonial">주제를 쓰기 시작한 뒤 바뀐 점</p>',
      '<div class="row"><div style="flex:1"></div>',
      '<div><a class="cta-btn">지금 시작하기</a></div></div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, ENGLISH_BRIEF);
    expect(healed).not.toMatch(TEAMVER_COPY_RE);
    expect(healed).not.toMatch(/쓰기 시작한 뒤, 작업이 한곳으로 모이기 시작했다/);
  });

  it('반복 step body 복구가 비-Teamver 덱에 Teamver step 문장을 주입하지 않는다', () => {
    // 실제 생성 덱(영어 회화)에서 slide6 step 본문이 '조직 기본값으로...',
    // '댓글과 버전을...', '보드로 옮기고 보기·고치기 역할을 나눈다' 로 오염됐다.
    // 출처는 healProductLaunchStructuralQuality 의 반복 step 복구(12922) +
    // healProductLaunchRepeatedCardCopy(12999) 가 productLaunchStepBodyForTitle 로
    // Teamver step body 를 주입하기 때문. allowTeamverCopy 게이트가 걸려야 한다.
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">15분 회화 루틴</h2>',
      '<div class="step"><div><h4>한 팀 보드</h4><p class="dim">같은 설명</p></div></div>',
      '<div class="step"><div><h4>리뷰 습관</h4><p class="dim">같은 설명</p></div></div>',
      '<div class="step"><div><h4>조직 기준</h4><p class="dim">같은 설명</p></div></div>',
      '</section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, ENGLISH_BRIEF);
    expect(healed).not.toMatch(TEAMVER_COPY_RE);
    expect(healed).not.toMatch(/보드로 옮기고|보기·고치기|댓글과 버전|조직 기본값|워크스페이스 기본값/);
  });

  it('받침으로 끝나는 토픽 명사에 조사(이/가·을/를)를 올바르게 붙인다', () => {
    // '공부법'은 받침(ㅂ)으로 끝나므로 토픽-중립 pack 이 '공부법가/공부법를'
    // 같은 깨진 조사를 만들면 안 된다. attachKoreanJosa 로 '공부법이/공부법을'.
    const html = productLaunchDeck([
      '<section class="slide center tc slide-title"><div data-od-slide-flow style="padding:80px 112px">',
      '<h1 class="h1">한국사 공부법 핵심</h1></div></section>',
      '<section class="slide center tc"><div data-od-slide-flow style="padding:80px 112px">',
      '<h2 class="h2">단계별 접근</h2></div></section>',
      '<section class="slide center tc"><div data-od-slide-flow style="padding:80px 112px">',
      '<h2 class="h2">마무리</h2></div></section>',
    ].join(''));
    const healed = healProductLaunchLeftoverCatalogCopy(html, '한국사 공부법으로 시험 준비하기');
    // 깨진 조사 금지.
    expect(healed).not.toMatch(/법가\s|법를\s|법은\s(?!말)/);
    expect(healed).not.toMatch(TEAMVER_COPY_RE);
  });

  it('이미 저장된 non-Teamver 덱의 pack 잔재는 persist 경로에서 토픽-중립화된다', () => {
    // 브리프가 없는 persist/preview 경로. 덱 본문에 Teamver 문자열이 없으면
    // non-Teamver 로 판단하고 남아 있는 pack 카피를 중립화한다.
    const html = productLaunchDeck([
      '<section class="slide"><h2 class="h2">영어 회화 핵심</h2>',
      '<div class="grid g3 mt-l">',
      '<div class="feature-card"><h4>같은 보드</h4><p class="dim">영어 회화에서 초안과 피드백이 파일 밖으로 흩어지지 않는다.</p></div>',
      '<div class="feature-card"><h4>권한 경계</h4><p class="dim">영어 회화에서 보기와 고치기를 슬라이드마다 정한다.</p></div>',
      '<div class="feature-card"><h4>결과 이력</h4><p class="dim">영어 회화에서 누가 언제 바꿨는지 남기고 되돌린다.</p></div>',
      '</div></section>',
    ].join(''));
    const persisted = sanitizePersistedDeckHostLeaks(html);
    expect(persisted).not.toMatch(/같은 보드|권한 경계|결과 이력/);
    expect(persisted).not.toMatch(/파일 밖으로 흩어지지/);
    // 중립 치환 결과가 들어간다.
    expect(persisted).toMatch(/통합 화면|역할 정의|변경 이력/);
  });
});
