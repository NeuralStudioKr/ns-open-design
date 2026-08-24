import { describe, expect, it } from 'vitest';

import { collapseAdjacentDuplicateDeckSiblings } from '../src/html/collapse-adjacent-duplicate-siblings.js';
import { healDeckHtmlForStandaloneExport } from '../src/html/deckPdfExport.js';

const MINIMAX_ECHO_SLIDE = `
<section class="slide" style="width:1920px;height:1080px">
  <h2 style="margin:0">시장 기회</h2>
  <h2 style="margin:0">시장 기회</h2>
  <p>국내 SaaS 전환이 가속화되고 있습니다.</p>
  <p>국내 SaaS 전환이 가속화되고 있습니다.</p>
  <div class="row">
    <span class="badge">B2B</span>
    <span class="badge">B2B</span>
    <span class="badge">Growth</span>
  </div>
  <div class="grid">
    <div class="card"><h3>동일 카드</h3></div>
    <div class="card"><h3>동일 카드</h3></div>
  </div>
</section>
`.trim();

describe('collapseAdjacentDuplicateDeckSiblings', () => {
  it('collapses MiniMax adjacent h2 / p / badge twins and keeps unique siblings', () => {
    const out = collapseAdjacentDuplicateDeckSiblings(MINIMAX_ECHO_SLIDE);
    expect(out.match(/<h2\b/g)).toHaveLength(1);
    expect(out.match(/<p>/g)).toHaveLength(1);
    expect(out.match(/class="badge"/g)).toHaveLength(2);
    expect(out).toContain('시장 기회');
    expect(out).toContain('국내 SaaS 전환이 가속화되고 있습니다.');
    expect(out).toContain('B2B');
    expect(out).toContain('Growth');
  });

  it('does not merge non-adjacent repeated headings', () => {
    const html = [
      '<section class="slide">',
      '<h2>Agenda</h2>',
      '<p>Keep this lead.</p>',
      '<h2>Agenda</h2>',
      '</section>',
    ].join('');
    expect(collapseAdjacentDuplicateDeckSiblings(html)).toBe(html);
    expect(html.match(/<h2>/g)).toHaveLength(2);
  });

  it('does not merge adjacent cards that happen to share the same title', () => {
    const html = [
      '<div class="grid">',
      '<div class="card"><h3>동일 카드</h3></div>',
      '<div class="card"><h3>동일 카드</h3></div>',
      '</div>',
    ].join('');
    const out = collapseAdjacentDuplicateDeckSiblings(html);
    expect(out.match(/class="card"/g)).toHaveLength(2);
    expect(out.match(/<h3>/g)).toHaveLength(2);
  });

  it('keeps decorative punctuation dots and empty spans', () => {
    const html = '<div><span>•</span><span>•</span><span></span><span></span></div>';
    expect(collapseAdjacentDuplicateDeckSiblings(html)).toBe(html);
  });

  it('collapses a triple echo down to one copy', () => {
    const html = '<h2>Title</h2><h2>Title</h2><h2>Title</h2>';
    expect(collapseAdjacentDuplicateDeckSiblings(html)).toBe('<h2>Title</h2>');
  });

  it('collapses nested badge twins inside a heading that was also echoed', () => {
    const html = [
      '<h2><span class="kicker">NEW</span><span class="kicker">NEW</span> Launch</h2>',
      '<h2><span class="kicker">NEW</span><span class="kicker">NEW</span> Launch</h2>',
    ].join('');
    const out = collapseAdjacentDuplicateDeckSiblings(html);
    expect(out.match(/<h2\b/g)).toHaveLength(1);
    expect(out.match(/class="kicker"/g)).toHaveLength(1);
  });

  it('is a no-op (same string) when there are no adjacent twins', () => {
    const html = '<section class="slide"><h1>Cover</h1><p>Lead.</p></section>';
    expect(collapseAdjacentDuplicateDeckSiblings(html)).toBe(html);
  });

  it('leaves style blocks that mention fake sibling tags untouched', () => {
    const html = '<style>h2{} /* <h2>x</h2><h2>x</h2> */</style><h2>Live</h2>';
    expect(collapseAdjacentDuplicateDeckSiblings(html)).toBe(html);
  });

  it('heals echoed copy on the standalone export path', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide" style="width:1920px;height:1080px">',
      '<h2>시장 기회</h2><h2>시장 기회</h2>',
      '<p>본문</p><p>본문</p>',
      '</section></body></html>',
    ].join('');
    const exported = healDeckHtmlForStandaloneExport(html);
    expect(exported.match(/<h2>/g)).toHaveLength(1);
    expect(exported.match(/<p>/g)).toHaveLength(1);
  });
});
