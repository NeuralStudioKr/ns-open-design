import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  nudgeDeckPreviewFit,
  postDeckHostViewportToIframe,
  resolveDeckPreviewIframeFromSource,
  scheduleDeckPreviewFitNudges,
  schedulePostDeckHostViewportUntilSized,
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

  it('invokes onAfterNudge after od:deck-nudge-fit (487)', () => {
    const postMessage = vi.fn();
    const onAfterNudge = vi.fn();
    const target = {
      contentWindow: { postMessage } as unknown as Window,
      getBoundingClientRect: () => ({ width: 640, height: 480 } as DOMRect),
    };
    nudgeDeckPreviewFit(target, 1, { onAfterNudge });
    expect(postMessage).toHaveBeenCalledWith({ type: 'od:deck-nudge-fit' }, '*');
    expect(onAfterNudge).toHaveBeenCalledTimes(1);
  });

  it('skips host viewport post when the iframe has no measurable box', () => {
    const postMessage = vi.fn();
    expect(
      postDeckHostViewportToIframe({
        contentWindow: { postMessage } as unknown as Window,
        getBoundingClientRect: () => ({ width: 0, height: 0 } as DOMRect),
      }),
    ).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('retries host viewport until the iframe reports a real box', () => {
    const postMessage = vi.fn();
    let width = 0;
    let height = 0;
    const target = {
      contentWindow: { postMessage } as unknown as Window,
      getBoundingClientRect: () => ({ width, height } as DOMRect),
    };
    const cancel = schedulePostDeckHostViewportUntilSized(target, 1, [0, 100, 200]);
    vi.advanceTimersByTime(0);
    expect(postMessage).not.toHaveBeenCalled();
    width = 960;
    height = 540;
    vi.advanceTimersByTime(100);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'od:deck-host-viewport', width: 960, height: 540, scale: 1, layoutFit: false },
      '*',
    );
    vi.advanceTimersByTime(200);
    // Keep posting across the window so a remount after the first success still
    // receives host viewport (black letterbox until refresh).
    expect(postMessage).toHaveBeenCalledTimes(2);
    cancel();
  });

  it('re-posts to a remounted iframe after an early successful post', () => {
    const postMessageA = vi.fn();
    const postMessageB = vi.fn();
    const frameA = {
      contentWindow: { postMessage: postMessageA } as unknown as Window,
      getBoundingClientRect: () => ({ width: 640, height: 480 } as DOMRect),
    };
    const frameB = {
      contentWindow: { postMessage: postMessageB } as unknown as Window,
      getBoundingClientRect: () => ({ width: 800, height: 600 } as DOMRect),
    };
    let current: typeof frameA | typeof frameB = frameA;
    const cancel = schedulePostDeckHostViewportUntilSized(() => current, 1, [0, 50, 100]);
    vi.advanceTimersByTime(0);
    expect(postMessageA).toHaveBeenCalledTimes(1);
    current = frameB;
    vi.advanceTimersByTime(50);
    expect(postMessageB).toHaveBeenCalledTimes(1);
    expect(postMessageB).toHaveBeenCalledWith(
      { type: 'od:deck-host-viewport', width: 800, height: 600, scale: 1, layoutFit: false },
      '*',
    );
    cancel();
  });

  it('resolves a live getter at each scheduled nudge (survives remount)', () => {
    const postMessageA = vi.fn();
    const postMessageB = vi.fn();
    const frameA = {
      contentWindow: { postMessage: postMessageA } as unknown as Window,
      getBoundingClientRect: () => ({ width: 640, height: 480 } as DOMRect),
    };
    const frameB = {
      contentWindow: { postMessage: postMessageB } as unknown as Window,
      getBoundingClientRect: () => ({ width: 800, height: 600 } as DOMRect),
    };
    let current: typeof frameA | typeof frameB = frameA;
    const cancel = scheduleDeckPreviewFitNudges(() => current, 1, [0, 100]);
    vi.advanceTimersByTime(0);
    expect(postMessageA).toHaveBeenCalled();
    expect(postMessageB).not.toHaveBeenCalled();
    current = frameB;
    vi.advanceTimersByTime(100);
    expect(postMessageB).toHaveBeenCalled();
    cancel();
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

  it('resolves the requesting preview iframe from postMessage source', () => {
    const winA = {} as Window;
    const winB = {} as Window;
    const frameA = { contentWindow: winA } as HTMLIFrameElement;
    const frameB = { contentWindow: winB } as HTMLIFrameElement;
    expect(resolveDeckPreviewIframeFromSource(winB, [frameA, frameB])).toBe(frameB);
    expect(resolveDeckPreviewIframeFromSource(winA, [null, frameA])).toBe(frameA);
    expect(resolveDeckPreviewIframeFromSource(winA, [frameB])).toBeNull();
  });
});
