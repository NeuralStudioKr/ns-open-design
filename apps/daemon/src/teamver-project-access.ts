import type { Request, RequestHandler } from 'express';

const DEFAULT_TIMEOUT_MS = 2500;
const ACCESS_GRANT_CACHE_TTL_MS = 10_000;
// Permanent denials (403 / forbidden) are sticky for 5s — admin revoked
// access, no point hammering design-api every request from a tight loop.
const ACCESS_DENY_PERMANENT_CACHE_TTL_MS = 5_000;
// Transient denials (404 / not-yet-registered) get a much shorter TTL because
// the FE is very likely to register the project in design-api within the next
// few hundred ms. A 5s sticky deny here used to translate every materialization
// retry inside the window into a teamver_project_s3_prefix_required 502 even
// after the row appeared.
const ACCESS_DENY_TRANSIENT_CACHE_TTL_MS = 1_500;

export type TeamverRequestIdentity = {
  userId: string;
  workspaceId: string;
  authorization?: string;
};

type AccessCacheEntry = {
  allowed: boolean;
  s3Prefix: string | null;
  expiresAt: number;
};

const accessCache = new Map<string, AccessCacheEntry>();

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function teamverDesignApiBaseUrl(): string {
  return trimTrailingSlash((process.env.TEAMVER_DESIGN_API_URL ?? '').trim());
}

export function isTeamverDesignManaged(): boolean {
  return Boolean(teamverDesignApiBaseUrl());
}

export function teamverProjectAccessCheckUrl(projectId: string): string | null {
  const baseUrl = teamverDesignApiBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/api/v1/projects/${encodeURIComponent(projectId)}/access`;
}

function accessCacheKey(identity: TeamverRequestIdentity, projectId: string): string {
  return `${identity.userId}:${identity.workspaceId}:${projectId}`;
}

export function clearTeamverProjectAccessCache(projectId?: string): void {
  if (!projectId) {
    accessCache.clear();
    return;
  }
  for (const key of accessCache.keys()) {
    if (key.endsWith(`:${projectId}`)) accessCache.delete(key);
  }
}

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return String(value ?? '').trim();
}

export function readTeamverIdentityFromRequest(req: Request): TeamverRequestIdentity | null {
  const userId = firstHeaderValue(req.headers['x-teamver-user-id']);
  const workspaceFromClient = firstHeaderValue(req.headers['x-workspace-id']);
  const workspaceFromSession = firstHeaderValue(req.headers['x-teamver-workspace-id']);
  const workspaceId = workspaceFromClient || workspaceFromSession;
  if (!userId || !workspaceId) return null;

  const identity: TeamverRequestIdentity = { userId, workspaceId };
  const authorization = firstHeaderValue(req.headers.authorization);
  if (authorization) identity.authorization = authorization;
  return identity;
}

export function readTeamverS3PrefixFromRequest(req: Request): string | null {
  const prefix = firstHeaderValue(req.headers['x-teamver-s3-prefix']);
  return prefix || null;
}

export function teamverIdentityHeadersFromIdentity(
  identity: TeamverRequestIdentity,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Teamver-User-Id': identity.userId,
    'X-Teamver-Workspace-Id': identity.workspaceId,
    'X-Workspace-Id': identity.workspaceId,
  };
  if (identity.authorization) headers.Authorization = identity.authorization;
  return headers;
}

export function teamverAccessTimeoutMs(): number {
  const parsed = Number(process.env.TEAMVER_PROJECT_ACCESS_TIMEOUT_MS ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function accessTimeoutMs(): number {
  return teamverAccessTimeoutMs();
}

export type TeamverProjectAccessResult =
  | { ok: true; s3Prefix: string | null }
  | { ok: false; kind: 'unauthorized' | 'denied' | 'upstream' };

export type TeamverProjectRegistryHint = {
  title?: string;
};

export type TeamverProjectRegistryResolver = (
  projectId: string,
) => TeamverProjectRegistryHint | null | Promise<TeamverProjectRegistryHint | null>;

function teamverDesignApiProjectsUrl(): string | null {
  const baseUrl = teamverDesignApiBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/api/v1/projects`;
}

function readCachedAccess(
  identity: TeamverRequestIdentity,
  projectId: string,
): TeamverProjectAccessResult | null {
  const cached = accessCache.get(accessCacheKey(identity, projectId));
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.allowed
    ? { ok: true, s3Prefix: cached.s3Prefix }
    : { ok: false, kind: 'denied' };
}

function rememberAccess(
  identity: TeamverRequestIdentity,
  projectId: string,
  allowed: boolean,
  s3Prefix: string | null,
  options?: { denyKind?: 'transient' | 'permanent' },
): void {
  let ttl: number;
  if (allowed) {
    ttl = ACCESS_GRANT_CACHE_TTL_MS;
  } else if (options?.denyKind === 'transient') {
    ttl = ACCESS_DENY_TRANSIENT_CACHE_TTL_MS;
  } else {
    ttl = ACCESS_DENY_PERMANENT_CACHE_TTL_MS;
  }
  accessCache.set(accessCacheKey(identity, projectId), {
    allowed,
    s3Prefix: allowed ? s3Prefix : null,
    expiresAt: Date.now() + ttl,
  });
}

// Structured warn marker so EC2 / CloudWatch log metric filters can pick up
// the upstream-failure cause behind a 502 from this middleware.
function emitProjectAccessFailureMarker(fields: Record<string, unknown>): void {
  try {
    const payload = {
      metric: 'teamver_project_access_5xx',
      ts: Date.now(),
      ...fields,
    };
    console.warn(JSON.stringify(payload));
  } catch {
    // structured warn must never bubble — keep middleware non-blocking.
  }
}

function classifyFetchFailure(err: unknown): {
  reason: 'timeout' | 'network';
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError' || /aborted|timed out/i.test(message)) {
    return { reason: 'timeout', message };
  }
  return { reason: 'network', message };
}

async function registerLegacyProjectInDesignApi(
  projectId: string,
  identity: TeamverRequestIdentity,
  registryHint?: TeamverProjectRegistryHint,
): Promise<boolean> {
  const url = teamverDesignApiProjectsUrl();
  if (!url) return false;

  const body: { odProjectId: string; title?: string } = { odProjectId: projectId };
  const title = registryHint?.title?.trim();
  if (title) body.title = title;

  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...teamverIdentityHeadersFromIdentity(identity),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(accessTimeoutMs()),
    });
    if (response.status === 200 || response.status === 201 || response.status === 409) {
      clearTeamverProjectAccessCache(projectId);
      return true;
    }
    // Non-success response: surface to ops so the same projectId hammering
    // the access endpoint with 404→register→denied loops gets a CloudWatch
    // alarm instead of being silently absorbed.
    emitProjectAccessFailureMarker({
      reason: 'register_failed',
      projectId,
      workspaceId: identity.workspaceId,
      httpStatus: response.status,
      elapsedMs: Date.now() - startedAt,
    });
  } catch (err) {
    const classified = classifyFetchFailure(err);
    emitProjectAccessFailureMarker({
      reason: 'register_failed',
      projectId,
      workspaceId: identity.workspaceId,
      failureReason: classified.reason,
      elapsedMs: Date.now() - startedAt,
      error: classified.message,
    });
  }
  return false;
}

async function fetchProjectAccessFromDesignApi(
  projectId: string,
  identity: TeamverRequestIdentity,
): Promise<
  | { kind: 'granted'; s3Prefix: string | null }
  | { kind: 'unauthorized' }
  | { kind: 'denied'; status: 403 | 404 }
  | { kind: 'upstream'; httpStatus: number; elapsedMs: number }
  | { kind: 'failed'; reason: 'timeout' | 'network'; message: string; elapsedMs: number }
> {
  const url = teamverProjectAccessCheckUrl(projectId);
  if (!url) return { kind: 'granted', s3Prefix: null };

  const headers = teamverIdentityHeadersFromIdentity(identity);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(accessTimeoutMs()),
    });
    if (response.status === 204) {
      return {
        kind: 'granted',
        s3Prefix: response.headers.get('x-teamver-s3-prefix')?.trim() || null,
      };
    }
    if (response.status === 401) {
      return { kind: 'unauthorized' };
    }
    if (response.status === 403) {
      return { kind: 'denied', status: 403 };
    }
    if (response.status === 404) {
      return { kind: 'denied', status: 404 };
    }
    return {
      kind: 'upstream',
      httpStatus: response.status,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (err) {
    const classified = classifyFetchFailure(err);
    return {
      kind: 'failed',
      reason: classified.reason,
      message: classified.message,
      elapsedMs: Date.now() - startedAt,
    };
  }
}

export async function verifyTeamverProjectAccess(
  projectId: string,
  identity: TeamverRequestIdentity,
  registryHint?: TeamverProjectRegistryHint,
): Promise<TeamverProjectAccessResult> {
  const cached = readCachedAccess(identity, projectId);
  if (cached) return cached;

  if (!teamverProjectAccessCheckUrl(projectId)) return { ok: true, s3Prefix: null };

  let outcome = await fetchProjectAccessFromDesignApi(projectId, identity);
  // 404 = "no design-api row yet". This is the common race after a fresh
  // create: FE has spawned daemon POST /api/projects and design-api
  // registration POST in parallel and the FE-driven subroute (e.g. GET
  // /folders) arrives at the daemon before the design-api row is committed.
  // We attempt a best-effort legacy register; the deny result that follows
  // is treated as transient so the next retry inside ~1.5s can succeed
  // instead of waiting out the 5s permanent-deny window.
  let registerAttempted = false;
  if (outcome.kind === 'denied' && outcome.status === 404) {
    registerAttempted = true;
    const registered = await registerLegacyProjectInDesignApi(projectId, identity, registryHint);
    if (registered) {
      outcome = await fetchProjectAccessFromDesignApi(projectId, identity);
    }
  }

  if (outcome.kind === 'granted') {
    rememberAccess(identity, projectId, true, outcome.s3Prefix);
    return { ok: true, s3Prefix: outcome.s3Prefix };
  }
  if (outcome.kind === 'unauthorized') {
    return { ok: false, kind: 'unauthorized' };
  }
  if (outcome.kind === 'denied') {
    // 403 — true permission deny — sticks for the full window. 404 (no row)
    // or any denial after a register attempt is treated as transient so the
    // race-with-create unwinds quickly.
    const denyKind: 'transient' | 'permanent' =
      outcome.status === 404 || registerAttempted ? 'transient' : 'permanent';
    rememberAccess(identity, projectId, false, null, { denyKind });
    return { ok: false, kind: 'denied' };
  }
  if (outcome.kind === 'upstream') {
    emitProjectAccessFailureMarker({
      reason: 'http_5xx',
      projectId,
      workspaceId: identity.workspaceId,
      httpStatus: outcome.httpStatus,
      elapsedMs: outcome.elapsedMs,
    });
    return { ok: false, kind: 'upstream' };
  }

  emitProjectAccessFailureMarker({
    reason: outcome.reason,
    projectId,
    workspaceId: identity.workspaceId,
    timeoutMs: accessTimeoutMs(),
    elapsedMs: outcome.elapsedMs,
    error: outcome.message,
  });
  return { ok: false, kind: 'upstream' };
}

export function createTeamverProjectAccessMiddleware(
  sendApiError: (...args: any[]) => any,
  resolveRegistryProject?: TeamverProjectRegistryResolver,
): RequestHandler {
  return async (req, res, next) => {
    const projectId = req.params.id;
    if (typeof projectId !== 'string' || !projectId.trim()) return next();
    if (!teamverProjectAccessCheckUrl(projectId)) return next();

    const identity = readTeamverIdentityFromRequest(req);
    if (!identity) {
      return sendApiError(res, 401, 'UNAUTHORIZED', 'teamver identity headers required');
    }

    const registryHint = resolveRegistryProject
      ? await resolveRegistryProject(projectId)
      : null;
    const result = await verifyTeamverProjectAccess(
      projectId,
      identity,
      registryHint ?? undefined,
    );
    if (result.ok) return next();
    if (result.kind === 'unauthorized') {
      return sendApiError(res, 401, 'UNAUTHORIZED', 'teamver project access unauthorized');
    }
    if (result.kind === 'denied') {
      return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
    }
    return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', 'teamver project access check failed');
  };
}
