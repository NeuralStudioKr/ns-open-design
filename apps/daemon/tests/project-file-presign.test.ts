import { describe, expect, it, vi } from 'vitest';

import {
  mintProjectFilePresignedGet,
  normalizeProjectFilePresignRelpath,
  resolveProjectFilePresignConfig,
} from '../src/project-file-presign.js';
import { buildS3PresignedGetUrl } from '../src/storage/s3-presign-get.js';

vi.mock('../src/storage/teamver-project-storage-meta.js', () => ({
  TeamverTenantStorageResolutionError: class TeamverTenantStorageResolutionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'TeamverTenantStorageResolutionError';
    }
  },
  resolveTeamverTenantRemoteStorage: vi.fn(async (
    _projectId: string,
    _identity: unknown,
    createTenantRemote: (prefix: string) => unknown,
  ) => {
    const s3Prefix = 'design/ws_1/user_2/proj_abc/';
    return { remote: createTenantRemote(s3Prefix), s3Prefix };
  }),
}));

describe('project file presign', () => {
  it('normalizes and rejects unsafe relpaths', () => {
    expect(normalizeProjectFilePresignRelpath('assets/a.png')).toBe('assets/a.png');
    expect(normalizeProjectFilePresignRelpath('/assets/a.png')).toBe('assets/a.png');
    expect(normalizeProjectFilePresignRelpath('../secret')).toBeNull();
    expect(normalizeProjectFilePresignRelpath('')).toBeNull();
  });

  it('disables when project storage is local', () => {
    expect(
      resolveProjectFilePresignConfig({
        OD_PROJECT_STORAGE: 'local',
        OD_S3_BUCKET: 'bucket',
        OD_S3_REGION: 'us-east-1',
      }),
    ).toEqual({ enabled: false, reason: 'local_storage' });
  });

  it('enables with short TTL when S3 project storage is configured', () => {
    expect(
      resolveProjectFilePresignConfig({
        OD_PROJECT_STORAGE: 's3',
        OD_S3_BUCKET: 'teamver-design-data',
        OD_S3_REGION: 'ap-northeast-2',
        OD_PROJECT_FILE_PRESIGN_TTL_SEC: '90',
      }),
    ).toEqual({
      enabled: true,
      bucket: 'teamver-design-data',
      region: 'ap-northeast-2',
      presignTtlSec: 90,
    });
  });

  it('mints a virtual-host S3 GET URL for a tenant-scoped object', async () => {
    const now = new Date('2026-08-05T06:00:00.000Z');
    const result = await mintProjectFilePresignedGet({
      projectId: 'proj_abc',
      relpath: 'msfole2d-drawing-2026-08-05T05-00-00-000Z.png',
      identity: { userId: 'u1', workspaceId: 'ws_1' },
      env: {
        OD_PROJECT_STORAGE: 's3',
        OD_S3_BUCKET: 'teamver-design-data',
        OD_S3_REGION: 'ap-northeast-2',
        OD_S3_ACCESS_KEY_ID: 'AKIATEST',
        OD_S3_SECRET_ACCESS_KEY: 'secret',
        OD_PROJECT_FILE_PRESIGN_TTL_SEC: '120',
      },
      now,
      credentialProvider: {
        usesImds: false,
        invalidate: () => undefined,
        getCredentials: async () => ({
          accessKeyId: 'AKIATEST',
          secretAccessKey: 'secret',
        }),
      },
      statRemoteFile: async () => ({ size: 128 }),
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.path).toBe('msfole2d-drawing-2026-08-05T05-00-00-000Z.png');
    expect(result.key).toBe(
      'design/ws_1/user_2/proj_abc/msfole2d-drawing-2026-08-05T05-00-00-000Z.png',
    );
    expect(result.expiresInSec).toBe(120);
    expect(result.url).toContain('https://teamver-design-data.s3.ap-northeast-2.amazonaws.com/');
    expect(result.url).toContain('X-Amz-Expires=120');
    expect(result.url).toContain('X-Amz-Signature=');
    expect(result.rawUrl).toContain('/api/projects/proj_abc/raw/');
  });

  it('falls back to NFD S3 key when caller requested NFC Hangul path', async () => {
    const nfc = 'msilvcf5-다운로드.jpeg'.normalize('NFC');
    const nfd = 'msilvcf5-다운로드.jpeg'.normalize('NFD');
    expect(nfc).not.toBe(nfd);
    const stats = vi.fn(async (relpath: string) => {
      // S3 only has the NFD-encoded object (older upload predating sanitizeName NFC).
      return relpath === nfd ? { size: 512 } : null;
    });
    const result = await mintProjectFilePresignedGet({
      projectId: 'proj_abc',
      relpath: nfc,
      identity: { userId: 'u1', workspaceId: 'ws_1' },
      env: {
        OD_PROJECT_STORAGE: 's3',
        OD_S3_BUCKET: 'teamver-design-data',
        OD_S3_REGION: 'ap-northeast-2',
        OD_S3_ACCESS_KEY_ID: 'AKIATEST',
        OD_S3_SECRET_ACCESS_KEY: 'secret',
      },
      credentialProvider: {
        usesImds: false,
        invalidate: () => undefined,
        getCredentials: async () => ({
          accessKeyId: 'AKIATEST',
          secretAccessKey: 'secret',
        }),
      },
      statRemoteFile: stats,
    });

    expect(stats.mock.calls.map((call) => call[0])).toEqual([nfc, nfd]);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    // Presign key + response path reflect the actual on-S3 form so the FE
    // uses that same form for /raw/ subsequent fetches.
    expect(result.path).toBe(nfd);
    expect(result.key).toContain(nfd);
    expect(result.rawUrl).toContain(encodeURIComponent(nfd));
  });

  it('returns not_found when the object is missing', async () => {
    const result = await mintProjectFilePresignedGet({
      projectId: 'proj_abc',
      relpath: 'gone.png',
      identity: { userId: 'u1', workspaceId: 'ws_1' },
      env: {
        OD_PROJECT_STORAGE: 's3',
        OD_S3_BUCKET: 'teamver-design-data',
        OD_S3_REGION: 'ap-northeast-2',
        OD_S3_ACCESS_KEY_ID: 'AKIATEST',
        OD_S3_SECRET_ACCESS_KEY: 'secret',
      },
      credentialProvider: {
        usesImds: false,
        invalidate: () => undefined,
        getCredentials: async () => ({
          accessKeyId: 'AKIATEST',
          secretAccessKey: 'secret',
        }),
      },
      statRemoteFile: async () => null,
    });
    expect(result).toMatchObject({ status: 'not_found', path: 'gone.png' });
  });

  it('builds path-style URLs for endpoint overrides', () => {
    const url = buildS3PresignedGetUrl({
      key: 'design/ws/proj/a.png',
      target: {
        bucket: 'local-bucket',
        region: 'us-east-1',
        endpoint: 'http://127.0.0.1:9000',
        expiresInSec: 60,
      },
      credentials: {
        accessKeyId: 'AKIATEST',
        secretAccessKey: 'secret',
      },
      now: new Date('2026-08-05T06:00:00.000Z'),
    });
    expect(url.startsWith('http://127.0.0.1:9000/local-bucket/design/ws/proj/a.png?')).toBe(true);
  });
});
