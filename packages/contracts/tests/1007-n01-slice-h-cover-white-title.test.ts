import { describe, expect, it } from 'vitest';

import { healAiGeneratedDeckMarkup } from '../src/html/heal-ai-generated-deck';
import { neutralizeClonedDeckModelHtml } from '../src/template-clone-fill';

const WRITING_SENTENCE = '독자를 사로잡는 한 문장';
const COVER_TITLE = '사람을 멈추게 하는 한';
const COVER_EMPH = '문장의 힘';

/** User report 2026-10-13: official-rich cover, white title on paper + bleed. */
function lightCoverWhiteTitleDeck(): string {
  return [
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"/>',
    `<title>${COVER_TITLE}</title>`,
    '<style data-od-official-look-css>',
    '.s-cover .titlewrap{bottom:80px;background:var(--paper)}',
    '</style></head>',
    '<body style="background:#0a0a12;color:#ffffff">',
    '<section class="slide s-cover" data-screen-label="01 Cover" ',
    'style="width:1920px;height:1080px;background:var(--paper);color:var(--ink)">',
    '<div data-od-slide-flow><div class="titlewrap">',
    `<h1 class="title" style="text-align:center;color:#ffffff!important">${COVER_TITLE}<br><em>${COVER_EMPH}</em></h1>`,
    '</div></div>',
    '<div data-od-official-motif-html class="hero-shot"></div>',
    '</section>',
    '<style data-od-slide-surface-bleed>html, body { background: #ffffff !important; color: #0a0a12 !important; }',
    ':where(.slide, section.slide) { background: #ffffff; color: #0a0a12; }</style>',
    '</body></html>',
  ].join('');
}

function darkCoverWhiteTitleDeck(): string {
  return [
    '<!doctype html><html><head>',
    '<style data-od-official-look-css>:root { --paper: #E9E5DB; --ink: #1B2566; }</style>',
    '</head><body>',
    '<section class="slide s-cover dark" style="background:#0a0a12;color:#f5f5f7">',
    `<h1 class="title" style="color:#ffffff!important">${COVER_TITLE}</h1>`,
    '</section></body></html>',
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

describe('1007-N01 슬라이스 H — 라이트 커버 흰 제목 비가시', () => {
  it('라이트 s-cover + #ffffff!important 제목을 가시 색으로 교정하고 원문을 유지한다', () => {
    const source = lightCoverWhiteTitleDeck();
    const out = healAiGeneratedDeckMarkup(source, WRITING_SENTENCE);
    expect(out).toContain(COVER_TITLE);
    expect(out).toContain(COVER_EMPH);
    expect(out).toContain('hero-shot');
    expect(out).toContain('data-od-official-look-css');
    const titleOpen = /<h1\b[^>]*\bclass\s*=\s*["'][^"']*\btitle\b[^>]*>/i.exec(out)?.[0] ?? '';
    expect(titleOpen).not.toMatch(/color\s*:\s*#(?:fff(?:fff)?)\s*!important/i);
    expect(out).not.toMatch(/이탈률은\s+\d+%/);
  });

  it('다크 커버의 흰 제목은 유지한다', () => {
    const source = darkCoverWhiteTitleDeck();
    const out = healAiGeneratedDeckMarkup(source, WRITING_SENTENCE);
    expect(out).toContain(COVER_TITLE);
    expect(out).toMatch(/color\s*:\s*#ffffff\s*!important/i);
  });

  it('official-look-css 있는 how-to는 LOOK을 재작성하지 않는다', () => {
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
