// Reader-SaaS backend for the daemon web_fetch pipeline. Sends outbound
// requests to a configured reader endpoint (Jina-style prefix, e.g.
// `https://r.jina.ai/<original-url>`) that returns already-stripped
// markdown, so the core can skip htmlToText for these responses.
//
// The core still owns SSRF against the ORIGINAL URL, the AbortSignal for
// the 12s ceiling, and the character-length fail-safe. This backend
// layers a reader-specific timeout on top so an unresponsive vendor
// cannot pin a tool-loop round for the full core timeout window.
//
// See docs-teamver/48-1-구현설계-webfetch-adapter.md §3.4.

import { MAX_TEXT_BYTES } from './core.js';
import type { WebFetchBackend, WebFetchBackendCtx, WebFetchBackendResult } from './backend.js';

export interface ReaderBackendConfig {
  /** Absolute https base; must end with `/` (select.ts guarantees this). */
  base: string;
  /** Optional bearer token; when present the backend sends `Authorization: Bearer <key>`. */
  apiKey?: string;
  /** Backend-specific timeout. Composes with the core-owned AbortSignal —
   *  whichever fires first wins. */
  timeoutMs: number;
}

async function readerFetch(
  config: ReaderBackendConfig,
  ctx: WebFetchBackendCtx,
): Promise<WebFetchBackendResult> {
  const outbound = config.base + ctx.url;

  // Compose the core-owned signal with a backend-owned timer so either
  // one can trip the fetch. Using AbortSignal.any would be cleaner but
  // is Node 20.3+ only; keep an explicit wiring for portability.
  const controller = new AbortController();
  let didReaderTimeout = false;
  const onCoreAbort = (): void => controller.abort();
  if (ctx.signal.aborted) controller.abort();
  else ctx.signal.addEventListener('abort', onCoreAbort, { once: true });
  const timer = setTimeout(() => {
    didReaderTimeout = true;
    controller.abort();
  }, config.timeoutMs);

  const cleanup = (): void => {
    clearTimeout(timer);
    ctx.signal.removeEventListener('abort', onCoreAbort);
  };

  const headers: Record<string, string> = {
    Accept: 'text/plain, text/markdown, */*;q=0.5',
  };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  let response: Response;
  try {
    response = await fetch(outbound, {
      ...ctx.requestInit,
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers,
    });
  } catch (err) {
    cleanup();
    if (didReaderTimeout) {
      return { ok: false, error: `reader timed out after ${config.timeoutMs}ms` };
    }
    if (ctx.signal.aborted) return { ok: false, error: 'aborted' };
    return {
      ok: false,
      error: `reader fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  cleanup();

  if (!response.ok) {
    return { ok: false, error: `http ${response.status} ${response.statusText}`.trim() };
  }

  // Reader responses can be arbitrarily large (long articles, HN
  // threads, etc.). Stream with the same 100KB cap the native backend
  // uses so a rogue endpoint cannot balloon the daemon heap even before
  // the core fail-safe runs.
  let truncated = false;
  let body: Buffer;
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      const buf = Buffer.from(await response.arrayBuffer());
      body = buf.length > MAX_TEXT_BYTES ? ((truncated = true), buf.subarray(0, MAX_TEXT_BYTES)) : buf;
    } else {
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.byteLength;
        if (received > MAX_TEXT_BYTES) {
          const allowed = MAX_TEXT_BYTES - (received - value.byteLength);
          if (allowed > 0) chunks.push(value.subarray(0, allowed));
          truncated = true;
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
        chunks.push(value);
      }
      body = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    }
  } catch (err) {
    return {
      ok: false,
      error: `read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  return {
    ok: true,
    text: body.toString('utf8'),
    isHtml: false,
    ...(truncated ? { truncated: true } : {}),
  };
}

export function makeReaderWebFetchBackend(config: ReaderBackendConfig): WebFetchBackend {
  return {
    name: 'reader',
    fetchOnce: (ctx) => readerFetch(config, ctx),
  };
}
