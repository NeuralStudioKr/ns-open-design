/**
 * Authenticated HTML → iframe `srcDoc` helpers for Teamver embed.
 *
 * Sandboxed iframes cannot send session cookies. Bare `src=/api/...` to
 * auth-gated preview/example/showcase/raw routes paints nginx
 * `{"detail":"session_expired"}` as a Chrome JSON viewer thumb.
 * Always parent-fetch (credentials / fetchTeamverDaemon) and mount srcDoc.
 */

import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';

export function isUnauthorizedHtmlBody(
  text: string,
  contentType: string | null | undefined,
): boolean {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('application/json')) return true;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return false;
  if (/"detail"\s*:\s*"session_expired"/i.test(trimmed)) return true;
  if (trimmed.length > 800) return false;
  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown };
    return parsed != null && typeof parsed === 'object' && 'detail' in parsed;
  } catch {
    return false;
  }
}

export function looksLikeHtmlDocument(text: string): boolean {
  const head = text.slice(0, 512).toLowerCase();
  return (
    head.includes('<!doctype')
    || head.includes('<html')
    || head.includes('<body')
    || head.includes('<head')
    || head.includes('<div')
    || head.includes('<section')
  );
}

/** Plugin preview/example → plugin root for public `/asset/` relatives. */
export function resolvePluginPreviewBaseHref(previewSrc: string, origin?: string): string {
  const baseOrigin = origin ?? (typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
  const absolute = new URL(previewSrc, baseOrigin);
  absolute.hash = '';
  absolute.search = '';
  absolute.pathname = absolute.pathname.replace(
    /\/(?:preview|example(?:\/[^/]*)?)\/?$/i,
    '/',
  );
  if (!absolute.pathname.endsWith('/')) absolute.pathname += '/';
  return absolute.href;
}

export function injectHtmlBaseHref(html: string, baseHref: string): string {
  if (/<base\b/i.test(html)) return html;
  const escaped = baseHref
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const base = `<base href="${escaped}">`;
  const headClose = html.toLowerCase().lastIndexOf('</head>');
  if (headClose !== -1) {
    return `${html.slice(0, headClose)}${base}${html.slice(headClose)}`;
  }
  return `${base}${html}`;
}

export function pluginPreviewSrcDoc(html: string, sourceUrl: string): string {
  return injectHtmlBaseHref(html, resolvePluginPreviewBaseHref(sourceUrl));
}

export type AuthenticatedHtmlLoadResult =
  | { ok: true; srcDoc: string }
  | { ok: false; reason: 'http' | 'not_html' | 'network'; status?: number };

/**
 * Load auth-gated HTML for srcDoc. Rejects JSON/401 envelopes so callers
 * never mount session_expired as a thumbnail.
 */
export async function loadAuthenticatedHtmlSrcDoc(
  url: string,
  options?: {
    signal?: AbortSignal;
    /** Defaults to plugin preview/example base resolution when URL matches. */
    baseHref?: string;
  },
): Promise<AuthenticatedHtmlLoadResult> {
  try {
    const res = await fetchTeamverDaemon(url, {
      method: 'GET',
      signal: options?.signal ?? new AbortController().signal,
    });
    if (!res.ok) {
      return { ok: false, reason: 'http', status: res.status };
    }
    const text = await res.text();
    const contentType = res.headers.get('content-type');
    if (isUnauthorizedHtmlBody(text, contentType) || !looksLikeHtmlDocument(text)) {
      return { ok: false, reason: 'not_html', status: res.status };
    }
    const baseHref = options?.baseHref
      ?? (/(?:\/preview|\/example\/)/i.test(url)
        ? resolvePluginPreviewBaseHref(url)
        : new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost/').href);
    return { ok: true, srcDoc: injectHtmlBaseHref(text, baseHref) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
