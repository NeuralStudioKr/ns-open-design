import type { ProjectFilePresignedGetResponse } from '@open-design/contracts';

import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';
import { waitForTeamverProjectStoragePrefix } from '../teamver/teamverProjectS3PrefixResolve';

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

/**
 * Mint a short-lived S3 GET URL for a project file.
 */
export async function fetchProjectFilePresignedGet(
  projectId: string,
  path: string,
  options: {
    fetchDaemon?: typeof fetchTeamverDaemon;
    waitForPrefix?: typeof waitForTeamverProjectStoragePrefix;
  } = {},
): Promise<ProjectFilePresignFetchResult> {
  const id = String(projectId || '').trim();
  const relpath = String(path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!id || !relpath) return { kind: 'unavailable', reason: 'invalid_path' };

  const fetchDaemon = options.fetchDaemon ?? fetchTeamverDaemon;
  const waitForPrefix = options.waitForPrefix ?? waitForTeamverProjectStoragePrefix;

  try {
    await waitForPrefix(id, { quick: true });
  } catch {
    // Prefix warm is best-effort — mint still carries identity headers.
  }

  try {
    const resp = await fetchDaemon(`/api/projects/${encodeURIComponent(id)}/presign-get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relpath }),
      teamverProjectId: id,
    });
    if (resp.status === 404) return { kind: 'missing' };
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
    return { kind: 'unavailable', reason: 'unexpected_body' };
  } catch (err) {
    return {
      kind: 'unavailable',
      reason: err instanceof Error ? err.message : 'fetch_failed',
    };
  }
}
