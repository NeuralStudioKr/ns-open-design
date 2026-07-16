import { describe, expect, it } from 'vitest';

import {
  buildRedirectLoopBlockedDoc,
  buildSrcdoc,
  nextRedirectGuardState,
  PREVIEW_REDIRECT_GUARD_MAX_HOPS,
  PREVIEW_REDIRECT_GUARD_WINDOW_MS,
  PREVIEW_REDIRECT_LOOP_MESSAGE,
} from '../../src/runtime/srcdoc';

describe('srcdoc redirect-loop guard', () => {
  it('injects the guard into preview documents', () => {
    const doc = buildSrcdoc('<!doctype html><html><head></head><body>x</body></html>');
    expect(doc).toContain('data-od-preview-redirect-guard');
    expect(doc).toContain(PREVIEW_REDIRECT_LOOP_MESSAGE);
  });

  it('does not inject the preview-only guard into export documents', () => {
    const doc = buildSrcdoc('<!doctype html><html><head></head><body>x</body></html>', {
      exportDocument: true,
    });
    expect(doc).not.toContain('data-od-preview-redirect-guard');
  });

  it('builds a static blocked document without script or meta refresh', () => {
    const doc = buildRedirectLoopBlockedDoc();
    expect(doc).toContain('redirect loop detected');
    expect(doc).not.toMatch(/<script\b/i);
    expect(doc).not.toMatch(/http-equiv\s*=\s*["']?\s*refresh/i);
  });

  it('counts redirect hops inside a window and resets after the window elapses', () => {
    let current = nextRedirectGuardState(null, 1000, { maxHops: 2, windowMs: 1000 });
    expect(current.state).toEqual({ hops: 1, windowStart: 1000 });
    expect(current.tripped).toBe(false);

    current = nextRedirectGuardState(current.state, 1200, { maxHops: 2, windowMs: 1000 });
    expect(current.state.hops).toBe(2);
    expect(current.tripped).toBe(false);

    current = nextRedirectGuardState(current.state, 1300, { maxHops: 2, windowMs: 1000 });
    expect(current.state.hops).toBe(3);
    expect(current.tripped).toBe(true);

    current = nextRedirectGuardState(current.state, 3000, { maxHops: 2, windowMs: 1000 });
    expect(current.state).toEqual({ hops: 1, windowStart: 3000 });
    expect(current.tripped).toBe(false);
  });

  it('uses the production hop constants for the default counter', () => {
    let current = nextRedirectGuardState(null, 0);
    for (let i = 1; i < PREVIEW_REDIRECT_GUARD_MAX_HOPS; i += 1) {
      current = nextRedirectGuardState(current.state, i);
      expect(current.tripped).toBe(false);
    }
    current = nextRedirectGuardState(
      current.state,
      PREVIEW_REDIRECT_GUARD_WINDOW_MS + PREVIEW_REDIRECT_GUARD_MAX_HOPS + 1,
    );
    expect(current.state.hops).toBe(1);
    expect(current.tripped).toBe(false);
  });
});
