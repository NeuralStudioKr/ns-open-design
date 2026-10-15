import { describe, expect, it } from 'vitest';

import {
  healAiGeneratedDeckMarkup,
  htmlLooksLikeOfficialRichDeck,
  htmlNeedsSparseSixteenNineFill,
  injectSparseG2FillCss,
  neutralizeClonedDeckModelHtml,
  pinDeckSlidesToFixedCanvas,
  SPARSE_SIXTEEN_NINE_FILL_CSS,
} from '../src/index.js';

const SECRET = '논리적 설득력의 비밀';
const QUOTE_TITLE = '"예벨수록" 잘라내는 편집자의 용기';
const QUOTE_BODY = '“뻔한 문장을 지워야 글이 남는다.”';
const HOW_TO = '독자를 사로잡는 한 문장';

/** Screenshot 1 — title + 데이터/사례. Columns may be bare divs, not feature-card. */
const G2_SLIDE = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>deck</title></head>',
  '<body class="tpl-product-launch">',
  `<section class="slide"><div data-od-slide-flow><h2>${SECRET}</h2>`,
  '<div class="grid g2">',
  '<div class="feature-card"><h4>데이터</h4><p>통계와 수치는 신뢰의 기반이 되지만 출처를 명확히 밝혀야 합니다.</p></div>',
  '<div class="feature-card"><h4>사례</h4><p>실제 사용자의 경험담은 추상적 주장을 구체적인 이야기로 바꿔줍니다.</p></div>',
  '</div></div></section>',
  '</body></html>',
].join('');

const G2_BARE_COLUMNS = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>deck</title></head>',
  '<body class="tpl-product-launch">',
  `<section class="slide"><div data-od-slide-flow><h2>${SECRET}</h2>`,
  '<div class="grid g2">',
  '<div><h4>데이터</h4><p>통계와 수치는 신뢰의 기반이 되지만 출처를 명확히 밝혀야 합니다.</p></div>',
  '<div><h4>사례</h4><p>실제 사용자의 경험담은 추상적 주장을 구체적인 이야기로 바꿔줍니다.</p></div>',
  '</div></div></section>',
  '</body></html>',
].join('');

/** Screenshot 2-like — dark, title, red-border card (not necessarily blockquote), RULE 03. */
const DARK_QUOTE_CARD = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>deck</title></head>',
  '<body class="tpl-product-launch">',
  '<section class="slide dark"><div data-od-slide-flow>',
  `<h2>${QUOTE_TITLE}</h2>`,
  `<div class="card" style="border:1px solid #e11;border-radius:24px"><p>${QUOTE_BODY}</p>`,
  '<cite>— WILLIAM ZINSSER, ON WRITING WELL</cite></div>',
  '<p class="rule-label">RULE 03</p>',
  '<div class="deck-footer">05 / 09</div>',
  '</div></section>',
  '</body></html>',
].join('');

const DARK_QUOTE_BLOCKQUOTE = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>deck</title></head>',
  '<body class="tpl-product-launch">',
  '<section class="slide dark"><div data-od-slide-flow>',
  `<h2>${QUOTE_TITLE}</h2>`,
  `<blockquote style="border:1px solid #e11;border-radius:24px">${QUOTE_BODY}`,
  '<cite>— William Zinsser, On Writing Well</cite></blockquote>',
  '<p class="rule-label">RULE 03</p>',
  '<div class="deck-footer">05 / 09</div>',
  '</div></section>',
  '</body></html>',
].join('');

const RADIUS_ONLY_DARK = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>deck</title></head>',
  '<body class="tpl-product-launch">',
  '<section class="slide dark"><div data-od-slide-flow>',
  '<h2>Keep</h2>',
  '<div class="chip" style="border-radius:24px">pill</div>',
  '</div></section>',
  '</body></html>',
].join('');

const OFFICIAL_RICH_HOW_TO = [
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
  `<title>${HOW_TO}</title>`,
  '<style data-od-official-look-css>.s-cover .titlewrap{bottom:80px}</style>',
  '</head><body class="tpl-product-launch">',
  '<section class="slide s-cover"><div data-od-slide-flow>',
  `<h1 class="title">${HOW_TO}</h1></div></section>`,
  '<section class="slide"><div data-od-slide-flow>',
  '<h2 style="font-family:\'Playfair Display\',serif">한 문단</h2>',
  '<p>문단마다 한 가지 결만 남긴다.</p></div></section>',
  '</body></html>',
].join('');

function expectNoSyntheticCopy(html: string) {
  expect(html).not.toMatch(/임의의|지금 다뤄야|핵심 질문/);
  expect(html).not.toContain('아낄수록');
  expect(html).not.toContain('예쁠수록');
}

describe('1007-N01 슬라이스 L — 셀렉터 범위', () => {
  it('LOOK_NEUTRALIZE 누수를 막기 위해 product-launch 로 한정하고 광역 grid/border-radius 를 쓰지 않는다', () => {
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('body.tpl-product-launch');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':has(.grid.g2)');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('.grid.g2>*');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).not.toMatch(/:has\(\.grid\),/);
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('[style*="border:"]');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).not.toMatch(/\[style\*="border"\]/);
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':not(.s-cover)');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':not(.s-quote)');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('>.card');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':not(:has(ul))');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':is(:has(ul),:has(ol),:has(li))>.card');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('padding-bottom:56px');
  });
});

describe('1007-N01 슬라이스 L — g2 빈 하반신 stretch 유지', () => {
  it('g2 는 합성 카피 없이 flow stretch·센터 CSS 를 넣는다', () => {
    expect(htmlNeedsSparseSixteenNineFill(G2_SLIDE)).toBe(true);
    const injected = injectSparseG2FillCss(G2_SLIDE);
    expect(injected).toContain('data-od-sparse-g2-fill');
    expect(injected).toContain('justify-content:center');
    expect(injected).toContain('.grid.g2');
    expect(injected).toContain('.grid.g2>*');
    expect(injected).toContain('통계와 수치는 신뢰의 기반');
    const healed = healAiGeneratedDeckMarkup(G2_SLIDE, SECRET);
    expect(healed).toContain('data-od-sparse-g2-fill');
    expect(healed).toContain(SECRET);
    expectNoSyntheticCopy(healed);
  });

  it('feature-card 없는 데이터/사례 칼럼도 g2>* 센터 대상이다', () => {
    const injected = injectSparseG2FillCss(G2_BARE_COLUMNS);
    expect(injected).toContain('data-od-sparse-g2-fill');
    expect(injected).toContain('.grid.g2>*');
    expect(injected).toContain('데이터');
    expect(injected).toContain('사례');
    expect(injected).toContain(SECRET);
  });
});

describe('1007-N01 슬라이스 L — 다크 quote+rule 상단 핀', () => {
  it('blockquote 다크 장은 인용 박스 min-height·flow 센터를 넣고 모델 원문을 유지한다', () => {
    expect(htmlNeedsSparseSixteenNineFill(DARK_QUOTE_BLOCKQUOTE)).toBe(true);
    const injected = injectSparseG2FillCss(DARK_QUOTE_BLOCKQUOTE);
    expect(injected).toContain('data-od-sparse-g2-fill');
    expect(injected).toContain('blockquote');
    expect(injected).toContain('min-height');
    expect(injected).toContain('justify-content:center');
    expect(injected).toContain(QUOTE_TITLE);
    expectNoSyntheticCopy(injected);
    const healed = healAiGeneratedDeckMarkup(DARK_QUOTE_BLOCKQUOTE, SECRET);
    expect(healed).toContain('data-od-sparse-g2-fill');
    expect(healed).toContain(QUOTE_TITLE);
    expect(healed).toContain(QUOTE_BODY);
    expect(healed).toContain('RULE 03');
    expectNoSyntheticCopy(healed);
  });

  it('빨간 border 카드(blockquote 아님)도 singleton .card / border: 셀렉터에 걸린다', () => {
    expect(htmlNeedsSparseSixteenNineFill(DARK_QUOTE_CARD)).toBe(true);
    const injected = injectSparseG2FillCss(DARK_QUOTE_CARD);
    expect(injected).toContain('data-od-sparse-g2-fill');
    expect(injected).toContain('>.card');
    expect(injected).toContain('[style*="border:"]');
    expect(injected).toContain('.rule-label');
    expect(injected).toContain('padding-bottom:56px');
    expect(injected).toContain(QUOTE_TITLE);
    expect(injected).toContain('05 / 09');
    expectNoSyntheticCopy(injected);
    const healed = healAiGeneratedDeckMarkup(DARK_QUOTE_CARD, SECRET);
    expect(healed).toContain(QUOTE_TITLE);
    expect(healed).toContain(QUOTE_BODY);
    expect(healed).toContain('RULE 03');
    expectNoSyntheticCopy(healed);
  });

  it('persist pin CSS 도 quote/g2/dark stretch 를 포함한다', () => {
    const pinned = pinDeckSlidesToFixedCanvas(DARK_QUOTE_CARD, { force: true });
    expect(pinned).toContain('data-od-deck-fixed-canvas-pin');
    expect(pinned).toContain('body.tpl-product-launch');
    expect(pinned).toContain('blockquote');
    expect(pinned).toContain('>.card');
    expect(pinned).toContain('min-height');
    expect(pinned).toContain(QUOTE_TITLE);
    expect(pinned).toContain('od-sparse-16x9-fill');
  });

  it('border-radius 만 있는 칩은 인용 min-height 셀렉터에 오탐되지 않는다', () => {
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).not.toMatch(/\[style\*="border"\]/);
    expect(RADIUS_ONLY_DARK).toContain('border-radius');
    expect(RADIUS_ONLY_DARK).not.toMatch(/border\s*:/);
    expect(htmlNeedsSparseSixteenNineFill(RADIUS_ONLY_DARK)).toBe(true);
    const injected = injectSparseG2FillCss(RADIUS_ONLY_DARK);
    expect(injected).toContain('[style*="border:"]');
    expect(injected).not.toMatch(/\[style\*="border"\]/);
  });
});

describe('1007-N01 슬라이스 L — G/K official-rich 불변', () => {
  it('how-to official-rich 는 look-css·모델 구조를 유지하고 LOOK 카드로 바꾸지 않는다', () => {
    expect(htmlNeedsSparseSixteenNineFill(OFFICIAL_RICH_HOW_TO)).toBe(false);
    const out = neutralizeClonedDeckModelHtml(OFFICIAL_RICH_HOW_TO, {
      brief: HOW_TO,
      deckTitle: HOW_TO,
    });
    expect(htmlLooksLikeOfficialRichDeck(out)).toBe(true);
    expect(out).toContain('data-od-official-look-css');
    expect(out).toContain('s-cover');
    expect(out).toContain('Playfair');
    expect(out).toContain('문단마다 한 가지 결만 남긴다');
    expect(out).not.toContain('feature-card');
    expect(out).not.toContain('data-od-heading-count-reconciled');
    const healed = healAiGeneratedDeckMarkup(OFFICIAL_RICH_HOW_TO, HOW_TO);
    expect(healed).toContain('data-od-official-look-css');
    expect(healed).not.toContain('feature-card');
    expect(healed).not.toContain('data-od-heading-count-reconciled');
    expect(healed).toContain('문단마다 한 가지 결만 남긴다');
    expect(healed).not.toContain('data-od-sparse-g2-fill');
  });
});
