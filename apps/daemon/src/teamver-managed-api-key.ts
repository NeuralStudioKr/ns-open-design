import type { Request } from 'express';

import {
  isTeamverDesignManaged,
  readTeamverIdentityFromRequest,
} from './teamver-project-access.js';

export function resolveTeamverManagedApiKeyFromEnv(): string {
  return (
    (process.env.TEAMVER_OD_API_KEY ?? '').trim()
    || (process.env.ANTHROPIC_API_KEY ?? '').trim()
  );
}

/** Resolve BYOK proxy apiKey — client key or authenticated embed managed key. */
export function resolveProxyStreamApiKey(
  req: Request,
  body: { apiKey?: unknown; useManagedApiKey?: unknown },
): string | null {
  const clientKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (clientKey) return clientKey;

  if (body.useManagedApiKey !== true) return null;
  if (!isTeamverDesignManaged()) return null;
  if (!readTeamverIdentityFromRequest(req)) return null;

  const managed = resolveTeamverManagedApiKeyFromEnv();
  return managed || null;
}
