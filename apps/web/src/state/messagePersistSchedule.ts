import type { SaveMessageOptions } from './projects';
import { isTeamverEmbedMode } from '../teamver/designApiBase';
import { readTeamverViteEnv } from '../teamver/teamverViteEnv';

/** Local OD dev fallback when `VITE_MESSAGE_PERSIST_THROTTLE_MS` is unset. */
export const MESSAGE_PERSIST_THROTTLE_MS_STANDALONE = 2500;

/** Local embed dev fallback when env unset (hosted builds bake from deploy .env). */
export const MESSAGE_PERSIST_THROTTLE_MS_EMBED = 5000;

/** @deprecated Prefer `resolveMessagePersistThrottleMs()`. */
export const MESSAGE_PERSIST_THROTTLE_MS = MESSAGE_PERSIST_THROTTLE_MS_STANDALONE;

const MIN_MESSAGE_PERSIST_THROTTLE_MS = 1000;

/**
 * SSOT: `VITE_MESSAGE_PERSIST_THROTTLE_MS` (deploy `.env` → Docker build arg → static export).
 * Hosted default: 5000 (see deploy/Dockerfile + .env.staging.example).
 * Local dev only: embed 5000 / standalone 2500 when env is absent.
 */
export function resolveMessagePersistThrottleMs(): number {
  const raw = readTeamverViteEnv('VITE_MESSAGE_PERSIST_THROTTLE_MS');
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed >= MIN_MESSAGE_PERSIST_THROTTLE_MS) {
      return parsed;
    }
  }
  return isTeamverEmbedMode()
    ? MESSAGE_PERSIST_THROTTLE_MS_EMBED
    : MESSAGE_PERSIST_THROTTLE_MS_STANDALONE;
}

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
  throttleMs: number = resolveMessagePersistThrottleMs(),
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
