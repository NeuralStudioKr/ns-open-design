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
import {
  normalizeProjectFilePath,
  projectFilePathBasename,
  projectFilePathToNfd,
} from '../utils/projectFilePaths';

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

/** @internal exported for tests */
export function alternateAuthenticatedRawPaths(path: string): string[] {
  const raw = String(path || '').trim().replace(/\\/g, '/');
  const nfc = normalizeProjectFilePath(path);
  const nfd = projectFilePathToNfd(path);
  if (!nfc && !raw) return [];
  const primary = nfc || raw;
  const baseName = projectFilePathBasename(primary);
  const baseNameNfd = projectFilePathToNfd(baseName);
  const alternates: string[] = [];
  // Hangul: probe both NFC and NFD forms of the full relative path so a disk
  // stored in one Unicode form matches even when the chat/deck path uses the
  // other. The daemon does byte-exact lookup on /raw/.
  if (raw && nfc && raw !== nfc) alternates.push(nfc);
  if (nfd && nfd !== primary && nfd !== raw) alternates.push(nfd);
  if (baseName && baseName !== primary) alternates.push(baseName);
  if (baseNameNfd && baseNameNfd !== baseName) alternates.push(baseNameNfd);
  const pushDrivePrefix = (prefix: string) => {
    if (baseName) alternates.push(`${prefix}${baseName}`);
    if (baseNameNfd && baseNameNfd !== baseName) alternates.push(`${prefix}${baseNameNfd}`);
  };
  if (baseName && !primary.includes('/')) {
    // Recovered mention-only history often stores basename while the file
    // lives under Drive / uploads / assets after refresh.
    pushDrivePrefix('refs/drive/');
    pushDrivePrefix('refs/');
    pushDrivePrefix('uploads/');
    pushDrivePrefix('assets/');
  } else if (baseName && primary.startsWith('uploads/')) {
    pushDrivePrefix('refs/drive/');
    alternates.push(baseName);
    if (baseNameNfd && baseNameNfd !== baseName) alternates.push(baseNameNfd);
  } else if (baseName && primary.startsWith('refs/drive/')) {
    alternates.push(baseName);
    if (baseNameNfd && baseNameNfd !== baseName) alternates.push(baseNameNfd);
    pushDrivePrefix('uploads/');
  }
  return [...new Set(alternates.filter(Boolean))];
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
  const resp = await fetchAuthenticatedRawImageResponse(fetchUrl, id, options.fetchDaemon);
  if (!resp) return null;
  const rawBlob = await readResponseImageBlob(resp);
  return await normalizeFetchedImageBlob(rawBlob);
}

async function fetchAuthenticatedRawImageResponse(
  fetchUrl: string,
  projectId: string,
  fetchDaemon: typeof fetchTeamverDaemon,
): Promise<Response | null> {
  let resp = await fetchDaemon(fetchUrl, {
    cache: 'no-store',
    teamverProjectId: projectId,
  });
  if (resp.status === 404) return null;
  // Conditional GET can return 304 with an empty body — fetch treats that as
  // !ok, which left indexed previews blank even when opening /raw in a tab
  // returned 200 image/png. Force a full reload once.
  if (resp.status === 304) {
    resp = await fetchDaemon(fetchUrl, {
      cache: 'reload',
      teamverProjectId: projectId,
    });
  }
  if (resp.status === 404) return null;
  if (!resp.ok) return null;
  return resp;
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
  const rawPath = String(filePath || '').trim().replace(/\\/g, '/');
  const nfcPath = normalizeProjectFilePath(filePath);
  const nfdPath = projectFilePathToNfd(filePath);
  // Probe the caller's exact byte form first so daemon disk lookup (byte-exact
  // on Linux) matches macOS NFD uploads without an unnecessary 404 round-trip.
  const primary = rawPath || nfcPath;
  if (!id || !primary) return null;
  const trustExists = Boolean(options?.trustExists);
  const allowBackgroundRetry = Boolean(options?.allowBackgroundRetry);
  const alreadyMissing = isProjectRawFileKnownMissing(id, primary)
    || (nfcPath && nfcPath !== primary && isProjectRawFileKnownMissing(id, nfcPath))
    || (nfdPath && nfdPath !== primary && isProjectRawFileKnownMissing(id, nfdPath));
  // Honor missing cache. Scratch-race callers (trustExists + allowBackgroundRetry)
  // may proceed once — AuthenticatedProjectFileImage blocks remounts via
  // startedKnownMissing so this does not re-spam `/raw/` for deleted files.
  if (alreadyMissing && !(trustExists && allowBackgroundRetry)) {
    return null;
  }

  const waitForPrefix = options?.waitForPrefix ?? waitForTeamverProjectStoragePrefix;
  const fetchDaemon = options?.fetchDaemon ?? fetchTeamverDaemon;
  // Already-missing scratch race: one shot only (no delay ladder spam).
  const delays = alreadyMissing
    ? [0]
    : (options?.delaysMs ?? AUTHENTICATED_PROJECT_FILE_FETCH_DELAYS_MS);
  // Always try raw + NFC + NFD (in that order) — Hangul filenames may be
  // stored on disk in either Unicode form depending on the upload client's OS.
  // When trustExists also probe Drive/uploads/assets basename alternates.
  const pathCandidates = [
    ...new Set([
      primary,
      ...(nfcPath && nfcPath !== primary ? [nfcPath] : []),
      ...(nfdPath && nfdPath !== primary && nfdPath !== nfcPath ? [nfdPath] : []),
      ...(trustExists ? alternateAuthenticatedRawPaths(primary) : []),
    ]),
  ];

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt] ?? 0;
    if (delay > 0) await sleep(delay);

    // Alternate paths are probed once — retries only hit the primary path so a
    // deleted drawing screenshot cannot spam uploads/ + assets/ on every delay.
    const candidatesThisAttempt = attempt === 0 ? pathCandidates : [primary];

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
        // Mark EVERY probed alternate missing so remounts short-circuit —
        // otherwise a re-render fires the full 5-alternate 404 storm again.
        for (const probed of pathCandidates) {
          markProjectRawFileMissing(id, probed);
        }
        return null;
      }
      clearProjectRawFileMissing(id, primary);
      if (nfcPath && nfcPath !== primary) clearProjectRawFileMissing(id, nfcPath);
      if (nfdPath && nfdPath !== primary && nfdPath !== nfcPath) clearProjectRawFileMissing(id, nfdPath);
      clearProjectRawFileMissing(id, candidatePath);
      return blob;
    }
  }

  for (const probed of pathCandidates) {
    markProjectRawFileMissing(id, probed);
  }
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
      if (isProjectRawFileKnownMissing(id, path)) return null;
      // Brief S3 lag after a failed first pass — clear only for this opted-in
      // background retry window, then re-check.
      clearProjectRawFileMissing(id, path);
      blob = await loadAuthenticatedProjectFileBlobInner(id, path, {
        ...options,
        // Inner no longer clears missing; we cleared above for this retry only.
      });
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
