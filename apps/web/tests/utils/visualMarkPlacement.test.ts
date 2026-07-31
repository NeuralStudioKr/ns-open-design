import { describe, expect, it } from 'vitest';

import { scaleBoundsToSlideCanvas, TEAMVER_SLIDE_CANVAS } from '../../src/utils/visualMarkPlacement';

describe('scaleBoundsToSlideCanvas', () => {
  it('maps preview-frame pixels to the 1920×1080 slide canvas', () => {
    const scaled = scaleBoundsToSlideCanvas(
      { x: 100, y: 50, width: 200, height: 100 },
      { width: 960, height: 540 },
      TEAMVER_SLIDE_CANVAS,
    );
    expect(scaled).toEqual({ x: 200, y: 100, width: 400, height: 200 });
  });
});
