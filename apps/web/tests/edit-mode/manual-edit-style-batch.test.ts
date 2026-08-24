// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { applyManualEditPatch, readManualEditStyles } from '../../src/edit-mode/source-patches';
import {
  diffManualEditStylePatch,
  isNoOpManualEditStyleFlush,
  pickManualEditSourceStylesForKeys,
} from '../../src/edit-mode/manual-edit-style-batch';

const baseSource = `<!doctype html><html><body>
  <div data-od-id="card">Card</div>
</body></html>`;

function sourceWithCardSize(width: string, height: string): string {
  const patched = applyManualEditPatch(baseSource, {
    id: 'card',
    kind: 'set-style',
    styles: { width, height },
  });
  if (!patched.ok) throw new Error('fixture setup failed');
  return patched.source;
}

describe('manual-edit-style-batch', () => {
  it('diffs pending styles against saved source', () => {
    const html = sourceWithCardSize('120px', '80px');
    expect(diffManualEditStylePatch(html, 'card', {
      width: '120px',
      height: '96px',
    })).toEqual({ height: '96px' });
  });

  it('reuses precomputed sourceStyles without re-reading the document', () => {
    const html = sourceWithCardSize('120px', '80px');
    const sourceStyles = readManualEditStyles(html, 'card');
    // Force a bogus baseSource — only sourceStyles should matter.
    expect(diffManualEditStylePatch('<html></html>', 'card', {
      width: '200px',
      height: '80px',
    }, { sourceStyles })).toEqual({ width: '200px' });
  });

  it('treats unchanged pending styles as a no-op flush', () => {
    const html = sourceWithCardSize('120px', '80px');
    expect(isNoOpManualEditStyleFlush(html, 'card', {
      width: '120px',
      height: '80px',
    })).toBe(true);
  });

  it('keeps resize commits as one effective style patch', () => {
    const html = sourceWithCardSize('120px', '80px');
    const patch = diffManualEditStylePatch(html, 'card', {
      width: '160px',
      height: '96px',
    });
    expect(patch).toEqual({ width: '160px', height: '96px' });
    expect(isNoOpManualEditStyleFlush(html, 'card', patch)).toBe(false);
  });

  it('treats rgb and hex colors as equivalent when diffing pending styles', () => {
    const html = sourceWithCardSize('120px', '80px');
    const colored = applyManualEditPatch(html, {
      id: 'card',
      kind: 'set-style',
      styles: { color: 'rgb(239, 68, 68)' },
    });
    if (!colored.ok) throw new Error('fixture setup failed');
    expect(isNoOpManualEditStyleFlush(colored.source, 'card', {
      color: '#ef4444',
    })).toBe(true);
    expect(diffManualEditStylePatch(colored.source, 'card', {
      color: '#ef4444',
    })).toEqual({});
  });

  it('picks source-backed values for no-op draft reconciliation keys', () => {
    const html = sourceWithCardSize('120px', '80px');
    expect(pickManualEditSourceStylesForKeys(html, 'card', ['width', 'height'])).toEqual({
      width: '120px',
      height: '80px',
    });
  });
});
