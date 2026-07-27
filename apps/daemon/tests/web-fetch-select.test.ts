// Env → backend pair resolution for the daemon web_fetch pipeline.
// Covers 48-1 §3.5 (select) and §4 (env schema).

import { describe, expect, it, vi } from 'vitest';

import { resolveWebFetchBackend, validateReaderEndpoint } from '../src/web-fetch/select.js';

describe('validateReaderEndpoint', () => {
  it('accepts a well-formed https base and normalises trailing slash', () => {
    expect(validateReaderEndpoint('https://r.jina.ai')).toEqual({
      ok: true,
      base: 'https://r.jina.ai/',
    });
    expect(validateReaderEndpoint('https://r.jina.ai/')).toEqual({
      ok: true,
      base: 'https://r.jina.ai/',
    });
  });

  it('rejects empty / missing / malformed / non-https / private URLs', () => {
    expect(validateReaderEndpoint(undefined).ok).toBe(false);
    expect(validateReaderEndpoint('').ok).toBe(false);
    expect(validateReaderEndpoint('not a url').ok).toBe(false);
    expect(validateReaderEndpoint('http://r.jina.ai/').ok).toBe(false);
    expect(validateReaderEndpoint('https://127.0.0.1/').ok).toBe(false);
    expect(validateReaderEndpoint('https://localhost/').ok).toBe(false);
    expect(validateReaderEndpoint('https://10.0.0.1/').ok).toBe(false);
    expect(validateReaderEndpoint('https://192.168.1.1/').ok).toBe(false);
    expect(validateReaderEndpoint('https://172.16.0.1/').ok).toBe(false);
    expect(validateReaderEndpoint('https://172.31.255.255/').ok).toBe(false);
    // Just outside the private 172.16.0.0/12 block.
    expect(validateReaderEndpoint('https://172.15.0.1/').ok).toBe(true);
    expect(validateReaderEndpoint('https://172.32.0.1/').ok).toBe(true);
  });
});

describe('resolveWebFetchBackend', () => {
  it('defaults to native when env is empty', () => {
    const pair = resolveWebFetchBackend({});
    expect(pair.primary.name).toBe('native');
    expect(pair.fallback).toBeNull();
  });

  it('returns native for WEB_FETCH_BACKEND=native', () => {
    const pair = resolveWebFetchBackend({ WEB_FETCH_BACKEND: 'native' });
    expect(pair.primary.name).toBe('native');
    expect(pair.fallback).toBeNull();
  });

  it('warns and downgrades to native when the backend name is unknown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pair = resolveWebFetchBackend({ WEB_FETCH_BACKEND: 'quantum' });
    expect(pair.primary.name).toBe('native');
    expect(pair.fallback).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown WEB_FETCH_BACKEND'));
    warn.mockRestore();
  });

  it('activates the reader backend when URL + backend flag are both set', () => {
    const pair = resolveWebFetchBackend({
      WEB_FETCH_BACKEND: 'reader',
      WEB_FETCH_READER_URL: 'https://r.jina.ai/',
    });
    expect(pair.primary.name).toBe('reader');
    expect(pair.fallback).toBeNull();
  });

  it('downgrades to native (with warn) when reader is requested but URL is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pair = resolveWebFetchBackend({ WEB_FETCH_BACKEND: 'reader' });
    expect(pair.primary.name).toBe('native');
    expect(pair.fallback).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reader backend requested'));
    warn.mockRestore();
  });

  it('downgrades to native (with warn) for a private reader URL', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pair = resolveWebFetchBackend({
      WEB_FETCH_BACKEND: 'reader',
      WEB_FETCH_READER_URL: 'https://127.0.0.1/',
    });
    expect(pair.primary.name).toBe('native');
    expect(pair.fallback).toBeNull();
    warn.mockRestore();
  });

  it('registers native as fallback when WEB_FETCH_READER_FALLBACK_TO_NATIVE=1', () => {
    const pair = resolveWebFetchBackend({
      WEB_FETCH_BACKEND: 'reader',
      WEB_FETCH_READER_URL: 'https://r.jina.ai/',
      WEB_FETCH_READER_FALLBACK_TO_NATIVE: '1',
    });
    expect(pair.primary.name).toBe('reader');
    expect(pair.fallback?.name).toBe('native');
  });

  it('does NOT register a fallback when the flag is unset / 0 / anything falsy', () => {
    for (const flag of [undefined, '', '0', 'no', 'false']) {
      const env: NodeJS.ProcessEnv = {
        WEB_FETCH_BACKEND: 'reader',
        WEB_FETCH_READER_URL: 'https://r.jina.ai/',
      };
      if (flag !== undefined) env.WEB_FETCH_READER_FALLBACK_TO_NATIVE = flag;
      const pair = resolveWebFetchBackend(env);
      expect(pair.fallback, `flag=${JSON.stringify(flag)}`).toBeNull();
    }
  });
});
