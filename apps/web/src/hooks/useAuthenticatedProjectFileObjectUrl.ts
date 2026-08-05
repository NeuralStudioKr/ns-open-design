import { useEffect, useState } from 'react';

import { projectRawUrl } from '../providers/registry';
import { readActiveTeamverWorkspaceId } from '../teamver/activeTeamverWorkspace';
import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';
import { waitForTeamverProjectStoragePrefix } from '../teamver/teamverProjectS3PrefixResolve';
import { subscribeTeamverProjectS3Prefix } from '../teamver/teamverProjectS3PrefixCache';
import {
  clearProjectRawFileMissing,
  isProjectRawFileKnownMissing,
  markProjectRawFileMissing,
} from '../utils/projectFileFetchCache';
import { normalizeFetchedImageBlob } from '../utils/imageBlobNormalize';
import { projectFilePathBasename } from '../utils/projectFilePaths';

export const AUTHENTICATED_PROJECT_FILE_FETCH_DELAYS_MS = [0, 250, 800, 1500] as const;
const TRUSTED_BACKGROUND_RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

const inflightProjectFileBlobLoads = new Map<string, Promise<Blob | null>>();

/** @internal vitest only */
export function resetInflightProjectFileBlobLoadsForTests(): void {
  inflightProjectFileBlobLoads.clear();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseImageBlob(resp: Response): Promise<Blob> {
  if (typeof resp.arrayBuffer === 'function') {
    return new Blob([await resp.arrayBuffer()], {
      type: resp.headers?.get?.('content-type') || '',
    });
  }
  if (typeof resp.blob === 'function') {
    return await resp.blob();
  }
  throw new Error('response body unavailable');
}

function alternateAuthenticatedRawPaths(path: string): string[] {
  const trimmed = String(path || '').trim().replace(/\\/g, '/');
  if (!trimmed) return [];
  const baseName = projectFilePathBasename(trimmed);
  const alternates: string[] = [];
  if (baseName && baseName !== trimmed) alternates.push(baseName);
  if (baseName && !trimmed.includes('/')) {
    alternates.push(`uploads/${baseName}`);
    alternates.push(`assets/${baseName}`);
  }
  return alternates;
}

async function fetchAuthenticatedImageBlobAtPath(
  id: string,
  path: string,
  options: {
    fetchDaemon: typeof fetchTeamverDaemon;
    waitForPrefix: typeof waitForTeamverProjectStoragePrefix;
    attempt: number;
  },
): Promise<Blob | null> {
  try {
    await options.waitForPrefix(id, { quick: options.attempt === 0 });
  } catch {
    // Prefix warm is best-effort.
  }
  const rawUrl = projectRawUrl(id, path);
  const fetchUrl =
    typeof window !== 'undefined' && rawUrl.startsWith('/')
      ? new URL(rawUrl, window.location.origin).href
      : rawUrl;
  const resp = await options.fetchDaemon(fetchUrl, {
    cache: 'no-store',
    teamverProjectId: id,
  });
  if (resp.status === 404) return null;
  if (!resp.ok) return null;
  const rawBlob = await readResponseImageBlob(resp);
  return await normalizeFetchedImageBlob(rawBlob);
}

async function loadAuthenticatedProjectFileBlobInner(
  projectId: string,
  filePath: string,
  options?: {
    delaysMs?: readonly number[];
    fetchDaemon?: typeof fetchTeamverDaemon;
    waitForPrefix?: typeof waitForTeamverProjectStoragePrefix;
    /** File is listed in the project index — try basename/uploads/assets alternates. */
    trustExists?: boolean;
    /** Retry briefly after the first pass (design panel / staged upload only). */
    allowBackgroundRetry?: boolean;
  },
): Promise<Blob | null> {
  const id = projectId.trim();
  const path = filePath.trim();
  if (!id || !path) return null;
  if (options?.trustExists) clearProjectRawFileMissing(id, path);
  else if (isProjectRawFileKnownMissing(id, path)) return null;

  const waitForPrefix = options?.waitForPrefix ?? waitForTeamverProjectStoragePrefix;
  const fetchDaemon = options?.fetchDaemon ?? fetchTeamverDaemon;
  const delays = options?.delaysMs ?? AUTHENTICATED_PROJECT_FILE_FETCH_DELAYS_MS;
  const trustExists = Boolean(options?.trustExists);
  const pathCandidates = trustExists
    ? [path, ...alternateAuthenticatedRawPaths(path)]
    : [path];

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0 && !trustExists && isProjectRawFileKnownMissing(id, path)) return null;

    const delay = delays[attempt] ?? 0;
    if (delay > 0) await sleep(delay);

    // Alternate paths are probed once — retries only hit the primary path so a
    // deleted drawing screenshot cannot spam uploads/ + assets/ on every delay.
    const candidatesThisAttempt = attempt === 0 ? pathCandidates : [path];

    for (let candidateIndex = 0; candidateIndex < candidatesThisAttempt.length; candidateIndex += 1) {
      const candidatePath = candidatesThisAttempt[candidateIndex]!;
      const isLastCandidate = candidateIndex >= candidatesThisAttempt.length - 1;
      const blob = await fetchAuthenticatedImageBlobAtPath(id, candidatePath, {
        fetchDaemon,
        waitForPrefix,
        attempt,
      });
      if (!blob) {
        if (!isLastCandidate) continue;
        const isLastAttempt = attempt >= delays.length - 1;
        if (!isLastAttempt) continue;
        markProjectRawFileMissing(id, path);
        return null;
      }
      clearProjectRawFileMissing(id, path);
      clearProjectRawFileMissing(id, candidatePath);
      return blob;
    }
  }

  markProjectRawFileMissing(id, path);
  return null;
}

/**
 * Fetch a project raw file as an image blob with bounded retry.
 *
 * Teamver embed can race workspace / S3-prefix readiness against the first
 * authenticated raw GET (401/502/empty). A single attempt left thumbnails
 * permanently blank; warm the storage prefix then retry briefly.
 */
export async function loadAuthenticatedProjectFileBlob(
  projectId: string,
  filePath: string,
  options?: {
    delaysMs?: readonly number[];
    fetchDaemon?: typeof fetchTeamverDaemon;
    waitForPrefix?: typeof waitForTeamverProjectStoragePrefix;
    trustExists?: boolean;
    allowBackgroundRetry?: boolean;
  },
): Promise<Blob | null> {
  const id = projectId.trim();
  const path = filePath.trim();
  if (!id || !path) return null;

  const inflightKey = `${id}::${path}::${options?.trustExists ? '1' : '0'}`;
  const inflight = inflightProjectFileBlobLoads.get(inflightKey);
  if (inflight) return inflight;

  const task = (async () => {
    let blob = await loadAuthenticatedProjectFileBlobInner(id, path, options);
    if (
      blob
      || !options?.allowBackgroundRetry
      || !options?.trustExists
      || isProjectRawFileKnownMissing(id, path)
    ) {
      return blob;
    }

    for (const waitMs of TRUSTED_BACKGROUND_RETRY_DELAYS_MS) {
      await sleep(waitMs);
      if (options?.trustExists) clearProjectRawFileMissing(id, path);
      else if (isProjectRawFileKnownMissing(id, path)) return null;
      blob = await loadAuthenticatedProjectFileBlobInner(id, path, options);
      if (blob) return blob;
    }
    return null;
  })();

  inflightProjectFileBlobLoads.set(inflightKey, task);
  try {
    return await task;
  } finally {
    inflightProjectFileBlobLoads.delete(inflightKey);
  }
}

export type AuthenticatedProjectFileObjectUrlState = {
  src: string | null;
  loading: boolean;
  failed: boolean;
};

/**
 * Teamver embed project files must be fetched with daemon auth headers.
 * Returns a blob object URL for `<img src>` (revoked on unmount / path change).
 */
export function useAuthenticatedProjectFileObjectUrl(
  projectId: string | null | undefined,
  filePath: string | null | undefined,
  /** Bust in-memory blob cache when the backing file changes (e.g. mtime). */
  rev?: string | number | null,
  trustExists?: boolean,
  allowBackgroundRetry?: boolean,
): AuthenticatedProjectFileObjectUrlState {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [prefixNonce, setPrefixNonce] = useState(0);

  useEffect(() => {
    const path = String(filePath || '').trim();
    const id = String(projectId || '').trim();
    if (!id || !path) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void readActiveTeamverWorkspaceId().then((workspaceId) => {
      if (cancelled || !workspaceId?.trim()) return;
      unsubscribe = subscribeTeamverProjectS3Prefix(workspaceId, id, () => {
        if (!cancelled) setPrefixNonce((value) => value + 1);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [filePath, projectId]);

  useEffect(() => {
    const path = String(filePath || '').trim();
    if (!projectId || !path) {
      setImageSrc(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    if (!trustExists && isProjectRawFileKnownMissing(projectId, path)) {
      setImageSrc(null);
      setLoading(false);
      setFailed(true);
      return;
    }

    let cancelled = false;
    let activeBlobUrl: string | null = null;
    setImageSrc(null);
    setLoading(true);
    setFailed(false);

    const revokeActiveBlobUrl = () => {
      if (activeBlobUrl) {
        URL.revokeObjectURL(activeBlobUrl);
        activeBlobUrl = null;
      }
    };

    void (async () => {
      const blob = await loadAuthenticatedProjectFileBlob(projectId, path, {
        trustExists,
        allowBackgroundRetry,
      });
      if (cancelled) return;

      if (blob) {
        revokeActiveBlobUrl();
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrl = blobUrl;
        setImageSrc(blobUrl);
        setFailed(false);
      } else {
        setFailed(true);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      revokeActiveBlobUrl();
      setImageSrc(null);
      setLoading(false);
      setFailed(false);
    };
  }, [allowBackgroundRetry, filePath, projectId, rev, trustExists, prefixNonce]);

  return { src: imageSrc, loading, failed };
}
