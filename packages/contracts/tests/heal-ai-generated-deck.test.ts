import { describe, expect, it } from 'vitest';
import {
  balanceUnderfilledFlexCardRow,
  balanceClassBoundFlexCardRow,
  closeUnclosedSiblingCardsInSlides,
  dropEmptyLikelyDeckSlides,
  healAiGeneratedDeckMarkup,
  listAiSlideSpans,
  polishTruncatedInstructionTitles,
  normalizeHangulParticleGaps,
  repairUnbalancedCardDivsInFragment,
  scrubBriefLeakFromMetaSlots,
  scrubTruncatedAiTagSoup,
  shrinkOverAllocatedRepeatGrid,
  normalizeEqualFrTracksToMinmax,
  normalizeGridAutoColumnShares,
  normalizeGridAutoRowShares,
  shrinkOverAllocatedEqualTrackRows,
  shrinkClassBoundEqualTrackGrids,
  dropEmptyLeftoverPeerCardsInAllocatedRows,
  relaxUniformPeerCardFixedMainSize,
  unwrapRedundantNestedPeerCards,
  unnestHeadingBlockChildren,
} from '../src/html/heal-ai-generated-deck.js';

describe('heal-ai-generated-deck (0826-N01 F7)', () => {
  describe('루프254 listAiSlideSpans depth match', () => {
    it('keeps sibling slides when an inner section is nested inside the first', () => {
      const html = [
        '<section class="slide"><h1>Cover</h1>',
        '<section class="note">inner note</section>',
        '<p>Lead copy for the cover.</p></section>',
        '<section class="slide"><h2>Body</h2><p>Second slide copy.</p></section>',
      ].join('');
      const spans = listAiSlideSpans(html);
      expect(spans).toHaveLength(2);
      const firstBody = html.slice(spans[0]!.openEnd, spans[0]!.bodyEnd);
      expect(firstBody).toContain('inner note');
      expect(firstBody).toContain('Lead copy');
      expect(firstBody).not.toContain('Second slide');
      const secondBody = html.slice(spans[1]!.openEnd, spans[1]!.bodyEnd);
      expect(secondBody).toContain('Second slide copy');
    });

    it('drops nested slide hosts contained by an outer slide', () => {
      const html = [
        '<section class="slide"><h1>Outer</h1>',
        '<section class="slide"><h2>Nested</h2><p>Should not be a peer.</p></section>',
        '<p>Outer lead.</p></section>',
      ].join('');
      const spans = listAiSlideSpans(html);
      expect(spans).toHaveLength(1);
      const body = html.slice(spans[0]!.openEnd, spans[0]!.bodyEnd);
      expect(body).toContain('Nested');
      expect(body).toContain('Outer lead');
    });
  });

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

    it('shrinks explicit 33% 33% 33% with 2 cards (루프210)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33% 33% 33%;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*33% 33%/);
      expect(out).not.toMatch(/grid-template-columns:\s*33% 33% 33%/);
    });

    it('leaves a 50% 50% split unchanged (루프210)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:50% 50%;gap:24px">',
        '<div>목차</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks explicit 33vw 33vw 33vw with 2 cards (루프215)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33vw 33vw 33vw;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*33vw 33vw/);
      expect(out).not.toMatch(/grid-template-columns:\s*33vw 33vw 33vw/);
    });

    it('leaves a 50vw 50vw split unchanged (루프215)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:50vw 50vw;gap:24px">',
        '<div>목차</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks explicit 1.0fr 1.0fr 1.0fr with 2 cards (루프220)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1.0fr 1.0fr 1.0fr;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*1\.0fr 1\.0fr(?:\s|;|")/);
      expect(out).not.toMatch(/grid-template-columns:\s*1\.0fr 1\.0fr 1\.0fr/);
    });

    it('shrinks explicit 0.33fr 0.33fr 0.33fr with 2 cards (루프255)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:0.33fr 0.33fr 0.33fr;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*0\.33fr 0\.33fr/);
      expect(out).not.toMatch(/grid-template-columns:\s*0\.33fr 0\.33fr 0\.33fr/);
    });

    it('leaves a 0.5fr 0.5fr split unchanged (루프255)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:0.5fr 0.5fr;gap:24px">',
        '<div>목차</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks explicit 33vi 33vi 33vi with 2 cards (루프251)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33vi 33vi 33vi;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*33vi 33vi/);
      expect(out).not.toMatch(/grid-template-columns:\s*33vi 33vi 33vi/);
    });

    it('leaves a 50vb 50vb split unchanged (루프251)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:50vb 50vb;gap:24px">',
        '<div>목차</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks explicit 33dvmin 33dvmin 33dvmin with 2 cards (루프250)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33dvmin 33dvmin 33dvmin;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*33dvmin 33dvmin/);
      expect(out).not.toMatch(/grid-template-columns:\s*33dvmin 33dvmin 33dvmin/);
    });

    it('leaves a 50lvmax 50lvmax split unchanged (루프250)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:50lvmax 50lvmax;gap:24px">',
        '<div>목차</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks explicit 33cqmin 33cqmin 33cqmin with 2 cards (루프246)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33cqmin 33cqmin 33cqmin;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*33cqmin 33cqmin/);
      expect(out).not.toMatch(/grid-template-columns:\s*33cqmin 33cqmin 33cqmin/);
    });

    it('leaves a 50cqmax 50cqmax split unchanged (루프246)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:50cqmax 50cqmax;gap:24px">',
        '<div>목차</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks explicit 33dvw 33dvw 33dvw with 2 cards (루프245)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33dvw 33dvw 33dvw;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*33dvw 33dvw/);
      expect(out).not.toMatch(/grid-template-columns:\s*33dvw 33dvw 33dvw/);
    });

    it('leaves a 50svw 50svw split unchanged (루프245)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:50svw 50svw;gap:24px">',
        '<div>목차</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks explicit 33vh 33vh 33vh with 2 cards (루프238)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33vh 33vh 33vh;gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/grid-template-columns:\s*33vh 33vh/);
      expect(out).not.toMatch(/grid-template-columns:\s*33vh 33vh 33vh/);
    });

    it('leaves a 50vmin 50vmin split unchanged (루프238)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:50vmin 50vmin;gap:24px">',
        '<div>목차</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks minmax(auto,1fr) x3 with 2 cards (루프221)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(auto,1fr) minmax(auto,1fr) minmax(auto,1fr);gap:24px">',
        '<div>극한</div>',
        '<div>도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/minmax\(\s*auto\s*,\s*1fr\s*\) minmax\(\s*auto\s*,\s*1fr\s*\)/);
      expect(out).not.toMatch(/minmax\(\s*auto\s*,\s*1fr\s*\) minmax\(\s*auto\s*,\s*1fr\s*\) minmax\(\s*auto\s*,\s*1fr\s*\)/);
    });

    it('shrinks minmax(0,33%) x3 with 2 cards (루프289)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0,33%) minmax(0,33%) minmax(0,33%);gap:24px">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/minmax\(0,33%\) minmax\(0,33%\)/);
      expect(out).not.toMatch(/minmax\(0,33%\) minmax\(0,33%\) minmax\(0,33%\)/);
    });
  });

  describe('루프195 equal-track leftover / clip', () => {
    it('rewrites a filled 1fr 1fr 1fr row to minmax so the last card can shrink', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*1fr 1fr 1fr/);
    });

    it('rewrites a filled 1.0fr 1.0fr 1.0fr row to minmax (루프220)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1.0fr 1.0fr 1.0fr;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*1\.0fr 1\.0fr 1\.0fr/);
    });

    it('rewrites a filled minmax(auto,1fr) row to minmax(0,1fr) (루프221)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(auto,1fr) minmax(auto,1fr) minmax(auto,1fr);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/minmax\(\s*auto\s*,\s*1fr\s*\)/);
    });

    it('leaves mixed minmax(200px,1fr) sidebar tracks alone (루프221)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(200px,1fr) minmax(auto,1fr);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('rewrites a filled 33% 33% 33% row to minmax (루프210)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33% 33% 33%;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*33% 33% 33%/);
    });

    it('rewrites a filled 0.33fr 0.33fr 0.33fr row to minmax (루프255)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:0.33fr 0.33fr 0.33fr;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*0\.33fr 0\.33fr 0\.33fr/);
    });

    it('rewrites a filled minmax(0,33%) row to minmax(0,1fr) (루프289)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0,33%) minmax(0,33%) minmax(0,33%);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/minmax\(0,33%\)/);
    });

    it('rewrites a filled minmax(0,30vw) row to minmax(0,1fr) (루프289)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0,30vw) minmax(0,30vw) minmax(0,30vw);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/minmax\(0,30vw\)/);
    });

    it('rewrites a filled minmax(0,0.33fr) row to minmax(0,1fr) (루프289)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0,0.33fr) minmax(0,0.33fr) minmax(0,0.33fr);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/minmax\(0,0\.33fr\)/);
    });

    it('leaves minmax(200px,1fr) sidebar tracks alone even with share-looking peers (루프289)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(200px,1fr) minmax(0,33%);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('shrinks repeat(3, minmax(0, calc(100%/3))) with 2 cards (루프292)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:repeat(3, minmax(0, calc(100% / 3)));gap:24px">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/repeat\(\s*2\s*,\s*minmax\(0,\s*calc\(100%\s*\/\s*3\)\)/);
      expect(out).not.toMatch(/repeat\(\s*3\s*,/);
    });

    it('rewrites a filled minmax(0, calc(33%)) row to minmax(0,1fr) (루프292)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0, calc(33%)) minmax(0, calc(33%)) minmax(0, calc(33%));gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/calc\(33%\)/);
    });

    it('rewrites a filled minmax(0, calc(100%/3)) row to minmax(0,1fr) (루프292)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0,calc(100%/3)) minmax(0,calc(100%/3)) minmax(0,calc(100%/3));gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/calc\(100%\/3\)/);
    });

    it('leaves calc(50%) two-track splits alone (루프292)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:calc(50%) calc(50%);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
      expect(shrinkOverAllocatedRepeatGrid(html)).toBe(html);
    });

    it('rewrites a filled var(--col, 33%) row to minmax (루프299)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:var(--col, 33%) var(--col, 33%) var(--col, 33%);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/var\(--col,\s*33%\)/);
    });

    it('rewrites minmax(0, var(--col, calc(100%/3))) leftover shares (루프299)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0, var(--col, calc(100% / 3))) minmax(0, var(--col, calc(100% / 3))) minmax(0, var(--col, calc(100% / 3)));gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
    });

    it('rewrites a filled minmax(0px,1fr) row to minmax(0,1fr) (루프300)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0px,1fr) minmax(0px,1fr) minmax(0px,1fr);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/minmax\(0px,1fr\)/);
    });

    it('rewrites a filled minmax(0%,33%) row to minmax(0,1fr) (루프300)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0%,33%) minmax(0%,33%) minmax(0%,33%);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
    });

    it('shrinks repeat(3, minmax(0px, 1fr)) with 2 cards (루프300)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:repeat(3, minmax(0px, 1fr));gap:24px">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedRepeatGrid(html);
      expect(out).toMatch(/repeat\(\s*2\s*,\s*minmax\(0px,\s*1fr\)/);
      expect(out).not.toMatch(/repeat\(\s*3\s*,/);
    });

    it('rewrites a filled clamp(0px,33%,1fr) row to minmax(0,1fr) (루프303)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:clamp(0px,33%,1fr) clamp(0px,33%,1fr) clamp(0px,33%,1fr);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/clamp\(/);
    });

    it('rewrites minmax(0, min(33%,1fr)) leftover shares (루프303)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0,min(33%,1fr)) minmax(0,min(33%,1fr)) minmax(0,min(33%,1fr));gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
    });

    it('rewrites a filled fit-content(33%) row to minmax(0,1fr) (루프306)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:fit-content(33%) fit-content(33%) fit-content(33%);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/fit-content\(/);
    });

    it('rewrites minmax(0, fit-content(calc(100%/3))) leftover shares (루프306)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0,fit-content(calc(100%/3))) minmax(0,fit-content(calc(100%/3))) minmax(0,fit-content(calc(100%/3)));gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
    });

    it('rewrites env(safe-area-inset-left, 33%) leftover shares (루프310)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:env(safe-area-inset-left, 33%) env(safe-area-inset-left, 33%) env(safe-area-inset-left, 33%);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/env\(/);
    });

    it('leaves env(..., 50%) two-track splits alone (루프310)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:env(safe-area-inset-left, 50%) env(safe-area-inset-left, 50%);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('rewrites repeat(auto-fill, 33%) with 2 cards to repeat(2, minmax(0,1fr)) (루프311)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:repeat(auto-fill, 33%);gap:24px">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/repeat\(\s*2\s*,\s*minmax\(0,1fr\)/);
      expect(out).not.toMatch(/auto-fill/);
    });

    it('rewrites repeat(auto-fit, minmax(0,33%)) filled 3-card row (루프311)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(0,33%));gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/repeat\(\s*3\s*,\s*minmax\(0,1fr\)/);
    });

    it('leaves repeat(auto-fill, 50%) two-card splits alone (루프311)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:repeat(auto-fill, 50%);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('rewrites grid-auto-columns:33% implicit leftover tracks (루프309)', () => {
      const html = [
        '<div style="display:grid;grid-auto-columns:33%;gap:24px">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '<div class="card">적분</div>',
        '</div>',
      ].join('');
      const out = normalizeGridAutoColumnShares(html, '미적분');
      expect(out).toMatch(/grid-auto-columns:\s*minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-auto-columns:\s*33%/);
    });

    it('leaves grid-auto-columns:50% two-card splits alone (루프309)', () => {
      const html = [
        '<div style="display:grid;grid-auto-columns:50%;gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeGridAutoColumnShares(html, '미적분')).toBe(html);
    });

    it('rewrites calc(100%/sibling-count()) leftover tracks (루프314)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:calc(100% / sibling-count()) calc(100% / sibling-count()) calc(100% / sibling-count());gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/sibling-count/);
    });

    it('rewrites calc((100% - 48px) / sibling-count()) leftover tracks (루프314)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:calc((100% - 48px) / sibling-count()) calc((100% - 48px) / sibling-count());gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*minmax\(0,1fr\) minmax\(0,1fr\)/);
    });

    it('rewrites 33% 33% 34% leftover rounding to minmax(0,1fr) (루프315)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33% 33% 34%;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
    });

    it('leaves 30% 50% mixed splits alone (루프315)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:30% 50%;gap:24px">',
        '<div>사이드</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('rewrites grid-auto-rows:33% implicit leftover bands (루프316)', () => {
      const html = [
        '<div style="display:grid;grid-auto-rows:33%;gap:24px">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '<div class="card">적분</div>',
        '</div>',
      ].join('');
      const out = normalizeGridAutoRowShares(html, '미적분');
      expect(out).toMatch(/grid-auto-rows:\s*minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-auto-rows:\s*33%/);
    });

    it('leaves grid-auto-rows:50% two-row splits alone (루프316)', () => {
      const html = [
        '<div style="display:grid;grid-auto-rows:50%;gap:24px">',
        '<div>위</div><div>아래</div>',
        '</div>',
      ].join('');
      expect(normalizeGridAutoRowShares(html, '미적분')).toBe(html);
    });

    it('rewrites constant(safe-area-inset-left, 33%) leftover shares (루프317)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:constant(safe-area-inset-left, 33%) constant(safe-area-inset-left, 33%) constant(safe-area-inset-left, 33%);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/constant\(/);
    });

    it('leaves constant(..., 50%) two-track splits alone (루프317)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:constant(safe-area-inset-left, 50%) constant(safe-area-inset-left, 50%);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('rewrites minmax(0ch, 33%) leftover shares (루프318)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0ch, 33%) minmax(0ex, 33%) minmax(0lh, 33%);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
    });

    it('rewrites minmax(0cqw, calc(100%/3)) leftover shares (루프318)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:minmax(0cqw, calc(100%/3)) minmax(0cqw, calc(100%/3)) minmax(0cqw, calc(100%/3));gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
    });

    it('rewrites calc(33% - 16px) leftover shares (루프312)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:calc(33% - 16px) calc(33% - 16px) calc(33% - 16px);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/calc\(33%/);
    });

    it('rewrites calc((100% - 48px) / 3) leftover shares (루프312)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:calc((100% - 48px) / 3) calc((100% - 48px) / 3) calc((100% - 48px) / 3);gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
    });

    it('leaves calc(50% - 16px) two-track splits alone (루프312)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:calc(50% - 16px) calc(50% - 16px);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('leaves fit-content(50%) two-track splits alone (루프306)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:fit-content(50%) fit-content(50%);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('leaves clamp(...,50%,...) two-track splits alone (루프303)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:clamp(0px,50%,1fr) clamp(0px,50%,1fr);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('leaves var(--col, 50%) two-track splits alone (루프299)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:var(--col, 50%) var(--col, 50%);gap:24px">',
        '<div>목차</div><div>본문</div>',
        '</div>',
      ].join('');
      expect(normalizeEqualFrTracksToMinmax(html)).toBe(html);
    });

    it('rewrites a filled 33vi 33vi 33vi row to minmax (루프251)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33vi 33vi 33vi;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*33vi 33vi 33vi/);
    });

    it('rewrites a filled 33dvmin 33dvmin 33dvmin row to minmax (루프250)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33dvmin 33dvmin 33dvmin;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*33dvmin 33dvmin 33dvmin/);
    });

    it('rewrites a filled 33cqmin 33cqmin 33cqmin row to minmax (루프246)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33cqmin 33cqmin 33cqmin;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*33cqmin 33cqmin 33cqmin/);
    });

    it('rewrites a filled 33dvw 33dvw 33dvw row to minmax (루프245)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33dvw 33dvw 33dvw;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*33dvw 33dvw 33dvw/);
    });

    it('rewrites a filled 33vh 33vh 33vh row to minmax (루프238)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33vh 33vh 33vh;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*33vh 33vh 33vh/);
    });

    it('rewrites a filled 33vw 33vw 33vw row to minmax (루프215)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:33vw 33vw 33vw;gap:24px">',
        '<div>a</div><div>b</div><div>c</div>',
        '</div>',
      ].join('');
      const out = normalizeEqualFrTracksToMinmax(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){2}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*33vw 33vw 33vw/);
    });

    it('collapses a 2x2 leftover row when only two cards were emitted', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:24px">',
        '<div>a</div><div>b</div>',
        '</div>',
      ].join('');
      const out = shrinkOverAllocatedEqualTrackRows(html);
      expect(out).toMatch(/grid-template-rows:\s*1fr(?:\s|;|")/);
      expect(out).not.toMatch(/grid-template-rows:\s*1fr 1fr/);
      expect(out).toMatch(/grid-template-columns:\s*1fr 1fr/);
    });

    it('does not collapse a 2x2 that actually has four cards', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr">',
        '<div>a</div><div>b</div><div>c</div><div>d</div>',
        '</div>',
      ].join('');
      expect(shrinkOverAllocatedEqualTrackRows(html)).toBe(html);
    });

    it('shrinks a Hangul .cards-grid stylesheet 3-col with two cards', () => {
      const html = [
        '<style>.cards-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}</style>',
        '<section class="slide"><h2>미적분의 세 기둥</h2>',
        '<div class="cards-grid">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '</div></section>',
      ].join('');
      const out = shrinkClassBoundEqualTrackGrids(html, '미적분');
      expect(out).toMatch(
        /<div\b[^>]*\bcards-grid\b[^>]*grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)|<div\b[^>]*grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)[^>]*\bcards-grid\b/,
      );
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('leaves official English catalog 2x2 class grids alone', () => {
      const html = [
        '<style>.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}</style>',
        '<div class="grid"><div>One</div><div>Two</div></div>',
      ].join('');
      expect(shrinkClassBoundEqualTrackGrids(html)).toBe(html);
    });

    it('shrinks English multi-slide class grids with AI markers (루프252)', () => {
      const html = [
        '<style>.cards-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px}</style>',
        '<section class="slide"><div data-od-slide-flow="">',
        '<h2>Three pillars</h2>',
        '<div class="cards-grid">',
        '<div class="card">Limit</div>',
        '<div class="card">Derivative</div>',
        '</div></div></section>',
        '<section class="slide"><h2>Summary</h2><p>Wrap up the lecture.</p></section>',
      ].join('');
      const out = shrinkClassBoundEqualTrackGrids(html);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)/);
      expect(out).toContain('Limit');
      expect(out).toContain('Derivative');
    });

    it('pipeline heals a class-bound 2x2 leftover on a Hangul slide', () => {
      const html = [
        '<style>.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}</style>',
        '<section class="slide s-data"><h2>두 가지 핵심</h2>',
        '<div class="grid">',
        '<div class="card">첫째</div>',
        '<div class="card">둘째</div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '핵심');
      expect(out).toMatch(
        /<div\b[^>]*grid-template-rows:\s*(?:minmax\(0,1fr\)|1fr)(?:\s|;|")/,
      );
      expect(out).not.toMatch(
        /<div\b[^>]*grid-template-rows:\s*1fr 1fr/,
      );
      expect(out).toContain('첫째');
      expect(out).toContain('둘째');
    });
  });

  describe('루프197 empty leftover peer cards', () => {
    it('drops an empty third card so a flex row can fill two pillars', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).not.toMatch(/<div class="card"[^>]*>\s*<\/div>/);
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
    });

    it('drops an empty third grid card so 190/195 can shrink the row', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '<div class="card"></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('keeps a motif svg card and does not wipe an all-empty row', () => {
      const svgRow = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3></div>',
        '<div class="card"><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(svgRow, '미적분')).toContain('<svg');

      const emptyRow = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"></div>',
        '<div class="card"></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(emptyRow, '미적분')).toBe(emptyRow);
    });

    it('leaves official English catalog empty cells alone without a brief', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr">',
        '<div class="card">One</div>',
        '<div class="card">Two</div>',
        '<div class="card"></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('pipeline heals the 미적분 empty-third-card leftover without inventing 적분 copy', () => {
      const html = [
        '<!doctype html><html><body>',
        '<section class="slide"><h1>미적분의 세 기둥: 극한 · 도함수 · 적분</h1>',
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>PILLAR 01</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>PILLAR 02</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"></div>',
        '</div></section>',
        '</body></html>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out).toContain('미적분의 세 기둥');
      expect(out).toContain('PILLAR 01');
      expect(out).toContain('PILLAR 02');
      expect(out).toContain('lim');
      expect(out).toContain('d/dx');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(2);
      expect(out).not.toMatch(/<div class="card"[^>]*>\s*<\/div>/);
      expect(out).not.toContain('PILLAR 03');
    });

    it('drops a 제목/내용 placeholder third card (루프200)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>제목</h3><p>내용</p></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).not.toContain('<h3>제목</h3>');
    });

    it('drops an ellipsis-only third card (루프200)', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card">극한</div>',
        '<div class="card">도함수</div>',
        '<div class="card">...</div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('...');
    });

    it('keeps a real short Hangul card that is not a placeholder', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>적분</h3><p>넓이</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a placeholder third pillar without inventing 적분 copy (루프200)', () => {
      const html = [
        '<!doctype html><html><body>',
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>PILLAR 01</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>PILLAR 02</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>제목</h3><p>내용을 입력하세요</p></div>',
        '</div></section>',
        '</body></html>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).toContain('PILLAR 01');
      expect(out).toContain('PILLAR 02');
      expect(out).not.toContain('내용을 입력하세요');
      expect(out).not.toContain('PILLAR 03');
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(2);
    });

    it('leaves official English Title/Body catalog cells alone without a brief (루프200)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>One</h3><p>Alpha</p></div>',
        '<div class="card"><h3>Title</h3><p>Body</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('drops a FIXME leftover third card (루프252)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>FIXME</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/FIXME/i);
      expect(out).toContain('극한');
    });

    it('keeps FIXME 적분 copy that is not a stub card (루프252)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>FIXME</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a hack leftover without inventing 적분 copy (루프252)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>hack</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bhack\b/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a Lesson 3 leftover third card (루프256)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>Lesson 3</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('Lesson 3');
      expect(out).toContain('극한');
    });

    it('keeps a Lesson step row where every peer is an index (루프256)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">Lesson 1</div>',
        '<div class="card">Lesson 2</div>',
        '<div class="card">Lesson 3</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 강 3 leftover without inventing 적분 copy (루프256)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>강 3</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('강 3');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a 기타 leftover third card (루프257)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>기타</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기타');
      expect(out).toContain('극한');
    });

    it('keeps leftover-token cards that still have extra visible text (루프257)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>기타</h3><p>실카피</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('pipeline heals an etc leftover without inventing 적분 copy (루프257)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>etc</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\betc\b/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a 완료 leftover third card (루프258)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>완료</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('완료');
      expect(out).toContain('극한');
    });

    it('keeps leftover-token cards that still have extra visible text (루프258)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>완료</h3><p>실카피</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('pipeline heals an ok leftover without inventing 적분 copy (루프258)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>ok</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bok\b/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('keeps leftover stubs that still have extra visible text of any topic (루프259)', () => {
      const hangulExtra = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>etc</h3><p>실카피</p></div>',
        '</div>',
      ].join('');
      const latinExtra = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>ok</h3><p>notes</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(hangulExtra, '발표')).toBe(hangulExtra);
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(latinExtra, '발표')).toBe(latinExtra);
    });

    it('still drops a lone leftover stub when there is no extra text (루프259)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>etc</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\betc\b/i);
      expect(out).toContain('하나');
    });

    it('pipeline heals a leftover stub without inventing topic copy (루프259)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>완료</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('완료');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('drops a 기타사항 leftover third card (루프264)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기타사항</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기타사항');
      expect(out).toContain('하나');
    });

    it('keeps leftover-token cards that still have extra visible text (루프264)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>misc</h3><p>실카피</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('pipeline heals a misc leftover without inventing topic copy (루프264)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>misc</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bmisc\b/i);
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('drops a 그외 leftover third card (루프265)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>그외</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('그외');
      expect(out).toContain('하나');
    });

    it('keeps leftover stubs that still have extra visible text of any topic (루프265)', () => {
      const extras = ['실카피', 'notes', '범위'];
      for (const extra of extras) {
        const html = [
          '<div style="display:flex;gap:16px">',
          '<div class="card"><h3>하나</h3><p>요지</p></div>',
          `<div class="card"><h3>other</h3><p>${extra}</p></div>`,
          '</div>',
        ].join('');
        expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
      }
    });

    it('pipeline heals a rest leftover without inventing topic copy (루프265)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>rest</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\brest\b/i);
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('drops a Chapter 3 leftover third card (루프248)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>Chapter 3</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('Chapter 3');
      expect(out).toContain('극한');
    });

    it('keeps a Chapter step row where every peer is an index (루프248)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">Chapter 1</div>',
        '<div class="card">Chapter 2</div>',
        '<div class="card">Chapter 3</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 장 3 leftover without inventing 적분 copy (루프248)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>장 3</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('장 3');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a foo leftover third card (루프247)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>foo</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bfoo\b/i);
      expect(out).toContain('극한');
    });

    it('keeps bar 적분 copy that is not a stub card (루프247)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>bar</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a baz leftover without inventing 적분 copy (루프247)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>baz</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bbaz\b/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a pass leftover third card (루프244)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>pass</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bpass\b/i);
      expect(out).toContain('극한');
    });

    it('keeps pass 적분 copy that is not a stub card (루프244)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>pass</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 스킵 leftover without inventing 적분 copy (루프244)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>스킵</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('스킵');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a null leftover third card (루프243)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>null</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bnull\b/i);
      expect(out).toContain('극한');
    });

    it('keeps null 적분 copy that is not a stub card (루프243)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>null</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals an undefined leftover without inventing 적분 copy (루프243)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>undefined</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bundefined\b/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a Group 3 leftover third card (루프242)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>Group 3</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('Group 3');
      expect(out).toContain('극한');
    });

    it('keeps a Group step row where every peer is an index (루프242)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">Group 1</div>',
        '<div class="card">Group 2</div>',
        '<div class="card">Group 3</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 행 3 leftover without inventing 적분 copy (루프242)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>행 3</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('행 3');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops an xxx leftover third card (루프241)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>xxx</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bxxx\b/i);
      expect(out).toContain('극한');
    });

    it('keeps xxx 적분 copy that is not a stub card (루프241)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>xxx</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals an asdf leftover without inventing 적분 copy (루프241)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>asdf</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\basdf\b/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a 임시 leftover third card (루프231)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>임시</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('임시');
      expect(out).toContain('극한');
    });

    it('keeps 임시 적분 copy that is not a stub card (루프231)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>임시</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a fake leftover without inventing 적분 copy (루프231)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>fake</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bfake\b/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a 10 leftover third card (루프230)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>10</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/>10</);
      expect(out).toContain('극한');
    });

    it('keeps an 11 index-looking card because 11–99 are not leftover digits (루프230)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>11</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('keeps a 10% KPI card that is not an index leftover (루프230)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>10%</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a PILLAR 10 leftover without inventing 적분 copy (루프230)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>PILLAR 10</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('PILLAR 10');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a Module 3 leftover third card (루프229)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>Module 3</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('Module 3');
      expect(out).toContain('극한');
    });

    it('keeps a Module step row where every peer is an index (루프229)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">Module 1</div>',
        '<div class="card">Module 2</div>',
        '<div class="card">Module 3</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 섹션 3 leftover without inventing 적분 copy (루프229)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>섹션 3</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('섹션 3');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a 자료없음 leftover third card (루프228)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>자료없음</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('자료없음');
      expect(out).toContain('극한');
    });

    it('keeps 자료 적분 copy that is not a stub card (루프228)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>자료</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals an 정보없음 leftover without inventing 적분 copy (루프228)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>정보없음</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('정보없음');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a lorem ipsum leftover third card (루프227)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>lorem ipsum</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/lorem ipsum/i);
      expect(out).toContain('극한');
    });

    it('keeps lorem 적분 copy that is not a stub card (루프227)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>lorem</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a placeholder leftover without inventing 적분 copy (루프227)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>placeholder</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/placeholder/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a fullwidth ０ leftover third card (루프226)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>０</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('０');
      expect(out).toContain('극한');
    });

    it('keeps a circled-zero step row where every peer is an index (루프226)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">⓪</div>',
        '<div class="card">①</div>',
        '<div class="card">②</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 기둥 ０ leftover without inventing 적분 copy (루프226)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>기둥 ０</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 ０');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a 00 leftover third card (루프225)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>00</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/>00</);
      expect(out).toContain('극한');
    });

    it('keeps a 0% KPI card that is not an index leftover (루프225)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>0%</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a PILLAR 0 leftover without inventing 적분 copy (루프225)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>PILLAR 0</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('PILLAR 0');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a 대기 leftover third card (루프224)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>대기</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('대기');
      expect(out).toContain('극한');
    });

    it('keeps 나중에 적분 copy that is not a stub card (루프224)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>나중에</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a soon leftover without inventing 적분 copy (루프224)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>soon</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bsoon\b/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a tobefilled leftover third card (루프223)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>to be filled</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/to be filled/i);
      expect(out).toContain('극한');
    });

    it('keeps to-be-filled 적분 copy that is not a stub card (루프223)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>to be filled</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a filllater third pillar without inventing 적분 copy (루프223)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>fill later</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/fill later/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a dummy / 예시 leftover third card (루프218)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>dummy</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bdummy\b/i);
      expect(out).toContain('극한');
    });

    it('keeps sample-mean copy that is not a stub card (루프218)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>표본</h3><p>sample mean</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals an 예시 third pillar without inventing 적분 copy (루프218)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>예시</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('예시');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a 작성예정 leftover third card (루프216)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>작성 예정</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('작성 예정');
      expect(out).toContain('극한');
    });

    it('keeps 추후 적분 예정 copy that is not a stub card (루프216)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>추후</h3><p>적분 예정 범위</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 입력필요 third pillar without inventing 적분 copy (루프216)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>입력필요</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('입력필요');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops an empty / blank leftover third card (루프214)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>empty</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/\bempty\b/i);
      expect(out).toContain('극한');
    });

    it('keeps empty-set copy that is not a stub card (루프214)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>공집합</h3><p>empty set</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a pending third pillar without inventing 적분 copy (루프214)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>pending</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/pending/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops an n.a. / t.b.d. dotted stub third card (루프211)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>n.a.</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/n\.a\./i);
      expect(out).toContain('극한');
    });

    it('keeps a 3.14 stat card that is not a dotted stub (루프211)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>3.14</h3><p>원주율</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a T.B.D. third pillar without inventing 적분 copy (루프211)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>T.B.D.</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/T\.B\.D\./i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a TBD / 준비중 stub third card (루프202)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>TBD</h3><p>준비중</p></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).not.toMatch(/TBD|준비중/);
    });

    it('drops a 해당없음 leftover third card (루프208)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>해당없음</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('해당없음');
      expect(out).toContain('극한');
    });

    it('keeps 부작용 없음 copy that is not a stub card (루프208)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>적분</h3><p>부작용 없음</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 미입력 third pillar without inventing 적분 copy (루프208)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>미입력</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('미입력');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('keeps a real card that only starts with 추후 (루프202)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>추후</h3><p>적분 예정 범위</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals an N/A third pillar without inventing 적분 copy (루프202)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>N/A</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/N\/A|n\/a/i);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)/);
    });

    it('drops a PILLAR 03 index-only third card (루프205)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>PILLAR 01</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>PILLAR 02</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>PILLAR 03</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).toContain('PILLAR 01');
      expect(out).toContain('PILLAR 02');
      expect(out).not.toContain('PILLAR 03');
    });

    it('keeps a numbered step row where every peer is an index (루프205)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">1</div>',
        '<div class="card">2</div>',
        '<div class="card">3</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('keeps a PILLAR label that still has pillar copy (루프205)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>PILLAR 01</h3><p>lim</p></div>',
        '<div class="card"><h3>PILLAR 02</h3><p>d/dx</p></div>',
        '<div class="card"><h3>PILLAR 03</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('drops a PILLAR 03. leftover with trailing punct (루프205)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>PILLAR 03.</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('PILLAR 03');
    });

    it('drops a Phase 3 leftover third card (루프222)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>Phase 3</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('Phase 3');
      expect(out).toContain('극한');
    });

    it('keeps a Phase step row where every peer is an index (루프222)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">Phase 1</div>',
        '<div class="card">Phase 2</div>',
        '<div class="card">Phase 3</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 축 3 leftover without inventing 적분 copy (루프222)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>축 3</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('축 3');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('keeps UNIT 3 because that prefix is not leftover vocabulary (루프222)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>UNIT 3</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('drops a circled ③ leftover third card (루프219)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>③</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('③');
      expect(out).toContain('극한');
    });

    it('keeps a circled step row where every peer is an index (루프219)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">①</div>',
        '<div class="card">②</div>',
        '<div class="card">③</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('drops a letter C leftover third card (루프237)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>C</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/>\s*C\s*</);
      expect(out).toContain('극한');
    });

    it('drops a 3번 / (3) leftover third card (루프237)', () => {
      const bun = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>극한</h3></div>',
        '<div class="card"><h3>도함수</h3></div>',
        '<div class="card"><h3>3번</h3></div>',
        '</div>',
      ].join('');
      const paren = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>극한</h3></div>',
        '<div class="card"><h3>도함수</h3></div>',
        '<div class="card"><h3>(3)</h3></div>',
        '</div>',
      ].join('');
      expect((dropEmptyLeftoverPeerCardsInAllocatedRows(bun, '미적분').match(/class="card"/g) ?? []).length).toBe(2);
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(bun, '미적분')).not.toContain('3번');
      expect((dropEmptyLeftoverPeerCardsInAllocatedRows(paren, '미적분').match(/class="card"/g) ?? []).length).toBe(2);
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(paren, '미적분')).not.toContain('(3)');
    });

    it('keeps a letter step row where every peer is an index (루프237)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">A</div>',
        '<div class="card">B</div>',
        '<div class="card">C</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 기둥 다 leftover without inventing 적분 copy (루프237)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>기둥 다</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 다');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a letter D leftover third card (루프239)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>D</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/>\s*D\s*</);
      expect(out).toContain('극한');
    });

    it('drops a 셋째 leftover third card (루프239)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>극한</h3></div>',
        '<div class="card"><h3>도함수</h3></div>',
        '<div class="card"><h3>셋째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('셋째');
    });

    it('keeps a Hangul ordinal step row where every peer is an index (루프239)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">첫째</div>',
        '<div class="card">둘째</div>',
        '<div class="card">셋째</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('keeps 스무 번째 — not treated as an empty column number yet (루프291)', () => {
      const twentieth = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>스무 번째</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(twentieth, '발표')).toBe(twentieth);
    });

    it('keeps 첫째 적분 real copy that is not an index leftover (루프239)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>극한</h3></div>',
        '<div class="card"><h3>도함수</h3></div>',
        '<div class="card"><h3>첫째 적분</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('drops a 기둥 E leftover third card (루프261)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 E</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 E');
      expect(out).toContain('극한');
    });

    it('drops a 여섯째 leftover third card (루프261)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>극한</h3></div>',
        '<div class="card"><h3>도함수</h3></div>',
        '<div class="card"><h3>여섯째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('여섯째');
    });

    it('keeps leftover-index cards that still have extra visible text (루프261)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>여섯째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a letter G leftover third card (루프266)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>G</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/>\s*G\s*</);
      expect(out).toContain('하나');
    });

    it('drops a 열한째 leftover third card (루프266)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열한째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열한째');
    });

    it('keeps leftover-index cards that still have extra visible text (루프266)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열한째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a 기둥 H leftover third card (루프272)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 H</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 H');
      expect(out).toContain('하나');
    });

    it('drops a 열두째 leftover third card (루프272)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열두째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열두째');
    });

    it('keeps leftover-index cards that still have extra visible text (루프272)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열두째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a 기둥 J leftover third card (루프274)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 J</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 J');
      expect(out).toContain('하나');
    });

    it('drops a 열세째 leftover third card (루프274)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열세째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열세째');
    });

    it('keeps leftover-index cards that still have extra visible text (루프274)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열세째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a third card whose only text is the column label 기둥 K (루프278)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 K</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 K');
      expect(out).toContain('하나');
    });

    it('drops a third card whose only text is the ordinal 열네째 (루프278)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열네째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열네째');
    });

    it('drops a third card whose only text is the column label 기둥 카 (루프278)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 카</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 카');
    });

    it('keeps 열네째 실카피 — a column number plus real body copy (루프278)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열네째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a third card whose only text is the column label 기둥 L (루프285)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 L</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 L');
      expect(out).toContain('하나');
    });

    it('drops a third card whose only text is the ordinal 열다섯째 (루프285)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열다섯째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열다섯째');
    });

    it('drops a third card whose only text is the column label 기둥 타 (루프285)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 타</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 타');
    });

    it('keeps 열다섯째 실카피 — a column number plus real body copy (루프285)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열다섯째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a third card whose only text is the column label 기둥 M (루프286)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 M</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 M');
      expect(out).toContain('하나');
    });

    it('drops a third card whose only text is the ordinal 열여섯째 (루프286)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열여섯째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열여섯째');
    });

    it('drops a third card whose only text is the column label 기둥 파 (루프286)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 파</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 파');
    });

    it('keeps 열여섯째 실카피 — a column number plus real body copy (루프286)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열여섯째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a third card whose only text is the column label 기둥 N (루프288)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 N</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 N');
      expect(out).toContain('하나');
    });

    it('drops a third card whose only text is the ordinal 열일곱째 (루프288)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열일곱째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열일곱째');
    });

    it('drops a third card whose only text is the column label 기둥 하 (루프288)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 하</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 하');
    });

    it('keeps 열일곱째 실카피 — a column number plus real body copy (루프288)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열일곱째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a third card whose only text is the column number 기둥 O (루프291)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 O</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 O');
      expect(out).toContain('하나');
    });

    it('drops a third card whose only text is the ordinal 열여덟째 (루프291)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열여덟째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열여덟째');
    });

    it('keeps 열여덟째 실카피 — a column number plus real body copy (루프291)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열여덟째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('keeps 기둥 W — not treated as an empty column number yet (루프324)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 W</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a third card whose only text is the column number 기둥 U (루프337)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 U</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 U');
      expect(out).toContain('하나');
    });

    it('keeps 기둥 U 실카피 — a column number plus real body copy (루프337)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 U 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('leaves official English 기둥 U catalog cells alone without a brief (루프337)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>One</h3></div>',
        '<div class="card"><h3>Two</h3></div>',
        '<div class="card"><h3>기둥 U</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('drops a third card whose only text is the column number 기둥 T (루프336)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 T</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 T');
      expect(out).toContain('하나');
    });

    it('keeps 기둥 T 실카피 — a column number plus real body copy (루프336)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 T 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('leaves official English 기둥 T catalog cells alone without a brief (루프336)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>One</h3></div>',
        '<div class="card"><h3>Two</h3></div>',
        '<div class="card"><h3>기둥 T</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('drops a third card whose only text is the column number 기둥 S (루프327)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 S</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 S');
      expect(out).toContain('하나');
    });

    it('keeps 기둥 S 실카피 — a column number plus real body copy (루프327)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 S 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('leaves official English 기둥 S catalog cells alone without a brief (루프327)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>One</h3></div>',
        '<div class="card"><h3>Two</h3></div>',
        '<div class="card"><h3>기둥 S</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('drops a third card whose only text is the column number 기둥 R (루프326)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 R</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 R');
      expect(out).toContain('하나');
    });

    it('keeps 기둥 R 실카피 — a column number plus real body copy (루프326)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 R 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('leaves official English 기둥 R catalog cells alone without a brief (루프326)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>One</h3></div>',
        '<div class="card"><h3>Two</h3></div>',
        '<div class="card"><h3>기둥 R</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('drops a third card whose only text is the column number 기둥 Q (루프324)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 Q</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 Q');
      expect(out).toContain('하나');
    });

    it('keeps 기둥 Q 실카피 — a column number plus real body copy (루프324)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>기둥 Q 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('drops a third card whose only text is the ordinal 스무째 (루프325)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>스무째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('스무째');
    });

    it('keeps 스무째 실카피 — a column number plus real body copy (루프325)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>스무째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('leaves official English 스무째 catalog cells alone without a brief (루프325)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>One</h3></div>',
        '<div class="card"><h3>Two</h3></div>',
        '<div class="card"><h3>스무째</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('leaves official English 기둥 Q catalog cells alone without a brief (루프324)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>One</h3></div>',
        '<div class="card"><h3>Two</h3></div>',
        '<div class="card"><h3>기둥 Q</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('drops a third card whose only text is the column number 기둥 P (루프322)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>하나</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>다음</h3><p>요지</p></div>',
        '<div class="card" style="padding:24px"><h3>기둥 P</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 P');
      expect(out).toContain('하나');
    });

    it('drops a third card whose only text is the ordinal 열아홉째 (루프322)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열아홉째</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('열아홉째');
    });

    it('keeps 열아홉째 실카피 — a column number plus real body copy (루프322)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>하나</h3></div>',
        '<div class="card"><h3>다음</h3></div>',
        '<div class="card"><h3>열아홉째 실카피</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '발표')).toBe(html);
    });

    it('leaves official English 기둥 P catalog cells alone without a brief (루프322)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>One</h3></div>',
        '<div class="card"><h3>Two</h3></div>',
        '<div class="card"><h3>기둥 P</h3></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html)).toBe(html);
    });

    it('pipeline removes a 기둥 O column-number card without inventing copy (루프291)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 O</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 O');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('pipeline removes a 기둥 P column-number card without inventing copy (루프322)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 P</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 P');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
      expect(out).not.toContain('적분');
      expect(out).not.toContain('실카피');
    });

    it('pipeline removes a 기둥 Q column-number card without inventing copy (루프324)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 Q</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 Q');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
      expect(out).not.toContain('적분');
      expect(out).not.toContain('실카피');
    });

    it('pipeline removes a 기둥 U column-number card without inventing copy (루프337)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 U</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 U');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
      expect(out).not.toContain('적분');
      expect(out).not.toContain('실카피');
    });

    it('pipeline removes a 기둥 T column-number card without inventing copy (루프336)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 T</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 T');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
      expect(out).not.toContain('적분');
      expect(out).not.toContain('실카피');
    });

    it('pipeline removes a 기둥 S column-number card without inventing copy (루프327)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 S</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 S');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
      expect(out).not.toContain('적분');
      expect(out).not.toContain('실카피');
    });

    it('pipeline removes a 기둥 R column-number card without inventing copy (루프326)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 R</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 R');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
      expect(out).not.toContain('적분');
      expect(out).not.toContain('실카피');
    });

    it('pipeline removes a 스무째 column-number card without inventing copy (루프325)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>스무째</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('스무째');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
      expect(out).not.toContain('적분');
      expect(out).not.toContain('실카피');
    });

    it('pipeline removes a 기둥 하 column-number card without inventing copy (루프288)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 하</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 하');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('pipeline removes a 기둥 파 column-number card without inventing copy (루프286)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 파</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 파');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('pipeline removes a 기둥 타 column-number card without inventing copy (루프285)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 타</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 타');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('pipeline removes a 기둥 카 column-number card without inventing copy (루프278)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 카</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 카');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('pipeline heals a 기둥 차 leftover without inventing topic copy (루프274)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 차</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 차');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('pipeline heals a 기둥 자 leftover without inventing topic copy (루프272)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 자</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 자');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('pipeline heals a 기둥 아 leftover without inventing topic copy (루프266)', () => {
      const html = [
        '<section class="slide"><h1>세 가지 포인트</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>하나</h3><p>요지</p></div>',
        '<div class="card"><h3>다음</h3><p>요지</p></div>',
        '<div class="card"><h3>기둥 아</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '발표');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 아');
      expect(out).toContain('하나');
      expect(out).toContain('다음');
    });

    it('pipeline heals a 기둥 바 leftover without inventing 적분 copy (루프261)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>기둥 바</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 바');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('pipeline heals a 기둥 마 leftover without inventing 적분 copy (루프239)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>기둥 마</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 마');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('pipeline heals a 기둥 ３ leftover without inventing 적분 copy (루프219)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>기둥 ３</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 ３');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a KEY 3 leftover third card (루프217)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>KEY 3</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('KEY 3');
      expect(out).toContain('극한');
    });

    it('keeps a KEY step row where every peer is an index (루프217)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">KEY 1</div>',
        '<div class="card">KEY 2</div>',
        '<div class="card">KEY 3</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 테마 3 leftover without inventing 적분 copy (루프217)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>테마 3</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('테마 3');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a No. 3 leftover third card (루프212)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>No. 3</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/No\.\s*3/);
      expect(out).toContain('극한');
    });

    it('keeps a No. step row where every peer is an index (루프212)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">No. 1</div>',
        '<div class="card">No. 2</div>',
        '<div class="card">No. 3</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 번호 3 leftover without inventing 적분 copy (루프212)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>번호 3</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('번호 3');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('drops a PILLAR III roman leftover third card (루프209)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card" style="padding:24px"><h3>PILLAR I</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>PILLAR II</h3><p>d/dx</p></div>',
        '<div class="card" style="padding:24px"><h3>PILLAR III</h3></div>',
        '</div>',
      ].join('');
      const out = dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).toContain('PILLAR I');
      expect(out).toContain('PILLAR II');
      expect(out).not.toContain('PILLAR III');
    });

    it('keeps a roman step row where every peer is an index (루프209)', () => {
      const html = [
        '<div style="display:flex;gap:16px">',
        '<div class="card">I</div>',
        '<div class="card">II</div>',
        '<div class="card">III</div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('keeps a PILLAR III label that still has pillar copy (루프209)', () => {
      const html = [
        '<div style="display:flex;gap:28px">',
        '<div class="card"><h3>PILLAR I</h3><p>lim</p></div>',
        '<div class="card"><h3>PILLAR II</h3><p>d/dx</p></div>',
        '<div class="card"><h3>PILLAR III</h3><p>적분</p></div>',
        '</div>',
      ].join('');
      expect(dropEmptyLeftoverPeerCardsInAllocatedRows(html, '미적분')).toBe(html);
    });

    it('pipeline heals a 기둥 3 leftover without inventing 적분 copy (루프205)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>기둥 3</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 3');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('pipeline heals a 기둥 Ⅲ leftover without inventing 적분 copy (루프209)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"><h3>기둥 Ⅲ</h3></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toContain('기둥 Ⅲ');
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('pipeline shrinks a minmax(auto,1fr) leftover row after dropping the empty shell (루프221)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:minmax(auto,1fr) minmax(auto,1fr) minmax(auto,1fr);gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/minmax\(\s*auto\s*,\s*1fr\s*\)/);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('pipeline shrinks a 1.0fr leftover row after dropping the empty shell (루프220)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:1.0fr 1.0fr 1.0fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/grid-template-columns:\s*1\.0fr/);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('pipeline shrinks a 33vw 33vw 33vw leftover row after dropping the empty shell (루프215)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:33vw 33vw 33vw;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/grid-template-columns:\s*33vw/);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('pipeline shrinks a 33% 33% 33% leftover row after dropping the empty shell (루프210)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:grid;grid-template-columns:33% 33% 33%;gap:24px">',
        '<div class="card"><h3>극한</h3><p>lim</p></div>',
        '<div class="card"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card"></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).not.toMatch(/grid-template-columns:\s*33%/);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });

    it('pipeline shrinks a 3-col grid after dropping the empty shell', () => {
      const html = [
        '<section class="slide s-data"><h2>미적분의 세 기둥</h2>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '<div class="card"><h3>도함수</h3><p>기울기</p></div>',
        '<div class="card"></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(2);
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)/);
      expect(out).not.toMatch(/grid-template-columns:\s*(?:1fr 1fr 1fr|minmax\(0,1fr\) minmax\(0,1fr\) minmax\(0,1fr\))/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
    });
  });

  describe('루프199 unwrap redundant nested peer cards', () => {
    it('unwraps a balanced card-in-card leftover', () => {
      const html = [
        '<div class="card">',
        '<div class="card"><h3>극한</h3><p>정의</p></div>',
        '</div>',
      ].join('');
      const out = unwrapRedundantNestedPeerCards(html, '미적분');
      expect(out).toBe('<div class="card"><h3>극한</h3><p>정의</p></div>');
    });

    it('collapses a triple wrap to one card', () => {
      const html = [
        '<div class="card"><div class="card"><div class="card">',
        '<h3>도함수</h3>',
        '</div></div></div>',
      ].join('');
      const out = unwrapRedundantNestedPeerCards(html, '미적분');
      expect(out).toBe('<div class="card"><h3>도함수</h3></div>');
    });

    it('keeps card > card-body and a card that hosts two cards', () => {
      const body = '<div class="card"><div class="card-body"><h3>sin</h3></div></div>';
      expect(unwrapRedundantNestedPeerCards(body, '삼각함수')).toBe(body);

      const host = [
        '<div class="card">',
        '<div class="card"><h3>A</h3></div>',
        '<div class="card"><h3>B</h3></div>',
        '</div>',
      ].join('');
      expect(unwrapRedundantNestedPeerCards(host, '삼각함수')).toBe(host);
    });

    it('keeps a card that has its own title plus an inner card', () => {
      const html = [
        '<div class="card">',
        '<h3>PILLAR 01</h3>',
        '<div class="card"><p>lim</p></div>',
        '</div>',
      ].join('');
      expect(unwrapRedundantNestedPeerCards(html, '미적분')).toBe(html);
    });

    it('leaves official English catalog nested cards alone without a brief', () => {
      const html = '<div class="card"><div class="card"><h3>One</h3></div></div>';
      expect(unwrapRedundantNestedPeerCards(html)).toBe(html);
    });

    it('pipeline unwraps double-wrapped pillars without inventing copy', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:flex;gap:24px">',
        '<div class="card"><div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div></div>',
        '<div class="card"><div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div></div>',
        '<div class="card"><div class="card" style="padding:24px"><h3>적분</h3><p>넓이</p></div></div>',
        '</div></section>',
      ].join('');
      const unwrapped = unwrapRedundantNestedPeerCards(html, '미적분');
      expect((unwrapped.match(/class="card"/g) ?? []).length).toBe(3);
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out).not.toMatch(/<div class="card">\s*<div class="card"/);
      expect(out).not.toMatch(/<div class="card"><\/div>/);
      expect((out.match(/class="card"/g) ?? []).length).toBe(3);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).toContain('적분');
      expect(out).toContain('넓이');
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('루프198 uniform peer card fixed main size', () => {
    it('strips the same width from three flex cards so 191 can grow them', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:600px;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:600px;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:600px;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*600px/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).toContain('적분');
      expect((out.match(/class="card"/g) ?? []).length).toBe(3);
    });

    it('strips uniform max-width so three cards can share the row (루프201)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="max-width:560px;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="max-width:560px;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="max-width:560px;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/max-width:\s*560px/);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
    });

    it('strips uniform max-inline-size so three cards can share the row (루프290)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="max-inline-size:560px;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="max-inline-size:560px;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="max-inline-size:560px;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/max-inline-size:\s*560px/);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
    });

    it('strips uniform inline-size leftover locks (루프290)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="inline-size:30vw;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="inline-size:30vw;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="inline-size:30vw;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/inline-size:\s*30vw/);
      expect(out).toContain('극한');
    });

    it('leaves mixed max-inline-size sidebar alone (루프290)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="max-inline-size:280px;padding:16px">목차</div>',
        '<div class="card" style="max-inline-size:900px;padding:16px">본문</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('strips uniform flex:0 0 locked basis (루프201)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:0 0 36rem;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="flex:0 0 36rem;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="flex:0 0 36rem;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/flex:\s*0 0 36rem/);
      expect(out).toContain('극한');
    });

    it('leaves flex:1 1 grow shorthand alone (루프201)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:1 1 0;padding:24px">극한</div>',
        '<div class="card" style="flex:1 1 560px;padding:24px">도함수</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('strips min-width on a filled 3-col grid so tracks can shrink', () => {
      const html = [
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">',
        '<div class="card" style="min-width:580px">극한</div>',
        '<div class="card" style="min-width:580px">도함수</div>',
        '<div class="card" style="min-width:580px">적분</div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/min-width:\s*580px/);
      expect(out).toMatch(/grid-template-columns:\s*1fr 1fr 1fr/);
    });

    it('leaves a mixed sidebar plus fluid card alone', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div style="width:280px;padding:16px">side</div>',
        '<div class="card" style="padding:16px">본문</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('leaves unequal card widths alone (real sidebar split)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:280px;padding:16px">목차</div>',
        '<div class="card" style="width:900px;padding:16px">본문</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('strips 400 vs 600 max-width leftover locks so three cards can share (루프240)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="max-width:400px;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="max-width:600px;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="max-width:400px;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/max-width:\s*400px/);
      expect(out).not.toMatch(/max-width:\s*600px/);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
    });

    it('leaves 400 vs 800 widths alone because the ratio is a real split (루프240)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:400px;padding:16px">목차</div>',
        '<div class="card" style="width:800px;padding:16px">본문</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('strips 400 vs 800 max-width leftover locks on a 3-card row (루프262)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="max-width:400px;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="max-width:800px;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="max-width:400px;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/max-width:\s*400px/);
      expect(out).not.toMatch(/max-width:\s*800px/);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
    });

    it('leaves official English 400 vs 800 max-width alone without a brief (루프262)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="max-width:400px;padding:24px">One</div>',
        '<div class="card" style="max-width:800px;padding:24px">Two</div>',
        '<div class="card" style="max-width:400px;padding:24px">Three</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html)).toBe(html);
    });

    it('leaves a 3-card 280 vs 900 leftover-looking split because the ratio is a sidebar (루프262)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:280px;padding:16px">목차</div>',
        '<div class="card" style="width:900px;padding:16px">본문</div>',
        '<div class="card" style="width:280px;padding:16px">메모</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('leaves official English catalog card widths alone without a brief', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:560px;padding:24px">One</div>',
        '<div class="card" style="width:560px;padding:24px">Two</div>',
        '<div class="card" style="width:560px;padding:24px">Three</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html)).toBe(html);
    });

    it('pipeline heals 3 fixed-width pillars without inventing copy', () => {
      const html = [
        '<!doctype html><html><body>',
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:560px;padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="width:560px;padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="width:560px;padding:24px"><h3>적분</h3><p>넓이</p></div>',
        '</div></section>',
        '</body></html>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out).not.toMatch(/width:\s*560px/);
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(3);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).toContain('적분');
      expect(out).toContain('넓이');
    });

    it('strips uniform 32% column-share widths so three cards can share (루프207)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:32%;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:32%;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:32%;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*32%/);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
    });

    it('strips uniform flex:0 0 33% locked basis (루프207)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:0 0 33%;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="flex:0 0 33%;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="flex:0 0 33%;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/flex:\s*0 0 33%/);
      expect(out).toContain('극한');
    });

    it('strips uniform width:calc(33%) leftover locks (루프296)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:calc(33%);padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:calc(33%);padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:calc(33%);padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*calc\(33%\)/);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
    });

    it('strips uniform inline-size:calc(100%/3) leftover locks (루프296)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="inline-size:calc(100% / 3);padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="inline-size:calc(100% / 3);padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="inline-size:calc(100% / 3);padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/inline-size:\s*calc\(100%\s*\/\s*3\)/);
      expect(out).toContain('적분');
    });

    it('leaves calc(50%) two-card width splits alone (루프296)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:calc(50%);padding:24px"><h3>목차</h3></div>',
        '<div class="card" style="width:calc(50%);padding:24px"><h3>본문</h3></div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('rewrites uniform flex:1 1 calc(33%) leftover basis to flex:1 1 0 (루프302)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:1 1 calc(33%);padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="flex:1 1 calc(33%);padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="flex:1 1 calc(33%);padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).toMatch(/flex:1 1 0/);
      expect(out).not.toMatch(/flex:\s*1 1 calc\(33%\)/);
      expect(out).toContain('극한');
    });

    it('leaves flex:1 1 50% two-card splits alone (루프302)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:1 1 50%;padding:24px"><h3>목차</h3></div>',
        '<div class="card" style="flex:1 1 50%;padding:24px"><h3>본문</h3></div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('rewrites uniform flex:0 1 calc(33%) leftover basis to flex:1 1 0 (루프304)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:0 1 calc(33%);padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="flex:0 1 calc(33%);padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="flex:0 1 calc(33%);padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).toMatch(/flex:1 1 0/);
      expect(out).not.toMatch(/flex:\s*0 1 calc\(33%\)/);
      expect(out).toContain('적분');
    });

    it('rewrites uniform flex:calc(33%) one-value leftover basis to flex:1 1 0 (루프305)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:calc(33%);padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="flex:calc(33%);padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="flex:calc(33%);padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).toMatch(/flex:1 1 0/);
      expect(out).not.toMatch(/flex:\s*calc\(33%\)/);
      expect(out).toContain('적분');
    });

    it('rewrites uniform flex:33% one-value leftover basis to flex:1 1 0 (루프305)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:33%;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="flex:33%;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="flex:33%;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).toMatch(/flex:1 1 0/);
      expect(out).not.toMatch(/flex:\s*33%/);
    });

    it('rewrites uniform flex:2 1 calc(33%) leftover basis to flex:1 1 0 (루프308)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:2 1 calc(33%);padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="flex:2 1 calc(33%);padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="flex:2 1 calc(33%);padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).toMatch(/flex:1 1 0/);
      expect(out).not.toMatch(/flex:\s*2 1 calc\(33%\)/);
    });

    it('rewrites uniform -webkit-flex:2 1 33% leftover basis to flex:1 1 0 (루프313)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="-webkit-flex:2 1 33%;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="-webkit-flex:2 1 33%;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="-webkit-flex:2 1 33%;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).toMatch(/flex:1 1 0/);
      expect(out).not.toMatch(/-webkit-flex:\s*2 1 33%/);
    });

    it('leaves -webkit-flex:2 1 50% two-card splits alone (루프313)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="-webkit-flex:2 1 50%;padding:24px"><h3>목차</h3></div>',
        '<div class="card" style="-webkit-flex:2 1 50%;padding:24px"><h3>본문</h3></div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('leaves flex:2 1 50% two-card splits alone (루프308)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:2 1 50%;padding:24px"><h3>목차</h3></div>',
        '<div class="card" style="flex:2 1 50%;padding:24px"><h3>본문</h3></div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('leaves flex:50% two-card splits alone (루프305)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:50%;padding:24px"><h3>목차</h3></div>',
        '<div class="card" style="flex:50%;padding:24px"><h3>본문</h3></div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('leaves flex:0 1 50% two-card splits alone (루프304)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:0 1 50%;padding:24px"><h3>목차</h3></div>',
        '<div class="card" style="flex:0 1 50%;padding:24px"><h3>본문</h3></div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(html, '미적분')).toBe(html);
    });

    it('strips uniform 30vb column-share widths so three cards can share (루프251)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:30vb;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:30vb;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:30vb;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*30vb/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).toContain('적분');
    });

    it('strips uniform 30svmin column-share widths so three cards can share (루프250)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:30svmin;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:30svmin;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:30svmin;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*30svmin/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).toContain('적분');
    });

    it('strips uniform 30cqmax column-share widths so three cards can share (루프246)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:30cqmax;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:30cqmax;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:30cqmax;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*30cqmax/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).toContain('적분');
    });

    it('strips uniform 30lvw column-share widths so three cards can share (루프245)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:30lvw;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:30lvw;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:30lvw;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*30lvw/);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
      expect(out).toContain('적분');
    });

    it('strips uniform 30vmin column-share widths so three cards can share (루프238)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:30vmin;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:30vmin;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:30vmin;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*30vmin/);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
    });

    it('strips uniform flex:0 0 30vh locked basis (루프238)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="flex:0 0 30vh;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="flex:0 0 30vh;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="flex:0 0 30vh;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/flex:\s*0 0 30vh/);
      expect(out).toContain('극한');
    });

    it('strips uniform 30vw column-share widths so three cards can share (루프213)', () => {
      const html = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:30vw;padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="width:30vw;padding:24px"><h3>도함수</h3></div>',
        '<div class="card" style="width:30vw;padding:24px"><h3>적분</h3></div>',
        '</div>',
      ].join('');
      const out = relaxUniformPeerCardFixedMainSize(html, '미적분');
      expect(out).not.toMatch(/width:\s*30vw/);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
    });

    it('leaves 100vw stretch and 50vw split cards alone (루프213)', () => {
      const stretch = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:100vw;padding:16px">극한</div>',
        '<div class="card" style="width:100vw;padding:16px">도함수</div>',
        '</div>',
      ].join('');
      const split = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:50vw;padding:16px">목차</div>',
        '<div class="card" style="width:50vw;padding:16px">본문</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(stretch, '미적분')).toBe(stretch);
      expect(relaxUniformPeerCardFixedMainSize(split, '미적분')).toBe(split);
    });

    it('pipeline heals 30vw pillars so 191 can grow them (루프213)', () => {
      const html = [
        '<!doctype html><html><body>',
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:30vw;padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="width:30vw;padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="width:30vw;padding:24px"><h3>적분</h3><p>넓이</p></div>',
        '</div></section>',
        '</body></html>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out).not.toMatch(/width:\s*30vw/);
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(3);
      expect(out).toContain('극한');
      expect(out).toContain('넓이');
    });

    it('leaves 100% stretch and 50% split cards alone (루프207)', () => {
      const stretch = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:100%;padding:16px">극한</div>',
        '<div class="card" style="width:100%;padding:16px">도함수</div>',
        '</div>',
      ].join('');
      const split = [
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:50%;padding:16px">목차</div>',
        '<div class="card" style="width:50%;padding:16px">본문</div>',
        '</div>',
      ].join('');
      expect(relaxUniformPeerCardFixedMainSize(stretch, '미적분')).toBe(stretch);
      expect(relaxUniformPeerCardFixedMainSize(split, '미적분')).toBe(split);
    });

    it('pipeline heals 32% pillars so 191 can grow them (루프207)', () => {
      const html = [
        '<!doctype html><html><body>',
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="width:32%;padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="width:32%;padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="width:32%;padding:24px"><h3>적분</h3><p>넓이</p></div>',
        '</div></section>',
        '</body></html>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out).not.toMatch(/width:\s*32%/);
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(3);
      expect(out).toContain('극한');
      expect(out).toContain('넓이');
    });

    it('pipeline heals max-width pillars so 191 can grow them (루프201)', () => {
      const html = [
        '<!doctype html><html><body>',
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div style="display:flex;gap:24px">',
        '<div class="card" style="max-width:560px;padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="max-width:560px;padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '<div class="card" style="max-width:560px;padding:24px"><h3>적분</h3><p>넓이</p></div>',
        '</div></section>',
        '</body></html>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out).not.toMatch(/max-width:\s*560px/);
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(3);
      expect(out).toContain('극한');
      expect(out).toContain('적분');
      expect(out).toContain('넓이');
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

  describe('루프204 class-bound flex card row', () => {
    it('gives flex-grow to peer cards in a stylesheet flex row', () => {
      const html = [
        '<style>.cards{display:flex;gap:28px}</style>',
        '<div class="cards">',
        '<div class="card" style="padding:24px"><h3>극한</h3></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3></div>',
        '</div>',
      ].join('');
      const out = balanceClassBoundFlexCardRow(html, '미적분');
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBe(2);
      expect(out).toMatch(/class="cards"[^>]*width:\s*100%|width:\s*100%[^>]*class="cards"/);
      expect(out).toContain('극한');
    });

    it('leaves a class flex column alone', () => {
      const html = [
        '<style>.stack{display:flex;flex-direction:column;gap:12px}</style>',
        '<div class="stack">',
        '<div class="card" style="padding:16px">a</div>',
        '<div class="card" style="padding:16px">b</div>',
        '</div>',
      ].join('');
      expect(balanceClassBoundFlexCardRow(html, '미적분')).toBe(html);
    });

    it('leaves official English class flex rows alone without a brief', () => {
      const html = [
        '<style>.cards{display:flex;gap:16px}</style>',
        '<div class="cards">',
        '<div class="card" style="padding:16px">One</div>',
        '<div class="card" style="padding:16px">Two</div>',
        '</div>',
      ].join('');
      expect(balanceClassBoundFlexCardRow(html)).toBe(html);
    });

    it('balances English class flex rows when AI slide markers are present (루프252)', () => {
      const html = [
        '<style>.cards{display:flex;gap:28px}</style>',
        '<section class="slide tpl-pitch-deck"><div data-od-slide-flow="">',
        '<h1>Calculus pillars</h1>',
        '<div class="cards">',
        '<div class="card" style="padding:24px"><h3>Limit</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>Derivative</h3><p>d/dx</p></div>',
        '</div></div></section>',
        '<section class="slide"><h2>Next</h2><p>Practice problems.</p></section>',
      ].join('');
      const out = balanceClassBoundFlexCardRow(html);
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(2);
      expect(out).toContain('Limit');
      expect(out).toContain('Derivative');
    });

    it('pipeline balances a Hangul class flex row without inventing copy', () => {
      const html = [
        '<style>.cards{display:flex;gap:28px}</style>',
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div class="cards">',
        '<div class="card" style="padding:24px"><h3>극한</h3><p>lim</p></div>',
        '<div class="card" style="padding:24px"><h3>도함수</h3><p>d/dx</p></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out.match(/flex:\s*1 1 0/gi)?.length).toBeGreaterThanOrEqual(2);
      expect(out).toContain('극한');
      expect(out).toContain('도함수');
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

    it('strips orphan extra </div> that would close the slide host (루프287)', () => {
      const inner = [
        '<div class="card"><h3>SIN</h3><p>대/빗변</p></div>',
        '<div class="card"><h3>COS</h3><p>밑/빗변</p></div>',
        '</div></div>',
      ].join('');
      const out = repairUnbalancedCardDivsInFragment(inner);
      expect(out).toBe(
        '<div class="card"><h3>SIN</h3><p>대/빗변</p></div>'
        + '<div class="card"><h3>COS</h3><p>밑/빗변</p></div>',
      );
      expect((out.match(/<\/div>/g) ?? []).length).toBe(2);
    });

    it('pipeline strips extra closes after nested card soup (루프287)', () => {
      const html = [
        '<section class="slide"><h2>정의</h2>',
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr">',
        '<div class="card"><h3>SIN</h3><p>대/빗변</p></div>',
        '<div class="card"><h3>COS</h3><p>밑/빗변</p></div>',
        '<div class="card"><h3>TAN</h3><p>대/밑</p></div>',
        '</div></div></div>',
        '</section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '삼각함수');
      const body = out.replace(/^[\s\S]*<section\b[^>]*>/i, '').replace(/<\/section>[\s\S]*$/i, '');
      const opens = (body.match(/<div\b/gi) ?? []).length;
      const closes = (body.match(/<\/div>/gi) ?? []).length;
      expect(opens).toBe(closes);
      expect(out).toContain('SIN');
      expect(out).toContain('TAN');
    });

    it('keeps a title plus a balanced inner card (루프203)', () => {
      const inner = [
        '<div class="card">',
        '<h3>PILLAR 01</h3>',
        '<div class="card"><p>lim</p></div>',
        '</div>',
      ].join('');
      expect(repairUnbalancedCardDivsInFragment(inner)).toBe(inner);
    });

    it('pipeline keeps title+inner card without inventing copy (루프203)', () => {
      const html = [
        '<section class="slide"><h1>미적분의 세 기둥</h1>',
        '<div class="card" style="padding:24px">',
        '<h3>PILLAR 01</h3>',
        '<div class="card"><p>극한 정의</p></div>',
        '</div></section>',
      ].join('');
      const out = healAiGeneratedDeckMarkup(html, '미적분');
      expect(out).toContain('PILLAR 01');
      expect(out).toContain('극한 정의');
      expect(out).not.toMatch(/<div class="card"[^>]*>\s*<\/div>/);
      expect(out).toMatch(/PILLAR 01[\s\S]*<div class="card"/);
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
      expect(out).toMatch(/grid-template-columns:\s*(?:minmax\(0,1fr\) ){1}minmax\(0,1fr\)(?:\s|;|")/);
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
