/**
 * Classify BYOK proxy / LLM stream failures for structured SSE error codes.
 *
 * Catch-all `INTERNAL_ERROR` previously swallowed network drops (fetch failed,
 * ECONNRESET, TLS) so the FE showed "AI 서비스에 연결하지 못했습니다" without
 * `retryable` — users hit intermittent hard failures with only a manual Retry.
 */

export type ProxyCatchClassification = {
  code: 'UPSTREAM_UNAVAILABLE' | 'INTERNAL_ERROR' | 'BAD_REQUEST';
  retryable: boolean;
  message: string;
  /** Abort / explicit cancel — end SSE without an error frame. */
  silent: boolean;
};

const NETWORK_HINT =
  /fetch failed|network|econnreset|econnrefused|etimedout|enotfound|epipe|ehostunreach|socket|und_err|tls|cert|ssl|disconnected|connection reset|connection refused|timed out|timeout|premature close|other side closed|closed unexpectedly|socket hang up|hang up/i;

function errField(err: unknown, key: string): string {
  if (!err || typeof err !== 'object' || !(key in err)) return '';
  const value = (err as Record<string, unknown>)[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function collectErrorHaystack(err: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 3 || value == null) return;
    if (typeof value === 'string') {
      parts.push(value);
      return;
    }
    if (value instanceof Error) {
      parts.push(value.name, value.message);
      parts.push(errField(value, 'code'));
      walk((value as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (typeof value === 'object') {
      parts.push(errField(value, 'code'), errField(value, 'name'), errField(value, 'message'));
    }
  };
  walk(err, 0);
  return parts.join(' ');
}

export function isProxyNetworkFailure(err: unknown): boolean {
  return NETWORK_HINT.test(collectErrorHaystack(err));
}

export function isProxyAbortError(err: unknown): boolean {
  const name = errField(err, 'name') || (err instanceof Error ? err.name : '');
  const message = err instanceof Error ? err.message : String(err ?? '');
  return name === 'AbortError' || /aborted|the operation was aborted/i.test(message);
}

export function classifyProxyCatchError(err: unknown): ProxyCatchClassification {
  const message = err instanceof Error ? err.message : String(err ?? 'proxy error');
  if (isProxyAbortError(err)) {
    return {
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: false,
      message,
      silent: true,
    };
  }
  if (isProxyNetworkFailure(err)) {
    return {
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
      message,
      silent: false,
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    retryable: false,
    message,
    silent: false,
  };
}

/** Map upstream HTTP status to ApiErrorCode for non-SSE JSON / SSE proxy errors. */
export function proxyHttpErrorCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 || status === 422) return 'BAD_REQUEST';
  if (status === 408 || status >= 500) return 'UPSTREAM_UNAVAILABLE';
  if (status >= 400 && status < 500) return 'BAD_REQUEST';
  return 'UPSTREAM_UNAVAILABLE';
}

export function proxyHttpRetryable(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/**
 * Classify mid-stream provider error frames (Anthropic/OpenAI/Gemini/etc.).
 * Previously every path hard-coded `retryable: false`, so pre-token overloads
 * never triggered FE soft-retry and often surfaced as a hard AI-connect failure.
 */
export type ProviderStreamClassification = {
  code: string;
  retryable: boolean;
};

const TRANSIENT_PROVIDER_HINT =
  /overloaded|rate.?limit|too many requests|timeout|timed out|temporar|unavailable|capacity|service.?unavailable|bad gateway|gateway timeout|internal.?server|server.?error|try.?again|please.?retry|econnreset|fetch failed|connection.?reset|premature close|other side closed|socket hang up|529|503|502|500\b/i;

const NON_RETRYABLE_PROVIDER_HINT =
  /invalid.?request|authentication|unauthorized|forbidden|permission|not.?found|content.?filter|safety|blocked|policy|insufficient.?quota|payment.?required|billing.?hard|incorrect.?api.?key|api.?key.?invalid|invalid.?api.?key|api.?key.?disabled|api.?key.has.been.disabled|x-api-key|context.?length|max.?tokens|prompt.?too.?long|unsupported/i;

const TRANSIENT_PROVIDER_CODES = new Set([
  'OVERLOADED',
  'OVERLOADED_ERROR',
  'RATE_LIMIT',
  'RATE_LIMIT_ERROR',
  'RATE_LIMITED',
  'TIMEOUT',
  'API_ERROR',
  'SERVER_ERROR',
  'INTERNAL_SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
  'UPSTREAM_UNAVAILABLE',
]);

const NON_RETRYABLE_PROVIDER_CODES = new Set([
  'INVALID_REQUEST',
  'INVALID_REQUEST_ERROR',
  'AUTHENTICATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'NOT_FOUND_ERROR',
  'BAD_REQUEST',
  'CONTENT_FILTER',
  'CONTENT_POLICY_VIOLATION',
  'SAFETY',
  'INVALID_API_KEY',
  'API_KEY_INVALID',
]);

function normalizeProviderCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
}

function collectProviderErrorHaystack(data: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 4 || value == null) return;
    if (typeof value === 'string') {
      parts.push(value);
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value));
      return;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['code', 'type', 'status', 'message', 'statusText', 'blockReason', 'finishReason']) {
        walk(record[key], depth + 1);
      }
      if (record.error) walk(record.error, depth + 1);
    }
  };
  walk(data, 0);
  return parts.join(' ');
}

function extractProviderErrorCode(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === 'object'
      ? (record.error as Record<string, unknown>)
      : null;
  const raw =
    (typeof nested?.code === 'string' && nested.code)
    || (typeof nested?.type === 'string' && nested.type)
    || (typeof record.code === 'string' && record.code)
    || (typeof record.type === 'string' && record.type)
    || '';
  return raw ? normalizeProviderCode(raw) : '';
}

function mapNonRetryableProviderCode(code: string, haystack: string): string {
  if (code === 'UNAUTHORIZED' || code === 'AUTHENTICATION_ERROR' || /unauthorized|authentication|api.?key/i.test(haystack)) {
    return 'UNAUTHORIZED';
  }
  if (code === 'FORBIDDEN' || code === 'PERMISSION_DENIED' || /forbidden|permission/i.test(haystack)) {
    return 'FORBIDDEN';
  }
  if (code === 'NOT_FOUND' || code === 'NOT_FOUND_ERROR') return 'NOT_FOUND';
  return 'BAD_REQUEST';
}

export function classifyProviderStreamError(
  data: unknown,
  options?: { fallbackCode?: string; forceNonRetryable?: boolean },
): ProviderStreamClassification {
  if (options?.forceNonRetryable) {
    return {
      code: options.fallbackCode || 'BAD_REQUEST',
      retryable: false,
    };
  }

  const haystack = collectProviderErrorHaystack(data);
  const rawCode = extractProviderErrorCode(data);

  if (
    (rawCode && NON_RETRYABLE_PROVIDER_CODES.has(rawCode))
    || NON_RETRYABLE_PROVIDER_HINT.test(haystack)
  ) {
    return {
      code: mapNonRetryableProviderCode(rawCode, haystack),
      retryable: false,
    };
  }

  if (
    (rawCode && TRANSIENT_PROVIDER_CODES.has(rawCode))
    || TRANSIENT_PROVIDER_HINT.test(haystack)
  ) {
    return {
      code: /RATE_LIMIT/.test(rawCode) || /rate.?limit|too many requests/i.test(haystack)
        ? 'RATE_LIMITED'
        : 'UPSTREAM_UNAVAILABLE',
      retryable: true,
    };
  }

  // Default: provider-originated mid-stream failure — treat as retryable
  // upstream so FE soft-retry can absorb pre-token blips.
  return {
    code: options?.fallbackCode || 'UPSTREAM_UNAVAILABLE',
    retryable: true,
  };
}
