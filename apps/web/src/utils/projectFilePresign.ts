import type { ProjectFilePresignedGetResponse } from '@open-design/contracts';

import { fetchTeamverDaemon } from '../teamver/teamverDaemonHeaders';
import { waitForTeamverProjectStoragePrefix } from '../teamver/teamverProjectS3PrefixResolve';

export type ProjectFilePresignReady = Extract<ProjectFilePresignedGetResponse, { status: 'ready' }>;

/**
 * Mint a short-lived S3 GET URL for a project file. Returns null when the
 * daemon falls back to disabled/local storage or the request fails — callers
 * should use authenticated `/raw/` fetch instead.
 */
export async function fetchProjectFilePresignedGet(
  projectId: string,
  path: string,
  options: {
    fetchDaemon?: typeof fetchTeamverDaemon;
    waitForPrefix?: typeof waitForTeamverProjectStoragePrefix;
  } = {},
): Promise<ProjectFilePresignReady | null> {
  const id = String(projectId || '').trim();
  const relpath = String(path || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!id || !relpath) return null;

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
    if (!resp.ok) return null;
    const body = (await resp.json()) as ProjectFilePresignedGetResponse;
    if (body?.status !== 'ready' || typeof body.url !== 'string' || !body.url) return null;
    return body;
  } catch {
    return null;
  }
}
