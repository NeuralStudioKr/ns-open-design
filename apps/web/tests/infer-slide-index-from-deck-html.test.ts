// @vitest-environment jsdom
//
// Behavioral tests for `inferSlideIndexFromDeckHtml`. This helper recovers
// the deck's 0-based `slideIndex` from the current deck HTML when the
// comment payload arrived without one (single-slide deck, freeform pod
// selection that only carried a selector, or a click that pre-dates the
// deck bridge). Without a resolved slideIndex the comment-edit prompt
// silently drops back to full-deck rewrite, so the recovery path here is
// on the critical path for `<artifact type="deck-patch">` engagement.

import { describe, expect, it } from 'vitest';
import { inferSlideIndexFromDeckHtml } from '../src/components/ProjectView';
import type { ChatCommentAttachment } from '../src/types';

function makeAttachment(overrides: Partial<ChatCommentAttachment> = {}): ChatCommentAttachment {
  return {
    id: 'c1',
    order: 1,
    filePath: 'deck.html',
    elementId: 'path-1-0',
    selector: '[data-od-id="path-1-0"]',
    label: 'h1',
    comment: 'test',
    currentText: '',
    pagePosition: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '',
    selectionKind: 'element',
    ...overrides,
  };
}

describe('inferSlideIndexFromDeckHtml', () => {
  it('returns null when the deck has no top-level slide sections', () => {
    const html = '<!doctype html><html><body><h1>Standalone page</h1></body></html>';
    expect(inferSlideIndexFromDeckHtml(html, makeAttachment())).toBeNull();
  });

  it('returns 0 for single-slide decks even when the attachment has no strong hint', () => {
    // Single-slide deck: slideIndex 0 is the only valid target. Without
    // this shortcut, comment edits on single-slide decks silently fell
    // back to full-deck rewrite because the model never received a
    // slideIndex on the `<attached-preview-comments>` block.
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><h1 data-od-id="hero">Only slide</h1></section>',
      '</body></html>',
    ].join('');
    // Empty-ish attachment (no elementId match, no text, no selector nth-of-type).
    expect(inferSlideIndexFromDeckHtml(html, makeAttachment({
      elementId: 'pin-abc',
      selector: '',
      htmlHint: '',
      currentText: '',
    }))).toBe(0);
  });

  it('extracts slideIndex from a DOM-selector elementId', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><p>One</p></section>',
      '<section class="slide"><p>Two</p></section>',
      '<section class="slide"><p>Three</p></section>',
      '</body></html>',
    ].join('');
    const attachment = makeAttachment({
      elementId: 'dom:body > section:nth-of-type(2) > p:nth-of-type(1)',
      selector: 'body > section:nth-of-type(2) > p:nth-of-type(1)',
    });
    expect(inferSlideIndexFromDeckHtml(html, attachment)).toBe(1);
  });

  it('uses .slide selector nth-of-type when the elementId is annotated', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><p>One</p></section>',
      '<section class="slide"><p>Two</p></section>',
      '</body></html>',
    ].join('');
    const attachment = makeAttachment({
      elementId: 'hero',
      selector: 'section.slide:nth-of-type(2) [data-od-id="hero"]',
    });
    expect(inferSlideIndexFromDeckHtml(html, attachment)).toBe(1);
  });

  it('falls back to elementId as a text needle when no other signal narrows', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><h1 data-od-id="hero-a">First</h1></section>',
      '<section class="slide"><h1 data-od-id="hero-b">Second</h1></section>',
      '</body></html>',
    ].join('');
    const attachment = makeAttachment({
      elementId: 'hero-b',
      selector: '[data-od-id="hero-b"]',
    });
    expect(inferSlideIndexFromDeckHtml(html, attachment)).toBe(1);
  });

  it('returns null when the text hint appears in multiple slides (ambiguous)', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide"><p>같은 문구</p></section>',
      '<section class="slide"><p>같은 문구</p></section>',
      '</body></html>',
    ].join('');
    const attachment = makeAttachment({
      elementId: 'unknown-id',
      selector: '',
      currentText: '같은 문구',
    });
    expect(inferSlideIndexFromDeckHtml(html, attachment)).toBeNull();
  });
});
