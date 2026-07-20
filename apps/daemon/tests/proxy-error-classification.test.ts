import { describe, expect, it } from 'vitest';
import {
  classifyProxyCatchError,
  isProxyNetworkFailure,
  proxyHttpErrorCode,
  proxyHttpRetryable,
} from '../src/proxy-error-classification.js';

describe('proxy-error-classification', () => {
  it('maps network drops to retryable UPSTREAM_UNAVAILABLE', () => {
    const classified = classifyProxyCatchError(new TypeError('fetch failed'));
    expect(classified.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(classified.retryable).toBe(true);
    expect(classified.silent).toBe(false);
  });

  it('maps undici cause ECONNRESET to network failure', () => {
    const err = new TypeError('fetch failed');
    (err as Error & { cause?: unknown }).cause = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
    });
    expect(isProxyNetworkFailure(err)).toBe(true);
    expect(classifyProxyCatchError(err).retryable).toBe(true);
  });

  it('silences AbortError', () => {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    const classified = classifyProxyCatchError(err);
    expect(classified.silent).toBe(true);
  });

  it('keeps unexpected bugs as INTERNAL_ERROR', () => {
    const classified = classifyProxyCatchError(new Error('unexpected null deref'));
    expect(classified.code).toBe('INTERNAL_ERROR');
    expect(classified.retryable).toBe(false);
  });

  it('classifies HTTP statuses without dumping 4xx into UPSTREAM', () => {
    expect(proxyHttpErrorCode(400)).toBe('BAD_REQUEST');
    expect(proxyHttpErrorCode(422)).toBe('BAD_REQUEST');
    expect(proxyHttpErrorCode(401)).toBe('UNAUTHORIZED');
    expect(proxyHttpErrorCode(429)).toBe('RATE_LIMITED');
    expect(proxyHttpErrorCode(502)).toBe('UPSTREAM_UNAVAILABLE');
    expect(proxyHttpRetryable(502)).toBe(true);
    expect(proxyHttpRetryable(400)).toBe(false);
  });
});
