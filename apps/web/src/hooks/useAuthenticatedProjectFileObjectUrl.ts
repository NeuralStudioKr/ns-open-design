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
import { isEphemeralDrawingScreenshotPath, projectFilePathBasename } from '../utils/projectFilePaths';

export const AUTHENTICATED_PROJECT_FILE_FETCH_DELAYS_MS = [0, 250, 800, 1500] as const;
const TRUSTED_BACKGROUND_RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

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
    trustExists: boolean;
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
    /** Skip session 404 cache — use when the file is listed in the project index. */
    trustExists?: boolean;
  },
): Promise<Blob | null> {
  const id = projectId.trim();
  const path = filePath.trim();
  if (!id || !path) return null;
  if (!options?.trustExists && isProjectRawFileKnownMissing(id, path)) {
    // Legacy session marks for user draw screenshots are ignored — they used
    // to poison thumbnails after a single 404 during S3 materialization.
    if (!isEphemeralDrawingScreenshotPath(path)) return null;
  }
  if (options?.trustExists) clearProjectRawFileMissing(id, path);

  const waitForPrefix = options?.waitForPrefix ?? waitForTeamverProjectStoragePrefix;
  const fetchDaemon = options?.fetchDaemon ?? fetchTeamverDaemon;
  const delays = options?.delaysMs ?? AUTHENTICATED_PROJECT_FILE_FETCH_DELAYS_MS;
  const trustExists = Boolean(options?.trustExists);
  const pathCandidates = trustExists
    ? [path, ...alternateAuthenticatedRawPaths(path)]
    : [path];

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt] ?? 0;
    if (delay > 0) await sleep(delay);

    for (let candidateIndex = 0; candidateIndex < pathCandidates.length; candidateIndex += 1) {
      const candidatePath = pathCandidates[candidateIndex]!;
      const isLastCandidate = candidateIndex >= pathCandidates.length - 1;
      const blob = await fetchAuthenticatedImageBlobAtPath(id, candidatePath, {
        fetchDaemon,
        waitForPrefix,
        trustExists,
        attempt,
      });
      if (!blob) {
        if (trustExists || !isLastCandidate) continue;
        const isLastAttempt = attempt >= delays.length - 1;
        if (!isLastAttempt) continue;
        if (!trustExists && !isEphemeralDrawingScreenshotPath(path)) {
          markProjectRawFileMissing(id, path);
        }
        return null;
      }
      clearProjectRawFileMissing(id, path);
      clearProjectRawFileMissing(id, candidatePath);
      return blob;
    }
  }
  return null;
}

export type AuthenticatedProjectFileObjectUrlState = {
  src: string | null;
  loading: boolean;
  failed: boolean;
};

/**
 * Teamver embed project files must be fetched with daemon auth headers.
 * Bare `/api/projects/.../raw/...` on `<img src>` can fail when cookies or
 * workspace headers are required for the request to succeed.
 *
 * Returns a blob object URL for `<img src>` (revoked on unmount / path change).
 */
export function useAuthenticatedProjectFileObjectUrl(
  projectId: string | null | undefined,
  filePath: string | null | undefined,
  /** Bust in-memory blob cache when the backing file changes (e.g. mtime). */
  rev?: string | number | null,
  trustExists?: boolean,
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
      const tryLoad = async (): Promise<Blob | null> => {
        return await loadAuthenticatedProjectFileBlob(projectId, path, { trustExists });
      };

      let blob = await tryLoad();
      if (cancelled) return;

      if (!blob && trustExists) {
        for (const waitMs of TRUSTED_BACKGROUND_RETRY_DELAYS_MS) {
          await sleep(waitMs);
          if (cancelled) return;
          blob = await tryLoad();
          if (blob) break;
        }
      }

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
  }, [filePath, projectId, rev, trustExists, prefixNonce]);

  return { src: imageSrc, loading, failed };
}
