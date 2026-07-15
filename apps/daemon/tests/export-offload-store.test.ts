import { describe, expect, it, vi } from 'vitest';

import {
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

  it('returns failed instead of throwing on storage errors', async () => {
    const storage: ExportOffloadStorage = {
      statObjectAtKey: vi.fn(async () => {
        throw new Error('s3 down');
      }),
      writeObjectAtKey: vi.fn(),
    };

    await expect(
      putExportOffloadObject(
        { key: 'exports/ws/proj/hash.pdf', body: 'pdf' },
        { config: enabledConfig(), storage },
      ),
    ).resolves.toEqual({ status: 'failed', key: 'exports/ws/proj/hash.pdf', reason: 's3 down' });
  });
});
