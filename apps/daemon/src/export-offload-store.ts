import type { ProjectFileMeta } from './storage/project-storage.js';
import { S3ProjectStorage } from './storage/project-storage.js';
import { createS3CredentialProvider } from './storage/s3-credential-provider.js';
import type { ExportOffloadConfig, ExportOffloadDisabledReason } from './export-offload-key.js';
import { resolveExportOffloadConfig } from './export-offload-key.js';

export type ExportOffloadStorage = Pick<S3ProjectStorage, 'statObjectAtKey' | 'writeObjectAtKey'>;

export type ExportOffloadPutResult =
  | { status: 'disabled'; reason: ExportOffloadDisabledReason }
  | { status: 'hit'; key: string; bytes: number }
  | { status: 'uploaded'; key: string; bytes: number }
  | { status: 'failed'; key: string; reason: string };

export type ExportOffloadPutInput = {
  key: string;
  body: Buffer | string;
};

function prefixedOffloadKey(prefix: string, key: string): string {
  const root = prefix.trim().replace(/^\/+|\/+$/g, '');
  const normalized = key.trim().replace(/^\/+/, '');
  return root ? `${root}/${normalized}` : normalized;
}

export function createExportOffloadStorage(
  config: Extract<ExportOffloadConfig, { enabled: true }>,
): ExportOffloadStorage {
  return new S3ProjectStorage({
    bucket: config.bucket,
    region: config.region,
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
