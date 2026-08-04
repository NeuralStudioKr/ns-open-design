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
import { normalizeFetchedImageBlob, blobToImageDataUrl } from '../utils/imageBlobNormalize';
import { isEphemeralDrawingScreenshotPath } from '../utils/projectFilePaths';

export const AUTHENTICATED_PROJECT_FILE_FETCH_DELAYS_MS = [0, 250, 800, 1500] as const;
const TRUSTED_BACKGROUND_RETRY_DELAYS_MS = [2000, 5000] as const;

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

async function blobToRenderableDataUrl(blob: Blob): Promise<string | null> {
  return await blobToImageDataUrl(blob);
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
  if (
    !options?.trustExists
    && isEphemeralDrawingScreenshotPath(path)
    && isProjectRawFileKnownMissing(id, path)
  ) {
    return null;
  }
  if (!options?.trustExists && isProjectRawFileKnownMissing(id, path)) return null;
  if (options?.trustExists) clearProjectRawFileMissing(id, path);

  const waitForPrefix = options?.waitForPrefix ?? waitForTeamverProjectStoragePrefix;
  const fetchDaemon = options?.fetchDaemon ?? fetchTeamverDaemon;
  const delays = options?.delaysMs ?? AUTHENTICATED_PROJECT_FILE_FETCH_DELAYS_MS;
  const trustExists = Boolean(options?.trustExists);

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt] ?? 0;
    if (delay > 0) await sleep(delay);

    try {
      await waitForPrefix(id, { quick: attempt === 0 });
    } catch {
      // Prefix warm is best-effort; still attempt the raw fetch.
    }

    try {
      const resp = await fetchDaemon(projectRawUrl(id, path), {
        cache: 'no-store',
        teamverProjectId: id,
      });
      if (resp.status === 404) {
        const isLastAttempt = attempt >= delays.length - 1;
        if (trustExists || !isLastAttempt) {
          continue;
        }
        markProjectRawFileMissing(id, path);
        return null;
      }
      if (!resp.ok) continue;
      const rawBlob = await readResponseImageBlob(resp);
      const blob = await normalizeFetchedImageBlob(rawBlob);
      if (!blob) continue;
      clearProjectRawFileMissing(id, path);
      return blob;
    } catch {
      // Auth / network race — retry remaining attempts.
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
 * Returns a data URL so `<img>` does not depend on revocable blob URLs.
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
    setImageSrc(null);
    setLoading(true);
    setFailed(false);

    void (async () => {
      const tryLoad = async (): Promise<string | null> => {
        const blob = await loadAuthenticatedProjectFileBlob(projectId, path, { trustExists });
        if (!blob) return null;
        return await blobToRenderableDataUrl(blob);
      };

      let dataUrl = await tryLoad();
      if (cancelled) return;

      if (!dataUrl && trustExists) {
        for (const waitMs of TRUSTED_BACKGROUND_RETRY_DELAYS_MS) {
          await sleep(waitMs);
          if (cancelled) return;
          dataUrl = await tryLoad();
          if (dataUrl) break;
        }
      }

      if (cancelled) return;
      if (dataUrl) {
        setImageSrc(dataUrl);
        setFailed(false);
      } else {
        setFailed(true);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      setImageSrc(null);
      setLoading(false);
      setFailed(false);
    };
  }, [filePath, projectId, rev, trustExists, prefixNonce]);

  return { src: imageSrc, loading, failed };
}
