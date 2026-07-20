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
  /fetch failed|network|econnreset|econnrefused|etimedout|enotfound|epipe|ehostunreach|socket|und_err|tls|cert|ssl|disconnected|connection reset|connection refused|timed out|timeout/i;

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
