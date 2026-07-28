// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  resolveDeckSlideIndex,
  withResolvedDeckSlideIndex,
} from '../../src/runtime/deck-slide-index';

describe('deck-slide-index', () => {
  it('prefers payload slideIndex over host fallbacks', () => {
    expect(resolveDeckSlideIndex({
      payloadSlideIndex: 2,
      slideStateActive: 5,
      cachedSlideActive: 7,
    })).toBe(2);
  });

  it('falls back to live slide state then cached slide state', () => {
    expect(resolveDeckSlideIndex({
      slideStateActive: 3,
      cachedSlideActive: 1,
    })).toBe(3);
    expect(resolveDeckSlideIndex({
      cachedSlideActive: 4,
    })).toBe(4);
  });

  it('ignores invalid slide indexes', () => {
    expect(resolveDeckSlideIndex({
      payloadSlideIndex: -1,
      slideStateActive: 1.5,
      cachedSlideActive: Number.NaN,
    })).toBeUndefined();
  });

  it('enriches targets without clobbering an existing slideIndex', () => {
    expect(withResolvedDeckSlideIndex(
      { elementId: 'title', slideIndex: 1 },
      { slideStateActive: 4 },
    )).toEqual({ elementId: 'title', slideIndex: 1 });
    expect(withResolvedDeckSlideIndex(
      { elementId: 'title' },
      { cachedSlideActive: 2 },
    )).toEqual({ elementId: 'title', slideIndex: 2 });
  });
});
