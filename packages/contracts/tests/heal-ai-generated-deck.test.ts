import { describe, expect, it } from 'vitest';
import {
  dropEmptyLikelyDeckSlides,
  healAiGeneratedDeckMarkup,
  polishTruncatedInstructionTitles,
  normalizeHangulParticleGaps,
  scrubBriefLeakFromMetaSlots,
  scrubTruncatedAiTagSoup,
  shrinkOverAllocatedRepeatGrid,
  unnestHeadingBlockChildren,
} from '../src/html/heal-ai-generated-deck.js';

describe('heal-ai-generated-deck (0826-N01 F7)', () => {
  describe('Q1 dropEmptyLikelyDeckSlides', () => {
    it('drops an empty s-chapter slide between filled slides', () => {
      const html = [
        '<section class="slide s-cover"><h1>커버</h1><p>서문</p></section>',
        '<section class="slide s-chapter" style="background:#0a0a0a"></section>',
        '<section class="slide s-data"><h2>본문</h2><p>내용</p></section>',
      ].join('');
      const out = dropEmptyLikelyDeckSlides(html);
      expect(out).not.toMatch(/s-chapter/);
      expect(out).toMatch(/s-cover/);
      expect(out).toMatch(/s-data/);
    });

    it('preserves the first slide even if it is empty', () => {
      const html = [
        '<section class="slide"></section>',
        '<section class="slide"><h2>본문</h2><p>내용입니다</p></section>',
      ].join('');
      const out = dropEmptyLikelyDeckSlides(html);
      expect((out.match(/class="slide"/g) ?? []).length).toBe(2);
    });

    it('keeps decorative motif slides (background-image / gradient)', () => {
      const html = [
        '<section class="slide s-cover"><h1>커버</h1></section>',
        '<section class="slide s-motif" style="background-image:linear-gradient(180deg,#0a0a0a,#1B2566)"></section>',
        '<section class="slide s-data"><h2>본문</h2><p>내용</p></section>',
      ].join('');
      const out = dropEmptyLikelyDeckSlides(html);
      expect(out).toMatch(/s-motif/);
    });

    it('keeps slides with svg-only motif chrome', () => {
      const html = [
        '<section class="slide"><h1>커버</h1></section>',
        '<section class="slide"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg></section>',
      ].join('');
      const out = dropEmptyLikelyDeckSlides(html);
      expect((out.match(/class="slide"/g) ?? []).length).toBe(2);
    });
  });

  describe('Q2 unnestHeadingBlockChildren', () => {
    it('splits a lede div nested inside h1 into a sibling', () => {
      const html = [
        '<section class="slide">',
        '<h1 style="font-size:124px">왜 회화는<br>공부가 아니라',
        '<div style="margin-top:48px;font-size:28px">발화 근육이 필요합니다.</div>',
        '</h1>',
        '</section>',
      ].join('');
      const out = unnestHeadingBlockChildren(html);
      // h1 close before div and NOT after
      expect(out).toMatch(/<h1[^>]*>왜 회화는<br>공부가 아니라<\/h1>\s*<div[^>]*>발화 근육이 필요합니다\.<\/div>/);
      // no more nested div inside h1
      expect(out).not.toMatch(/<h1[^>]*>[\s\S]*<div[\s\S]*<\/h1>/);
    });

    it('leaves h1 with only inline children alone', () => {
      const html = '<h1>제목 <em>강조</em> 텍스트</h1>';
      expect(unnestHeadingBlockChildren(html)).toBe(html);
    });

    it('leaves h1 whose first child is a block (nothing before) alone', () => {
      const html = '<h1><div>only-child block</div></h1>';
      expect(unnestHeadingBlockChildren(html)).toBe(html);
    });
  });

  describe('Q3 shrinkOverAllocatedRepeatGrid', () => {
    it('shrinks a 4-column grid with 1 card to 1 column', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px">',
        '<div style="background:#E9E5DB;padding:24px"><h3>01 · 10 MIN</h3><p>Shadowing</p></div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*repeat\(1\s*,\s*1fr\)/);
    });

    it('shrinks a 4-column grid with 2 cards to 2 columns', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px">',
        '<div>a</div>',
        '<div>b</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/repeat\(2\s*,\s*1fr\)/);
    });

    it('leaves a 4-column grid with 4 cards unchanged', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px">',
        '<div>a</div><div>b</div><div>c</div><div>d</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('leaves single-column grids unchanged', () => {
      const html = '<div style="display:grid;grid-template-columns:repeat(1,1fr)"><div>a</div></div>';
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });
  });

  describe('Q4 scrubTruncatedAiTagSoup', () => {
    it('removes stray </h> and <h> without a digit', () => {
      const html = '<div>Shado</div></div></h></div></div></section>';
      const out = scrubTruncatedAiTagSoup(html);
      expect(out).not.toMatch(/<\/?h(?![1-6])[\s>/]/);
      expect(out).toContain('Shado');
    });

    it('leaves valid h1..h6 alone', () => {
      const html = '<h1>제목</h1><h3>부제</h3>';
      expect(scrubTruncatedAiTagSoup(html)).toBe(html);
    });
  });

  describe('Q5-a normalizeHangulParticleGaps', () => {
    it('joins the noun and particle back together', () => {
      expect(normalizeHangulParticleGaps('발화 회로 를 단련합니다')).toBe('발화 회로를 단련합니다');
      expect(normalizeHangulParticleGaps('의견 을 나누자')).toBe('의견을 나누자');
      expect(normalizeHangulParticleGaps('학습 이 어렵다')).toBe('학습이 어렵다');
    });

    it('leaves multi-word phrases intact', () => {
      expect(normalizeHangulParticleGaps('영어 회화 공부')).toBe('영어 회화 공부');
    });
  });

  describe('Q5-b scrubBriefLeakFromMetaSlots', () => {
    it('blanks .v/.conf whose text is the raw brief', () => {
      const brief = '영어 회화 공부, 연습 팁에 대한';
      const html = [
        '<div class="row"><span class="k">01</span><span class="v">영어 회화 공부, 연습 팁에 대한</span></div>',
        '<span class="conf">영어 회화 공부, 연습 팁에 대한</span>',
      ].join('');
      const out = scrubBriefLeakFromMetaSlots(html, brief);
      expect(out).not.toContain('영어 회화 공부, 연습 팁에 대한');
    });

    it('leaves genuine slot copy alone', () => {
      const brief = '영어 회화 공부, 연습 팁에 대한';
      const html = '<span class="v">Shadowing 10분</span>';
      expect(scrubBriefLeakFromMetaSlots(html, brief)).toBe(html);
    });

    it('is a no-op without a brief', () => {
      const html = '<span class="v">영어 회화 공부, 연습 팁에 대한</span>';
      expect(scrubBriefLeakFromMetaSlots(html, '')).toBe(html);
      expect(scrubBriefLeakFromMetaSlots(html, null)).toBe(html);
    });
  });

  describe('Q6 polishTruncatedInstructionTitles', () => {
    it('strips leftover 에 대한 tails without inventing copy', () => {
      const html = '<h1 class="display">영어 회화 공부<br>연습 팁에 대한</h1>';
      const out = polishTruncatedInstructionTitles(html);
      expect(out).toContain('영어 회화 공부');
      expect(out).toContain('연습 팁');
      expect(out).not.toMatch(/에 대한/);
      expect(out).not.toMatch(/학습 노트|쉐도잉|개요/);
    });

    it('leaves finished headings alone', () => {
      const html = '<h2>문법으로 외운 회화는 왜 입에서 안 나올까</h2>';
      expect(polishTruncatedInstructionTitles(html)).toBe(html);
    });
  });

  describe('healAiGeneratedDeckMarkup (combined)', () => {
    it('reproduces the user attachment fix in one pass', () => {
      const brief = '영어 회화 공부, 연습 팁에 대한';
      const html = [
        // Cover with brief leak in .v and .conf
        '<section class="slide s-cover" style="width:1920px;height:1080px">',
        '  <h1>영어 회화, 발화 근육 훈련</h1>',
        '  <div class="row"><span class="k">01</span><span class="v">영어 회화 공부, 연습 팁에 대한</span></div>',
        '  <span class="conf">영어 회화 공부, 연습 팁에 대한</span>',
        '  <div>하루 45분, 네 가지 리츄얼로 발화 회로 를 단련합니다</div>',
        '</section>',
        // Empty chapter shell
        '<section class="slide s-chapter" style="width:1920px;height:1080px;background:#0a0a0a"></section>',
        // Chapter slide with h1 wrapping a lede div
        '<section class="slide s-chapter" style="width:1920px;height:1080px">',
        '  <h1 style="font-size:124px">왜 회화는<br>공부가 아니라',
        '    <div style="margin-top:48px;font-size:28px">발화 근육이 필요합니다.</div>',
        '  </h1>',
        '</section>',
        // 4-col grid with 1 card + tail truncation
        '<section class="slide s-data" style="width:1920px;height:1080px">',
        '  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:28px">',
        '    <div style="background:#E9E5DB;padding:24px">',
        '      <div>01 · 10 MIN</div>',
        '      <div>Shado</div>',
        '    </div>',
        '  </div>',
        '</div></h></div></div></section>',
      ].join('\n');
      const out = healAiGeneratedDeckMarkup(html, brief);
      expect(out).not.toContain('영어 회화 공부, 연습 팁에 대한');
      expect(out).toMatch(/발화 회로를 단련합니다/);
      // Empty chapter is dropped (was slide 2).
      expect((out.match(/class="slide s-chapter"/g) ?? []).length).toBe(1);
      // Chapter h1 no longer wraps the lede div inline
      expect(out).toMatch(/<h1[^>]*>왜 회화는[^<]*<br>공부가 아니라[^<]*<\/h1>\s*<div[^>]*>발화 근육이 필요합니다\.<\/div>/);
      // Grid collapsed to 1 column
      expect(out).toMatch(/repeat\(1\s*,\s*1fr\)/);
      // Stray </h> gone
      expect(out).not.toMatch(/<\/?h(?![1-6])[\s>/]/);
    });
  });
});
