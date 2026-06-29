import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearTeamverProjectAccessCache } from '../src/teamver-project-access.js';
import {
  fetchTeamverProjectS3Prefix,
  resolveTeamverTenantRemoteStorage,
} from '../src/storage/teamver-project-storage-meta.js';
import { verifyTeamverProjectAccess } from '../src/teamver-project-access.js';
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
    clearTeamverProjectAccessCache();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('verifyTeamverProjectAccess grant cache', () => {
    it('rejects daemon collection route slugs without legacy auto-register', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        verifyTeamverProjectAccess('recent', identity),
      ).resolves.toEqual({ ok: false, kind: 'denied' });
      await expect(
        verifyTeamverProjectAccess('cover-hints', identity),
      ).resolves.toEqual({ ok: false, kind: 'denied' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not cache 204 grants that omit the s3 prefix header', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 204,
        headers: noopHeaders({}),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(verifyTeamverProjectAccess('proj-1', identity)).resolves.toEqual({
        ok: true,
        s3Prefix: null,
      });
      await expect(verifyTeamverProjectAccess('proj-1', identity)).resolves.toEqual({
        ok: true,
        s3Prefix: null,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
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
      const call = fetchMock.mock.calls[0];
      expect(call).toBeDefined();
      const [url, init] = call as [string, RequestInit];
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

      const call = fetchMock.mock.calls[0];
      expect(call).toBeDefined();
      const [url] = call as [string, RequestInit];
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

    it('rejects managed storage when identity is null', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      await expect(
        resolveTeamverTenantRemoteStorage('proj-1', null, tenant, fallback),
      ).rejects.toThrow('teamver_project_identity_required');
      expect(tenant).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
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

    it('rejects managed storage when access check yields no prefix', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 403,
        headers: noopHeaders({}),
      });
      vi.stubGlobal('fetch', fetchMock);
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      await expect(
        resolveTeamverTenantRemoteStorage('proj-1', identity, tenant, fallback),
      ).rejects.toThrow('teamver_project_s3_prefix_required');
      expect(tenant).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('uses s3PrefixOverride when access is denied (create race)', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 404,
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
        'design/ws_hint/user_hint/proj_proj-1/',
      );

      expect(result.s3Prefix).toBe('design/ws_hint/user_hint/proj_proj-1/');
      expect(tenant).toHaveBeenCalledWith('design/ws_hint/user_hint/proj_proj-1/');
      expect(fallback).not.toHaveBeenCalled();
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

    it('rejects a managed prefix override that differs from registry SSOT', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 204,
        headers: noopHeaders({
          'X-Teamver-S3-Prefix': 'design/ws_a/user_b/proj_proj-1',
        }),
      }));
      const tenant = vi.fn((prefix: string) => fakeStorage(`tenant:${prefix}`));
      const fallback = vi.fn(() => fakeStorage('fallback'));

      await expect(
        resolveTeamverTenantRemoteStorage(
          'proj-1',
          identity,
          tenant,
          fallback,
          'design/ws_other/user_other/proj_proj-1',
        ),
      ).rejects.toThrow('teamver_project_s3_prefix_mismatch');
      expect(tenant).not.toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('uses request override when access is granted but prefix header is missing', async () => {
      vi.stubEnv('TEAMVER_DESIGN_API_URL', 'http://design-api:16000');
      const fetchMock: FetchMock = vi.fn().mockResolvedValue({
        status: 204,
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
        'design/ws_hint/user_hint/proj_proj-1/',
      );

      expect(result.s3Prefix).toBe('design/ws_hint/user_hint/proj_proj-1/');
      expect(tenant).toHaveBeenCalledWith('design/ws_hint/user_hint/proj_proj-1/');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
