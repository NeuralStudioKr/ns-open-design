import { describe, expect, it } from 'vitest';

import { healAiGeneratedDeckMarkup } from '../src/html/heal-ai-generated-deck';
import { healOfficialMagazineLayoutDensity } from '../src/html/heal-official-magazine-layout';
import {
  injectBiennaleSparseFillCss,
  injectSCoverKitSlotCss,
  repairCoverKitSurfaceBleed,
  resolveTemplateCloneKitKey,
  sanitizePersistedDeckHostLeaks,
  stripForeignCoverKitMotifs,
} from '../src/template-clone-fill';

const TITLE = '업무와 AI를 하나의 공간에서';

/**
 * Production 2026-10-29: editor preview was white paper + bottom title.
 * Home root thumbnail stayed Halo (dark + orange hero-shot).
 */
function productionHaloCoverLeakedBiennale(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    '<style data-od-official-motif-deco-css>',
    '.slide [data-od-official-motif-html].hero-shot{position:absolute;right:0;top:50%;',
    'transform:translateY(-50%);width:640px;height:640px;border-radius:50%;background:var(--grad)}</style>',
    '<style data-od-biennale-sparse-fill>.s-cover:not(:has(.footer-row)) .titlewrap{bottom:clamp(48px,6vh,96px)}</style>',
    '<style data-od-s-cover-kit-slots>.slide.s-cover [data-od-slide-flow] .titlewrap{',
    'left:clamp(40px,4vw,76px);bottom:clamp(48px,6vh,96px)}</style>',
    '<style data-od-cover-kit-surface>.slide.s-cover{background:var(--paper,var(--bg,var(--surface)));}</style>',
    '</head>',
    '<body class="tpl-product-launch">',
    '<section class="slide s-cover" data-screen-label="01 Cover" ',
    'style="width:1920px;height:1080px;position:relative;background:var(--paper);color:var(--ink)">',
    '<div data-od-slide-flow style="overflow:visible;color:var(--ink);padding:80px 112px">',
    '<div class="blocks" aria-hidden="true"><div class="b1"></div><div class="b2"></div>',
    '<div class="b3"></div><div class="b4"></div></div>',
    `<div class="titlewrap"><h1 class="title">업무와 AI를<br><em>하나의 공간에서</em></h1></div>`,
    '<div class="sunglow" aria-hidden="true"></div>',
    '</div></section>',
    '<section class="slide" data-screen-label="02 Problem">',
    '<div data-od-slide-flow><h2>지금 팀의 일은 너무 많이 흩어져 있습니다</h2>',
    '<p>대화는 메신저에, 문서는 노션에 있습니다.</p></div></section>',
    '<style data-od-official-look-css>',
    '.tpl-product-launch{--bg:#ffffff;--ink:#0a0a12;--accent:#ff5a36;',
    '--grad:linear-gradient(120deg,#ff5a36 0%,#ff8c5a 60%,#ffb36b 100%)}',
    '.tpl-product-launch .hero-shot{position:absolute;right:0;top:50%;width:640px;height:640px}',
    '.slide > div:not(.sunglow):not(.hero-shot){position:relative}',
    '</style>',
    '<style data-od-slide-surface-bleed>html, body { background: var(--paper, var(--bg, var(--surface))) !important; }',
    ':where(.slide, section.slide) { background: var(--paper, var(--bg, var(--surface))); }</style>',
    '</body></html>',
  ].join('');
}

describe('1007-N01 AD — product-launch 표지 흰 종이', () => {
  it('kit key는 Halo이지 biennale-yellow가 아니다', () => {
    expect(resolveTemplateCloneKitKey(productionHaloCoverLeakedBiennale()))
      .toBe('product-launch-halo');
    expect(injectBiennaleSparseFillCss(productionHaloCoverLeakedBiennale()))
      .not.toMatch(/data-od-biennale-sparse-fill/);
  });

  it('미리보기 heal이 썸네일과 같이 다크+#hero-shot을 복원한다', () => {
    const source = productionHaloCoverLeakedBiennale();
    expect(source).toContain('class="sunglow"');
    expect(source).not.toMatch(/class="hero-shot"/);

    const stripped = stripForeignCoverKitMotifs(source);
    expect(stripped).not.toMatch(/class="blocks"/);
    expect(stripped).not.toMatch(/class="sunglow"/);
    expect(stripped).toContain('하나의 공간에서');

    const healed = healAiGeneratedDeckMarkup(source, TITLE);
    expect(healed).toMatch(/class="hero-shot"/);
    expect(healed).not.toMatch(/class="blocks"/);
    expect(healed).not.toMatch(/class="sunglow"/);
    expect(healed).toMatch(/background:#0a0a12/i);
    expect(healed).not.toContain('data-od-cover-kit-surface');
    expect(healed).not.toContain('data-od-biennale-sparse-fill');
    expect(healed).toMatch(/top\s*:\s*50%/);
    expect(healed).toContain('하나의 공간에서');
    expect(healed).toContain('지금 팀의 일은 너무 많이 흩어져 있습니다');
    expect(healed).not.toMatch(/첫 문장에서 결론을|임의의/);

    const magazine = healOfficialMagazineLayoutDensity(source, TITLE);
    expect(magazine).toMatch(/class="hero-shot"/);
    expect(magazine).toMatch(/background:#0a0a12/i);
    expect(magazine).not.toMatch(/class="sunglow"/);

    const persisted = sanitizePersistedDeckHostLeaks(healed);
    expect(persisted).toMatch(/class="hero-shot"/);
    expect(persisted).not.toMatch(/class="blocks"/);
  });

  it('surface bleed가 Halo 표지에 --paper를 다시 심지 않는다', () => {
    const source = productionHaloCoverLeakedBiennale();
    const bleed = repairCoverKitSurfaceBleed(source);
    expect(bleed).toMatch(/background:#0a0a12/i);
    expect(bleed).not.toContain('data-od-cover-kit-surface');
    const slotted = injectSCoverKitSlotCss(source);
    expect(slotted).not.toContain('data-od-biennale-sparse-fill');
    expect(slotted).toMatch(/top\s*:\s*50%/);
  });
});
