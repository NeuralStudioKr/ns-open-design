import { describe, expect, it } from 'vitest';
import {
  buildResizeSessionStart,
  computeResize,
  parseManualEditStylePx,
  resizeStylesForCommit,
} from '../../src/edit-mode/resize-math';
import { hostDeltaToContentDelta } from '../../src/edit-mode/preview-coords';

describe('resize-math', () => {
  it('grows width and height for SE without aspect lock', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 100, height: 50 },
      { width: '100px', height: '50px' },
      'se',
      'container',
      false,
    );
    const result = computeResize({ ...start, dx: 20, dy: 10 });
    expect(result).toMatchObject({ widthPx: 120, heightPx: 60 });
  });

  it('changes width only for east handle', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 100, height: 50 },
      { width: '100px', height: '50px' },
      'e',
      'container',
      false,
    );
    const result = computeResize({ ...start, dx: 20, dy: 0 });
    expect(result).toMatchObject({ widthPx: 120, heightPx: 50 });
    expect(resizeStylesForCommit(result, 'e')).toEqual({ width: '120px' });
  });

  it('keeps aspect ratio when locked on corner drag', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 200, height: 100 },
      { width: '200px', height: '100px' },
      'se',
      'image',
      false,
    );
    const result = computeResize({ ...start, dx: 40, dy: 5 });
    expect(result.widthPx / result.heightPx).toBeCloseTo(2, 5);
  });

  it('clamps to minimum size', () => {
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 30, height: 30 },
      { width: '30px', height: '30px' },
      'nw',
      'container',
      false,
    );
    const result = computeResize({ ...start, dx: 20, dy: 20 });
    expect(result.widthPx).toBeGreaterThanOrEqual(24);
    expect(result.heightPx).toBeGreaterThanOrEqual(24);
  });

  it('parses px styles and falls back to rect size', () => {
    expect(parseManualEditStylePx('320px', 100)).toBe(320);
    expect(parseManualEditStylePx('auto', 88)).toBe(88);
  });

  it('scales host delta into content delta before resize math', () => {
    const contentDelta = hostDeltaToContentDelta(15, 7.5, 0.75);
    const start = buildResizeSessionStart(
      { x: 0, y: 0, width: 100, height: 50 },
      { width: '100px', height: '50px' },
      'se',
      'container',
      false,
    );
    const result = computeResize({ ...start, ...contentDelta });
    expect(result).toMatchObject({ widthPx: 120, heightPx: 60 });
  });
});
