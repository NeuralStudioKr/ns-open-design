import type { Request } from 'express';

import {
  isTeamverDesignManaged,
  readTeamverIdentityFromRequest,
} from './teamver-project-access.js';
import {
  MINIMAX_PROVIDER_ID,
  resolveTeamverMiniMaxApiKeyFromEnv,
} from './minimax-runtime.js';

export type ManagedProviderId = 'anthropic' | typeof MINIMAX_PROVIDER_ID;
export type TeamverManagedProviderId = ManagedProviderId;

export function resolveTeamverManagedApiKeyFromEnvForProvider(
  provider: ManagedProviderId = 'anthropic',
): string {
  if (provider === MINIMAX_PROVIDER_ID) return resolveTeamverMiniMaxApiKeyFromEnv();
  return (
    (process.env.TEAMVER_OD_API_KEY ?? '').trim()
    || (process.env.ANTHROPIC_API_KEY ?? '').trim()
  );
}

/** Anthropic/Claude managed key (legacy name — unchanged semantics). */
export function resolveTeamverManagedApiKeyFromEnv(): string {
  return resolveTeamverManagedApiKeyFromEnvForProvider('anthropic');
}

/**
 * Why the proxy key resolution returned null. Surfaced to the caller so the
 * route can pick a specific error code (instead of a generic BAD_REQUEST that
 * leaves the FE with `error_code: n/a`) and so we can emit a structured marker
 * for the operationally-actionable case (managed key missing despite the FE
 * asking for managed mode).
 */
export type ProxyApiKeyResolutionFailure =
  | { reason: 'no_client_key_and_no_managed' }
  | { reason: 'managed_not_supported' }
  | { reason: 'managed_identity_missing' }
  | { reason: 'managed_key_env_missing'; provider: ManagedProviderId };

export type ProxyApiKeyResolution =
  | { ok: true; apiKey: string; source: 'client' | 'managed'; provider?: ManagedProviderId }
  | { ok: false; failure: ProxyApiKeyResolutionFailure };

function providerFromProxyBody(
  body: { apiProtocol?: unknown },
  fallback: ManagedProviderId,
): ManagedProviderId {
  return body.apiProtocol === MINIMAX_PROVIDER_ID ? MINIMAX_PROVIDER_ID : fallback;
}

function wantsManagedProxyKey(
  req: Request,
  body: { apiKey?: unknown; useManagedApiKey?: unknown },
  clientKey: string,
): boolean {
  if (body.useManagedApiKey === true) return true;
  if (clientKey) return false;
  // Legacy / stale embed bundles sometimes omit `useManagedApiKey` while still
  // posting an empty apiKey. Authenticated Teamver embed traffic always arrives
  // with nginx-injected identity headers on /api/proxy/* — infer managed mode
  // so a missed web rebuild does not strand runs on API_KEY_REQUIRED.
  return Boolean(isTeamverDesignManaged() && readTeamverIdentityFromRequest(req));
}

/** Detailed resolver — preferred for new code so the route can emit a specific error. */
export function resolveProxyStreamApiKeyDetailed(
  req: Request,
  body: { apiKey?: unknown; useManagedApiKey?: unknown; apiProtocol?: unknown },
  opts: { provider?: ManagedProviderId } = {},
): ProxyApiKeyResolution {
  const provider = providerFromProxyBody(body, opts.provider ?? 'anthropic');
  const clientKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (clientKey) return { ok: true, apiKey: clientKey, source: 'client', provider };

  if (!wantsManagedProxyKey(req, body, clientKey)) {
    return { ok: false, failure: { reason: 'no_client_key_and_no_managed' } };
  }
  if (body.useManagedApiKey !== true) {
    emitManagedProxyKeyInferredMarker(req, provider);
  }
  if (!isTeamverDesignManaged()) {
    return { ok: false, failure: { reason: 'managed_not_supported' } };
  }
  if (!readTeamverIdentityFromRequest(req)) {
    return { ok: false, failure: { reason: 'managed_identity_missing' } };
  }

  const managed = resolveTeamverManagedApiKeyFromEnvForProvider(provider);
  if (!managed) {
    emitManagedApiKeyMissingMarker(req, provider);
    return { ok: false, failure: { reason: 'managed_key_env_missing', provider } };
  }
  return { ok: true, apiKey: managed, source: 'managed', provider };
}

/** Resolve BYOK proxy apiKey — client key or authenticated embed managed key. */
export function resolveProxyStreamApiKey(
  req: Request,
  body: { apiKey?: unknown; useManagedApiKey?: unknown; apiProtocol?: unknown },
  opts: { provider?: ManagedProviderId } = {},
): string | null {
  const result = resolveProxyStreamApiKeyDetailed(req, body, opts);
  return result.ok ? result.apiKey : null;
}

function firstHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  return String(value ?? '').trim();
}

function emitManagedProxyKeyInferredMarker(req: Request, provider: ManagedProviderId): void {
  try {
    console.info(
      JSON.stringify({
        metric: 'od_proxy_managed_key_inferred',
        provider,
        ts: Date.now(),
        workspaceId: firstHeader(req.headers['x-teamver-workspace-id'])
          || firstHeader(req.headers['x-workspace-id']) || null,
        userId: firstHeader(req.headers['x-teamver-user-id']) || null,
        route: typeof req.path === 'string' ? req.path : null,
      }),
    );
  } catch {
    // best-effort observability
  }
}

function emitManagedApiKeyMissingMarker(req: Request, provider: ManagedProviderId): void {
  try {
    const payload = {
      metric: provider === MINIMAX_PROVIDER_ID
        ? 'teamver_managed_minimax_key_missing'
        : 'teamver_managed_api_key_missing',
      ts: Date.now(),
      provider,
      workspaceId: firstHeader(req.headers['x-teamver-workspace-id'])
        || firstHeader(req.headers['x-workspace-id']) || null,
      userId: firstHeader(req.headers['x-teamver-user-id']) || null,
      route: typeof req.path === 'string' ? req.path : null,
      hint: provider === MINIMAX_PROVIDER_ID
        ? 'TEAMVER_MINIMAX_API_KEY (or OD_MINIMAX_API_KEY / MINIMAX_API_KEY) missing from open-design-daemon env.'
        : 'TEAMVER_OD_API_KEY (and/or ANTHROPIC_API_KEY) missing from open-design-daemon env; '
          + 'rebuild + redeploy with the latest .env.{staging,production}.',
    };
    console.warn(JSON.stringify(payload));
  } catch {
    // Structured warn must never bubble — managed key failure already
    // surfaces to the caller via the resolution result.
  }
}

/**
 * Stable error code returned to the FE so the chat UI can surface a specific
 * "managed key missing" failure card instead of `error_code: n/a`. The same
 * code is matched on the FE inside ChatPane diagnostic copy.
 */
export const PROXY_API_KEY_MISSING_ERROR_CODE = 'MANAGED_API_KEY_MISSING';
export const PROXY_MINIMAX_API_KEY_MISSING_ERROR_CODE = 'MINIMAX_API_KEY_MISSING';
/** 400-class managed-key failures (identity / unsupported daemon mode). */
export const MANAGED_KEY_UNAVAILABLE = 'MANAGED_KEY_UNAVAILABLE';
export const PROXY_API_KEY_MISSING_MESSAGE =
  'Server-managed BYOK key is not configured on this daemon. '
  + 'Ask the operator to set TEAMVER_OD_API_KEY in the daemon environment '
  + '(deploy/teamver/.env.{staging,production}) and restart the container.';
export const PROXY_MINIMAX_API_KEY_MISSING_MESSAGE =
  'Server-managed MiniMax key is not configured on this daemon. '
  + 'Set TEAMVER_MINIMAX_API_KEY in deploy/teamver/.env.{staging,production} and restart the container.';

export function proxyApiKeyFailureToErrorCode(
  failure: ProxyApiKeyResolutionFailure,
  options: { provider?: TeamverManagedProviderId } = {},
): { httpStatus: number; code: string; message: string } {
  if (failure.reason === 'managed_key_env_missing') {
    const provider = failure.provider ?? options.provider ?? 'anthropic';
    if (provider === MINIMAX_PROVIDER_ID) {
      return {
        httpStatus: 503,
        code: PROXY_MINIMAX_API_KEY_MISSING_ERROR_CODE,
        message: PROXY_MINIMAX_API_KEY_MISSING_MESSAGE,
      };
    }
    return {
      httpStatus: 503,
      code: PROXY_API_KEY_MISSING_ERROR_CODE,
      message: PROXY_API_KEY_MISSING_MESSAGE,
    };
  }
  // Identity / managed-not-supported / no-client-key — these are caller-side
  // mistakes (FE forgot to send identity headers, or asked for managed mode
  // against a non-managed daemon). They map to 400 BAD_REQUEST with a more
  // descriptive code so the FE diagnostic copy has something to show.
  if (failure.reason === 'managed_identity_missing') {
    return {
      httpStatus: 400,
      code: MANAGED_KEY_UNAVAILABLE,
      message: 'managed API key requested but X-Teamver-* identity headers missing',
    };
  }
  if (failure.reason === 'managed_not_supported') {
    return {
      httpStatus: 400,
      code: MANAGED_KEY_UNAVAILABLE,
      message: 'managed API key requested but TEAMVER_DESIGN_API_URL is not configured',
    };
  }
  return {
    httpStatus: 400,
    code: 'API_KEY_REQUIRED',
    message: 'apiKey or useManagedApiKey is required',
  };
}
