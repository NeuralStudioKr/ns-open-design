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

/**
 * Teamver canvas HTML embeds CSP meta with `base-uri 'none'` (download hardening).
 * srcDoc thumbs/previews must inject `<base href>` for relative assets; that
 * violates the meta and floods DevTools. Drop only the conflicting directive
 * (keep default-src / img-src / etc.).
 *
 * Canvas export CSP often sets `script-src 'none'` (or mixes `'none'` with other
 * sources, which browsers reject). Sandboxed preview iframes (`allow-scripts`)
 * must run deck navigation and host bridges, so drop `'none'` from `script-src`
 * and ensure `'unsafe-inline'` is present (keeping `'self'` when listed).
 */
function dedupeCspSourceTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

const KNOWN_CSP_DIRECTIVE_NAMES = new Set([
  'default-src',
  'script-src',
  'style-src',
  'img-src',
  'font-src',
  'connect-src',
  'frame-src',
  'worker-src',
  'child-src',
  'object-src',
  'media-src',
  'manifest-src',
  'prefetch-src',
  'navigate-to',
  'base-uri',
  'form-action',
  'frame-ancestors',
  'upgrade-insecure-requests',
  'block-all-mixed-content',
  'require-trusted-types-for',
  'trusted-types',
  'report-uri',
  'report-to',
  'sandbox',
]);

function isCspDirectiveName(token: string): boolean {
  const lower = token.toLowerCase();
  if (KNOWN_CSP_DIRECTIVE_NAMES.has(lower)) return true;
  return lower.endsWith('-src');
}

function parseCspToDirectives(content: string): Array<{ name: string; value: string }> {
  const chunks = content
    .trim()
    .split(';')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  const directives: Array<{ name: string; value: string }> = [];

  for (const chunk of chunks) {
    const tokens = chunk.split(/\s+/).filter(Boolean);
    let index = 0;
    while (index < tokens.length) {
      const name = tokens[index]?.toLowerCase() ?? '';
      if (!isCspDirectiveName(name)) {
        index += 1;
        continue;
      }
      index += 1;
      const valueTokens: string[] = [];
      while (index < tokens.length) {
        const token = tokens[index] ?? '';
        if (isCspDirectiveName(token.toLowerCase())) break;
        valueTokens.push(token);
        index += 1;
      }
      directives.push({ name, value: valueTokens.join(' ') });
    }
  }
  return directives;
}

function serializeCspDirectives(directives: Array<{ name: string; value: string }>): string {
  return directives
    .map((directive) => {
      const value = directive.value.trim();
      return value ? `${directive.name} ${value}` : directive.name;
    })
    .join('; ');
}

function isBaseUriNoneDirective(directive: { name: string; value: string }): boolean {
  if (directive.name !== 'base-uri') return false;
  const value = directive.value.trim();
  return value === "'none'" || value === '"none"' || value === 'none';
}

function normalizeScriptSrcDirective(sourceList: string): string {
  const tokens = dedupeCspSourceTokens(
    sourceList
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0),
  );
  const withoutNone = tokens.filter(
    (token) => token !== "'none'" && token !== '"none"' && token !== 'none',
  );
  if (withoutNone.length === 0) {
    return "'unsafe-inline'";
  }
  const hasInline = withoutNone.some(
    (token) => token === "'unsafe-inline'" || token === '"unsafe-inline"',
  );
  if (!hasInline) {
    withoutNone.push("'unsafe-inline'");
  }
  return dedupeCspSourceTokens(withoutNone).join(' ');
}

/** Relax canvas export meta CSP for sandboxed srcDoc previews. */
function relaxSrcDocPreviewCspContent(content: string): string {
  const directives = parseCspToDirectives(content)
    .filter((directive) => !isBaseUriNoneDirective(directive))
    .map((directive) => {
      if (directive.name !== 'script-src') return directive;
      return {
        ...directive,
        value: normalizeScriptSrcDirective(directive.value),
      };
    });
  return serializeCspDirectives(directives);
}

export function stripConflictingSrcDocCspBaseUri(html: string): string {
  return html.replace(/<meta\b[^>]*>/gi, (tag) => {
    if (!/\bhttp-equiv\s*=\s*(["']?)Content-Security-Policy\1/i.test(tag)
      && !/\bhttp-equiv\s*=\s*Content-Security-Policy\b/i.test(tag)) {
      return tag;
    }
    return tag.replace(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i, (_m, quote: string, content: string) => {
      const next = relaxSrcDocPreviewCspContent(content);
      return `content=${quote}${next}${quote}`;
    });
  });
}

export function injectHtmlBaseHref(html: string, baseHref: string): string {
  const prepared = stripConflictingSrcDocCspBaseUri(html);
  if (/<base\b/i.test(prepared)) return prepared;
  const escaped = baseHref
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const base = `<base href="${escaped}">`;
  const headClose = prepared.toLowerCase().lastIndexOf('</head>');
  if (headClose !== -1) {
    return `${prepared.slice(0, headClose)}${base}${prepared.slice(headClose)}`;
  }
  return `${base}${prepared}`;
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
