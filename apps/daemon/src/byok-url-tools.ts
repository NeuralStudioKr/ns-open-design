// Shared URL-fetch tool backing the BYOK `web_fetch` tool.
//
// BYOK proxy chat (unlike the CLI agent path with its built-in WebFetch/Read)
// has no way to read a URL the user pastes, so the model would hallucinate or
// refuse. This module fetches a public http(s) URL server-side, strips it to
// plain text, and returns it for the tool loop to feed back to the model.
//
// Safety: every fetch goes through the same SSRF guard the media tools use
// (assertExternalAssetUrl + redirect: 'error'), and the body is capped/streamed
// so a huge page can never blow up the daemon's memory or the model context.

import { assertExternalAssetUrl } from './connectionTest.js';

export interface WebFetchToolResult {
  ok: boolean;
  /** Plain-text content of the page (HTML stripped), capped at MAX_TEXT_BYTES. */
  text?: string;
  /** Document <title>, when present — fed to the model as a hint. */
  title?: string;
  /** True when the body hit the size cap and was cut short. */
  truncated?: boolean;
  /** Short human-readable failure reason for the model to relay. */
  error?: string;
}

const MAX_TEXT_BYTES = 100 * 1024; // 100 KB post-fetch cap
const FETCH_TIMEOUT_MS = 12_000; // 12s — one tool-loop round must not hang

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

// Dependency-free HTML → text. Not a full parser, but plenty for an LLM: a
// 100 KB page collapses to ~30-50 KB of readable text. We deliberately avoid
// cheerio/jsdom to keep the daemon bundle and maintenance surface small.
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

/**
 * Fetch a public http(s) URL and return its content as plain text.
 * SSRF-guarded, size-capped, time-bounded. Never throws — all failures come
 * back as `{ ok: false, error }`.
 */
export async function fetchUrlContent(
  rawUrl: unknown,
  requestInit?: Pick<RequestInit, 'dispatcher'>,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      ...requestInit,
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; OpenDesignBot/1.0; +https://open-design.ai)',
        Accept:
          'text/html,application/xhtml+xml,application/xml,text/plain,application/json;q=0.9,*/*;q=0.5',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      return { ok: false, error: `request timed out after ${FETCH_TIMEOUT_MS}ms` };
    }
    return {
      ok: false,
      error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  clearTimeout(timer);

  if (!response.ok) {
    return { ok: false, error: `http ${response.status} ${response.statusText}`.trim() };
  }

  // Stream the body and stop the moment we cross the cap, cancelling the
  // reader so the rest of a huge page never lands in daemon memory.
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
  const raw = body.toString('utf8');
  const isHtml = contentType.includes('html') || /^\s*<(!doctype|html)/i.test(raw);
  const stripped: StrippedHtml = isHtml ? htmlToText(raw) : { text: raw.trim() };
  const { text, title } = stripped;

  return { ok: true, text, ...(title ? { title } : {}), ...(truncated ? { truncated: true } : {}) };
}
