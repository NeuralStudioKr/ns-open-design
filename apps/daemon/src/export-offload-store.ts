import { createHash, createHmac } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import type { ProjectFileMeta } from './storage/project-storage.js';
import { S3ProjectStorage } from './storage/project-storage.js';
import { encodeS3PathSegment, type SigV4Credentials } from './storage/aws-sigv4.js';
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
};

export type ExportOffloadFileInput = {
  key: string;
  filePath: string;
  bytes?: number;
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
  return root ? `${root}/${normalized}` : normalized;
}

function formatAmzDate(d: Date): string {
  const iso = d.toISOString().replace(/[-:]/g, '');
  return `${iso.slice(0, 15)}Z`;
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function endpointBase(config: Extract<ExportOffloadConfig, { enabled: true }>): string {
  const endpoint = (config.endpoint ?? '').trim();
  if (endpoint) return endpoint.replace(/\/+$/, '');
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
}

function canonicalPathForKey(
  config: Extract<ExportOffloadConfig, { enabled: true }>,
  key: string,
): { host: string; path: string; base: string } {
  const base = endpointBase(config);
  const host = new URL(base).host;
  const objectKey = prefixedOffloadKey(config.prefix, key);
  const encodedKey = objectKey.split('/').filter(Boolean).map(encodeS3PathSegment).join('/');
  if ((config.endpoint ?? '').trim()) {
    return {
      base,
      host,
      path: `/${[config.bucket, encodedKey].filter(Boolean).join('/')}`,
    };
  }
  return {
    base,
    host,
    path: encodedKey ? `/${encodedKey}` : '/',
  };
}

export function buildExportOffloadPresignedGetUrl(input: ExportOffloadPresignInput): string {
  const now = input.now ?? new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.config.region}/s3/aws4_request`;
  const { base, host, path } = canonicalPathForKey(input.config, input.key);
  const params: Array<[string, string]> = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${input.credentials.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(input.config.presignTtlSec)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (input.responseContentDisposition) {
    params.push(['response-content-disposition', input.responseContentDisposition]);
  }
  if (input.responseContentType) {
    params.push(['response-content-type', input.responseContentType]);
  }
  if (input.credentials.sessionToken) {
    params.push(['X-Amz-Security-Token', input.credentials.sessionToken]);
  }
  params.sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalQuery = params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const canonicalRequest = [
    'GET',
    path,
    canonicalQuery,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${input.credentials.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.config.region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `${base}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
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
  try {
    const existing = await storage.statObjectAtKey(key);
    if (existing && existing.size === body.byteLength) {
      return { status: 'hit', key, bytes: existing.size };
    }
    const written: ProjectFileMeta = await storage.writeObjectAtKey(key, body);
    return { status: 'uploaded', key, bytes: written.size };
  } catch (err) {
    return {
      status: 'failed',
      key,
      reason: err instanceof Error ? err.message : String(err),
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
  try {
    const expectedBytes =
      Number.isFinite(input.bytes) && input.bytes !== undefined && input.bytes >= 0
        ? Math.floor(input.bytes)
        : (await stat(input.filePath)).size;
    const existing = await storage.statObjectAtKey(key);
    if (existing && existing.size === expectedBytes) {
      return { status: 'hit', key, bytes: existing.size };
    }
    const body = await readFile(input.filePath);
    const written: ProjectFileMeta = await storage.writeObjectAtKey(key, body);
    return { status: 'uploaded', key, bytes: written.size };
  } catch (err) {
    return {
      status: 'failed',
      key,
      reason: err instanceof Error ? err.message : String(err),
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
