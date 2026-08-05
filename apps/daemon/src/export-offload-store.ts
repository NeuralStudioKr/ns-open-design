import { readFile, stat } from 'node:fs/promises';
import type { ProjectFileMeta } from './storage/project-storage.js';
import { S3ProjectStorage } from './storage/project-storage.js';
import type { SigV4Credentials } from './storage/aws-sigv4.js';
import { buildS3PresignedGetUrl } from './storage/s3-presign-get.js';
import { createS3CredentialProvider } from './storage/s3-credential-provider.js';
import type { ExportOffloadConfig, ExportOffloadDisabledReason } from './export-offload-key.js';
import { resolveExportOffloadConfig } from './export-offload-key.js';

export type ExportOffloadStorage = Pick<S3ProjectStorage, 'statObjectAtKey' | 'writeObjectAtKey'>;

export type ExportOffloadPutResult =
  | { status: 'disabled'; reason: ExportOffloadDisabledReason }
  | { status: 'hit'; key: string; bytes: number }
  | { status: 'uploaded'; key: string; bytes: number }
  | { status: 'failed'; key: string; reason: string };

export type ExportOffloadPresignResult =
  | { status: 'disabled'; reason: ExportOffloadDisabledReason }
  | { status: 'ready'; key: string; url: string; expiresInSec: number }
  | { status: 'failed'; key: string; reason: string };

export type ExportOffloadPutInput = {
  key: string;
  body: Buffer | string;
  /** Stored on the S3 object so GET/presign can return Korean filenames. */
  contentType?: string;
  contentDisposition?: string;
};

export type ExportOffloadFileInput = {
  key: string;
  filePath: string;
  bytes?: number;
  contentType?: string;
  contentDisposition?: string;
};

export type ExportOffloadPresignInput = {
  key: string;
  config: Extract<ExportOffloadConfig, { enabled: true }>;
  credentials: SigV4Credentials;
  now?: Date;
  responseContentDisposition?: string;
  responseContentType?: string;
};

function prefixedOffloadKey(prefix: string, key: string): string {
  const root = prefix.trim().replace(/^\/+|\/+$/g, '');
  const normalized = key.trim().replace(/^\/+/, '');
  if (root && (normalized === root || normalized.startsWith(`${root}/`))) return normalized;
  return root ? `${root}/${normalized}` : normalized;
}

function exportOffloadObjectHeaders(input: {
  contentType?: string;
  contentDisposition?: string;
}): { contentType?: string; contentDisposition?: string } | undefined {
  const contentType = input.contentType?.trim();
  const contentDisposition = input.contentDisposition?.trim();
  if (!contentType && !contentDisposition) return undefined;
  return {
    ...(contentType ? { contentType } : {}),
    ...(contentDisposition ? { contentDisposition } : {}),
  };
}

function exportOffloadHeadersMatch(
  existing: { contentType?: string; contentDisposition?: string },
  wanted: { contentType?: string; contentDisposition?: string } | undefined,
): boolean {
  if (!wanted) return true;
  if (wanted.contentType && existing.contentType !== wanted.contentType) return false;
  if (wanted.contentDisposition && existing.contentDisposition !== wanted.contentDisposition) {
    return false;
  }
  return true;
}

export function buildExportOffloadPresignedGetUrl(input: ExportOffloadPresignInput): string {
  return buildS3PresignedGetUrl({
    key: prefixedOffloadKey(input.config.prefix, input.key),
    target: {
      bucket: input.config.bucket,
      region: input.config.region,
      ...(input.config.endpoint ? { endpoint: input.config.endpoint } : {}),
      expiresInSec: input.config.presignTtlSec,
    },
    credentials: input.credentials,
    ...(input.now ? { now: input.now } : {}),
    ...(input.responseContentDisposition
      ? { responseContentDisposition: input.responseContentDisposition }
      : {}),
    ...(input.responseContentType ? { responseContentType: input.responseContentType } : {}),
  });
}

export function createExportOffloadStorage(
  config: Extract<ExportOffloadConfig, { enabled: true }>,
): ExportOffloadStorage {
  return new S3ProjectStorage({
    bucket: config.bucket,
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    prefix: '',
    credentialProvider: createS3CredentialProvider(),
  });
}

export async function putExportOffloadObject(
  input: ExportOffloadPutInput,
  options: {
    config?: ExportOffloadConfig;
    storage?: ExportOffloadStorage;
  } = {},
): Promise<ExportOffloadPutResult> {
  const config = options.config ?? resolveExportOffloadConfig();
  if (!config.enabled) return { status: 'disabled', reason: config.reason };
  const key = prefixedOffloadKey(config.prefix, input.key);
  const body = typeof input.body === 'string' ? Buffer.from(input.body, 'utf8') : input.body;
  const storage = options.storage ?? createExportOffloadStorage(config);
  const objectHeaders = exportOffloadObjectHeaders(input);
  let statReason: string | undefined;
  try {
    const existing = await storage.statObjectAtKey(key).catch((err) => {
      statReason = err instanceof Error ? err.message : String(err);
      return null;
    });
    // Skip PUT when bytes and download headers already match.
    if (
      existing
      && existing.size === body.byteLength
      && exportOffloadHeadersMatch(existing, objectHeaders)
    ) {
      return { status: 'hit', key, bytes: existing.size };
    }
    const written: ProjectFileMeta = await storage.writeObjectAtKey(key, body, objectHeaders ?? {});
    return { status: 'uploaded', key, bytes: written.size };
  } catch (err) {
    const writeReason = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      key,
      reason: statReason ? `stat failed: ${statReason}; write failed: ${writeReason}` : writeReason,
    };
  }
}

export async function putExportOffloadFileObject(
  input: ExportOffloadFileInput,
  options: {
    config?: ExportOffloadConfig;
    storage?: ExportOffloadStorage;
  } = {},
): Promise<ExportOffloadPutResult> {
  const config = options.config ?? resolveExportOffloadConfig();
  if (!config.enabled) return { status: 'disabled', reason: config.reason };
  const key = prefixedOffloadKey(config.prefix, input.key);
  const storage = options.storage ?? createExportOffloadStorage(config);
  const objectHeaders = exportOffloadObjectHeaders(input);
  let statReason: string | undefined;
  try {
    const expectedBytes =
      Number.isFinite(input.bytes) && input.bytes !== undefined && input.bytes >= 0
        ? Math.floor(input.bytes)
        : (await stat(input.filePath)).size;
    const existing = await storage.statObjectAtKey(key).catch((err) => {
      statReason = err instanceof Error ? err.message : String(err);
      return null;
    });
    if (
      existing
      && existing.size === expectedBytes
      && exportOffloadHeadersMatch(existing, objectHeaders)
    ) {
      return { status: 'hit', key, bytes: existing.size };
    }
    const body = await readFile(input.filePath);
    const written: ProjectFileMeta = await storage.writeObjectAtKey(key, body, objectHeaders ?? {});
    return { status: 'uploaded', key, bytes: written.size };
  } catch (err) {
    const writeReason = err instanceof Error ? err.message : String(err);
    return {
      status: 'failed',
      key,
      reason: statReason ? `stat failed: ${statReason}; write failed: ${writeReason}` : writeReason,
    };
  }
}

export async function presignExportOffloadGet(
  key: string,
  options: {
    config?: ExportOffloadConfig;
    credentialProvider?: ReturnType<typeof createS3CredentialProvider>;
    now?: Date;
    responseContentDisposition?: string;
    responseContentType?: string;
  } = {},
): Promise<ExportOffloadPresignResult> {
  const config = options.config ?? resolveExportOffloadConfig();
  if (!config.enabled) return { status: 'disabled', reason: config.reason };
  const fullKey = prefixedOffloadKey(config.prefix, key);
  try {
    const provider = options.credentialProvider ?? createS3CredentialProvider();
    const credentials = await provider.getCredentials();
    return {
      status: 'ready',
      key: fullKey,
      url: buildExportOffloadPresignedGetUrl({
        key,
        config,
        credentials,
        ...(options.now ? { now: options.now } : {}),
        ...(options.responseContentDisposition
          ? { responseContentDisposition: options.responseContentDisposition }
          : {}),
        ...(options.responseContentType ? { responseContentType: options.responseContentType } : {}),
      }),
      expiresInSec: config.presignTtlSec,
    };
  } catch (err) {
    return {
      status: 'failed',
      key: fullKey,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
