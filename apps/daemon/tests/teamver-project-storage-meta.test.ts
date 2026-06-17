import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchTeamverProjectS3Prefix,
  resolveTeamverTenantRemoteStorage,
} from '../src/storage/teamver-project-storage-meta.js';
import type { ProjectStorage } from '../src/storage/project-storage.js';

type FetchMock = ReturnType<typeof vi.fn>;

const identity = { userId: 'u-1', workspaceId: 'ws-1' };

function fakeStorage(label: string): ProjectStorage {
  return { __label: label } as unknown as ProjectStorage;
}

function noopHeaders(headerEntries: Record<string, string> = {}) {
  return {
    get(name: string) {
      const lower = name.toLowerCase();
      for (const [k, v] of Object.entries(headerEntries)) {
        if (k.toLowerCase() === lower) return v;
      }
      return null;
    },
  };
}

describe('teamver-project-storage-meta', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('fetchTeamverProjectS3Prefix', () => {
    it('returns null when TEAMVER_DESIGN_API_URL is not configured', async () => {
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchTeamverProjectS3Prefix('proj-1', identity);

      expect(result).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns the trimmed s3 prefix from x-teamver-s3-prefix on 204', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 204,
        headers: noopHeaders({
          'X-Teamver-S3-Prefix': '  design/ws_a/user_b/proj_proj-1  ',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchTeamverProjectS3Prefix('proj-1', identity);

      expect(result).toBe('design/ws_a/user_b/proj_proj-1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://design-api:16000/api/v1/projects/proj-1/access');
      expect(init?.method).toBe('GET');
      expect(init?.headers).toMatchObject({
        'X-Teamver-User-Id': 'u-1',
        'X-Teamver-Workspace-Id': 'ws-1',
      });
    });

    it('returns null when 204 has no x-teamver-s3-prefix header', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 204,
        headers: noopHeaders({}),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchTeamverProjectS3Prefix('proj-1', identity);
      expect(result).toBeNull();
    });

    it('returns null when 204 header is empty string', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 204,
        headers: noopHeaders({ 'X-Teamver-S3-Prefix': '   ' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchTeamverProjectS3Prefix('proj-1', identity);
      expect(result).toBeNull();
    });

    it('returns null on non-204 (e.g. 403)', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 403,
        headers: noopHeaders({ 'X-Teamver-S3-Prefix': 'will/be/ignored' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchTeamverProjectS3Prefix('proj-1', identity);
      expect(result).toBeNull();
    });

    it('returns null on network error / abort', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockRejectedValue(new Error('network down'));
      vi.stubGlobal('fetch', fetchMock);

      const result = await fetchTeamverProjectS3Prefix('proj-1', identity);
      expect(result).toBeNull();
    });

    it('encodes special characters in projectId in the access URL', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 204,
        headers: noopHeaders({ 'X-Teamver-S3-Prefix': 'p/special' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await fetchTeamverProjectS3Prefix('weird id/with slash', identity);

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe(
        'http://design-api:16000/api/v1/projects/weird%20id%2Fwith%20slash/access',
      );
    });
  });

  describe('resolveTeamverTenantRemoteStorage', () => {
    it('uses s3PrefixOverride and skips fetch entirely', async () => {
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      const result = await resolveTeamverTenantRemoteStorage(
        'proj-1',
        identity,
        tenant,
        fallback,
        '   override/prefix   ',
      );

      expect(result.s3Prefix).toBe('override/prefix');
      expect(tenant).toHaveBeenCalledWith('override/prefix');
      expect(fallback).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns fallback when identity is null', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      const result = await resolveTeamverTenantRemoteStorage(
        'proj-1',
        null,
        tenant,
        fallback,
      );

      expect(result.s3Prefix).toBeNull();
      expect(tenant).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns fallback when TEAMVER_DESIGN_API_URL is not configured', async () => {
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      const result = await resolveTeamverTenantRemoteStorage(
        'proj-1',
        identity,
        tenant,
        fallback,
      );

      expect(result.s3Prefix).toBeNull();
      expect(tenant).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns fallback when access check yields no prefix', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 403,
        headers: noopHeaders({}),
      });
      vi.stubGlobal('fetch', fetchMock);
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      const result = await resolveTeamverTenantRemoteStorage(
        'proj-1',
        identity,
        tenant,
        fallback,
      );

      expect(result.s3Prefix).toBeNull();
      expect(tenant).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('returns tenant-scoped storage when access check returns prefix', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 204,
        headers: noopHeaders({
          'X-Teamver-S3-Prefix': 'design/ws_a/user_b/proj_proj-1',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      const result = await resolveTeamverTenantRemoteStorage(
        'proj-1',
        identity,
        tenant,
        fallback,
      );

      expect(result.s3Prefix).toBe('design/ws_a/user_b/proj_proj-1');
      expect(tenant).toHaveBeenCalledWith('design/ws_a/user_b/proj_proj-1');
      expect(fallback).not.toHaveBeenCalled();
    });

    it('treats whitespace-only override as no override', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 204,
        headers: noopHeaders({
          'X-Teamver-S3-Prefix': 'design/from-server',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      const result = await resolveTeamverTenantRemoteStorage(
        'proj-1',
        identity,
        tenant,
        fallback,
        '   ',
      );

      expect(result.s3Prefix).toBe('design/from-server');
      expect(tenant).toHaveBeenCalledWith('design/from-server');
      expect(fallback).not.toHaveBeenCalled();
    });
  });
});
