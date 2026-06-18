import type { Request, RequestHandler } from 'express';

const DEFAULT_TIMEOUT_MS = 2500;

export type TeamverRequestIdentity = {
  userId: string;
  workspaceId: string;
  authorization?: string;
};

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

function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return String(value ?? '').trim();
}

export function readTeamverIdentityFromRequest(req: Request): TeamverRequestIdentity | null {
  const userId = firstHeaderValue(req.headers['x-teamver-user-id']);
  const workspaceId = firstHeaderValue(req.headers['x-teamver-workspace-id']);
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

// Structured warn marker so EC2 / CloudWatch log metric filters can pick up
// the upstream-failure cause behind a 502 from this middleware.
//
// Filter (CloudWatch Logs Insights):
//   { $.metric = "teamver_project_access_5xx" && $.reason != "ok" }
//
// We never throw from here — the middleware always returns a structured
// API error to the caller; the warn is observability only.
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
  // AbortSignal.timeout fires AbortError with name 'TimeoutError' on Node 18+ /
  // 'AbortError' on older runtimes. Treat both as timeout.
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError' || /aborted|timed out/i.test(message)) {
    return { reason: 'timeout', message };
  }
  return { reason: 'network', message };
}

export function createTeamverProjectAccessMiddleware(sendApiError: (...args: any[]) => any): RequestHandler {
  return async (req, res, next) => {
    const projectId = req.params.id;
    if (typeof projectId !== 'string' || !projectId.trim()) return next();
    const url = teamverProjectAccessCheckUrl(projectId);
    if (!url) return next();

    const identity = readTeamverIdentityFromRequest(req);
    if (!identity) {
      return sendApiError(res, 401, 'UNAUTHORIZED', 'teamver identity headers required');
    }
    const headers = teamverIdentityHeadersFromIdentity(identity);
    const startedAt = Date.now();

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(accessTimeoutMs()),
      });
      if (response.status === 204) return next();
      if (response.status === 401) {
        return sendApiError(res, 401, 'UNAUTHORIZED', 'teamver project access unauthorized');
      }
      if (response.status === 403 || response.status === 404) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      // Anything else (5xx, redirects, …) → emit marker + 502.
      emitProjectAccessFailureMarker({
        reason: 'http_5xx',
        projectId,
        workspaceId: identity.workspaceId,
        httpStatus: response.status,
        elapsedMs: Date.now() - startedAt,
      });
      return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', 'teamver project access check failed');
    } catch (err) {
      const classified = classifyFetchFailure(err);
      emitProjectAccessFailureMarker({
        reason: classified.reason,
        projectId,
        workspaceId: identity.workspaceId,
        timeoutMs: accessTimeoutMs(),
        elapsedMs: Date.now() - startedAt,
        error: classified.message,
      });
      return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', 'teamver project access check unavailable');
    }
  };
}
