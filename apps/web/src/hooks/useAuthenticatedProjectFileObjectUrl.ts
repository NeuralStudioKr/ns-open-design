import { useEffect, useState } from 'react';

import { projectRawUrl } from '../providers/registry';
import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';
import { waitForTeamverProjectStoragePrefix } from '../teamver/teamverProjectS3PrefixResolve';
import {
  clearProjectRawFileMissing,
  isProjectRawFileKnownMissing,
  markProjectRawFileMissing,
} from '../utils/projectFileFetchCache';

const FETCH_RETRY_DELAYS_MS = [0, 250, 800] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUsableImageBlob(blob: Blob): boolean {
  if (blob.size <= 0) return false;
  const mime = String(blob.type || '').toLowerCase();
  // Reject HTML/JSON error bodies that somehow returned 200 — those
  // surface as broken <img> alt text in the chat thumbnail.
  if (mime && !mime.startsWith('image/') && mime !== 'application/octet-stream') {
    return false;
  }
  return true;
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
  },
): Promise<Blob | null> {
  const id = projectId.trim();
  const path = filePath.trim();
  if (!id || !path) return null;
  if (isProjectRawFileKnownMissing(id, path)) return null;

  const waitForPrefix = options?.waitForPrefix ?? waitForTeamverProjectStoragePrefix;
  const fetchDaemon = options?.fetchDaemon ?? fetchTeamverDaemon;
  const delays = options?.delaysMs ?? FETCH_RETRY_DELAYS_MS;

  try {
    await waitForPrefix(id, { quick: true });
  } catch {
    // Prefix warm is best-effort; still attempt the raw fetch.
  }

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt] ?? 0;
    if (delay > 0) await sleep(delay);
    try {
      const resp = await fetchDaemon(projectRawUrl(id, path), {
        cache: 'no-store',
        teamverProjectId: id,
      });
      if (resp.status === 404) {
        markProjectRawFileMissing(id, path);
        return null;
      }
      if (!resp.ok) continue;
      const blob = await resp.blob();
      if (!isUsableImageBlob(blob)) continue;
      clearProjectRawFileMissing(id, path);
      return blob;
    } catch {
      // Auth / network race — retry remaining attempts.
    }
  }
  return null;
}

/**
 * Teamver embed project files must be fetched with daemon auth headers.
 * Bare `/api/projects/.../raw/...` on `<img src>` can fail when cookies or
 * workspace headers are required for the request to succeed.
 */
export function useAuthenticatedProjectFileObjectUrl(
  projectId: string | null | undefined,
  filePath: string | null | undefined,
): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const path = String(filePath || '').trim();
    if (!projectId || !path) {
      setObjectUrl(null);
      return;
    }

    let cancelled = false;
    let revokeUrl: string | null = null;

    void (async () => {
      const blob = await loadAuthenticatedProjectFileBlob(projectId, path);
      if (cancelled || !blob) return;
      revokeUrl = URL.createObjectURL(blob);
      if (cancelled) {
        URL.revokeObjectURL(revokeUrl);
        return;
      }
      setObjectUrl(revokeUrl);
    })();

    return () => {
      cancelled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
      setObjectUrl(null);
    };
  }, [filePath, projectId]);

  return objectUrl;
}
