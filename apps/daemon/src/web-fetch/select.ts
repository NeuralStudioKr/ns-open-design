// Env-driven backend selection for the daemon web_fetch pipeline. See
// docs-teamver/48-1-구현설계-webfetch-adapter.md §3.5 and §4.
//
// Contract:
//   - resolveWebFetchBackend(env) is total: any invalid combination
//     downgrades to native with a console.warn instead of throwing so
//     the daemon boot cannot be blocked by a mis-scoped WEB_FETCH_* env.
//   - validateReaderEndpoint is intentionally sync + DNS-free (only
//     scheme / private-literal checks) so it is safe to call during
//     boot without stalling on network I/O.
//   - The reader endpoint is treated as trusted infrastructure: SSRF
//     against the ORIGINAL user URL happens in core.ts, and this file
//     ensures the endpoint itself is https + not a private-literal.

import type { WebFetchBackend } from './backend.js';
import { nativeWebFetchBackend } from './native-backend.js';
import { makeReaderWebFetchBackend } from './reader-backend.js';

export interface WebFetchBackendPair {
  primary: WebFetchBackend;
  fallback: WebFetchBackend | null;
}

/** Sync-only, DNS-free private-literal check. Enough for a boot gate;
 *  per-request SSRF still runs in core via assertExternalAssetUrl on the
 *  original URL. */
function isPrivateHostLiteral(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return true;
  if (
    h === 'localhost'
    || h === '::1'
    || h.startsWith('127.')
    || h.startsWith('10.')
    || h.startsWith('192.168.')
    || h.startsWith('169.254.')
    || h.startsWith('fe80:')
    || h.startsWith('fc00:')
    || h.startsWith('fd00:')
  ) {
    return true;
  }
  // 172.16.0.0 – 172.31.255.255
  const m = /^172\.(\d+)\./.exec(h);
  if (m) {
    const octet = Number(m[1]);
    if (Number.isFinite(octet) && octet >= 16 && octet <= 31) return true;
  }
  return false;
}

export type ValidateReaderResult =
  | { ok: true; base: string }
  | { ok: false; error: string };

export function validateReaderEndpoint(rawUrl: string | undefined): ValidateReaderResult {
  const s = (rawUrl ?? '').trim();
  if (!s) return { ok: false, error: 'WEB_FETCH_READER_URL is empty' };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return { ok: false, error: `WEB_FETCH_READER_URL is not a valid URL (${s})` };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, error: `WEB_FETCH_READER_URL must be https (got ${url.protocol})` };
  }
  if (isPrivateHostLiteral(url.hostname)) {
    return { ok: false, error: `WEB_FETCH_READER_URL points at a private host (${url.hostname})` };
  }
  const base = s.endsWith('/') ? s : `${s}/`;
  return { ok: true, base };
}

function parseTimeoutMs(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 60_000) return fallback;
  return Math.floor(n);
}

function parseBoolFlag(value: string | undefined): boolean {
  if (!value) return false;
  const s = value.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

/**
 * Resolve the {primary, fallback} backend pair from env. Never throws —
 * unrecognised or invalid combinations degrade to native + console.warn
 * so a misconfigured deploy still boots and reveals its state via logs.
 */
export function resolveWebFetchBackend(env: NodeJS.ProcessEnv): WebFetchBackendPair {
  const desired = (env.WEB_FETCH_BACKEND ?? 'native').trim().toLowerCase();

  if (desired === '' || desired === 'native') {
    return { primary: nativeWebFetchBackend, fallback: null };
  }

  if (desired !== 'reader') {
    console.warn(
      `web_fetch: unknown WEB_FETCH_BACKEND=\"${desired}\"; falling back to native`,
    );
    return { primary: nativeWebFetchBackend, fallback: null };
  }

  const endpoint = validateReaderEndpoint(env.WEB_FETCH_READER_URL);
  if (!endpoint.ok) {
    console.warn(
      `web_fetch: reader backend requested but ${endpoint.error}; falling back to native`,
    );
    return { primary: nativeWebFetchBackend, fallback: null };
  }

  const apiKey = env.WEB_FETCH_READER_API_KEY?.trim();
  const reader = makeReaderWebFetchBackend({
    base: endpoint.base,
    ...(apiKey ? { apiKey } : {}),
    timeoutMs: parseTimeoutMs(env.WEB_FETCH_READER_TIMEOUT_MS, 12_000),
  });

  const fallback = parseBoolFlag(env.WEB_FETCH_READER_FALLBACK_TO_NATIVE)
    ? nativeWebFetchBackend
    : null;

  return { primary: reader, fallback };
}
