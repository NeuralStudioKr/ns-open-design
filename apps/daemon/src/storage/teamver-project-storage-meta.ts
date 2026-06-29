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

/**
 * Trust the X-Teamver-S3-Prefix override unconditionally when the request was
 * proven to come from the trusted backend caller (BE → daemon over the
 * private compose network with Bearer OD_API_TOKEN). The BE is the source of
 * truth for the row's `s3_prefix` column — it just wrote it in the same
 * transaction that the daemon is being asked to materialize for. Skipping the
 * design-api round-trip removes the create-race window where /access still
 * returns 404 even though the BE already has the prefix.
 */
function emitStorageMetaWarn(fields: Record<string, unknown>): void {
  try {
    console.warn(JSON.stringify({ metric: 'teamver_tenant_storage_resolve', ts: Date.now(), ...fields }));
  } catch {
    // structured warn must never bubble.
  }
}

export async function resolveTeamverTenantRemoteStorage(
  projectId: string,
  identity: TeamverRequestIdentity | null | undefined,
  createTenantRemote: (objectPrefix: string) => import('./project-storage.js').ProjectStorage,
  fallbackRemote: () => import('./project-storage.js').ProjectStorage,
  s3PrefixOverride?: string | null,
  options?: { trustOverride?: boolean },
): Promise<{ remote: import('./project-storage.js').ProjectStorage; s3Prefix: string | null }> {
  const override = s3PrefixOverride?.trim();
  const managedApiUrl = teamverDesignApiBaseUrl();
  if (!managedApiUrl) {
    if (override) {
      return { remote: createTenantRemote(override), s3Prefix: override };
    }
    return { remote: fallbackRemote(), s3Prefix: null };
  }

  // Trusted-caller fast path. Used by BE → daemon scratch sync-up and other
  // internal compose-network calls that present Bearer OD_API_TOKEN. We rely
  // on the daemon's bearer middleware (server.ts §3.K1) having already
  // rejected non-trusted callers — by the time we land here, override
  // existence + trustOverride means the value came from the BE writer.
  if (options?.trustOverride && override) {
    if (identity) {
      // Best-effort access verify in the background so the access cache stays
      // warm for subsequent FE calls without delaying the BE-initiated path.
      void verifyTeamverProjectAccess(projectId, identity).catch(() => undefined);
    }
    return { remote: createTenantRemote(override), s3Prefix: override };
  }

  if (!identity) {
    throw new TeamverTenantStorageResolutionError('teamver_project_identity_required');
  }
  const access = await verifyTeamverProjectAccess(projectId, identity);
  if (!access.ok) {
    // A non-trusted caller (FE-driven request) hit a transient design-api
    // denial — emit a marker so the recurring 502 loop is actionable in
    // CloudWatch. The materialization middleware translates this throw into
    // an UPSTREAM_UNAVAILABLE 502 and the FE retries on next poll.
    emitStorageMetaWarn({
      reason: 'access_denied',
      projectId,
      workspaceId: identity.workspaceId,
      kind: access.kind,
      hasOverride: Boolean(override),
    });
    throw new TeamverTenantStorageResolutionError('teamver_project_s3_prefix_required');
  }
  const s3Prefix = (access.s3Prefix?.trim() || override) ?? null;
  if (!s3Prefix) {
    emitStorageMetaWarn({
      reason: 'access_granted_without_prefix',
      projectId,
      workspaceId: identity.workspaceId,
    });
    throw new TeamverTenantStorageResolutionError('teamver_project_s3_prefix_required');
  }
  if (override && access.s3Prefix?.trim() && override !== access.s3Prefix.trim()) {
    emitStorageMetaWarn({
      reason: 'prefix_mismatch',
      projectId,
      workspaceId: identity.workspaceId,
      accessPrefix: access.s3Prefix.trim(),
      overridePrefix: override,
    });
    throw new TeamverTenantStorageResolutionError('teamver_project_s3_prefix_mismatch');
  }
  return { remote: createTenantRemote(s3Prefix), s3Prefix };
}
