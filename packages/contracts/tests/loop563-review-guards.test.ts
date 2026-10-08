import { describe, expect, it } from 'vitest';
import {
  cleanProductLaunchBrokenHostCopy,
  healProductLaunchLeftoverCatalogCopy,
  officialLookIsProductLaunchHalo,
} from '../src/template-clone-fill.js';

/**
 * 1007-N01 코드리뷰 가드 — "임의 폴백 금지 + 빈칸=박스수 조절 + 중복 축약" 변경에서
 * 발견한 2개 엣지케이스가 회귀하지 않도록 고정한다.
 */
describe('loop563 리뷰 가드 — 정당한 콘텐츠 보존', () => {
  const deck = [
    '<!DOCTYPE html><html lang="ko"><body>',
    '<section class="slide tpl-product-launch" data-title="Cover">',
    '  <h1 class="h1">제품 소개 2024</h1>',
    '</section>',
    '<section class="slide" data-title="Flow">',
    '  <h2 class="h2">실행 흐름 안내</h2>',
    '  <div class="stack">',
    '    <div class="step"><div class="n">1</div><div><h4>첫 단계 제목</h4>',
    '      <p class="dim">같은 문장이 여러 단계에 반복되는 호스트 합성 본문이다.</p></div></div>',
    '    <div class="step"><div class="n">2</div><div><h4>둘째 단계 제목</h4>',
    '      <p class="dim">같은 문장이 여러 단계에 반복되는 호스트 합성 본문이다.</p></div></div>',
    '    <div class="step"><div class="n">3</div><div><h4>셋째 단계 제목</h4>',
    '      <p class="dim">세 번째 단계에만 있는 서로 다른 별개 설명 문장이다.</p></div></div>',
    '  </div>',
    '</section>',
    '</body></html>',
  ].join('\n');

  it('product-launch halo로 인식된다(heal 발동 전제)', () => {
    expect(officialLookIsProductLaunchHalo(deck)).toBe(true);
  });

  it('cleaner: "소개 N" 중복 넘버만 지우고 연도(소개 2024)는 보존한다', () => {
    // 섹션 인덱스(1~2자리) 접미만 제거.
    expect(cleanProductLaunchBrokenHostCopy('<h1 class="h1">Teamver 소개 2</h1>'))
      .toBe('<h1 class="h1">Teamver 소개</h1>');
    expect(cleanProductLaunchBrokenHostCopy('<h2 class="h2">한눈에 3</h2>'))
      .toBe('<h2 class="h2">한눈에</h2>');
    // 3자리+ 숫자(연도 등)는 모델 콘텐츠로 보존.
    expect(cleanProductLaunchBrokenHostCopy('<h1 class="h1">제품 소개 2024</h1>'))
      .toContain('제품 소개 2024');
  });

  it('cleaner: 깨진 조사만 고치고, 유효 텍스트/플레이스홀더 경계를 지킨다', () => {
    expect(cleanProductLaunchBrokenHostCopy('<p>핵심 주제이 해결한다</p>'))
      .toContain('핵심 주제가 해결한다');
    // 노드 전체가 "핵심 N"일 때만 비운다. "핵심 3가지 원칙"은 보존.
    expect(cleanProductLaunchBrokenHostCopy('<h2 class="h2">핵심 3가지 원칙</h2>'))
      .toContain('핵심 3가지 원칙');
    // 조사 교정이 비한글 경계를 넘지 않는다("주제이론"은 그대로).
    expect(cleanProductLaunchBrokenHostCopy('<p>본주제이론 설명</p>'))
      .toContain('본주제이론 설명');
  });

  it('demote: 실제 금액 price-card는 보존하고, synth amount(한 화면) 카드만 격하한다', () => {
    const pricingDeck = [
      '<!DOCTYPE html><html lang="ko"><body>',
      '<section class="slide tpl-product-launch" data-title="Pricing">',
      '  <h2 class="h2">요금 안내</h2>',
      '  <div class="grid g2" style="grid-template-columns:repeat(2, minmax(0,1fr))">',
      '    <div class="price-card"><h4>프로 플랜</h4><div class="amount">₩9,900</div>',
      '      <p class="dim">월 구독으로 모든 기능을 제공하는 상세 설명 문장이다.</p></div>',
      '    <div class="price-card"><h4>베이직 플랜</h4><div class="amount">한 화면</div>',
      '      <p class="dim">기본 기능만 포함하는 상세 설명 문장이다.</p></div>',
      '  </div>',
      '</section>',
      '</body></html>',
    ].join('\n');
    const healed = healProductLaunchLeftoverCatalogCopy(pricingDeck, '요금제 안내');
    // 실제 금액(₩9,900)과 그 카드 본문은 그대로 보존.
    expect(healed).toContain('₩9,900');
    expect(healed).toContain('월 구독으로 모든 기능을 제공하는 상세 설명 문장이다.');
    expect(healed).toContain('price-card');
    // synth amount('한 화면')는 제거되고 해당 카드는 feature-card로 격하, 본문은 보존.
    expect(healed).not.toContain('한 화면');
    expect(healed).toContain('feature-card');
    expect(healed).toContain('기본 기능만 포함하는 상세 설명 문장이다.');
  });

  it('반복 step dim은 첫 개만 남기고 중복만 비우되, 정당한 별개 문장은 보존한다', () => {
    const healed = healProductLaunchLeftoverCatalogCopy(deck, '제품 소개');
    const dup = '같은 문장이 여러 단계에 반복되는 호스트 합성 본문이다.';
    const distinct = '세 번째 단계에만 있는 서로 다른 별개 설명 문장이다.';
    // 중복 본문은 정확히 1회만 남는다(지어내지 않고 축약).
    expect(healed.split(dup).length - 1).toBe(1);
    // 서로 다른 별개 문장은 그대로 보존된다.
    expect(healed).toContain(distinct);
    // step 제목(모델 콘텐츠)은 3개 모두 보존된다.
    for (const title of ['첫 단계 제목', '둘째 단계 제목', '셋째 단계 제목']) {
      expect(healed).toContain(title);
    }
  });
});
