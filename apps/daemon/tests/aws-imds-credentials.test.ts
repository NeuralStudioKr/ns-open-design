import { describe, expect, it, vi } from 'vitest';

import { fetchEc2InstanceRoleCredentials } from '../src/storage/aws-imds-credentials.js';

describe('fetchEc2InstanceRoleCredentials', () => {
  it('fetches role credentials via IMDSv2 using path-only metadata URLs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'http://169.254.169.254/latest/api/token' && init?.method === 'PUT') {
        return new Response('test-token', { status: 200 });
      }
      if (
        url === 'http://169.254.169.254/latest/meta-data/iam/security-credentials/' &&
        init?.headers &&
        (init.headers as Record<string, string>)['X-aws-ec2-metadata-token'] === 'test-token'
      ) {
        return new Response('teamver-design-prod-app', { status: 200 });
      }
      if (
        url ===
          'http://169.254.169.254/latest/meta-data/iam/security-credentials/teamver-design-prod-app' &&
        init?.headers &&
        (init.headers as Record<string, string>)['X-aws-ec2-metadata-token'] === 'test-token'
      ) {
        return new Response(
          JSON.stringify({
            Code: 'Success',
            AccessKeyId: 'ASIA_TEST',
            SecretAccessKey: 'secret',
            Token: 'session-token',
            Expiration: '2030-01-01T00:00:00Z',
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const creds = await fetchEc2InstanceRoleCredentials({ timeoutMs: 5000 });
    expect(creds).toEqual({
      accessKeyId: 'ASIA_TEST',
      secretAccessKey: 'secret',
      sessionToken: 'session-token',
      expiresAtMs: Date.parse('2030-01-01T00:00:00Z'),
    });

    expect(
      fetchMock.mock.calls.some(
        ([url]) =>
          String(url) ===
          'http://169.254.169.254/latest/meta-data/iam/security-credentials/teamver-design-prod-app',
      ),
    ).toBe(true);

    vi.unstubAllGlobals();
  });

  it('returns null when the role credential document is unavailable', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/token') && init?.method === 'PUT') {
        return new Response('test-token', { status: 200 });
      }
      if (url.endsWith('/iam/security-credentials/')) {
        return new Response('missing-role', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const creds = await fetchEc2InstanceRoleCredentials({ timeoutMs: 5000 });
    expect(creds).toBeNull();

    vi.unstubAllGlobals();
  });
});
