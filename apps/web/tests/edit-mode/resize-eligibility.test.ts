import { describe, expect, it } from 'vitest';
import { canResizeTarget, isDeckSlideRoot, aspectLockForTarget } from '../../src/edit-mode/resize-eligibility';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

describe('resize-eligibility', () => {
  it('rejects slide root targets', () => {
    const target = baseTarget({
      tagName: 'section',
      className: 'slide',
      attributes: { 'data-slide-index': '0' },
    });
    expect(isDeckSlideRoot(target)).toBe(true);
    expect(canResizeTarget(target)).toBe(false);
  });

  it('treats empty data-slide as a slide root and honors editMode', () => {
    expect(isDeckSlideRoot(baseTarget({
      tagName: 'section',
      attributes: { 'data-slide': '' },
    }))).toBe(true);
    expect(canResizeTarget(baseTarget(), { editMode: false })).toBe(false);
  });

  it('allows container targets and blocks inline text editing', () => {
    const target = baseTarget({ kind: 'container' });
    expect(canResizeTarget(target)).toBe(true);
    expect(canResizeTarget(target, { inlineTextEditing: true })).toBe(false);
  });

  it('does not treat slide-chrome as a slide root', () => {
    const chrome = baseTarget({
      tagName: 'div',
      className: 'slide-chrome',
    });
    expect(isDeckSlideRoot(chrome)).toBe(false);
    expect(canResizeTarget(chrome)).toBe(true);
    expect(isDeckSlideRoot(baseTarget({ tagName: 'section', className: 'slide-5' }))).toBe(true);
    expect(isDeckSlideRoot(baseTarget({ tagName: 'section', className: 's1' }))).toBe(true);
    expect(isDeckSlideRoot(baseTarget({
      tagName: 'section',
      className: 'page',
      attributes: { 'data-screen-label': '01 Cover' },
    }))).toBe(true);
  });

  it('locks aspect for images unless shift is held', () => {
    expect(aspectLockForTarget('image', false)).toBe(true);
    expect(aspectLockForTarget('image', true)).toBe(false);
    expect(aspectLockForTarget('container', true)).toBe(true);
  });
});

function baseTarget(overrides: Partial<ManualEditTarget> = {}): ManualEditTarget {
  return {
    id: 'hero',
    kind: 'container',
    label: 'Hero',
    tagName: 'div',
    className: '',
    text: '',
    rect: { x: 0, y: 0, width: 120, height: 80 },
    fields: {},
    attributes: { 'data-od-id': 'hero' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: true,
    outerHtml: '<div data-od-id="hero"></div>',
    ...overrides,
  };
}
