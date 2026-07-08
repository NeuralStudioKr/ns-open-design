import path from 'node:path';
import { promises as fsp } from 'node:fs';

import { isRunTouchedProjectFile } from '../projects.js';
import {
  LocalProjectStorage,
  S3ProjectStorage,
  StorageError,
  type ProjectFileMeta,
  type ProjectStorage,
  type ProjectStorageProbeResult,
} from './project-storage.js';
import { createS3CredentialProvider } from './s3-credential-provider.js';
import { isTeamverDaemonStateRelpath } from '../teamver-project-daemon-state-store.js';
import { TenantScopedProjectStorage } from './tenant-scoped-project-storage.js';

const DEFAULT_SYNC_UP_ATTEMPTS = 3;
const DEFAULT_SYNC_UP_RETRY_MS = 250;
const DEFAULT_SYNC_DOWN_ATTEMPTS = 3;
const DEFAULT_SYNC_DOWN_RETRY_MS = 250;

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withStorageRetry<T>(
  fn: () => Promise<T>,
  attemptsEnv: string,
  retryMsEnv: string,
  defaultAttempts: number,
  defaultRetryMs: number,
): Promise<T> {
  const parsedAttempts = Number(process.env[attemptsEnv] ?? '');
  const attempts = Number.isFinite(parsedAttempts) && parsedAttempts >= 1
    ? Math.floor(parsedAttempts)
    : defaultAttempts;
  const parsedRetryMs = Number(process.env[retryMsEnv] ?? '');
  const retryMs = Number.isFinite(parsedRetryMs) && parsedRetryMs >= 0
    ? parsedRetryMs
    : defaultRetryMs;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= attempts) break;
      await sleep(retryMs * attempt);
    }
  }
  throw lastError;
}

async function withSyncUpRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withStorageRetry(
    fn,
    'OD_S3_SYNC_UP_RETRIES',
    'OD_S3_SYNC_UP_RETRY_MS',
    DEFAULT_SYNC_UP_ATTEMPTS,
    DEFAULT_SYNC_UP_RETRY_MS,
  );
}

async function withSyncDownRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withStorageRetry(
    fn,
    'OD_S3_SYNC_DOWN_RETRIES',
    'OD_S3_SYNC_DOWN_RETRY_MS',
    DEFAULT_SYNC_DOWN_ATTEMPTS,
    DEFAULT_SYNC_DOWN_RETRY_MS,
  );
}

/**
 * Whether full sync-up (runStart=0) may DELETE remote objects missing from scratch.
 * Empty scratch must never imply "delete entire remote SSOT" (redeploy / idle evict).
 * When OD_S3_PURGE_ON_DELETE=0, remote deletes belong only to explicit purge on
 * registry delete — not lazy sync-up / self-heal / pre-evict sync.
 */
export function shouldPropagateScratchDeletionsToRemote(scratchFileCount: number): boolean {
  if (scratchFileCount === 0) return false;
  const raw = (process.env.OD_S3_PURGE_ON_DELETE ?? '').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return true;
}

/**
 * Hybrid storage: agent run cwd reads/writes scratch; S3 is SSOT.
 * Non-run routes keep using projects.ts on scratch after sync-down.
 */
export class MaterializingProjectStorage implements ProjectStorage {
  constructor(
    public readonly scratch: LocalProjectStorage,
    public readonly baseRemote: ProjectStorage,
  ) {}

  readFile(projectId: string, relpath: string): Promise<Buffer> {
    return this.scratch.readFile(projectId, relpath);
  }

  writeFile(projectId: string, relpath: string, body: Buffer): Promise<ProjectFileMeta> {
    return this.scratch.writeFile(projectId, relpath, body);
  }

  listFiles(projectId: string): Promise<ProjectFileMeta[]> {
    return this.scratch.listFiles(projectId);
  }

  deleteFile(projectId: string, relpath: string): Promise<void> {
    return this.scratch.deleteFile(projectId, relpath);
  }

  statFile(projectId: string, relpath: string): Promise<ProjectFileMeta | null> {
    return this.scratch.statFile(projectId, relpath);
  }

  // Reachability probe — defers to the S3 backend since scratch is
  // local and only meaningful as a write target. Returns the remote
  // result verbatim so /api/health/storage surfaces S3 errors.
  async probe(): Promise<ProjectStorageProbeResult> {
    if (typeof this.baseRemote.probe === 'function') {
      return await this.baseRemote.probe();
    }
    return await this.scratch.probe!();
  }

  remoteForTenantPrefix(objectPrefix: string): ProjectStorage {
    return new TenantScopedProjectStorage(this.baseRemote, objectPrefix);
  }

  flatRemote(): ProjectStorage {
    return this.baseRemote;
  }

  async syncDown(projectId: string, remote: ProjectStorage): Promise<{ files: number }> {
    const remoteFiles = await withSyncDownRetry(() => remote.listFiles(projectId));
    let files = 0;
    for (const file of remoteFiles) {
      if (isTeamverDaemonStateRelpath(file.path)) continue;
      const body = await withSyncDownRetry(() => remote.readFile(projectId, file.path));
      await this.scratch.writeFile(projectId, file.path, body);
      if (file.mtimeMs > 0 && Number.isFinite(file.mtimeMs)) {
        await this.scratch.setFileMtime(projectId, file.path, file.mtimeMs);
      }
      files += 1;
    }
    return { files };
  }

  async syncUp(
    projectId: string,
    remote: ProjectStorage,
    runStartTimeMs: number,
  ): Promise<{ uploaded: number; skipped: number; failed: number; deleted: number }> {
    const scratchFiles = await this.scratch.listFiles(projectId);
    const scratchPaths = new Set(scratchFiles.map((file) => file.path));
    let uploaded = 0;
    let skipped = 0;
    let failed = 0;
    let deleted = 0;
    for (const file of scratchFiles) {
      if (!isRunTouchedProjectFile(file.mtimeMs, runStartTimeMs)) {
        skipped += 1;
        continue;
      }
      try {
        await withSyncUpRetry(async () => {
          const body = await this.scratch.readFile(projectId, file.path);
          await remote.writeFile(projectId, file.path, body);
        });
        uploaded += 1;
      } catch (err) {
        failed += 1;
        console.warn(
          `[project-materialization] sync-up failed for ${projectId}/${file.path}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Full sync (non-run API writes) may propagate scratch deletions to remote SSOT.
    // Never when scratch is empty or OD_S3_PURGE_ON_DELETE=0 (staging retain policy).
    if (runStartTimeMs === 0 && shouldPropagateScratchDeletionsToRemote(scratchFiles.length)) {
      const remoteFiles = await withSyncUpRetry(() => remote.listFiles(projectId));
      for (const remoteFile of remoteFiles) {
        if (scratchPaths.has(remoteFile.path)) continue;
        try {
          await withSyncUpRetry(async () => {
            await remote.deleteFile(projectId, remoteFile.path);
          });
          deleted += 1;
        } catch (err) {
          failed += 1;
          console.warn(
            `[project-materialization] sync-up remote delete failed for ${projectId}/${remoteFile.path}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } else if (runStartTimeMs === 0 && scratchFiles.length === 0) {
      console.info(
        `[project-materialization] sync-up ${projectId}: skipped remote orphan delete (empty scratch)`,
      );
    }

    return { uploaded, skipped, failed, deleted };
  }

  async evictScratchProject(projectId: string): Promise<void> {
    const root = path.join(this.scratch.projectsRoot, projectId);
    await fsp.rm(root, { recursive: true, force: true });
  }

  async purgeRemoteProject(remote: ProjectStorage): Promise<{ deleted: number; failed: number }> {
    if (remote instanceof TenantScopedProjectStorage) {
      return await remote.purgeTenantObjects();
    }
    return { deleted: 0, failed: 0 };
  }
}

export async function resolveRemoteProjectStorage(opts: {
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}): Promise<ProjectStorage | null> {
  const env = opts.env ?? process.env;
  const kind = (env.OD_PROJECT_STORAGE ?? 'local').trim().toLowerCase();
  if (kind !== 's3') return null;

  const credentialProvider = createS3CredentialProvider({
    env,
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
  });
  // Warm IMDS once at startup so misconfiguration fails fast; provider
  // refreshes before Expiration on subsequent signed requests.
  await credentialProvider.getCredentials();

  return new S3ProjectStorage({
    bucket: env.OD_S3_BUCKET ?? '',
    region: env.OD_S3_REGION ?? env.AWS_REGION ?? '',
    ...(env.OD_S3_PREFIX ? { prefix: env.OD_S3_PREFIX } : {}),
    ...(env.OD_S3_ENDPOINT ? { endpoint: env.OD_S3_ENDPOINT } : {}),
    credentialProvider,
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
  });
}

export async function createMaterializingProjectStorage(opts: {
  scratchProjectsRoot: string;
  env?: Record<string, string | undefined>;
  fetchFn?: typeof fetch;
}): Promise<MaterializingProjectStorage> {
  const remote = await resolveRemoteProjectStorage(opts);
  if (!remote) {
    throw new StorageError('IO', 'S3 project storage is not configured');
  }
  return new MaterializingProjectStorage(
    new LocalProjectStorage(opts.scratchProjectsRoot),
    remote,
  );
}

export { S3ProjectStorage };
