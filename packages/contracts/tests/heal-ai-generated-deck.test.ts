import { describe, expect, it } from 'vitest';
import {
  balanceUnderfilledFlexCardRow,
  closeUnclosedSiblingCardsInSlides,
  dropEmptyLikelyDeckSlides,
  healAiGeneratedDeckMarkup,
  polishTruncatedInstructionTitles,
  normalizeHangulParticleGaps,
  repairUnbalancedCardDivsInFragment,
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

    it('shrinks explicit 1fr 1fr 1fr with 2 cards to two equal columns', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;background:#1a1a1a">',
        '<div>PILLAR 01 lim</div>',
        '<div>PILLAR 02 d/dx</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*1fr 1fr(?:\s|;|")/);
      expect(out).not.toMatch(/grid-template-columns:\s*1fr 1fr 1fr/);
      expect(out).toContain('PILLAR 01 lim');
      expect(out).toContain('PILLAR 02 d/dx');
    });

    it('shrinks minmax(0,1fr) track lists the same way', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">',
        '<div>a</div><div>b</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*minmax\(0,1fr\) minmax\(0,1fr\)(?:\s|;|")/);
    });

    it('leaves a filled 1fr 1fr 1fr row unchanged', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('does not smash mixed sidebar tracks', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1.3fr 1fr">',
        '<div>main</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });
  });

  describe('루프191 balanceUnderfilledFlexCardRow', () => {
    it('gives flex-grow to peer cards in a row with no grow', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px;background:#1a1a1a"><h3>미분</h3></div>',
        '<div class="card" style="padding:24px;background:#1a1a1a"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = balanceUnderfilledFlexCardRow(html);
      expect(out).toMatch(/class="card"[^>]*flex:\s*1 1 0/i);
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBe(2);
      expect(out).toMatch(/display:flex;gap:28px;width:100%;min-width:0/i);
      expect(out).toContain('미분');
      expect(out).toContain('적분');
    });

    it('balances padded boxes without a card class', () => {
      const html = [
        '<div style="display:flex;gap:20px">',
        '<div style="padding:20px;background:#222">A</div>',
        '<div style="padding:20px;background:#222">B</div>',
        '<div style="padding:20px;background:#222">C</div>',
        '</div>',
      ].join('');
      const out = balanceUnderfilledFlexCardRow(html);
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBe(3);
    });

    it('leaves flex columns alone', () => {
      const html = [
        '<div style="display:flex;flex-direction:column;gap:12px">',
        '<div class="card" style="padding:16px">a</div>',
        '<div class="card" style="padding:16px">b</div>',
        '</div>',
      ].join('');
      expect(balanceUnderfilledFlexCardRow(html)).toBe(html);
    });

    it('leaves rows that already grow', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card" style="flex:1;padding:16px">a</div>',
        '<div class="card" style="flex:1;padding:16px">b</div>',
        '</div>',
      ].join('');
      expect(balanceUnderfilledFlexCardRow(html)).toBe(html);
    });

    it('leaves fixed-width sidebar flex rows alone', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div style="width:280px;padding:16px">side</div>',
        '<div class="card" style="padding:16px">main</div>',
        '</div>',
      ].join('');
      expect(balanceUnderfilledFlexCardRow(html)).toBe(html);
    });

    it('leaves chrome label rows without card-like children alone', () => {
      const html = [
        '<div style="display:flex;gap:32px;align-items:center">',
        '<div>Education · 2025</div>',
        '<div>High School</div>',
        '</div>',
      ].join('');
      expect(balanceUnderfilledFlexCardRow(html)).toBe(html);
    });

    it('heal pipeline balances a two-pillar flex row', () => {
      const html = [
        '<!doctype html><html><body>',
        '<section class="slide"><h1>미적분 세 기둥</h1>',
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>정의</p></div>',
        '<div class="card" style="padding:24px"><h3>미분</h3><p>도함수</p></div>',
        '</div></section>',
        '</body></html>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(2);
      expect(out).toContain('극한');
      expect(out).toContain('미분');
    });
  });

  describe('루프194 closeUnclosedSiblingCardsInSlides', () => {
    it('closes the previous card before the next sibling card opens', () => {
      const inner = [
        '<div class="card"><h3>극한</h3><p>정의</p>',
        '<div class="card"><h3>미분</h3><p>도함수</p></div>',
      ].join('');
      const out = repairUnbalancedCardDivsInFragment(inner);
      expect(out).toContain('</div><div class="card">');
      expect(out.match(/<div class="card"/g)?.length).toBe(2);
      expect((out.match(/<\/div>/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect(out).toContain('극한');
      expect(out).toContain('미분');
    });

    it('appends missing closes when a card is truncated mid-slide', () => {
      const inner = '<div class="card"><h3>적분</h3><p>넓이';
      const out = repairUnbalancedCardDivsInFragment(inner);
      expect(out.endsWith('</p></div>') || out.endsWith('넓이</p></div>')).toBe(true);
      expect(out).toContain('적분');
    });

    it('leaves well-formed sibling cards unchanged', () => {
      const inner = [
        '<div class="card"><h3>A</h3><p>a</p></div>',
        '<div class="card"><h3>B</h3><p>b</p></div>',
      ].join('');
      expect(repairUnbalancedCardDivsInFragment(inner)).toBe(inner);
    });

    it('keeps non-card wrappers inside a card', () => {
      const inner = '<div class="card"><div class="body"><p>본문</p></div></div>';
      expect(repairUnbalancedCardDivsInFragment(inner)).toBe(inner);
    });

    it('repairs unclosed cards inside slide hosts via the pipeline', () => {
      const html = [
        '<!doctype html><html><body>',
        '<section class="slide"><h2>세 기둥</h2>',
        '<div class="card"><h3>극한</h3><p>정의</p>',
        '<div class="card"><h3>미분</h3><p>도함수</p></div>',
        '</section>',
        '<section class="slide"><h2>다음</h2><p>정리</p></section>',
        '</body></html>',
      ].join('');
      const out = closeUnclosedSiblingCardsInSlides(html);
      expect(out).toMatch(/극한[\s\S]*?<\/div>\s*<div class="card"/);
      expect(out).toContain('미분');
      expect(out).toContain('<h2>다음</h2>');
      const healed = healAiGeneratedDeckMarkup(html, '미적분');
      expect(healed).toContain('극한');
      expect(healed).toContain('미분');
      expect(healed).toContain('다음');
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

    it('shrinks a three-pillar 1fr 1fr 1fr row that only emitted two cards', () => {
      const html = [
        '<section class="slide s-data" style="width:1920px;height:1080px">',
        '<h2>미적분의 세 기둥: 극한 · 도함수 · 적분</h2>',
        '<div class="grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px">',
        '<div class="card"><h3>PILLAR 01</h3><p>극한</p></div>',
        '<div class="card"><h3>PILLAR 02</h3><p>도함수</p></div>',
        '</div>',
        '</section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out).toMatch(/grid-template-columns:\s*1fr 1fr(?:\s|;|")/);
      expect(out).not.toMatch(/grid-template-columns:\s*1fr 1fr 1fr/);
      expect(out).toContain('PILLAR 01');
      expect(out).toContain('PILLAR 02');
      expect(out).toContain('미적분의 세 기둥');
    });

    it('clears a tagline that only repeats the user brief', () => {
      const brief = '삼각함수에 대해서 설명하는 피피티 만들어줘.';
      const html = [
        '<section class="slide s-cover">',
        '<h1>삼각함수</h1>',
        `<p class="tagline">${brief}</p>`,
        '</section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, brief);
      expect(out).toContain('삼각함수');
      expect(out).not.toContain(brief);
    });
  });
});
