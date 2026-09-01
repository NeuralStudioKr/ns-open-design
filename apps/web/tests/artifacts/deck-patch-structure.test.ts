import { describe, expect, it } from 'vitest';
import {
  buildBlankDeckSlideShell,
  deleteDeckSlideAt,
  duplicateDeckSlideAt,
  extractTopLevelSlideSections,
  insertBlankDeckSlideAfter,
  moveDeckSlideByDelta,
  restampDeckSlideIndexes,
} from '../../src/artifacts/deck-patch';

function deck(...labels: string[]): string {
  const slides = labels
    .map(
      (label, i) =>
        `<section class="slide" data-slide-index="${i}" data-screen-label="${label}"><h1>${label}</h1></section>`,
    )
    .join('\n');
  return `<!doctype html><html><body>\n${slides}\n</body></html>`;
}

describe('0901-N01 deck structure mutations', () => {
  it('deletes the active slide and restamps indexes', () => {
    const html = deck('A', 'B', 'C');
    const out = deleteDeckSlideAt(html, 1);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.slideCount).toBe(2);
    expect(out.activeIndex).toBe(1);
    expect(out.html).not.toContain('data-screen-label="B"');
    expect(out.html).toContain('data-screen-label="A"');
    expect(out.html).toContain('data-screen-label="C"');
    const slides = extractTopLevelSlideSections(out.html);
    expect(slides).toHaveLength(2);
    expect(slides[0]!.outerHtml).toContain('data-slide-index="0"');
    expect(slides[1]!.outerHtml).toContain('data-slide-index="1"');
  });

  it('refuses to delete the last remaining slide', () => {
    const out = deleteDeckSlideAt(deck('Only'), 0);
    expect(out.ok).toBe(false);
  });

  it('moves a slide earlier and later', () => {
    const html = deck('A', 'B', 'C');
    const later = moveDeckSlideByDelta(html, 0, 1);
    expect(later.ok).toBe(true);
    if (!later.ok) return;
    expect(later.activeIndex).toBe(1);
    const labels = extractTopLevelSlideSections(later.html).map((s) =>
      /data-screen-label="([^"]+)"/.exec(s.outerHtml)?.[1],
    );
    expect(labels).toEqual(['B', 'A', 'C']);

    const earlier = moveDeckSlideByDelta(later.html, 1, -1);
    expect(earlier.ok).toBe(true);
    if (!earlier.ok) return;
    expect(earlier.activeIndex).toBe(0);
    const restored = extractTopLevelSlideSections(earlier.html).map((s) =>
      /data-screen-label="([^"]+)"/.exec(s.outerHtml)?.[1],
    );
    expect(restored).toEqual(['A', 'B', 'C']);
  });

  it('refuses move past the edges', () => {
    const html = deck('A', 'B');
    expect(moveDeckSlideByDelta(html, 0, -1).ok).toBe(false);
    expect(moveDeckSlideByDelta(html, 1, 1).ok).toBe(false);
  });

  it('restampDeckSlideIndexes rewrites existing indexes', () => {
    const messy =
      '<!doctype html><html><body>'
      + '<section class="slide" data-slide-index="9"><h1>A</h1></section>'
      + '<section class="slide" data-slide-index="2"><h1>B</h1></section>'
      + '</body></html>';
    const out = restampDeckSlideIndexes(messy);
    expect(out).toContain('data-slide-index="0"');
    expect(out).toContain('data-slide-index="1"');
    expect(out).not.toContain('data-slide-index="9"');
  });

  it('inserts a blank slide after the active index', () => {
    const html = deck('A', 'B');
    const out = insertBlankDeckSlideAfter(html, 0);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.slideCount).toBe(3);
    expect(out.activeIndex).toBe(1);
    const slides = extractTopLevelSlideSections(out.html);
    expect(slides).toHaveLength(3);
    expect(slides[0]!.outerHtml).toContain('data-screen-label="A"');
    expect(slides[1]!.outerHtml).toContain('slide-inner');
    expect(slides[2]!.outerHtml).toContain('data-screen-label="B"');
    expect(slides[0]!.outerHtml).toContain('data-slide-index="0"');
    expect(slides[2]!.outerHtml).toContain('data-slide-index="2"');
  });

  it('duplicates a slide after the source and strips identity attrs on the copy', () => {
    const html =
      '<!doctype html><html><body>'
      + '<section class="slide slide-cover" data-slide-index="0" data-od-id="s0" data-screen-label="Cover"><h1>Cover</h1></section>'
      + '<section class="slide" data-slide-index="1" data-screen-label="Body"><h1>Body</h1></section>'
      + '</body></html>';
    const out = duplicateDeckSlideAt(html, 0);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.slideCount).toBe(3);
    expect(out.activeIndex).toBe(1);
    const slides = extractTopLevelSlideSections(out.html);
    expect(slides).toHaveLength(3);
    expect(slides[0]!.outerHtml).toContain('data-od-id="s0"');
    expect(slides[1]!.outerHtml).toContain('slide-cover');
    expect(slides[1]!.outerHtml).not.toContain('data-od-id=');
    expect(slides[1]!.outerHtml).not.toContain('data-screen-label=');
    expect(slides[2]!.outerHtml).toContain('data-screen-label="Body"');
  });

  it('buildBlankDeckSlideShell inherits slide class from reference', () => {
    const shell = buildBlankDeckSlideShell('<section class="slide slide-dark theme-a">');
    expect(shell).toContain('class="slide slide-dark theme-a"');
    expect(shell).toContain('<h2></h2>');
  });
});
