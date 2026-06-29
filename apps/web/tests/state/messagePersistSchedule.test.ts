import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MESSAGE_PERSIST_THROTTLE_MS,
  createMessagePersistScheduler,
} from '../../src/state/messagePersistSchedule';

describe('createMessagePersistScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throttles persistSoon to at most one call per window', () => {
    const persist = vi.fn();
    const { persistSoon } = createMessagePersistScheduler(persist, 1000);

    persistSoon();
    persistSoon();
    persistSoon();
    expect(persist).not.toHaveBeenCalled();

    vi.advanceTimersByTime(999);
    expect(persist).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('persistNow bypasses the throttle immediately', () => {
    const persist = vi.fn();
    const { persistSoon, persistNow } = createMessagePersistScheduler(persist, 1000);

    persistSoon();
    persistNow({ keepalive: true });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ keepalive: true });

    persistSoon();
    vi.advanceTimersByTime(1000);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('merges pending options onto the trailing persist', () => {
    const persist = vi.fn();
    const { persistSoon } = createMessagePersistScheduler(persist, 500);

    persistSoon({ keepalive: true });
    persistSoon({ telemetryFinalized: true });
    vi.advanceTimersByTime(500);
    expect(persist).toHaveBeenCalledWith({
      keepalive: true,
      telemetryFinalized: true,
    });
  });

  it('exports a default throttle interval for streaming persistence', () => {
    expect(MESSAGE_PERSIST_THROTTLE_MS).toBeGreaterThanOrEqual(2000);
  });
});
