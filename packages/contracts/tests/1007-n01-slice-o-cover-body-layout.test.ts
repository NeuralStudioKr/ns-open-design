import { describe, expect, it } from 'vitest';

import {
  ensureSCoverTitlewrap,
  healAiGeneratedDeckMarkup,
  injectSCoverKitSlotCss,
  injectSparseG2FillCss,
  SPARSE_SIXTEEN_NINE_FILL_CSS,
  stripEmptySlideChips,
} from '../src/index.js';

const COVER_TITLE = '한 문장이 사람을 멈추게 끌어당기는 법';
const BODY_TITLE = '문장의 호흡, 짧게 끊고 길게 펼치다';
const BODY_LINE =
  '짧다. (8자) → 긴 문장이 호흡을 만든다. (24자) → 다시 짧게 끊는다. (10자) → 긴 호흡으로 질문. (28자)';

/** Screenshot A — dark cover, title in flow (no titlewrap), WRITING + empty chip, motif. */
function coverEmptyChipDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${COVER_TITLE}</title></head>`,
    '<body class="tpl-product-launch" style="background:#0a0a12;color:#fff">',
    '<section class="slide s-cover" style="width:1920px;height:1080px;background:#0a0a12">',
    '<div data-od-slide-flow>',
    `<h1 class="title">${COVER_TITLE}</h1>`,
    '<p>글의 매력을 만드는 9가지 원칙 — 첫 문장부터 마침표까지, 독자의 시선을 사로잡는 구성과 호흡의 기술.</p>',
    '<p>SPEAKER · 문정현 김서연</p>',
    '<div class="chip">WRITING</div>',
    '<div class="chip"></div>',
    '</div>',
    '<div data-od-official-motif-html class="hero-shot"></div>',
    '</section></body></html>',
  ].join('');
}

/** Screenshot B — dark body, title+bullets at top, hollow gray card with bottom-pinned line. */
function bodyHollowCardDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${BODY_TITLE}</title></head>`,
    '<body class="tpl-product-launch">',
    '<section class="slide dark"><div data-od-slide-flow>',
    `<h2>${BODY_TITLE}</h2>`,
    '<ul>',
    '<li>짧은 문장 1-2개인 호흡의 문장</li>',
    '<li>한 문단에 핵심 한 가지만. 다음 문단은 다른 결</li>',
    '<li>구분점은 마침표만이 아니라 줄바꿈과 여백</li>',
    '</ul>',
    `<div class="card">${BODY_LINE}</div>`,
    '</div></section></body></html>',
  ].join('');
}

function expectNoSyntheticCopy(html: string) {
  expect(html).not.toMatch(/임의의|지금 다뤄야|핵심 질문/);
}

describe('1007-N01 슬라이스 O — 커버 빈 칩 + titlewrap 킷', () => {
  it('빈 칩은 지우고 WRITING 필은 남기며 카피를 지어내지 않는다', () => {
    const source = coverEmptyChipDeck();
    expect(source).toMatch(/<div class="chip"><\/div>/);
    const stripped = stripEmptySlideChips(source);
    expect(stripped).toContain('WRITING');
    expect(stripped).not.toMatch(/<div class="chip"><\/div>/);
    expect(stripped).toContain(COVER_TITLE);
    expect(stripped).toContain('hero-shot');
  });

  it('titlewrap 없는 s-cover 제목을 킷 wrap 하고 persist flow 후에도 absolute 한다', () => {
    const source = coverEmptyChipDeck();
    expect(source).not.toMatch(/\btitlewrap\b/);
    const wrapped = ensureSCoverTitlewrap(source);
    expect(wrapped).toMatch(/<div class="titlewrap"><h1 class="title">/);
    expect(wrapped).toContain(COVER_TITLE);
    const out = injectSCoverKitSlotCss(source);
    expect(out).toContain('data-od-s-cover-kit-slots');
    expect(out).toMatch(/\.slide\.s-cover\s+\.titlewrap\{[^}]*position\s*:\s*absolute\s*!important/i);
    expect(out).toContain('WRITING');
    expect(out).not.toMatch(/<div class="chip"><\/div>/);
    expect(out).toContain('hero-shot');
    const healed = healAiGeneratedDeckMarkup(source, COVER_TITLE);
    expect(healed).toContain('data-od-s-cover-kit-slots');
    expect(healed).toMatch(/<div class="titlewrap">/);
    expect(healed).toContain(COVER_TITLE);
    expect(healed).toContain('hero-shot');
    expect(healed).not.toContain('Launch ·');
    expectNoSyntheticCopy(healed);
  });

  it('킷 커버를 납작하게 만들지 않는다 — s-cover titlewrap 은 flow flatten 대상이 아니다', () => {
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':not(.s-cover)');
    const out = injectSCoverKitSlotCss(coverEmptyChipDeck());
    expect(out).toMatch(/justify-content\s*:\s*unset\s*!important/i);
    expect(out).not.toMatch(/\.slide\.s-cover\s+\.titlewrap\{[^}]*position\s*:\s*relative/i);
  });
});

describe('1007-N01 슬라이스 O — 본문 hollow card min-height', () => {
  it('title+bullets+card 장에는 card min-height/flex:1 을 걸지 않는다', () => {
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':not(:has(ul))');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain(':is(:has(ul),:has(ol),:has(li))>.card');
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('min-height:0!important');
    const injected = injectSparseG2FillCss(bodyHollowCardDeck());
    expect(injected).toContain('data-od-sparse-g2-fill');
    expect(injected).toContain(BODY_TITLE);
    expect(injected).toContain(BODY_LINE);
    expect(injected).toContain('<ul>');
    expect(injected).toMatch(/min-height:0!important/);
    const healed = healAiGeneratedDeckMarkup(bodyHollowCardDeck(), BODY_TITLE);
    expect(healed).toContain(BODY_TITLE);
    expect(healed).toContain(BODY_LINE);
    expect(healed).toContain('짧은 문장 1-2개인 호흡의 문장');
    expect(healed).not.toMatch(/임의의|지금 다뤄야/);
  });

  it('인용-only 다크 장(리스트 없음)은 L card min-height 를 유지한다', () => {
    const quoteOnly = [
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>deck</title></head>',
      '<body class="tpl-product-launch">',
      '<section class="slide dark"><div data-od-slide-flow>',
      '<h2>"예벨수록" 잘라내는 편집자의 용기</h2>',
      '<div class="card" style="border:1px solid #e11">',
      '<p>“뻔한 문장을 지워야 글이 남는다.”</p>',
      '<cite>— WILLIAM ZINSSER, ON WRITING WELL</cite></div>',
      '<p class="rule-label">RULE 03</p>',
      '</div></section></body></html>',
    ].join('');
    expect(quoteOnly).not.toMatch(/<(?:ul|ol|li)\b/i);
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toMatch(
      /:not\(:has\(ul\)\):not\(:has\(ol\)\):not\(:has\(li\)\):not\(:has\(> \.card ~ \.card\)\)>\.card/,
    );
    expect(SPARSE_SIXTEEN_NINE_FILL_CSS).toContain('min-height:clamp(240px,36%,420px)!important');
    const injected = injectSparseG2FillCss(quoteOnly);
    expect(injected).toContain('data-od-sparse-g2-fill');
    expect(injected).toContain('WILLIAM ZINSSER');
    expect(injected).toContain('RULE 03');
    expect(injected).toContain('min-height:clamp(240px,36%,420px)!important');
    const healed = healAiGeneratedDeckMarkup(quoteOnly, '편집자의 용기');
    expect(healed).toContain('뻔한 문장을 지워야 글이 남는다');
    expect(healed).toContain('WILLIAM ZINSSER');
    expectNoSyntheticCopy(healed);
  });
});
