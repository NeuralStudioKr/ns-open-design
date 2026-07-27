// The default web_fetch backend. Behaves exactly like the pre-adapter
// implementation of `fetchUrlContent`: GET the URL with a Teamver UA,
// refuse redirects, stream up to MAX_TEXT_BYTES, and return the bytes
// as UTF-8 text with an `isHtml` hint the core uses to decide whether
// to run htmlToText. See docs-teamver/48-1-구현설계-webfetch-adapter.md §3.3.

import { MAX_TEXT_BYTES, USER_AGENT } from './core.js';
import type { WebFetchBackend, WebFetchBackendCtx, WebFetchBackendResult } from './backend.js';

async function nativeFetch(ctx: WebFetchBackendCtx): Promise<WebFetchBackendResult> {
  let response: Response;
  try {
    response = await fetch(ctx.url, {
      ...ctx.requestInit,
      method: 'GET',
      redirect: 'error',
      signal: ctx.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.5',
      },
    });
  } catch (err) {
    // Core rewrites the message to a timeout notice when its own timer
    // fired. Otherwise we surface the underlying fetch error verbatim.
    if (ctx.signal.aborted) return { ok: false, error: 'aborted' };
    return {
      ok: false,
      error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!response.ok) {
    return { ok: false, error: `http ${response.status} ${response.statusText}`.trim() };
  }

  // Stream the body and stop the moment we cross the cap, cancelling
  // the reader so a huge page never lands in daemon memory.
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

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const text = body.toString('utf8');
  const isHtml = contentType.includes('html') || /^\s*<(!doctype|html)/i.test(text);

  return {
    ok: true,
    text,
    isHtml,
    ...(truncated ? { truncated: true } : {}),
  };
}

export const nativeWebFetchBackend: WebFetchBackend = {
  name: 'native',
  fetchOnce: nativeFetch,
};
