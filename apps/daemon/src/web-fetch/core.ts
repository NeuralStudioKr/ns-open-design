// Core dispatcher for the daemon `web_fetch` pipeline. Owns the
// invariants that must survive backend swaps (see 48-1 §2):
//   I4  SSRF (assertExternalAssetUrl) against the ORIGINAL URL, once
//   I5  100KB post-fetch cap, 12s timeout, redirect: 'error', UA
//   I6  never throws — always {ok, ...} or {ok:false, error}
//
// Backends only ever see a SSRF-cleared, http(s) URL plus an
// AbortSignal this file owns.
//
// Phase C is a pure refactor: the only backend registered is native
// and the public API (`fetchUrlContent`) is byte-for-byte compatible
// with the pre-refactor implementation exercised by
// `apps/daemon/tests/byok-url-tools.test.ts`.

import { assertExternalAssetUrl } from '../connectionTest.js';
import type {
  WebFetchBackend,
  WebFetchBackendResult,
  WebFetchToolResult,
} from './backend.js';
import { nativeWebFetchBackend } from './native-backend.js';

export const MAX_TEXT_BYTES = 100 * 1024; // 100 KB post-fetch cap
export const FETCH_TIMEOUT_MS = 12_000; // 12s — one tool-loop round must not hang
export const USER_AGENT =
  'Mozilla/5.0 (compatible; TeamverDesignBot/1.0; +https://teamver.com)';

interface StrippedHtml {
  text: string;
  title?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// Dependency-free HTML → text. Not a full parser, but plenty for an
// LLM: a 100 KB page collapses to ~30-50 KB of readable text. We
// deliberately avoid cheerio/jsdom to keep the daemon bundle and
// maintenance surface small.
function htmlToText(html: string): StrippedHtml {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch?.[1]
    ? decodeEntities(titleMatch[1].replace(/\s+/g, ' ').trim())
    : undefined;

  const stripped = html
    // Block elements whose inner text is meaningless / dangerous.
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, ' ')
    // HTML comments.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Block-closing tags → newline (preserve structure).
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|li|ul|ol|h[1-6]|tr|td|th|article|section|header|footer|nav|main)>/gi,
      '\n',
    )
    // Block-opening tags → space (don't fuse adjacent text).
    .replace(/<(p|div|li|h[1-6]|tr|td|th)\b[^>]*>/gi, ' ')
    // Everything else.
    .replace(/<[^>]+>/g, ' ');

  const text = decodeEntities(stripped)
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter((l) => l.length > 0)
    .join('\n');

  return { text, ...(title ? { title } : {}) };
}

/** Phase C: always native. Phase D wires env-driven selection + an
 *  optional 1x fallback to native (see 48-1 §3.5). The resolver stays
 *  inline here so the Phase C diff is a pure refactor — a dedicated
 *  select.ts arrives with the reader backend. */
function resolveWebFetchBackend(): {
  primary: WebFetchBackend;
  fallback: WebFetchBackend | null;
} {
  return { primary: nativeWebFetchBackend, fallback: null };
}

/**
 * Fetch a public http(s) URL and return its content as plain text.
 * SSRF-guarded, size-capped, time-bounded. Never throws — all
 * failures come back as `{ ok: false, error }`.
 *
 * This function is the daemon's `web_fetch` entry point. It is called
 * both from POST /api/tools/web-fetch (pre-fetch injection into
 * <web-fetch-context>) and from the BYOK tool loop's `executeWebFetch`.
 */
export async function fetchUrlContent(
  rawUrl: unknown,
  requestInit?: Pick<RequestInit, 'dispatcher' | 'signal'>,
): Promise<WebFetchToolResult> {
  if (typeof rawUrl !== 'string') return { ok: false, error: 'url is required' };
  const url = rawUrl.trim();
  if (!url) return { ok: false, error: 'url is required' };

  // Only http(s) — block file://, ftp://, data:, javascript:, etc.
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'only http(s) URLs are supported' };
  }

  const check = await assertExternalAssetUrl(url);
  if (!check.ok) return { ok: false, error: check.error };

  const { primary, fallback } = resolveWebFetchBackend();

  const first = await runBackend(primary, url, requestInit);
  if (first.ok || !fallback) return first;

  // Phase C: fallback is always null so this line is unreachable.
  // Phase D wires reader → native retry here.
  return runBackend(fallback, url, requestInit);
}

async function runBackend(
  backend: WebFetchBackend,
  url: string,
  requestInit?: Pick<RequestInit, 'dispatcher' | 'signal'>,
): Promise<WebFetchToolResult> {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  let raw: WebFetchBackendResult;
  try {
    raw = await backend.fetchOnce({
      url,
      signal: controller.signal,
      ...(requestInit ? { requestInit } : {}),
    });
  } catch (err) {
    // Backends must not throw. Any throw is a bug — normalise so we
    // still honour the "never throws" contract at the public surface.
    raw = {
      ok: false,
      error: `backend threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (!raw.ok) {
    if (didTimeout) {
      return { ok: false, error: `request timed out after ${FETCH_TIMEOUT_MS}ms` };
    }
    return { ok: false, error: raw.error ?? 'unknown backend error' };
  }

  const rawText = raw.text ?? '';
  const isHtml =
    raw.isHtml === true ||
    (raw.isHtml === undefined && /^\s*<(!doctype|html)/i.test(rawText));
  const stripped: StrippedHtml = isHtml
    ? htmlToText(rawText)
    : { text: rawText.trim() };
  const title = raw.title ?? stripped.title;

  // Core-side fail-safe: even if a backend forgot its own cap we never
  // return more than MAX_TEXT_BYTES of characters. The streaming cap
  // in the native backend already handles the byte-accurate case; the
  // character-length check here catches malformed reader responses.
  const cappedText =
    stripped.text.length > MAX_TEXT_BYTES
      ? stripped.text.slice(0, MAX_TEXT_BYTES)
      : stripped.text;
  const truncated =
    Boolean(raw.truncated) || cappedText.length !== stripped.text.length;

  return {
    ok: true,
    text: cappedText,
    ...(title ? { title } : {}),
    ...(truncated ? { truncated: true } : {}),
  };
}
