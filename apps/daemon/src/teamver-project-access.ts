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

function teamverIdentityHeaders(req: Request): Record<string, string> | null {
  const identity = readTeamverIdentityFromRequest(req);
  return identity ? teamverIdentityHeadersFromIdentity(identity) : null;
}

export function teamverAccessTimeoutMs(): number {
  const parsed = Number(process.env.TEAMVER_PROJECT_ACCESS_TIMEOUT_MS ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function accessTimeoutMs(): number {
  return teamverAccessTimeoutMs();
}

export function createTeamverProjectAccessMiddleware(sendApiError: (...args: any[]) => any): RequestHandler {
  return async (req, res, next) => {
    const projectId = req.params.id;
    if (typeof projectId !== 'string' || !projectId.trim()) return next();
    const url = teamverProjectAccessCheckUrl(projectId);
    if (!url) return next();

    const headers = teamverIdentityHeaders(req);
    if (!headers) {
      return sendApiError(res, 401, 'UNAUTHORIZED', 'teamver identity headers required');
    }

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
      return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', 'teamver project access check failed');
    } catch {
      return sendApiError(res, 502, 'UPSTREAM_UNAVAILABLE', 'teamver project access check unavailable');
    }
  };
}
