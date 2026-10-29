import { describe, expect, it } from 'vitest';

import { LOOK_NEUTRALIZE_CSS } from '../src/html/deck-template-look-css';
import { healAiGeneratedDeckMarkup } from '../src/html/heal-ai-generated-deck';
import {
  injectSCoverKitSlotCss,
  neutralizeClonedDeckModelHtml,
} from '../src/template-clone-fill';

const WRITING_SENTENCE = '독자를 사로잡는 한 문장';
const COVER_TITLE = '사람을 멈추게 하는 한';
const COVER_EMPH = '문장의 힘';

/** User report 2026-10-13: official-rich how-to cover, titlewrap inside flow. */
function officialRichCoverDeck(opts: {
  whiteTitle?: boolean;
  lookHasTitlewrapBottom?: boolean;
} = {}): string {
  const look = opts.lookHasTitlewrapBottom !== false
    ? '.s-cover .titlewrap{bottom:80px;background:var(--paper)}'
    : '.tpl-product-launch .h1{letter-spacing:-.045em}';
  const titleStyle = opts.whiteTitle
    ? ' style="text-align:center;color:#ffffff!important"'
    : ' style="text-align:center"';
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${COVER_TITLE}</title>`,
    `<style data-od-official-look-css>${look}</style></head>`,
    '<body class="tpl-product-launch" style="background:#0a0a12;color:#ffffff">',
    '<section class="slide s-cover" data-screen-label="01 Cover" ',
    'style="width:1920px;height:1080px;background:var(--paper);color:var(--ink)">',
    '<div data-od-slide-flow><div class="titlewrap">',
    `<h1 class="title"${titleStyle}>${COVER_TITLE}<br><em>${COVER_EMPH}</em></h1>`,
    '</div></div>',
    '<div data-od-official-motif-html class="hero-shot"></div>',
    '</section>',
    '<section class="slide"><div data-od-slide-flow>',
    `<h2>왜 '${WRITING_SENTENCE}'이 필요한가</h2>`,
    '<p>첫 문장이 기대를 잡지 못하면 독자는 3초 안에 떠난다.</p>',
    '</div></section>',
    '<style data-od-slide-surface-bleed>html, body { background: #ffffff !important; color: #0a0a12 !important; }',
    ':where(.slide, section.slide) { background: #ffffff; color: #0a0a12; }</style>',
    '</body></html>',
  ].join('');
}

function officialRichHowToDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${WRITING_SENTENCE}</title>`,
    '<style data-od-official-look-css>.s-cover .titlewrap{bottom:80px}</style>',
    '</head><body class="tpl-product-launch">',
    `<section class="slide s-cover" data-title="Cover"><div data-od-slide-flow>`,
    `<h1 class="title">왜 '쓸모 있는 글'이 필요한가</h1>`,
    '<p>첫 문장이 기대를 잡지 못하면 독자는 3초 안에 떠난다.</p></div></section>',
    '<section class="slide"><div data-od-slide-flow>',
    '<h2>3가지 비결 미리보기</h2>',
    '<p>첫 문장, 한 문장 한 메시지, 구체적 이미지.</p>',
    '</div></section>',
    '</body></html>',
  ].join('');
}

describe('1007-N01 슬라이스 I — neutralize가 s-cover 킷 슬롯을 깨지 않는다', () => {
  it('LOOK_NEUTRALIZE는 flow 안 titlewrap도 absolute로 복원하고 s-cover를 수직균형에서 뺀다', () => {
    expect(LOOK_NEUTRALIZE_CSS).toMatch(/\.slide\.s-cover\s+\.titlewrap/);
    expect(LOOK_NEUTRALIZE_CSS).toMatch(
      /body\.tpl-product-launch\s+\.slide:not\(\.s-cover\)/,
    );
    expect(LOOK_NEUTRALIZE_CSS).toMatch(
      /\.slide:not\(\.s-cover\)\s+\[data-od-slide-flow\]\s+:is\(\.title\)/,
    );
    expect(LOOK_NEUTRALIZE_CSS).toContain('od-product-launch-vertical-balance');
  });
});

describe('1007-N01 슬라이스 I — persist 후 titlewrap 킷 위치', () => {
  it('s-cover + flow 안 titlewrap에 킷 absolute를 넣고 원문 공백을 유지한다', () => {
    const source = officialRichCoverDeck({ whiteTitle: true });
    const neutralized = neutralizeClonedDeckModelHtml(source, {
      brief: WRITING_SENTENCE,
      deckTitle: WRITING_SENTENCE,
    });
    const out = healAiGeneratedDeckMarkup(neutralized, WRITING_SENTENCE);
    expect(out).toContain('data-od-s-cover-kit-slots');
    expect(out).toMatch(/\.slide\.s-cover\s+\.titlewrap\{[^}]*position\s*:\s*absolute\s*!important/i);
    expect(out).toContain(COVER_TITLE);
    expect(out).toContain(COVER_EMPH);
    expect(out).toMatch(/사람을 멈추게 하는 한/);
    expect(out).toMatch(/문장의 힘/);
    expect(out).toContain('hero-shot');
    expect(out).not.toContain('Launch ·');
    expect(out).not.toContain('halo.audio');
    expect(out).not.toMatch(/<p class="lede"/i);
    expect(out).not.toMatch(/<div[^>]*class="brand"/i);
  });

  it('look CSS에 titlewrap bottom이 없으면 Halo는 좌측 수직 중앙으로 보충한다', () => {
    const source = officialRichCoverDeck({ lookHasTitlewrapBottom: false });
    const out = injectSCoverKitSlotCss(source);
    expect(out).toContain('data-od-s-cover-kit-slots');
    expect(out).toMatch(/top\s*:\s*50%/i);
    expect(out).toMatch(/left\s*:\s*clamp\(80px/i);
    expect(out).not.toMatch(/bottom\s*:\s*clamp\(48px,\s*6vh,\s*96px\)/i);
    expect(out).toContain(COVER_TITLE);
  });

  it('look CSS에 titlewrap bottom이 있으면 위치값만 복원하고 킷 inset은 덮지 않는다', () => {
    const source = officialRichCoverDeck();
    const out = injectSCoverKitSlotCss(source);
    expect(out).toMatch(/position\s*:\s*absolute\s*!important/i);
    expect(out).not.toMatch(/data-od-s-cover-kit-slots[\s\S]*bottom\s*:\s*clamp\(48px/i);
  });

  it('한글 커버 제목은 letter-spacing:0 으로 원문 띄어쓰기를 보이게 한다', () => {
    const out = injectSCoverKitSlotCss(officialRichCoverDeck());
    expect(out).toMatch(/letter-spacing\s*:\s*0\s*!important/i);
    expect(out).toMatch(/word-break\s*:\s*keep-all/i);
    expect(out).toMatch(/사람을 멈추게 하는 한/);
  });

  it('inject는 멱등이다', () => {
    const once = injectSCoverKitSlotCss(officialRichCoverDeck());
    const twice = injectSCoverKitSlotCss(once);
    expect((twice.match(/data-od-s-cover-kit-slots/g) ?? []).length).toBe(1);
  });
});

describe('1007-N01 슬라이스 I — H/G 불변', () => {
  it('라이트 커버 흰글씨 제거(H)는 유지한다', () => {
    const source = officialRichCoverDeck({ whiteTitle: true });
    const out = healAiGeneratedDeckMarkup(source, WRITING_SENTENCE);
    const titleOpen = /<h1\b[^>]*\bclass\s*=\s*["'][^"']*\btitle\b[^>]*>/i.exec(out)?.[0] ?? '';
    expect(titleOpen).not.toMatch(/color\s*:\s*#(?:fff(?:fff)?)\s*!important/i);
    expect(out).toContain(COVER_TITLE);
    expect(out).toContain('hero-shot');
  });

  it('how-to official-rich는 LOOK을 재작성하지 않는다(G)', () => {
    const source = officialRichHowToDeck();
    const neutralized = neutralizeClonedDeckModelHtml(source, {
      brief: WRITING_SENTENCE,
      deckTitle: WRITING_SENTENCE,
    });
    const out = healAiGeneratedDeckMarkup(neutralized, WRITING_SENTENCE);
    expect(out).toContain('data-od-official-look-css');
    expect(out).toContain("왜 '쓸모 있는 글'이 필요한가");
    expect(out).toContain('첫 문장이 기대를 잡지 못하면');
    expect(out).not.toContain('feature-card');
    expect(out).not.toContain('data-od-heading-count-reconciled');
    expect((out.match(/<style\b[^>]*\bdata-od-official-look-css\b/gi) ?? []).length).toBe(1);
  });
});
