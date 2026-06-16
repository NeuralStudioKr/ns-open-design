import {
  teamverDesignApiBaseUrl,
  teamverProjectAccessCheckUrl,
  type TeamverRequestIdentity,
  teamverIdentityHeadersFromIdentity,
  teamverAccessTimeoutMs,
} from '../teamver-project-access.js';

export type { TeamverRequestIdentity };

export async function fetchTeamverProjectS3Prefix(
  projectId: string,
  identity: TeamverRequestIdentity,
): Promise<string | null> {
  const url = teamverProjectAccessCheckUrl(projectId);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: teamverIdentityHeadersFromIdentity(identity),
      signal: AbortSignal.timeout(teamverAccessTimeoutMs()),
    });
    if (response.status !== 204) return null;
    const prefix = response.headers.get('x-teamver-s3-prefix')?.trim();
    return prefix || null;
  } catch {
    return null;
  }
}

export async function resolveTeamverTenantRemoteStorage(
  projectId: string,
  identity: TeamverRequestIdentity | null | undefined,
  createTenantRemote: (objectPrefix: string) => import('./project-storage.js').ProjectStorage,
  fallbackRemote: () => import('./project-storage.js').ProjectStorage,
  s3PrefixOverride?: string | null,
): Promise<{ remote: import('./project-storage.js').ProjectStorage; s3Prefix: string | null }> {
  const override = s3PrefixOverride?.trim();
  if (override) {
    return { remote: createTenantRemote(override), s3Prefix: override };
  }
  if (!identity || !teamverDesignApiBaseUrl()) {
    return { remote: fallbackRemote(), s3Prefix: null };
  }
  const s3Prefix = await fetchTeamverProjectS3Prefix(projectId, identity);
  if (!s3Prefix) {
    return { remote: fallbackRemote(), s3Prefix: null };
  }
  return { remote: createTenantRemote(s3Prefix), s3Prefix };
}
