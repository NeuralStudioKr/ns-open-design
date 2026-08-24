import { describe, expect, it } from 'vitest';

import {
  fittedSlideContentRect,
  normalizePagePositionToSlideCanvas,
  scaleBoundsToSlideCanvas,
  TEAMVER_SLIDE_CANVAS,
} from '../../src/utils/visualMarkPlacement';

describe('scaleBoundsToSlideCanvas', () => {
  it('maps preview-frame pixels to the 1920×1080 slide canvas', () => {
    const scaled = scaleBoundsToSlideCanvas(
      { x: 100, y: 50, width: 200, height: 100 },
      { width: 960, height: 540 },
      TEAMVER_SLIDE_CANVAS,
    );
    expect(scaled).toEqual({ x: 200, y: 100, width: 400, height: 200 });
  });

  it('subtracts letterbox inset before mapping to canvas pixels', () => {
    // 800×540 frame → contain-fit 800×450 content with 45px top/bottom bars.
    const content = fittedSlideContentRect({ width: 800, height: 540 });
    expect(content.y).toBeCloseTo(45, 5);
    expect(content.height).toBeCloseTo(450, 5);
    const scaled = scaleBoundsToSlideCanvas(
      { x: 0, y: 45, width: 800, height: 450 },
      { width: 800, height: 540 },
    );
    expect(scaled).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});

describe('normalizePagePositionToSlideCanvas', () => {
  it('scales 0–1 fractions to slide canvas pixels', () => {
    expect(normalizePagePositionToSlideCanvas({ x: 0.1, y: 0.2, width: 0.3, height: 0.15 }))
      .toEqual({ x: 192, y: 216, width: 576, height: 162 });
  });

  it('keeps pixel coordinates when values are already large', () => {
    expect(normalizePagePositionToSlideCanvas({ x: 100, y: 200, width: 400, height: 80 }))
      .toEqual({ x: 100, y: 200, width: 400, height: 80 });
  });
});
