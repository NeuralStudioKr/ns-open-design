import { encodeS3PathSegment } from './storage/aws-sigv4.js';

const SAFE_SEGMENT_RE = /[^a-zA-Z0-9._-]+/g;
const EXPORT_HASH_RE = /^[a-f0-9]{32,64}$/i;

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
