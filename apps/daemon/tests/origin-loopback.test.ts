import { describe, expect, it } from 'vitest';

import {
  isBrowserOriginLoopback,
  isStrictLoopbackHostname,
} from '../src/origin-validation.js';

function req(headers: Record<string, string>) {
  return { headers } as Parameters<typeof isBrowserOriginLoopback>[0];
}

describe('isStrictLoopbackHostname', () => {
  it('accepts true loopback hostnames', () => {
    expect(isStrictLoopbackHostname('localhost')).toBe(true);
    expect(isStrictLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isStrictLoopbackHostname('::1')).toBe(true);
    expect(isStrictLoopbackHostname('[::1]')).toBe(true);
    expect(isStrictLoopbackHostname('LOCALHOST')).toBe(true);
  });

  it('rejects private LAN IPs — they are reachable by other devices', () => {
    expect(isStrictLoopbackHostname('192.168.1.50')).toBe(false);
    expect(isStrictLoopbackHostname('10.0.0.5')).toBe(false);
    expect(isStrictLoopbackHostname('172.16.0.1')).toBe(false);
    expect(isStrictLoopbackHostname('169.254.169.254')).toBe(false);
  });

  it('rejects public hostnames and the unspecified address', () => {
    expect(isStrictLoopbackHostname('stg-design.teamver.com')).toBe(false);
    expect(isStrictLoopbackHostname('0.0.0.0')).toBe(false);
    expect(isStrictLoopbackHostname('')).toBe(false);
    expect(isStrictLoopbackHostname(null)).toBe(false);
  });
});

describe('isBrowserOriginLoopback', () => {
  it('returns true for http://localhost origin', () => {
    expect(isBrowserOriginLoopback(req({ origin: 'http://localhost:5173' }))).toBe(true);
  });

  it('returns true for http://127.0.0.1 origin', () => {
    expect(isBrowserOriginLoopback(req({ origin: 'http://127.0.0.1:7456' }))).toBe(true);
  });

  it('returns false for a public https origin even when env allow-lists it', () => {
    // The secret-exposure gate is *stricter* than `isLocalSameOrigin`: a
    // public origin in OD_ALLOWED_ORIGINS may pass cross-origin checks, but
    // it must never receive raw stored secrets.
    expect(
      isBrowserOriginLoopback(req({ origin: 'https://stg-design.teamver.com' })),
    ).toBe(false);
  });

  it('returns false for a private LAN browser origin', () => {
    expect(
      isBrowserOriginLoopback(req({ origin: 'http://192.168.1.50:7456' })),
    ).toBe(false);
  });

  it('returns false when Origin is missing and sec-fetch-site is cross-site', () => {
    expect(
      isBrowserOriginLoopback(
        req({ host: 'stg-design.teamver.com', 'sec-fetch-site': 'cross-site' }),
      ),
    ).toBe(false);
  });

  it('returns false when Origin is missing and sec-fetch-site is absent', () => {
    // No Origin header AND no sec-fetch-site signal — could be a reverse-proxy
    // forwarded request without browser context. Fail closed.
    expect(
      isBrowserOriginLoopback(req({ host: '127.0.0.1:7456' })),
    ).toBe(false);
  });

  it('returns true when Origin is missing, sec-fetch-site is same-origin, and Host is loopback', () => {
    expect(
      isBrowserOriginLoopback(
        req({ host: '127.0.0.1:7456', 'sec-fetch-site': 'same-origin' }),
      ),
    ).toBe(true);
  });

  it('returns false when Host is a private LAN IP even with same-origin signal', () => {
    expect(
      isBrowserOriginLoopback(
        req({ host: '192.168.1.50:7456', 'sec-fetch-site': 'same-origin' }),
      ),
    ).toBe(false);
  });

  it('returns false for non-http(s) origins', () => {
    expect(isBrowserOriginLoopback(req({ origin: 'file://' }))).toBe(false);
    expect(isBrowserOriginLoopback(req({ origin: 'data:text/html,' }))).toBe(false);
  });

  it('returns false for an unparseable Origin header', () => {
    expect(isBrowserOriginLoopback(req({ origin: 'not-a-url' }))).toBe(false);
  });
});
