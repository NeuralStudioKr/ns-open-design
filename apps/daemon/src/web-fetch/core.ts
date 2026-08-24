// Core dispatcher for the daemon `web_fetch` pipeline. Owns the
// invariants that must survive backend swaps (see 48-1 §2):
//   I4  SSRF (assertExternalAssetUrl) against the ORIGINAL URL, once
//   I5  100KB post-fetch cap, 12s timeout, safe redirect (native:
//       redirect:'manual', max 3 hops, per-hop SSRF — 48-1 §3.3.1), UA
//   I6  never throws — always {ok, ...} or {ok:false, error}
//
// Backends only ever see a SSRF-cleared, http(s) URL plus an
// AbortSignal this file owns.
//
// The public API (`fetchUrlContent`) is byte-for-byte compatible with
// the pre-adapter implementation exercised by
// `apps/daemon/tests/byok-url-tools.test.ts`. Env-driven selection
// (WEB_FETCH_BACKEND, reader endpoint, optional fallback) lives in
// select.ts; defaults keep the native backend as the only path.

import { assertExternalAssetUrl } from '../connectionTest.js';
import type {
  WebFetchBackend,
  WebFetchBackendResult,
  WebFetchToolResult,
} from './backend.js';
import { looksLikeWebFetchStylesheetText } from '@open-design/contracts';
import { isWebFetchPageUrl } from './page-url.js';
import { resolveWebFetchBackend } from './select.js';
import type { WebFetchBackendPair } from './select.js';

export const MAX_TEXT_BYTES = 100 * 1024; // 100 KB post-fetch cap
export const FETCH_TIMEOUT_MS = 12_000; // 12s — one tool-loop round must not hang
export const USER_AGENT =
  'Mozilla/5.0 (compatible; TeamverDesignBot/1.0; +https://teamver.com)';

/** Kit `<link>` / Google Fonts css2 is not page text. Returning ok:false
 *  mapped POST /api/tools/web-fetch to 400 and made MiniMax retry. */
export const WEB_FETCH_ASSET_SKIP_TEXT =
  'Not an HTML page — this is a font, stylesheet, or CDN asset from the visual kit. '
  + 'Keep it as <link rel="stylesheet"> in the deck. '
  + 'Do not call web_fetch again on fonts, CSS, images, scripts, or kit CDN URLs.';

function skipWebFetchAssetResult(): WebFetchToolResult {
  return {
    ok: true,
    title: '(kit asset — not a page)',
    text: WEB_FETCH_ASSET_SKIP_TEXT,
  };
}

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

/** Lazy-memoised backend pair. Reading env once and caching means the
 *  daemon does not re-parse configuration for every fetch. Tests use
 *  `_resetWebFetchBackendCacheForTests` to swap env between cases. */
let cachedBackends: WebFetchBackendPair | null = null;

function getBackends(): WebFetchBackendPair {
  if (!cachedBackends) {
    cachedBackends = resolveWebFetchBackend(process.env);
  }
  return cachedBackends;
}

/** Test-only escape hatch — production code should never call this. */
export function _resetWebFetchBackendCacheForTests(): void {
  cachedBackends = null;
}

/** Best-effort URL → host for logs. Body / title / path are never
 *  logged; only the network coordinate we already know from SSRF. */
function safeUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid';
  }
}

/** Classify an error message into a coarse bucket so ops dashboards
 *  can group signals without regex-diving the free-form error. */
function classifyErrorCode(error: string | undefined): string {
  if (!error) return 'unknown';
  if (error.startsWith('http ')) {
    const status = Number(error.slice(5, 8));
    if (Number.isFinite(status)) {
      if (status >= 500) return 'http_5xx';
      if (status >= 400) return 'http_4xx';
    }
    return 'http_other';
  }
  if (error.includes('timed out') || error === 'aborted') return 'timeout';
  if (error.startsWith('read failed')) return 'read_failed';
  // Redirect policy failures — surface separately so ops can tell an
  // "attacker.com→169.254.169.254" pattern from a plain network fault.
  if (error.startsWith('too many redirects')) return 'redirect_max';
  if (error.startsWith('blocked redirect')) return 'redirect_blocked';
  if (error.startsWith('redirect without Location') || error.startsWith('invalid redirect Location')) {
    return 'redirect_malformed';
  }
  if (error.startsWith('fetch failed') || error.startsWith('reader fetch failed')) return 'network';
  if (error.startsWith('backend threw')) return 'backend_bug';
  return 'unknown';
}

interface WebFetchCallLog {
  backend: string;
  urlHost: string;
  durationMs: number;
  /** Non-zero redirect hops the native backend followed before landing
   *  on the terminal response (or the intermediate hop that blocked).
   *  Emitted as `hops=N` when > 0 to keep the healthy default line
   *  minimal. */
  hops?: number;
  readerFallback?: boolean;
}

/** Emit the per-call log line the 48-1 §5 log schema promises. Body,
 *  title, path, and query string are all deliberately excluded. */
function logWebFetchCall(ctx: WebFetchCallLog, result: WebFetchToolResult): void {
  const base
    = `web_fetch.backend=${ctx.backend}`
    + ` url_host=${ctx.urlHost}`
    + ` duration_ms=${ctx.durationMs}`;
  const hops = ctx.hops && ctx.hops > 0 ? ` hops=${ctx.hops}` : '';
  const fallback = ctx.readerFallback ? ' reader_fallback=1' : '';
  if (result.ok) {
    const bytes = result.text?.length ?? 0;
    const truncated = result.truncated ? ' truncated=1' : '';
    console.log(`${base}${hops} status=ok text_bytes=${bytes}${truncated}${fallback}`);
  } else {
    const code = classifyErrorCode(result.error);
    // Backend error strings are already short (no body/title). Safe to
    // include verbatim — helpful when the ops bucket is 'unknown'.
    console.log(`${base}${hops} status=error error_code=${code} error=${result.error ?? 'unknown'}${fallback}`);
  }
}

function isHtmlHint(isHtml: boolean | undefined, rawText: string): boolean {
  return isHtml === true || (isHtml === undefined && /^\s*<(!doctype|html)/i.test(rawText));
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
  // Input-validation failures are short-circuited without a log line —
  // they never touch the network and would otherwise flood the log with
  // malformed-tool-call noise. Callers still get the same error shape.
  if (typeof rawUrl !== 'string') return { ok: false, error: 'url is required' };
  const url = rawUrl.trim();
  if (!url) return { ok: false, error: 'url is required' };

  // Only http(s) — block file://, ftp://, data:, javascript:, etc.
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'only http(s) URLs are supported' };
  }

  if (!isWebFetchPageUrl(url)) {
    console.log(
      `web_fetch.backend=- url_host=${safeUrlHost(url)} duration_ms=0 status=skipped_asset`,
    );
    return skipWebFetchAssetResult();
  }

  const startedAt = Date.now();
  const urlHost = safeUrlHost(url);

  const check = await assertExternalAssetUrl(url);
  if (!check.ok) {
    const ssrfResult: WebFetchToolResult = { ok: false, error: check.error };
    // ssrf sits before backend selection — log with backend=- so ops
    // dashboards can still count blocked outbound attempts by host.
    console.log(
      `web_fetch.backend=- url_host=${urlHost} duration_ms=${Date.now() - startedAt} status=error error_code=ssrf error=${check.error ?? 'ssrf'}`,
    );
    return ssrfResult;
  }

  const { primary, fallback } = getBackends();

  const first = await runBackend(primary, url, requestInit);
  if (first.result.ok || !fallback) {
    logWebFetchCall(
      {
        backend: primary.name,
        urlHost,
        durationMs: Date.now() - startedAt,
        ...(first.hops ? { hops: first.hops } : {}),
      },
      first.result,
    );
    return first.result;
  }

  // Fallback path: only reachable when WEB_FETCH_BACKEND=reader AND
  // WEB_FETCH_READER_FALLBACK_TO_NATIVE=1 AND the reader call errored.
  // A single retry only — no chaining, no exponential backoff.
  console.warn(
    `web_fetch.reader_fallback primary=${primary.name} url_host=${urlHost} error=${first.result.error ?? 'unknown'}`,
  );
  const second = await runBackend(fallback, url, requestInit);
  logWebFetchCall(
    {
      backend: fallback.name,
      urlHost,
      durationMs: Date.now() - startedAt,
      readerFallback: true,
      ...(second.hops ? { hops: second.hops } : {}),
    },
    second.result,
  );
  return second.result;
}

interface RunBackendOutcome {
  result: WebFetchToolResult;
  /** Copied from `WebFetchBackendResult.hops` so the log line can
   *  include it without adding a public field. Undefined when the
   *  backend did not report one (e.g. reader backend). */
  hops?: number;
}

async function runBackend(
  backend: WebFetchBackend,
  url: string,
  requestInit?: Pick<RequestInit, 'dispatcher' | 'signal'>,
): Promise<RunBackendOutcome> {
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

  const hopsOut = typeof raw.hops === 'number' && raw.hops > 0 ? { hops: raw.hops } : {};

  if (!raw.ok) {
    if (didTimeout) {
      return {
        result: { ok: false, error: `request timed out after ${FETCH_TIMEOUT_MS}ms` },
        ...hopsOut,
      };
    }
    if (/stylesheet, font, or static asset/i.test(raw.error ?? '')) {
      return {
        result: skipWebFetchAssetResult(),
        ...hopsOut,
      };
    }
    return {
      result: { ok: false, error: raw.error ?? 'unknown backend error' },
      ...hopsOut,
    };
  }

  const rawText = raw.text ?? '';
  if (!isHtmlHint(raw.isHtml, rawText) && looksLikeWebFetchStylesheetText(rawText)) {
    return {
      result: skipWebFetchAssetResult(),
      ...hopsOut,
    };
  }
  const isHtml = isHtmlHint(raw.isHtml, rawText);
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
    result: {
      ok: true,
      text: cappedText,
      ...(title ? { title } : {}),
      ...(truncated ? { truncated: true } : {}),
    },
    ...hopsOut,
  };
}
