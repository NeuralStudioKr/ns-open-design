import {
  verifyTeamverProjectAccess,
  teamverDesignApiBaseUrl,
  type TeamverRequestIdentity,
} from '../teamver-project-access.js';

export type { TeamverRequestIdentity };

export class TeamverTenantStorageResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TeamverTenantStorageResolutionError';
  }
}

export async function fetchTeamverProjectS3Prefix(
  projectId: string,
  identity: TeamverRequestIdentity,
): Promise<string | null> {
  if (!teamverDesignApiBaseUrl()) return null;

  const result = await verifyTeamverProjectAccess(projectId, identity);
  if (!result.ok) return null;
  return result.s3Prefix;
}

export async function resolveTeamverTenantRemoteStorage(
  projectId: string,
  identity: TeamverRequestIdentity | null | undefined,
  createTenantRemote: (objectPrefix: string) => import('./project-storage.js').ProjectStorage,
  fallbackRemote: () => import('./project-storage.js').ProjectStorage,
  s3PrefixOverride?: string | null,
): Promise<{ remote: import('./project-storage.js').ProjectStorage; s3Prefix: string | null }> {
  const override = s3PrefixOverride?.trim();
  const managedApiUrl = teamverDesignApiBaseUrl();
  if (!managedApiUrl) {
    if (override) {
      return { remote: createTenantRemote(override), s3Prefix: override };
    }
    return { remote: fallbackRemote(), s3Prefix: null };
  }
  if (!identity) {
    throw new TeamverTenantStorageResolutionError('teamver_project_identity_required');
  }
  const s3Prefix = await fetchTeamverProjectS3Prefix(projectId, identity);
  if (!s3Prefix) {
    throw new TeamverTenantStorageResolutionError('teamver_project_s3_prefix_required');
  }
  if (override && override !== s3Prefix) {
    throw new TeamverTenantStorageResolutionError('teamver_project_s3_prefix_mismatch');
  }
  return { remote: createTenantRemote(s3Prefix), s3Prefix };
}
