import { describe, expect, it } from 'vitest';
import {
  MANUAL_EDIT_GEOMETRY_STYLE_PROP_KEYS,
  manualEditTargetsIdentityFingerprint,
} from '../../src/edit-mode/manual-edit-targets-identity';
import { emptyManualEditStyles, type ManualEditTarget } from '../../src/edit-mode/types';

function target(over: Partial<ManualEditTarget> = {}): ManualEditTarget {
  return {
    id: 'card',
    kind: 'container',
    label: 'Card',
    tagName: 'div',
    className: 'card',
    text: 'Hello',
    rect: { x: 10, y: 20, width: 100, height: 50 },
    fields: { text: 'Hello', href: '', src: '', alt: '' },
    attributes: { 'data-od-id': 'card' },
    styles: emptyManualEditStyles(),
    isLayoutContainer: true,
    outerHtml: '<div data-od-id="card">Hello</div>',
    ...over,
  };
}

describe('manualEditTargetsIdentityFingerprint', () => {
  it('ignores box-geometry style churn while catching paint/text identity', () => {
    const base = target({
      styles: { ...emptyManualEditStyles(), color: '#111', left: '10px', width: '100px' },
    });
    const geometryOnly = target({
      styles: { ...emptyManualEditStyles(), color: '#111', left: '40px', width: '160px' },
      rect: { x: 40, y: 20, width: 160, height: 50 },
    });
    const paintChanged = target({
      styles: { ...emptyManualEditStyles(), color: '#f00', left: '10px', width: '100px' },
    });
    expect(manualEditTargetsIdentityFingerprint([base]))
      .toBe(manualEditTargetsIdentityFingerprint([geometryOnly]));
    expect(manualEditTargetsIdentityFingerprint([base]))
      .not.toBe(manualEditTargetsIdentityFingerprint([paintChanged]));
    expect(MANUAL_EDIT_GEOMETRY_STYLE_PROP_KEYS.has('left')).toBe(true);
    expect(MANUAL_EDIT_GEOMETRY_STYLE_PROP_KEYS.has('color')).toBe(false);
  });

  it('changes when selected-set membership or text identity changes', () => {
    const a = target({ id: 'a', text: 'A', fields: { text: 'A' } });
    const b = target({ id: 'b', text: 'B', fields: { text: 'B' } });
    const aEdited = target({ id: 'a', text: 'A2', fields: { text: 'A2' } });
    expect(manualEditTargetsIdentityFingerprint([a, b]))
      .not.toBe(manualEditTargetsIdentityFingerprint([a]));
    expect(manualEditTargetsIdentityFingerprint([a]))
      .not.toBe(manualEditTargetsIdentityFingerprint([aEdited]));
  });

  it('ignores empty vs tip outerHtml length (bridge catalogs send "") (474)', () => {
    const withMarkup = target({ outerHtml: '<div data-od-id="card">Hello</div>' });
    const blankCatalog = target({ outerHtml: '' });
    expect(manualEditTargetsIdentityFingerprint([withMarkup]))
      .toBe(manualEditTargetsIdentityFingerprint([blankCatalog]));
  });
});
