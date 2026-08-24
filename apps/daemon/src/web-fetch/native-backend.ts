// The default web_fetch backend. Fetches an SSRF-cleared http(s) URL
// with a Teamver UA, follows a short chain of safe redirects (see
// §Redirect policy below), streams up to MAX_TEXT_BYTES, and returns
// the bytes as UTF-8 text with an `isHtml` hint the core uses to
// decide whether to run htmlToText.
//
// §Redirect policy — see docs-teamver/48-1-구현설계-webfetch-adapter.md §3.3:
//   - `redirect: 'manual'` on every hop so we can inspect Location
//     ourselves. Node/undici surfaces the 3xx response with the
//     Location header intact.
//   - MAX_REDIRECT_HOPS caps the chain at 3, defeating loops and
//     tracker cascades. Common legitimate redirects (apex→www,
//     http→https, region routing) fit inside 1–2 hops.
//   - Every hop is re-SSRF'd through assertExternalAssetUrl. An
//     attacker-controlled origin cannot 302 into 127.0.0.1 or
//     169.254.169.254 — that was the original reason we set
//     `redirect: 'error'`, and per-hop validation preserves it.
//   - https → http downgrade is refused (TLS leak). http → https
//     upgrade is fine (safety improves).
//   - Non-http(s) redirect targets (ftp://, file://, javascript:) are
//     refused.
//   - Cross-origin hops are allowed — legitimate CDNs and vanity
//     domains often terminate on a different hostname. Safety is
//     enforced by per-hop SSRF, not same-origin.

import { isWebFetchPageContentType } from '@open-design/contracts';
import { assertExternalAssetUrl } from '../connectionTest.js';
import { MAX_TEXT_BYTES, USER_AGENT } from './core.js';
import type { WebFetchBackend, WebFetchBackendCtx, WebFetchBackendResult } from './backend.js';

const MAX_REDIRECT_HOPS = 3;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Fetch `currentUrl` with a Teamver UA, honouring the core's abort
 *  signal, and return the (raw) Response. Throws only for network /
 *  abort — HTTP status is examined by the caller. */
async function fetchNoRedirect(
  currentUrl: string,
  ctx: WebFetchBackendCtx,
): Promise<Response> {
  return fetch(currentUrl, {
    ...ctx.requestInit,
    method: 'GET',
    redirect: 'manual',
    signal: ctx.signal,
    headers: {
      'User-Agent': USER_AGENT,
      Accept:
        'text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.5',
    },
  });
}

/** Try to release the socket for an intermediate 3xx response we are
 *  not going to read. Best-effort — swallow any error. */
async function drainIntermediateBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    /* ignore */
  }
}

/** Validate a Location header we would follow. Returns the safe
 *  absolute URL string, or a discriminated error the backend can
 *  return verbatim.
 *
 *  Check order matters — SSRF fires FIRST so that the "attacker.com
 *  → 169.254.169.254" pattern is always attributed to the SSRF
 *  gate, regardless of which scheme the metadata endpoint uses. The
 *  https→http downgrade check runs afterwards to catch public targets
 *  that would silently drop TLS. */
async function resolveSafeRedirect(
  currentUrl: string,
  location: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!location?.trim()) {
    return { ok: false, error: 'redirect without Location header' };
  }

  let target: URL;
  try {
    target = new URL(location.trim(), currentUrl);
  } catch {
    return { ok: false, error: `invalid redirect Location: ${location.slice(0, 200)}` };
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return {
      ok: false,
      error: `blocked redirect: non-http(s) scheme ${target.protocol}`,
    };
  }

  // (1) SSRF re-check on every hop. This is the real defence against
  //     the "attacker.com 302s into loopback / RFC1918 / link-local /
  //     169.254.169.254" pattern that motivated `redirect: 'error'`
  //     in the first place.
  const check = await assertExternalAssetUrl(target.href);
  if (!check.ok) {
    return { ok: false, error: `blocked redirect: ${check.error}` };
  }

  // (2) TLS-preserving policy: https origin must not silently walk
  //     into plaintext http. Mirrors `curl --proto-redir =https`.
  let current: URL;
  try {
    current = new URL(currentUrl);
  } catch {
    return { ok: false, error: 'invalid current URL during redirect' };
  }
  if (current.protocol === 'https:' && target.protocol === 'http:') {
    return {
      ok: false,
      error: `blocked redirect: https→http downgrade to ${target.host}`,
    };
  }

  return { ok: true, url: target.href };
}

/** Read the body of the terminal 2xx response, respecting
 *  MAX_TEXT_BYTES and cancelling the stream past the cap. */
async function readCappedBody(
  response: Response,
): Promise<{ ok: true; body: Buffer; truncated: boolean } | { ok: false; error: string }> {
  let truncated = false;
  try {
    const reader = response.body?.getReader();
    if (!reader) {
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > MAX_TEXT_BYTES) {
        return { ok: true, body: buf.subarray(0, MAX_TEXT_BYTES), truncated: true };
      }
      return { ok: true, body: buf, truncated: false };
    }
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
    return {
      ok: true,
      body: Buffer.concat(chunks.map((c) => Buffer.from(c))),
      truncated,
    };
  } catch (err) {
    return {
      ok: false,
      error: `read failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function nativeFetch(ctx: WebFetchBackendCtx): Promise<WebFetchBackendResult> {
  let currentUrl = ctx.url;
  let hops = 0;

  for (;;) {
    let response: Response;
    try {
      response = await fetchNoRedirect(currentUrl, ctx);
    } catch (err) {
      // Core rewrites the message to a timeout notice when its own
      // timer fired. Otherwise we surface the underlying fetch
      // error verbatim.
      if (ctx.signal.aborted) return { ok: false, error: 'aborted', hops };
      return {
        ok: false,
        error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        hops,
      };
    }

    // 3xx → count and, if the budget allows, evaluate the target.
    // `hops` tracks Location headers we CONSUMED (attempted), not just
    // ones we successfully followed. Ops dashboards see the same
    // number regardless of whether the chain terminated on 2xx, hit
    // the cap, or was blocked mid-chain — the count reflects work.
    if (REDIRECT_STATUSES.has(response.status)) {
      hops += 1;
      if (hops > MAX_REDIRECT_HOPS) {
        await drainIntermediateBody(response);
        return {
          ok: false,
          error: `too many redirects (>${MAX_REDIRECT_HOPS} hops)`,
          hops,
        };
      }
      const decision = await resolveSafeRedirect(
        currentUrl,
        response.headers.get('location'),
      );
      await drainIntermediateBody(response);
      if (!decision.ok) return { ok: false, error: decision.error, hops };
      currentUrl = decision.url;
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `http ${response.status} ${response.statusText}`.trim(),
        hops,
      };
    }

    const bodyResult = await readCappedBody(response);
    if (!bodyResult.ok) return { ok: false, error: bodyResult.error, hops };

    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!isWebFetchPageContentType(contentType)) {
      return {
        ok: false,
        error: 'response is a stylesheet, font, or static asset, not a page',
        hops,
      };
    }
    const text = bodyResult.body.toString('utf8');
    const isHtml = contentType.includes('html') || /^\s*<(!doctype|html)/i.test(text);

    return {
      ok: true,
      text,
      isHtml,
      hops,
      ...(bodyResult.truncated ? { truncated: true } : {}),
    };
  }
}

export const nativeWebFetchBackend: WebFetchBackend = {
  name: 'native',
  fetchOnce: nativeFetch,
};
