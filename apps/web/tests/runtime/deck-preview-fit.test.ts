import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  nudgeDeckPreviewFit,
  postDeckHostViewportToIframe,
  scheduleDeckPreviewFitNudges,
} from '../../src/runtime/deckPreviewFit';

describe('deckPreviewFit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts host viewport size then od:deck-nudge-fit', () => {
    const postMessage = vi.fn();
    const target = {
      contentWindow: { postMessage } as unknown as Window,
      getBoundingClientRect: () => ({ width: 640, height: 480 } as DOMRect),
    };
    nudgeDeckPreviewFit(target);
    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      { type: 'od:deck-host-viewport', width: 640, height: 480, scale: 1, layoutFit: false },
      '*',
    );
    expect(postMessage).toHaveBeenNthCalledWith(2, { type: 'od:deck-nudge-fit' }, '*');
  });

  it('skips host viewport post when the iframe has no measurable box', () => {
    const postMessage = vi.fn();
    postDeckHostViewportToIframe({
      contentWindow: { postMessage } as unknown as Window,
      getBoundingClientRect: () => ({ width: 0, height: 0 } as DOMRect),
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('schedules repeated nudges through layout settles', () => {
    const postMessage = vi.fn();
    const target = {
      contentWindow: { postMessage } as unknown as Window,
      getBoundingClientRect: () => ({ width: 800, height: 600 } as DOMRect),
    };
    const cancel = scheduleDeckPreviewFitNudges(target, 1, [0, 100, 200]);
    vi.advanceTimersByTime(0);
    expect(postMessage).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(100);
    expect(postMessage).toHaveBeenCalledTimes(4);
    cancel();
    vi.advanceTimersByTime(200);
    expect(postMessage).toHaveBeenCalledTimes(4);
  });

  it('forwards layoutFit for auto-fit modal scalers', () => {
    const postMessage = vi.fn();
    const target = {
      contentWindow: { postMessage } as unknown as Window,
      getBoundingClientRect: () => ({ width: 175, height: 312 } as DOMRect),
    };
    postDeckHostViewportToIframe(target, 0.45, { layoutFit: true });
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od:deck-host-viewport', width: 175, height: 312, scale: 0.45, layoutFit: true },
      '*',
    );
  });

  it('uses iframe layout box for letterboxed compact decks so host zoom does not reflow', () => {
    const postMessage = vi.fn();
    const target = {
      contentWindow: { postMessage } as unknown as Window,
      clientWidth: 960,
      clientHeight: 540,
      getBoundingClientRect: () => ({ width: 1200, height: 675 } as DOMRect),
    };
    postDeckHostViewportToIframe(target, 1, { useLayoutBox: true });
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1, layoutFit: false },
      '*',
    );
  });
});
