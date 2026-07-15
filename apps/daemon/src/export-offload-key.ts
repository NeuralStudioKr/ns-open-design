import { encodeS3PathSegment } from './storage/aws-sigv4.js';

const SAFE_SEGMENT_RE = /[^a-zA-Z0-9._-]+/g;
const EXPORT_HASH_RE = /^[a-f0-9]{32,64}$/i;

export function isExportOffloadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.OD_EXPORT_OFFLOAD_ENABLED ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function readPositiveIntEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = (env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export type ExportOffloadConfig =
  | {
      enabled: false;
      reason: 'flag_disabled' | 'missing_bucket' | 'missing_region';
    }
  | {
      enabled: true;
      bucket: string;
      region: string;
      prefix: string;
      presignTtlSec: number;
    };

export function resolveExportOffloadConfig(
  env: NodeJS.ProcessEnv = process.env,
): ExportOffloadConfig {
  if (!isExportOffloadEnabled(env)) return { enabled: false, reason: 'flag_disabled' };
  const bucket = (env.OD_EXPORT_OFFLOAD_BUCKET ?? env.OD_S3_BUCKET ?? '').trim();
  if (!bucket) return { enabled: false, reason: 'missing_bucket' };
  const region = (env.OD_EXPORT_OFFLOAD_REGION ?? env.OD_S3_REGION ?? env.AWS_REGION ?? '').trim();
  if (!region) return { enabled: false, reason: 'missing_region' };
  const prefix = (env.OD_EXPORT_OFFLOAD_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, '');
  return {
    enabled: true,
    bucket,
    region,
    prefix,
    presignTtlSec: readPositiveIntEnv(env, 'OD_EXPORT_OFFLOAD_PRESIGN_TTL_SEC', 300, 60, 900),
  };
}

function safeSegment(value: string, fallback: string): string {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(SAFE_SEGMENT_RE, '_')
    .replace(/_+/g, '_')
    .slice(0, 96);
  return cleaned || fallback;
}

function safeHash(value: string): string {
  const trimmed = String(value ?? '').trim().toLowerCase();
  if (EXPORT_HASH_RE.test(trimmed)) return trimmed;
  throw new Error('invalid export cache hash');
}

function safeExtension(filename: string): string {
  const ext = filename.trim().toLowerCase().match(/\.([a-z0-9]{1,12})$/)?.[1];
  return ext ? `.${ext}` : '';
}

export type ExportOffloadObjectKeyInput = {
  workspaceId: string;
  projectId: string;
  cacheKey: string;
  filename: string;
};

export function buildExportOffloadObjectKey(input: ExportOffloadObjectKeyInput): string {
  const workspace = safeSegment(input.workspaceId, 'workspace');
  const project = safeSegment(input.projectId, 'project');
  const hash = safeHash(input.cacheKey);
  const extension = safeExtension(input.filename);
  return [
    'exports',
    `ws_${encodeS3PathSegment(workspace)}`,
    `proj_${encodeS3PathSegment(project)}`,
    `${hash}${extension}`,
  ].join('/');
}
