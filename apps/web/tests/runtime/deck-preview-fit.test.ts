import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { nudgeDeckPreviewFit, scheduleDeckPreviewFitNudges } from '../../src/runtime/deckPreviewFit';

describe('deckPreviewFit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('posts od:deck-nudge-fit to the iframe content window', () => {
    const postMessage = vi.fn();
    nudgeDeckPreviewFit({ contentWindow: { postMessage } as unknown as Window });
    expect(postMessage).toHaveBeenCalledWith({ type: 'od:deck-nudge-fit' }, '*');
  });

  it('schedules repeated nudges through layout settles', () => {
    const postMessage = vi.fn();
    const cancel = scheduleDeckPreviewFitNudges(
      { contentWindow: { postMessage } as unknown as Window },
      [0, 100, 200],
    );
    vi.advanceTimersByTime(0);
    expect(postMessage).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(postMessage).toHaveBeenCalledTimes(2);
    cancel();
    vi.advanceTimersByTime(200);
    expect(postMessage).toHaveBeenCalledTimes(2);
  });
});
