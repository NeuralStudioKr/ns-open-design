import { describe, expect, it } from 'vitest';
import {
  classifyProxyCatchError,
  classifyProviderStreamError,
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

  it('maps overloaded / rate-limit mid-stream frames to retryable UPSTREAM', () => {
    expect(
      classifyProviderStreamError({
        type: 'error',
        error: { type: 'overloaded_error', message: 'Overloaded' },
      }),
    ).toEqual({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });

    expect(
      classifyProviderStreamError({
        error: { code: 'rate_limit_exceeded', message: 'Rate limit reached' },
      }),
    ).toEqual({ code: 'RATE_LIMITED', retryable: true });
  });

  it('keeps auth / invalid-request mid-stream frames non-retryable', () => {
    expect(
      classifyProviderStreamError({
        error: { type: 'invalid_request_error', message: 'messages: empty' },
      }),
    ).toEqual({ code: 'BAD_REQUEST', retryable: false });

    expect(
      classifyProviderStreamError({
        error: { type: 'authentication_error', message: 'invalid x-api-key' },
      }),
    ).toEqual({ code: 'UNAUTHORIZED', retryable: false });
  });

  it('forceNonRetryable is used for content-policy / Gemini block paths', () => {
    expect(
      classifyProviderStreamError(
        { promptFeedback: { blockReason: 'SAFETY' } },
        { forceNonRetryable: true, fallbackCode: 'BAD_REQUEST' },
      ),
    ).toEqual({ code: 'BAD_REQUEST', retryable: false });
  });

  it('maps premature close / hang-up to retryable network failure', () => {
    expect(isProxyNetworkFailure(new Error('premature close'))).toBe(true);
    expect(classifyProxyCatchError(new Error('socket hang up')).retryable).toBe(true);
    expect(classifyProxyCatchError(new Error('other side closed')).code).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('maps invalid API key codes to non-retryable UNAUTHORIZED', () => {
    expect(
      classifyProviderStreamError({
        error: { code: 'invalid_api_key', message: 'Incorrect API key provided' },
      }),
    ).toEqual({ code: 'UNAUTHORIZED', retryable: false });
  });

  it('does not treat temporary billing blips as non-retryable auth', () => {
    expect(
      classifyProviderStreamError({
        error: { message: 'billing temporarily unavailable' },
      }),
    ).toEqual({ code: 'UPSTREAM_UNAVAILABLE', retryable: true });
  });

  it('maps missing API key messages to non-retryable UNAUTHORIZED', () => {
    expect(
      classifyProviderStreamError({
        error: { message: 'API key required' },
      }),
    ).toEqual({ code: 'UNAUTHORIZED', retryable: false });
    expect(
      classifyProviderStreamError({
        error: { message: 'No API key provided' },
      }),
    ).toEqual({ code: 'UNAUTHORIZED', retryable: false });
  });

  it('defaults unknown provider mid-stream errors to retryable UPSTREAM', () => {
    expect(classifyProviderStreamError({ error: { message: 'weird blip' } })).toEqual({
      code: 'UPSTREAM_UNAVAILABLE',
      retryable: true,
    });
  });
});
