import { describe, expect, it } from 'vitest';

import { healAiGeneratedDeckMarkup } from '../src/html/heal-ai-generated-deck';
import {
  injectSCoverKitSlotCss,
  repairCoverKitSurfaceBleed,
  sanitizePersistedDeckHostLeaks,
  stripForeignCoverKitMotifs,
} from '../src/template-clone-fill';

const COVER_TITLE = '글을 매력적으로 쓰는 팁';

/**
 * User screenshot 2026-10-15: white 16:9, title top-center, product-launch
 * orange hero-shot on a Biennale s-cover, persist bleed forcing #ffffff.
 */
function screenshotMixedCoverDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${COVER_TITLE}</title>`,
    '<style data-od-official-look-css>.slide-1 .titlewrap{} .slide-2{} .slide-8{} .slide-10 .close-title{}</style>',
    '</head>',
    '<body class="tpl-product-launch">',
    '<section class="slide s-cover" style="width:1920px;height:1080px;box-sizing:border-box;',
    'overflow:visible;position:relative;background:var(--paper);color:var(--ink)">',
    '<div data-od-slide-flow data-od-s-cover-kit-slots style="overflow:visible;color:var(--ink);',
    'box-sizing:border-box;padding:80px 112px;text-align:center">',
    '<div class="blocks" aria-hidden="true"><div class="b1"></div><div class="b2"></div>',
    '<div class="b3"></div><div class="b4"></div></div>',
    `<div class="titlewrap"><h1 class="title" style="text-align:center">${COVER_TITLE.replace('쓰는 팁', '')}<br><em>쓰는 팁</em></h1></div>`,
    '<div class="sunglow" aria-hidden="true"></div>',
    '</div>',
    '<div data-od-official-motif-html class="hero-shot"></div>',
    '</section>',
    '<section class="slide"><div data-od-slide-flow>',
    '<h2>첫 문장이 하는 일</h2><p>독자가 다음 줄을 읽을지 여기서 갈린다.</p>',
    '</div></section>',
    '<style data-od-biennale-sparse-fill></style>',
    '<style data-od-slide-surface-bleed>html, body { background: #ffffff !important; color: #0a0a12 !important; }',
    ':where(.slide, section.slide, [data-screen-label], .deck-slide, .ppt-slide) { background: #ffffff; color: #0a0a12; }</style>',
    '</body></html>',
  ].join('');
}

function productLaunchCoverDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${COVER_TITLE}</title></head>`,
    '<body class="tpl-product-launch">',
    '<section class="slide s-cover" style="background:#0a0a12;color:#fff">',
    `<div data-od-slide-flow><div class="titlewrap"><h1 class="title">${COVER_TITLE}</h1></div></div>`,
    '<div data-od-official-motif-html class="hero-shot"></div>',
    '</section></body></html>',
  ].join('');
}

function productLaunchWithBiennaleBlocksDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>Launch</title></head>',
    '<body class="tpl-product-launch">',
    '<section class="slide dark slide-title">',
    '<div class="blocks" aria-hidden="true"><div class="b1"></div></div>',
    '<div class="sunglow" aria-hidden="true"></div>',
    '<h1 class="h1">Halo v2</h1>',
    '<div data-od-official-motif-html class="hero-shot"></div>',
    '</section></body></html>',
  ].join('');
}

function expectNoSyntheticWritingTips(html: string) {
  expect(html).not.toMatch(/첫 문장에서 결론을|한 문장 한 메시지|지금 다뤄야|임의의/);
  expect(html).not.toMatch(/<p class="lede"/i);
  expect(html).not.toMatch(/SPEAKER/);
}

describe('1007-N01 슬라이스 S — 스크린샷 mixed persist 커버', () => {
  it('킷 titlewrap 하단 배치, 이질 hero-shot 제거, bleed가 킷 paper를 #ffffff로 덮지 않는다', () => {
    const source = screenshotMixedCoverDeck();
    expect(source).toContain('hero-shot');
    expect(source).toMatch(/data-od-slide-flow data-od-s-cover-kit-slots/);
    expect(source).toMatch(/background: #ffffff !important/);

    const stripped = stripForeignCoverKitMotifs(source);
    expect(stripped).toContain('blocks');
    expect(stripped).toContain('sunglow');
    expect(stripped).not.toMatch(/class="hero-shot"/);
    expect(stripped).toContain(COVER_TITLE.split(' ')[0]!);

    const slotted = injectSCoverKitSlotCss(source);
    expect(slotted).toMatch(/<style[^>]*data-od-s-cover-kit-slots/);
    expect(slotted).toMatch(/\.slide\.s-cover\s+\.titlewrap\{[^}]*position\s*:\s*absolute\s*!important/i);
    expect(slotted).toMatch(/bottom\s*:\s*clamp\(48px,\s*6vh,\s*96px\)/i);
    expect(slotted).toMatch(/left\s*:\s*clamp\(40px/i);

    const bleedFixed = repairCoverKitSurfaceBleed(source);
    const bleed = /<style\b[^>]*\bdata-od-slide-surface-bleed\b[^>]*>([\s\S]*?)<\/style>/i
      .exec(bleedFixed)?.[1] ?? '';
    expect(bleed).not.toMatch(
      /html,\s*body,\s*\.slide[^{]*\{[^}]*background(?:-color)?\s*:\s*#ffffff/i,
    );
    expect(bleed).not.toMatch(/:where\((?:[^)]*\s)?\.slide\s*,/i);
    expect(bleedFixed).toContain('data-od-cover-kit-surface');
    expect(bleedFixed).toMatch(/background:var\(--paper/i);

    const healed = healAiGeneratedDeckMarkup(source, COVER_TITLE);
    expect(healed).toContain('글을 매력적으로');
    expect(healed).toContain('쓰는 팁');
    expect(healed).toContain('blocks');
    expect(healed).toContain('sunglow');
    expect(healed).not.toMatch(/class="hero-shot"/);
    expect(healed).toMatch(/<style[^>]*data-od-s-cover-kit-slots/);
    expect(healed).toMatch(/position\s*:\s*absolute\s*!important/i);
    expect(healed).toContain('data-od-cover-kit-surface');
    expect(healed).toMatch(/background:var\(--paper/i);
    expect(healed).toContain('첫 문장이 하는 일');
    expectNoSyntheticWritingTips(healed);

    const persisted = sanitizePersistedDeckHostLeaks(healed);
    expect(persisted).not.toMatch(/class="hero-shot"/);
    expect(persisted).toContain('blocks');
    expect(persisted).toContain('쓰는 팁');
  });

  it('호스트가 product-launch면 hero-shot을 유지하고 포스터 deco만 벗긴다', () => {
    const kept = stripForeignCoverKitMotifs(productLaunchCoverDeck());
    expect(kept).toContain('hero-shot');
    expect(kept).toContain(COVER_TITLE);

    const mixed = stripForeignCoverKitMotifs(productLaunchWithBiennaleBlocksDeck());
    expect(mixed).toContain('hero-shot');
    expect(mixed).toContain('Halo v2');
    expect(mixed).not.toMatch(/class="blocks"/);
    expect(mixed).not.toMatch(/class="sunglow"/);

    const healedLaunch = healAiGeneratedDeckMarkup(productLaunchCoverDeck(), COVER_TITLE);
    expect(healedLaunch).toContain('hero-shot');
    expect(healedLaunch).toContain(COVER_TITLE);
    expectNoSyntheticWritingTips(healedLaunch);
  });

  it('본문 단어 blocks / feature-blocks 클래스만으로 진짜 product-launch hero-shot을 벗기지 않는다', () => {
    const title = 'Building blocks of a launch';
    const source = [
      '<!doctype html><html lang="en"><body class="tpl-product-launch">',
      '<section class="slide s-cover" style="background:#0a0a12;color:#fff">',
      '<div data-od-slide-flow><div class="titlewrap">',
      `<h1 class="title">${title}</h1>`,
      '<div class="feature-blocks"><p>Range and battery in week one.</p></div>',
      '</div></div>',
      '<div data-od-official-motif-html class="hero-shot"></div>',
      '</section>',
      '<section class="slide"><div data-od-slide-flow>',
      '<h2>Range</h2><p>Battery life is the first buying question.</p>',
      '</div></section>',
      '</body></html>',
    ].join('');
    const stripped = stripForeignCoverKitMotifs(source);
    expect(stripped).toContain('hero-shot');
    expect(stripped).toContain(title);
    expect(stripped).toContain('feature-blocks');
    const healed = healAiGeneratedDeckMarkup(source, title);
    expect(healed).toContain('hero-shot');
    expect(healed).toContain(title);
    expect(healed).toContain('Battery life is the first buying question');
    expectNoSyntheticWritingTips(healed);
  });

  it('다크 s-cover 인라인 배경을 cream --paper 로 덮지 않는다', () => {
    const source = [
      '<!doctype html><html><head>',
      '<style data-od-official-look-css>:root { --paper: #E9E5DB; --ink: #1B2566; }</style>',
      '</head><body class="tpl-product-launch">',
      '<section class="slide s-cover" style="background:#0a0a12;color:#f5f5f7">',
      `<h1 class="title" style="color:#ffffff!important">${COVER_TITLE}</h1>`,
      '<div data-od-official-motif-html class="hero-shot"></div>',
      '</section>',
      '<style data-od-slide-surface-bleed>html, body, .slide { background: #ffffff !important; color: #0a0a12 !important; }',
      ':where(.slide, section.slide) { background: #ffffff; color: #0a0a12; }</style>',
      '</body></html>',
    ].join('');
    const bleedFixed = repairCoverKitSurfaceBleed(source);
    const coverOpen = /<section\b[^>]*\bs-cover\b[^>]*>/i.exec(bleedFixed)?.[0] ?? '';
    expect(coverOpen).toMatch(/background\s*:\s*#0a0a12/i);
    expect(bleedFixed).toMatch(/data-od-cover-kit-surface/);
    expect(bleedFixed).not.toMatch(
      /\.slide\.s-cover[^{]*\{[^}]*background:var\(--paper[^;]*!important/i,
    );
    const healed = healAiGeneratedDeckMarkup(source, COVER_TITLE);
    const healedCover = /<section\b[^>]*\bs-cover\b[^>]*>/i.exec(healed)?.[0] ?? '';
    expect(healedCover).toMatch(/background\s*:\s*#0a0a12/i);
    expect(healed).toContain('hero-shot');
    expect(healed).toMatch(/color\s*:\s*#ffffff\s*!important/i);
    expectNoSyntheticWritingTips(healed);
  });

  it('본문 첫 장의 blocks+hero-shot 은 커버로 오인하지 않는다', () => {
    const source = [
      '<!doctype html><html><body>',
      '<section class="slide s-chapter">',
      '<div class="blocks" aria-hidden="true"><div class="b1"></div></div>',
      '<h2>본문 장</h2><p>호스트 deco를 지우면 안 된다.</p>',
      '<div data-od-official-motif-html class="hero-shot"></div>',
      '</section></body></html>',
    ].join('');
    const stripped = stripForeignCoverKitMotifs(source);
    expect(stripped).toMatch(/class="blocks"/);
    expect(stripped).toContain('hero-shot');
    expect(stripped).toContain('본문 장');
  });
});
