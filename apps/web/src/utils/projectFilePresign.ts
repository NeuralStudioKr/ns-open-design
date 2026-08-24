import type { ProjectFilePresignedGetResponse } from '@open-design/contracts';

import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';
import { waitForTeamverProjectStoragePrefix } from '../teamver/teamverProjectS3PrefixResolve';
import { isProjectRawFileKnownMissing, markProjectRawFileMissing } from './projectFileFetchCache';
import { normalizeProjectFilePath, projectFilePathToNfd } from './projectFilePaths';

export type ProjectFilePresignReady = Extract<ProjectFilePresignedGetResponse, { status: 'ready' }>;

/**
 * - `ready` — use `mint.url` directly (S3 GET, no daemon byte proxy)
 * - `missing` — object absent; do **not** fall back to `/raw/` (avoids double 404)
 * - `unavailable` — disabled/local/transient; `/raw/` fallback is appropriate
 */
export type ProjectFilePresignFetchResult =
  | { kind: 'ready'; mint: ProjectFilePresignReady }
  | { kind: 'missing' }
  | { kind: 'unavailable'; reason?: string };

const presignInflight = new Map<string, Promise<ProjectFilePresignFetchResult>>();

function presignCacheKey(projectId: string, path: string): string {
  return `${projectId}::${path}`;
}

/**
 * Mint a short-lived S3 GET URL for a project file.
 */
export async function fetchProjectFilePresignedGet(
  projectId: string,
  path: string,
  options: {
    fetchDaemon?: typeof fetchTeamverDaemon;
    waitForPrefix?: typeof waitForTeamverProjectStoragePrefix;
    /** When true, mint even if the session missing cache already knows this path. */
    bypassMissingCache?: boolean;
  } = {},
): Promise<ProjectFilePresignFetchResult> {
  const id = String(projectId || '').trim();
  const rawRel = String(path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!id || !rawRel) return { kind: 'unavailable', reason: 'invalid_path' };

  const nfc = normalizeProjectFilePath(rawRel);
  const nfd = projectFilePathToNfd(rawRel);
  const candidates = [
    ...new Set([
      rawRel,
      ...(nfc && nfc !== rawRel ? [nfc] : []),
      ...(nfd && nfd !== rawRel && nfd !== nfc ? [nfd] : []),
    ]),
  ];

  if (!options.bypassMissingCache) {
    // Only short-circuit when EVERY Unicode form is cached missing — otherwise a
    // stale NFC cache mark would block a valid NFD mint after re-upload.
    if (candidates.every((candidate) => isProjectRawFileKnownMissing(id, candidate))) {
      return { kind: 'missing' };
    }
  }

  const key = presignCacheKey(id, rawRel);
  const existing = presignInflight.get(key);
  if (existing) return existing;

  const fetchDaemon = options.fetchDaemon ?? fetchTeamverDaemon;
  const waitForPrefix = options.waitForPrefix ?? waitForTeamverProjectStoragePrefix;

  const run = (async (): Promise<ProjectFilePresignFetchResult> => {
    try {
      await waitForPrefix(id, { quick: true });
    } catch {
      // Prefix warm is best-effort — mint still carries identity headers.
    }

    let lastMissing = false;
    for (const candidate of candidates) {
      try {
        const resp = await fetchDaemon(`/api/projects/${encodeURIComponent(id)}/presign-get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: candidate }),
          teamverProjectId: id,
        });
        if (resp.status === 404) {
          markProjectRawFileMissing(id, candidate);
          lastMissing = true;
          continue;
        }
        if (!resp.ok) {
          return { kind: 'unavailable', reason: `http_${resp.status}` };
        }
        const body = (await resp.json()) as ProjectFilePresignedGetResponse;
        if (body?.status === 'ready' && typeof body.url === 'string' && body.url) {
          return { kind: 'ready', mint: body };
        }
        if (body?.status === 'disabled') {
          return { kind: 'unavailable', reason: body.reason || 'disabled' };
        }
      } catch (err) {
        return {
          kind: 'unavailable',
          reason: err instanceof Error ? err.message : 'fetch_failed',
        };
      }
    }
    return lastMissing ? { kind: 'missing' } : { kind: 'unavailable', reason: 'unexpected_body' };
  })().finally(() => {
    if (presignInflight.get(key) === run) presignInflight.delete(key);
  });

  presignInflight.set(key, run);
  return run;
}

/** @internal vitest only */
export function resetProjectFilePresignInflightForTests(): void {
  presignInflight.clear();
}
