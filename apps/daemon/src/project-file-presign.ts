import { buildProjectRawFileUrl } from '@open-design/contracts';

import {
  isTrustedBackendCaller,
  readTeamverIdentityFromRequest,
  readTeamverS3PrefixFromRequest,
  type TeamverRequestIdentity,
} from './teamver-project-access.js';
import { createS3CredentialProvider } from './storage/s3-credential-provider.js';
import { S3ProjectStorage, StorageError } from './storage/project-storage.js';
import { buildS3PresignedGetUrl } from './storage/s3-presign-get.js';
import { TenantScopedProjectStorage } from './storage/tenant-scoped-project-storage.js';
import {
  resolveTeamverTenantRemoteStorage,
  TeamverTenantStorageResolutionError,
} from './storage/teamver-project-storage-meta.js';
import type { Request } from 'express';

export type ProjectFilePresignDisabledReason =
  | 'flag_disabled'
  | 'local_storage'
  | 'missing_bucket'
  | 'missing_region';

export type ProjectFilePresignConfig =
  | { enabled: false; reason: ProjectFilePresignDisabledReason }
  | {
      enabled: true;
      bucket: string;
      region: string;
      prefix?: string;
      endpoint?: string;
      presignTtlSec: number;
    };

export type ProjectFilePresignResult =
  | {
      status: 'ready';
      path: string;
      key: string;
      url: string;
      expiresInSec: number;
      expiresAt: string;
      rawUrl: string;
    }
  | {
      status: 'disabled';
      path: string;
      rawUrl: string;
      reason: ProjectFilePresignDisabledReason | string;
    }
  | {
      status: 'not_found';
      path: string;
      rawUrl: string;
    }
  | {
      status: 'failed';
      path: string;
      rawUrl: string;
      reason: string;
    };

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

function isTruthyEnv(raw: string | undefined): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function isFalsyEnv(raw: string | undefined): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  return value === '0' || value === 'false' || value === 'no' || value === 'off';
}

export function normalizeProjectFilePresignRelpath(relpath: unknown): string | null {
  if (typeof relpath !== 'string') return null;
  const normalized = relpath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;
  if (normalized.split('/').some((seg) => !seg || seg === '.' || seg === '..')) return null;
  return normalized;
}

/**
 * NFC/NFD path candidates for byte-exact S3 lookups. Hangul filenames uploaded
 * from macOS often persist NFD, while the FE / model / URL pipeline uses NFC —
 * probing both forms lets old objects presign successfully.
 */
function presignPathCandidates(relpath: string): string[] {
  const raw = String(relpath || '');
  const out = new Set<string>([raw]);
  try {
    const nfc = raw.normalize('NFC');
    if (nfc !== raw) out.add(nfc);
  } catch { /* ignore */ }
  try {
    const nfd = raw.normalize('NFD');
    if (nfd !== raw) out.add(nfd);
  } catch { /* ignore */ }
  return [...out];
}

/**
 * Project-file image/media GET presign. Enabled whenever project storage is S3
 * unless explicitly disabled via OD_PROJECT_FILE_PRESIGN_ENABLED=0.
 */
export function resolveProjectFilePresignConfig(
  env: NodeJS.ProcessEnv = process.env,
): ProjectFilePresignConfig {
  if (isFalsyEnv(env.OD_PROJECT_FILE_PRESIGN_ENABLED)) {
    return { enabled: false, reason: 'flag_disabled' };
  }
  const kind = (env.OD_PROJECT_STORAGE ?? 'local').trim().toLowerCase();
  if (kind !== 's3' && !isTruthyEnv(env.OD_PROJECT_FILE_PRESIGN_ENABLED)) {
    return { enabled: false, reason: 'local_storage' };
  }
  const bucket = (env.OD_S3_BUCKET ?? '').trim();
  if (!bucket) return { enabled: false, reason: 'missing_bucket' };
  const region = (env.OD_S3_REGION ?? env.AWS_REGION ?? '').trim();
  if (!region) return { enabled: false, reason: 'missing_region' };
  const prefix = (env.OD_S3_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, '');
  const endpoint = (env.OD_S3_ENDPOINT ?? '').trim().replace(/\/+$/, '');
  return {
    enabled: true,
    bucket,
    region,
    ...(prefix ? { prefix } : {}),
    ...(endpoint ? { endpoint } : {}),
    // Short TTL: browser img loads are immediate; mint again on refresh.
    presignTtlSec: readPositiveIntEnv(env, 'OD_PROJECT_FILE_PRESIGN_TTL_SEC', 120, 60, 300),
  };
}

function buildRawUrl(projectId: string, relpath: string): string {
  return (
    buildProjectRawFileUrl('', projectId, relpath)
    ?? `/api/projects/${encodeURIComponent(projectId)}/raw/${relpath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`
  );
}

export async function mintProjectFilePresignedGet(input: {
  projectId: string;
  relpath: string;
  identity?: TeamverRequestIdentity | null;
  s3PrefixOverride?: string | null;
  trustOverride?: boolean;
  env?: NodeJS.ProcessEnv;
  now?: Date;
  credentialProvider?: ReturnType<typeof createS3CredentialProvider>;
  /** Test seam — skip HEAD when injecting a fixed key. */
  resolveObjectKey?: (args: {
    storage: S3ProjectStorage;
    projectId: string;
    relpath: string;
    s3Prefix: string | null;
  }) => string;
  /** Test seam — inject remote.statFile. */
  statRemoteFile?: (relpath: string) => Promise<{ size: number } | null>;
}): Promise<ProjectFilePresignResult> {
  const env = input.env ?? process.env;
  const path = normalizeProjectFilePresignRelpath(input.relpath);
  if (!path) {
    return {
      status: 'failed',
      path: String(input.relpath ?? ''),
      rawUrl: buildRawUrl(input.projectId, String(input.relpath ?? '')),
      reason: 'invalid_path',
    };
  }
  const rawUrl = buildRawUrl(input.projectId, path);
  const config = resolveProjectFilePresignConfig(env);
  if (!config.enabled) {
    return { status: 'disabled', path, rawUrl, reason: config.reason };
  }

  const credentialProvider =
    input.credentialProvider
    ?? createS3CredentialProvider({ env: env as Record<string, string | undefined> });
  const storage = new S3ProjectStorage({
    bucket: config.bucket,
    region: config.region,
    ...(config.prefix ? { prefix: config.prefix } : {}),
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    credentialProvider,
  });

  try {
    const resolved = await resolveTeamverTenantRemoteStorage(
      input.projectId,
      input.identity ?? null,
      (objectPrefix) => new TenantScopedProjectStorage(storage, objectPrefix),
      () => storage,
      input.s3PrefixOverride,
      input.trustOverride === undefined ? undefined : { trustOverride: input.trustOverride },
    );

    const remote = resolved.remote;
    // Probe NFC and NFD variants — S3 keys are byte-exact, so a Hangul NFD
    // uploaded object stays invisible to a NFC request (and vice versa).
    // sanitizeName now NFC-normalizes new uploads; older objects predate that
    // and still live at NFD keys, so both forms must resolve.
    const candidates = presignPathCandidates(path);
    let matched: { relpath: string; size: number } | null = null;
    for (const candidate of candidates) {
      const existing = input.statRemoteFile
        ? await input.statRemoteFile(candidate)
        : await remote.statFile(input.projectId, candidate);
      if (existing) {
        matched = { relpath: candidate, size: existing.size };
        break;
      }
    }
    if (!matched) {
      return { status: 'not_found', path, rawUrl };
    }

    const effectivePath = matched.relpath;
    const key = input.resolveObjectKey
      ? input.resolveObjectKey({
          storage,
          projectId: input.projectId,
          relpath: effectivePath,
          s3Prefix: resolved.s3Prefix,
        })
      : remote instanceof TenantScopedProjectStorage
        ? storage.objectKeyForPrefixAndRel(remote.objectPrefix, effectivePath)
        : storage.keyFor(input.projectId, effectivePath);

    const credentials = await credentialProvider.getCredentials();
    const now = input.now ?? new Date();
    const url = buildS3PresignedGetUrl({
      key,
      target: {
        bucket: config.bucket,
        region: config.region,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        expiresInSec: config.presignTtlSec,
      },
      credentials,
      now,
    });
    const expiresAt = new Date(now.getTime() + config.presignTtlSec * 1000).toISOString();
    return {
      status: 'ready',
      // Report the on-disk / on-S3 form so the FE `<img src>` stays consistent
      // with what /raw/ will accept on subsequent fetches.
      path: effectivePath,
      key,
      url,
      expiresInSec: config.presignTtlSec,
      expiresAt,
      rawUrl: buildRawUrl(input.projectId, effectivePath),
    };
  } catch (err) {
    if (err instanceof TeamverTenantStorageResolutionError) {
      return {
        status: 'failed',
        path,
        rawUrl,
        reason: err.message,
      };
    }
    if (err instanceof StorageError && err.code === 'TRAVERSAL') {
      return { status: 'failed', path, rawUrl, reason: 'invalid_path' };
    }
    return {
      status: 'failed',
      path,
      rawUrl,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function mintProjectFilePresignedGetFromRequest(
  req: Request,
  projectId: string,
  relpath: string,
  options: {
    env?: NodeJS.ProcessEnv;
    now?: Date;
  } = {},
): Promise<ProjectFilePresignResult> {
  return mintProjectFilePresignedGet({
    projectId,
    relpath,
    identity: readTeamverIdentityFromRequest(req),
    s3PrefixOverride: readTeamverS3PrefixFromRequest(req),
    trustOverride: isTrustedBackendCaller(req),
    ...(options.env ? { env: options.env } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
}
