import { describe, expect, it } from 'vitest';

import {
  buildExportOffloadObjectKey,
  isExportOffloadEnabled,
  isExportOffloadRequired,
  resolveExportOffloadConfig,
} from '../src/export-offload-key.js';

describe('export offload object key', () => {
  it('keeps export offload disabled unless the feature flag is explicit', () => {
    expect(isExportOffloadEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isExportOffloadEnabled({ OD_EXPORT_OFFLOAD_ENABLED: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isExportOffloadEnabled({ OD_EXPORT_OFFLOAD_ENABLED: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isExportOffloadEnabled({ OD_EXPORT_OFFLOAD_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('keeps export offload fallback allowed unless required is explicit', () => {
    expect(isExportOffloadRequired({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isExportOffloadRequired({ OD_EXPORT_OFFLOAD_REQUIRED: '0' } as NodeJS.ProcessEnv)).toBe(false);
    expect(isExportOffloadRequired({ OD_EXPORT_OFFLOAD_REQUIRED: '1' } as NodeJS.ProcessEnv)).toBe(true);
    expect(isExportOffloadRequired({ OD_EXPORT_OFFLOAD_REQUIRED: 'on' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('resolves offload config only when required S3 env is present', () => {
    expect(resolveExportOffloadConfig({} as NodeJS.ProcessEnv)).toEqual({
      enabled: false,
      reason: 'flag_disabled',
    });
    expect(resolveExportOffloadConfig({ OD_EXPORT_OFFLOAD_ENABLED: '1' } as NodeJS.ProcessEnv)).toEqual({
      enabled: false,
      reason: 'missing_bucket',
    });
    expect(
      resolveExportOffloadConfig({
        OD_EXPORT_OFFLOAD_ENABLED: '1',
        OD_S3_BUCKET: 'teamver-design-data',
      } as NodeJS.ProcessEnv),
    ).toEqual({ enabled: false, reason: 'missing_region' });
    expect(
      resolveExportOffloadConfig({
        OD_EXPORT_OFFLOAD_ENABLED: '1',
        OD_S3_BUCKET: 'teamver-design-data',
        AWS_REGION: 'us-east-1',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      enabled: true,
      bucket: 'teamver-design-data',
      region: 'us-east-1',
      prefix: '',
      presignTtlSec: 300,
    });
  });

  it('supports dedicated export offload env and clamps presign ttl', () => {
    expect(
      resolveExportOffloadConfig({
        OD_EXPORT_OFFLOAD_ENABLED: '1',
        OD_EXPORT_OFFLOAD_BUCKET: 'exports-bucket',
        OD_EXPORT_OFFLOAD_REGION: 'ap-northeast-2',
        OD_EXPORT_OFFLOAD_ENDPOINT: 'https://s3.internal.test/',
        OD_EXPORT_OFFLOAD_PREFIX: '/teamver-design/',
        OD_EXPORT_OFFLOAD_PRESIGN_TTL_SEC: '9999',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      enabled: true,
      bucket: 'exports-bucket',
      region: 'ap-northeast-2',
      endpoint: 'https://s3.internal.test',
      prefix: 'teamver-design',
      presignTtlSec: 900,
    });
  });

  it('builds a tenant/project scoped exports key with the cache hash', () => {
    expect(
      buildExportOffloadObjectKey({
        workspaceId: 'W-TEAMVER',
        projectId: 'proj-123',
        cacheKey: 'a'.repeat(64),
        filename: 'Deck.PDF',
      }),
    ).toBe(`exports/ws_W-TEAMVER/proj_proj-123/${'a'.repeat(64)}.pdf`);
  });

  it('sanitizes scope segments and preserves only the filename extension', () => {
    expect(
      buildExportOffloadObjectKey({
        workspaceId: ' workspace / with spaces ',
        projectId: '../project:deck',
        cacheKey: 'B'.repeat(32),
        filename: 'Quarterly Deck (final).html',
      }),
    ).toBe(`exports/ws_workspace_with_spaces/proj_.._project_deck/${'b'.repeat(32)}.html`);
  });

  it('rejects non-hash cache keys to avoid user-controlled object names', () => {
    expect(() =>
      buildExportOffloadObjectKey({
        workspaceId: 'ws1',
        projectId: 'proj1',
        cacheKey: '../../artifact',
        filename: 'deck.pdf',
      }),
    ).toThrow('invalid export cache hash');
  });
});
