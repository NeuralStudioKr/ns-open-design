import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildExportOffloadPresignedGetUrl,
  presignExportOffloadGet,
  putExportOffloadFileObject,
  putExportOffloadObject,
  type ExportOffloadStorage,
} from '../src/export-offload-store.js';

function enabledConfig(overrides: Partial<{
  bucket: string;
  region: string;
  prefix: string;
  presignTtlSec: number;
}> = {}) {
  return {
    enabled: true as const,
    bucket: overrides.bucket ?? 'teamver-design-data',
    region: overrides.region ?? 'us-east-1',
    prefix: overrides.prefix ?? '',
    presignTtlSec: overrides.presignTtlSec ?? 300,
  };
}

describe('export offload store', () => {
  it('returns disabled without touching storage when config is disabled', async () => {
    const storage: ExportOffloadStorage = {
      statObjectAtKey: vi.fn(),
      writeObjectAtKey: vi.fn(),
    };

    await expect(
      putExportOffloadObject(
        { key: 'exports/ws/proj/hash.pdf', body: 'pdf' },
        { config: { enabled: false, reason: 'flag_disabled' }, storage },
      ),
    ).resolves.toEqual({ status: 'disabled', reason: 'flag_disabled' });
    expect(storage.statObjectAtKey).not.toHaveBeenCalled();
    expect(storage.writeObjectAtKey).not.toHaveBeenCalled();
  });

  it('returns hit when an object with matching byte size already exists', async () => {
    const storage: ExportOffloadStorage = {
      statObjectAtKey: vi.fn(async () => ({
        path: 'hash.pdf',
        size: 3,
        mtimeMs: 1,
      })),
      writeObjectAtKey: vi.fn(),
    };

    await expect(
      putExportOffloadObject(
        { key: 'exports/ws/proj/hash.pdf', body: 'pdf' },
        { config: enabledConfig(), storage },
      ),
    ).resolves.toEqual({ status: 'hit', key: 'exports/ws/proj/hash.pdf', bytes: 3 });
    expect(storage.writeObjectAtKey).not.toHaveBeenCalled();
  });

  it('uploads with configured prefix when missing or size changed', async () => {
    const storage: ExportOffloadStorage = {
      statObjectAtKey: vi.fn(async () => null),
      writeObjectAtKey: vi.fn(async (key: string, body: Buffer) => ({
        path: key,
        size: body.byteLength,
        mtimeMs: 1,
      })),
    };

    await expect(
      putExportOffloadObject(
        { key: 'exports/ws/proj/hash.pdf', body: Buffer.from('pdf') },
        { config: enabledConfig({ prefix: 'teamver' }), storage },
      ),
    ).resolves.toEqual({ status: 'uploaded', key: 'teamver/exports/ws/proj/hash.pdf', bytes: 3 });
    expect(storage.writeObjectAtKey).toHaveBeenCalledWith(
      'teamver/exports/ws/proj/hash.pdf',
      Buffer.from('pdf'),
    );
  });

  it('does not duplicate the configured prefix when the key already includes it', async () => {
    const storage: ExportOffloadStorage = {
      statObjectAtKey: vi.fn(async () => null),
      writeObjectAtKey: vi.fn(async (key: string, body: Buffer) => ({
        path: key,
        size: body.byteLength,
        mtimeMs: 1,
      })),
    };

    await expect(
      putExportOffloadObject(
        { key: 'exports/ws/proj/hash.pdf', body: Buffer.from('pdf') },
        { config: enabledConfig({ prefix: 'exports' }), storage },
      ),
    ).resolves.toEqual({ status: 'uploaded', key: 'exports/ws/proj/hash.pdf', bytes: 3 });
    expect(storage.statObjectAtKey).toHaveBeenCalledWith('exports/ws/proj/hash.pdf');
    expect(storage.writeObjectAtKey).toHaveBeenCalledWith(
      'exports/ws/proj/hash.pdf',
      Buffer.from('pdf'),
    );
  });

  it('still uploads when HEAD/stat is forbidden but PUT succeeds', async () => {
    const storage: ExportOffloadStorage = {
      statObjectAtKey: vi.fn(async () => {
        throw new Error('S3 HEAD exports/ws/proj/hash.pdf → 403 Forbidden');
      }),
      writeObjectAtKey: vi.fn(async (key: string, body: Buffer) => ({
        path: key,
        size: body.byteLength,
        mtimeMs: 1,
      })),
    };

    await expect(
      putExportOffloadObject(
        { key: 'exports/ws/proj/hash.pdf', body: Buffer.from('pdf') },
        { config: enabledConfig({ prefix: 'exports' }), storage },
      ),
    ).resolves.toEqual({ status: 'uploaded', key: 'exports/ws/proj/hash.pdf', bytes: 3 });
    expect(storage.writeObjectAtKey).toHaveBeenCalledWith(
      'exports/ws/proj/hash.pdf',
      Buffer.from('pdf'),
    );
  });

  it('returns failed instead of throwing on storage errors', async () => {
    const storage: ExportOffloadStorage = {
      statObjectAtKey: vi.fn(async () => {
        throw new Error('s3 down');
      }),
      writeObjectAtKey: vi.fn(async () => {
        throw new Error('store disabled');
      }),
    };

    await expect(
      putExportOffloadObject(
        { key: 'exports/ws/proj/hash.pdf', body: 'pdf' },
        { config: enabledConfig(), storage },
      ),
    ).resolves.toEqual({
      status: 'failed',
      key: 'exports/ws/proj/hash.pdf',
      reason: 'stat failed: s3 down; write failed: store disabled',
    });
  });

  it('uploads file-backed cache entries and skips reads when S3 already has matching bytes', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'od-offload-file-'));
    const filePath = path.join(dir, 'deck.pdf');
    await writeFile(filePath, Buffer.from('pdf'));
    try {
      const hitStorage: ExportOffloadStorage = {
        statObjectAtKey: vi.fn(async () => ({
          path: 'exports/ws/proj/hash.pdf',
          size: 3,
          mtimeMs: 1,
        })),
        writeObjectAtKey: vi.fn(),
      };
      await expect(
        putExportOffloadFileObject(
          { key: 'exports/ws/proj/hash.pdf', filePath, bytes: 3 },
          { config: enabledConfig(), storage: hitStorage },
        ),
      ).resolves.toEqual({ status: 'hit', key: 'exports/ws/proj/hash.pdf', bytes: 3 });
      expect(hitStorage.writeObjectAtKey).not.toHaveBeenCalled();

      const uploadStorage: ExportOffloadStorage = {
        statObjectAtKey: vi.fn(async () => null),
        writeObjectAtKey: vi.fn(async (key: string, body: Buffer) => ({
          path: key,
          size: body.byteLength,
          mtimeMs: 1,
        })),
      };
      await expect(
        putExportOffloadFileObject(
          { key: 'exports/ws/proj/hash.pdf', filePath, bytes: 3 },
          { config: enabledConfig({ prefix: 'teamver' }), storage: uploadStorage },
        ),
      ).resolves.toEqual({ status: 'uploaded', key: 'teamver/exports/ws/proj/hash.pdf', bytes: 3 });
      expect(uploadStorage.writeObjectAtKey).toHaveBeenCalledWith(
        'teamver/exports/ws/proj/hash.pdf',
        Buffer.from('pdf'),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('builds a virtual-host S3 presigned GET URL', () => {
    const url = new URL(
      buildExportOffloadPresignedGetUrl({
        key: 'exports/ws/proj/hash.pdf',
        config: enabledConfig({ region: 'ap-northeast-2', presignTtlSec: 120 }),
        credentials: {
          accessKeyId: 'AKTEST',
          secretAccessKey: 'secret',
        },
        now: new Date('2026-07-15T00:00:00.000Z'),
      }),
    );

    expect(url.origin).toBe('https://teamver-design-data.s3.ap-northeast-2.amazonaws.com');
    expect(url.pathname).toBe('/exports/ws/proj/hash.pdf');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toBe('AKTEST/20260715/ap-northeast-2/s3/aws4_request');
    expect(url.searchParams.get('X-Amz-Date')).toBe('20260715T000000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not duplicate a matching prefix in presigned GET URLs', () => {
    const url = new URL(
      buildExportOffloadPresignedGetUrl({
        key: 'exports/ws/proj/hash.pdf',
        config: enabledConfig({ prefix: 'exports', region: 'ap-northeast-2' }),
        credentials: {
          accessKeyId: 'AKTEST',
          secretAccessKey: 'secret',
        },
        now: new Date('2026-07-15T00:00:00.000Z'),
      }),
    );

    expect(url.pathname).toBe('/exports/ws/proj/hash.pdf');
  });

  it('builds a path-style presigned GET URL for endpoint overrides', () => {
    const url = new URL(
      buildExportOffloadPresignedGetUrl({
        key: 'exports/ws/proj/hash.pdf',
        config: {
          ...enabledConfig({ prefix: 'teamver' }),
          endpoint: 'https://s3.internal.test',
        },
        credentials: {
          accessKeyId: 'ASIA_TEST',
          secretAccessKey: 'secret',
          sessionToken: 'session-token',
        },
        now: new Date('2026-07-15T00:00:00.000Z'),
      }),
    );

    expect(url.origin).toBe('https://s3.internal.test');
    expect(url.pathname).toBe('/teamver-design-data/teamver/exports/ws/proj/hash.pdf');
    expect(url.searchParams.get('X-Amz-Security-Token')).toBe('session-token');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('presigns a ready offload object with provider credentials', async () => {
    const result = await presignExportOffloadGet('exports/ws/proj/hash.pdf', {
      config: enabledConfig({ prefix: 'teamver', presignTtlSec: 180 }),
      credentialProvider: {
        usesImds: false,
        invalidate() {},
        async getCredentials() {
          return { accessKeyId: 'AKTEST', secretAccessKey: 'secret' };
        },
      },
      now: new Date('2026-07-15T00:00:00.000Z'),
      responseContentDisposition: 'attachment; filename="Deck.pdf"',
      responseContentType: 'application/pdf',
    });

    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.key).toBe('teamver/exports/ws/proj/hash.pdf');
      expect(result.expiresInSec).toBe(180);
      const url = new URL(result.url);
      expect(url.pathname).toBe('/teamver/exports/ws/proj/hash.pdf');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('180');
      expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="Deck.pdf"');
      expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
    }
  });

  it('AWS-encodes query values and keeps ASCII-only disposition free of filename*', () => {
    const disposition = 'attachment; filename="___ AI ___.pdf"';
    const url = new URL(
      buildExportOffloadPresignedGetUrl({
        key: 'exports/ws/proj/hash.pdf',
        config: enabledConfig({ region: 'ap-northeast-2' }),
        credentials: {
          accessKeyId: 'AKTEST',
          secretAccessKey: 'secret',
        },
        now: new Date('2026-07-15T00:00:00.000Z'),
        responseContentDisposition: disposition,
      }),
    );

    expect(url.searchParams.get('response-content-disposition')).toBe(disposition);
    expect(url.search).not.toContain('filename%2A');
    expect(url.search).not.toContain('filename*');
  });

  it('returns disabled or failed instead of throwing from presign', async () => {
    await expect(
      presignExportOffloadGet('exports/ws/proj/hash.pdf', {
        config: { enabled: false, reason: 'flag_disabled' },
      }),
    ).resolves.toEqual({ status: 'disabled', reason: 'flag_disabled' });

    await expect(
      presignExportOffloadGet('exports/ws/proj/hash.pdf', {
        config: enabledConfig(),
        credentialProvider: {
          usesImds: false,
          invalidate() {},
          async getCredentials() {
            throw new Error('no creds');
          },
        },
      }),
    ).resolves.toEqual({
      status: 'failed',
      key: 'exports/ws/proj/hash.pdf',
      reason: 'no creds',
    });
  });
});
