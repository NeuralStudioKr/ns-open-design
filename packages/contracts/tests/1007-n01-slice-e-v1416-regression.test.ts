import { describe, it, expect } from 'vitest';

import { healProductLaunchLeftoverCatalogCopy } from '../src/template-clone-fill';

/**
 * 1007-N01 슬라이스 E — v1.4.16 품질 회귀.
 *
 * json slot-fill product-launch 덱에서 관찰된 결함을 heal 레벨에서 교정한다:
 *   결함1 — <title> 태그 ≠ 커버 제목(h1), 커버 .brand 가 커버 h1 과 중복.
 *   결함2 — hero-shot 모티프 ::before 라벨에 문장형 주제가 16자로 잘려 새어 들어감.
 *   결함3 — 모델이 카드를 못 채운 완전히 빈 그리드가 g3 빈 박스로 남음.
 *
 * 공통 입력: product-launch halo 지문(`body.tpl-product-launch` + hero-shot + price-card),
 * 문장형 일반 지식 주제(브랜드가 아님).
 */
const SENTENCE_TOPIC_BRIEF = '글을 매력적으로 쓰는 팁';
const COVER_TITLE = '읽는 사람을 사로잡는 글쓰기';

function buildRegressionDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    '<title>글을 매력적으로 쓰는 팁</title>',
    '<style data-od-official-motif-deco-css>',
    '.slide [data-od-official-motif-html].hero-shot::before{content:"Halo v2";position:absolute;inset:80px}',
    '</style></head>',
    '<body class="tpl-product-launch">',
    // 1. Cover: title tag ≠ h1, brand == h1, hero-shot orb.
    `<section class="slide dark slide-title" data-title="Cover"><div data-od-slide-flow><h1 class="h1">${COVER_TITLE}</h1></div>`,
    `<div class="brand" style="position:absolute;top:56px;left:112px">${COVER_TITLE}</div>`,
    '<div data-od-official-motif-html class="hero-shot"></div></section>',
    // 2. Empty grid slide (title-only + empty g3).
    '<section class="slide dark" data-title="Fit"><div data-od-slide-flow><h2 class="h2">Tip 02 · 한 문단, 한 메시지</h2>',
    '<div class="grid g3 mt-l"></div></div></section>',
    // 3. A real grid with cards (plus a price-card so the halo gate passes).
    '<section class="slide" data-title="Sound"><div data-od-slide-flow><h2 class="h2">Tip 01 · 강한 첫 문장</h2>',
    '<div class="grid g3 mt-l">',
    '<div class="feature-card"><h4>결론부터 제시</h4><p class="dim">요지를 첫 줄에 노출해 기대를 잡습니다.</p></div>',
    '<div class="price-card pro"><h4>구체적 숫자</h4><p class="dim">수치가 신뢰와 흥미를 동시에 만듭니다.</p></div>',
    '</div></div></section>',
    '</body></html>',
  ].join('');
}

describe('1007-N01 슬라이스 E — product-launch json 덱 heal', () => {
  it('결함2 — 문장형 주제가 hero-shot ::before 라벨로 잘려 들어가지 않는다(빈 content)', () => {
    const out = healProductLaunchLeftoverCatalogCopy(buildRegressionDeck(), SENTENCE_TOPIC_BRIEF);
    // 잘린 주제 조각이 모티프 라벨/본문 어디에도 남지 않는다.
    expect(out).not.toContain('글을 매력적으로 쓰는 팁에 대');
    // "Halo v2" 데모 라벨도 사라진다.
    expect(out).not.toContain('content:"Halo v2"');
    // deco css content 는 빈 문자열(장식만, 라벨 없음).
    const deco = /data-od-official-motif-deco-css[^>]*>([\s\S]*?)<\/style>/i.exec(out)?.[1] ?? '';
    expect(deco).toMatch(/content\s*:\s*""/);
    expect(deco).not.toMatch(/content\s*:\s*"[^"]+"/);
  });

  it('결함3 — 카드가 하나도 없는 빈 그리드는 통째로 제거된다', () => {
    const out = healProductLaunchLeftoverCatalogCopy(buildRegressionDeck(), SENTENCE_TOPIC_BRIEF);
    // 빈 g3 그리드 박스가 남지 않는다.
    expect(out).not.toMatch(/<div[^>]*\bgrid\b[^>]*>\s*<\/div>/i);
    // 카드가 있는 그리드는 보존된다(feature-card 유지).
    expect(out).toContain('결론부터 제시');
  });

  it('결함1 — <title> 는 커버 제목과 일치하고, 커버 brand 중복은 비워진다', () => {
    const out = healProductLaunchLeftoverCatalogCopy(buildRegressionDeck(), SENTENCE_TOPIC_BRIEF);
    // <title> 이 보이는 커버 제목으로 동기화된다(브리프 원문이 아니라).
    expect(out).toMatch(new RegExp(`<title[^>]*>${COVER_TITLE}</title>`));
    expect(out).not.toMatch(/<title[^>]*>글을 매력적으로 쓰는 팁<\/title>/);
    // 커버 h1 과 동일하던 .brand 중복은 사라진다(비워지거나 제거됨).
    expect(out).not.toMatch(new RegExp(`<div[^>]*\\bbrand\\b[^>]*>[^<]*${COVER_TITLE}`));
    // 커버 h1 자체는 보존.
    expect(out).toContain(`<h1 class="h1">${COVER_TITLE}</h1>`);
  });

  it('멱등 — 두 번 heal 해도 동일(추가 손상/주입 없음)', () => {
    const once = healProductLaunchLeftoverCatalogCopy(buildRegressionDeck(), SENTENCE_TOPIC_BRIEF);
    const twice = healProductLaunchLeftoverCatalogCopy(once, SENTENCE_TOPIC_BRIEF);
    expect(twice).toBe(once);
  });

  it('브랜드형 짧은 주제는 hero-shot 라벨을 유지한다(과잉 제거 금지)', () => {
    const brandDeck = buildRegressionDeck().replace(COVER_TITLE, 'Teamver');
    const out = healProductLaunchLeftoverCatalogCopy(brandDeck, 'Teamver');
    const deco = /data-od-official-motif-deco-css[^>]*>([\s\S]*?)<\/style>/i.exec(out)?.[1] ?? '';
    // Teamver 는 유효한 짧은 브랜드명 → 라벨로 쓰거나 최소한 잘린 조각이 없다.
    expect(deco).not.toContain('글을 매력적으로');
  });
});
