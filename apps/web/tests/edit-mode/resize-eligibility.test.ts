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

  it('allows container targets and blocks inline text editing', () => {
    const target = baseTarget({ kind: 'container' });
    expect(canResizeTarget(target)).toBe(true);
    expect(canResizeTarget(target, { inlineTextEditing: true })).toBe(false);
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
