// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isPreviewSnapshotMostlyBlank } from '../../src/utils/annotationSnapshotQuality';

const WHITE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let restoreCanvasMocks: (() => void) | null = null;

beforeEach(() => {
  const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(255),
      width: w,
      height: h,
    })),
    stroke: vi.fn(),
  }) as unknown as CanvasRenderingContext2D) as unknown as HTMLCanvasElement['getContext']);
  restoreCanvasMocks = () => getContextSpy.mockRestore();
});

afterEach(() => {
  restoreCanvasMocks?.();
  restoreCanvasMocks = null;
});

describe('isPreviewSnapshotMostlyBlank', () => {
  it('detects near-uniform white captures', async () => {
    class ImmediateImage {
      onload: ((ev?: Event) => void) | null = null;
      onerror: ((ev?: Event) => void) | null = null;
      width = 1;
      height = 1;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }
    const imageSpy = vi.spyOn(globalThis, 'Image' as any).mockImplementation(function ImageMock() {
      return new ImmediateImage();
    } as any);

    await expect(
      isPreviewSnapshotMostlyBlank({ dataUrl: WHITE_PNG_DATA_URL, w: 320, h: 200 }),
    ).resolves.toBe(true);
    imageSpy.mockRestore();
  });

  it('accepts captures with real slide content', async () => {
    class ImmediateImage {
      onload: ((ev?: Event) => void) | null = null;
      onerror: ((ev?: Event) => void) | null = null;
      width = 4;
      height = 4;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.(new Event('load')));
      }
    }
    const imageSpy = vi.spyOn(globalThis, 'Image' as any).mockImplementation(function ImageMock() {
      return new ImmediateImage();
    } as any);
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => {
      const pixels = new Uint8ClampedArray(4 * 4 * 4);
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = i % 8 === 0 ? 30 : 255;
        pixels[i + 1] = i % 8 === 0 ? 80 : 255;
        pixels[i + 2] = i % 8 === 0 ? 140 : 255;
        pixels[i + 3] = 255;
      }
      return {
        beginPath: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: '',
        getImageData: vi.fn(() => ({
          data: pixels,
          width: 4,
          height: 4,
        })),
        stroke: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
    }) as unknown as HTMLCanvasElement['getContext']);

    await expect(
      isPreviewSnapshotMostlyBlank({ dataUrl: WHITE_PNG_DATA_URL, w: 320, h: 200 }),
    ).resolves.toBe(false);
    imageSpy.mockRestore();
    getContextSpy.mockRestore();
  });
});
