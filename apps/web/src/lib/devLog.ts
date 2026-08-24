/**
 * Browser console helper that is silent in production builds.
 * Staging/production Next builds use NODE_ENV=production, so observation
 * and debug payloads must not reach end-user DevTools via these helpers.
 * Local `next dev` and Vitest (`NODE_ENV=test`) still emit for debugging.
 *
 * NODE_ENV=production wins over import.meta.env.DEV so unit tests can
 * assert silence by stubbing the env without fighting Vite's DEV flag.
 */
function isClientDevLogEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    return false;
  }
  const metaEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
  if (metaEnv?.DEV === true) return true;
  if (typeof process === 'undefined') return false;
  return process.env.NODE_ENV !== 'production';
}

export const devLog = {
  debug(...args: unknown[]): void {
    if (!isClientDevLogEnabled()) return;
    console.debug(...args);
  },
  info(...args: unknown[]): void {
    if (!isClientDevLogEnabled()) return;
    console.info(...args);
  },
  warn(...args: unknown[]): void {
    if (!isClientDevLogEnabled()) return;
    console.warn(...args);
  },
};
