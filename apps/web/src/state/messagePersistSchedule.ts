import type { SaveMessageOptions } from './projects';

/** Max rate for in-flight assistant message PUTs during streaming (~0.4/s). */
export const MESSAGE_PERSIST_THROTTLE_MS = 2500;

/**
 * Throttle mid-stream message persistence. UI state still updates every frame;
 * only the daemon PUT is paced so a long SSE/BYOK stream does not hammer
 * `PUT …/messages/:id` every few hundred ms.
 *
 * - `persistSoon` — at most one PUT per throttle window (trailing edge).
 * - `persistNow` — bypass throttle (terminal status, pagehide keepalive).
 */
export function createMessagePersistScheduler(
  persist: (options?: SaveMessageOptions) => void,
  throttleMs: number = MESSAGE_PERSIST_THROTTLE_MS,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPersistAt: number | null = null;
  let pendingOptions: SaveMessageOptions | undefined;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    pendingOptions = undefined;
  };

  const persistNow = (options?: SaveMessageOptions) => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastPersistAt = Date.now();
    pendingOptions = undefined;
    persist(options);
  };

  const persistSoon = (options?: SaveMessageOptions) => {
    if (options) {
      pendingOptions = pendingOptions ? { ...pendingOptions, ...options } : options;
    }
    const now = Date.now();
    const elapsed = lastPersistAt === null ? 0 : now - lastPersistAt;
    if (lastPersistAt !== null && elapsed >= throttleMs) {
      persistNow(pendingOptions);
      return;
    }
    if (timer !== null) return;
    const delay = lastPersistAt === null ? throttleMs : throttleMs - elapsed;
    timer = setTimeout(() => {
      timer = null;
      persistNow(pendingOptions);
    }, delay);
  };

  return { persistSoon, persistNow, cancel };
}
