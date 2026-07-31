import { describe, expect, it } from 'vitest';
import { hostDeltaToContentDelta, contentRectToHostRect } from '../../src/edit-mode/preview-coords';

describe('preview-coords', () => {
  it('maps content rect to host rect using preview scale', () => {
    expect(contentRectToHostRect({ x: 10, y: 20, width: 100, height: 50 }, 0.75)).toEqual({
      x: 7.5,
      y: 15,
      width: 75,
      height: 37.5,
    });
  });

  it('converts host pointer delta to content delta', () => {
    expect(hostDeltaToContentDelta(15, 7.5, 0.75)).toEqual({ dx: 20, dy: 10 });
  });
});
