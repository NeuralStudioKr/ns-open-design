import { describe, expect, it } from 'vitest';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

/**
 * F7 heal must run inside buildSrcdoc preview path (0826-N01).
 * Regression: user attachment HTML with empty chapter, h1/lede nest,
 * 4-col grid / 1 card, stray </h>, brief leak, particle gap.
 */
describe('buildSrcdoc + healAiGeneratedDeckMarkup (F7 preview path)', () => {
  it('heals user attachment HTML when deck preview + userBrief are set', () => {
    const brief = '영어 회화 공부, 연습 팁에 대한';
    const html = [
      '<section class="slide s-cover" style="width:1920px;height:1080px">',
      '  <h1>영어 회화, 발화 근육 훈련</h1>',
      '  <div class="row"><span class="k">01</span><span class="v">영어 회화 공부, 연습 팁에 대한</span></div>',
      '  <span class="conf">영어 회화 공부, 연습 팁에 대한</span>',
      '  <div>하루 45분, 네 가지 리츄얼로 발화 회로 를 단련합니다</div>',
      '</section>',
      '<section class="slide s-chapter" style="width:1920px;height:1080px;background:#0a0a0a"></section>',
      '<section class="slide s-chapter" style="width:1920px;height:1080px">',
      '  <h1 style="font-size:124px">왜 회화는<br>공부가 아니라',
      '    <div style="margin-top:48px;font-size:28px">발화 근육이 필요합니다.</div>',
      '  </h1>',
      '</section>',
      '<section class="slide s-data" style="width:1920px;height:1080px">',
      '  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px">',
      '    <div style="background:#E9E5DB;padding:24px">',
      '      <div>01 · 10 MIN</div>',
      '      <div>Shado</div>',
      '    </div>',
      '  </div>',
      '</div></h></div></div></section>',
    ].join('\n');

    const srcdoc = buildSrcdoc(html, { deck: true, userBrief: brief, scrubLeftoverCatalog: true });
    expect(srcdoc).not.toContain('영어 회화 공부, 연습 팁에 대한');
    expect(srcdoc).toMatch(/발화 회로를 단련합니다/);
    expect((srcdoc.match(/class="slide s-chapter"/g) ?? []).length).toBe(1);
    expect(srcdoc).toMatch(/<h1[^>]*>왜 회화는[^<]*<br>공부가 아니라[^<]*<\/h1>\s*<div[^>]*>발화 근육이 필요합니다\.<\/div>/);
    expect(srcdoc).toMatch(/repeat\(1\s*,\s*1fr\)/);
    expect(srcdoc).not.toMatch(/<\/?h(?![1-6])[\s>/]/);
  });
});
