import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MESSAGE_PERSIST_THROTTLE_MS_EMBED,
  MESSAGE_PERSIST_THROTTLE_MS_STANDALONE,
  createMessagePersistScheduler,
  resolveMessagePersistThrottleMs,
} from '../../src/state/messagePersistSchedule';

vi.mock('../../src/teamver/designApiBase', () => ({
  isTeamverEmbedMode: vi.fn(() => false),
}));

vi.mock('../../src/teamver/teamverViteEnv', () => ({
  readTeamverViteEnv: vi.fn(() => undefined),
}));

import { isTeamverEmbedMode } from '../../src/teamver/designApiBase';
import { readTeamverViteEnv } from '../../src/teamver/teamverViteEnv';

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
});

describe('resolveMessagePersistThrottleMs', () => {
  beforeEach(() => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(false);
    vi.mocked(readTeamverViteEnv).mockReturnValue(undefined);
  });

  it('uses standalone default when not embed', () => {
    expect(resolveMessagePersistThrottleMs()).toBe(MESSAGE_PERSIST_THROTTLE_MS_STANDALONE);
  });

  it('uses embed default when embed mode', () => {
    vi.mocked(isTeamverEmbedMode).mockReturnValue(true);
    expect(resolveMessagePersistThrottleMs()).toBe(MESSAGE_PERSIST_THROTTLE_MS_EMBED);
  });

  it('honors VITE_MESSAGE_PERSIST_THROTTLE_MS when valid', () => {
    vi.mocked(readTeamverViteEnv).mockReturnValue('8000');
    expect(resolveMessagePersistThrottleMs()).toBe(8000);
  });

  it('ignores invalid env override', () => {
    vi.mocked(readTeamverViteEnv).mockReturnValue('500');
    expect(resolveMessagePersistThrottleMs()).toBe(MESSAGE_PERSIST_THROTTLE_MS_STANDALONE);
  });

  it('embed default is at least 5s for server load pacing', () => {
    expect(MESSAGE_PERSIST_THROTTLE_MS_EMBED).toBeGreaterThanOrEqual(5000);
  });
});
