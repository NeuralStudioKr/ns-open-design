import {
  TeamverClient,
  createLocalStorageWorkspaceStore,
  snakeToCamelDeep,
  NetworkError,
  type WorkspaceListItem,
} from "@teamver/app-sdk";
import {
  isTeamverEmbedMode,
  isBootstrapAuthMode,
  resolveTeamverDesignApiBase,
  resolveTeamverDesignApiCrossOriginFallback,
  resolveDesignBffRefreshUrl,
  prepareTeamverLoginNavigation,
} from "./designApiBase";
import { redirectToTeamverLoginPreservingRoute } from "./designAuthFlow";
import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";
import {
  clearOrphanTeamverAuthCookies,
  isOrphanTeamverJwtAuthFailure,
} from "./teamverAuthOrphanJwt";
import { hasProbableTeamverAuthCookie } from "./teamverAuthCookieHints";
import { isTeamverEmbedSessionAuthenticated } from "./teamverEmbedSession";
import {
  consumeTeamverAuthReturnPending,
  isLikelyTeamverAuthReturnNavigation,
} from "./teamverAuthReturn";

/** Post–app-sdk shape (`snakeToCamelDeep` on `/auth/session`). */
export type DesignAuthSessionUser = {
  userId?: string;
  email?: string;
  displayName?: string;
  name?: string;
  imageUrl?: string | null;
  s3ImageUrl?: string | null;
  profileImageUrl?: string | null;
};

export type DesignAuthSession = {
  authenticated: boolean;
  authSource?: string | null;
  appKey?: string | null;
  user?: DesignAuthSessionUser | null;
  defaultWorkspaceId?: string | null;
  workspaces?: WorkspaceListItem[];
};

let cachedClient: TeamverClient | null = null;

function isSdkAuthRefreshRequest(input: Parameters<typeof fetch>[0], init?: RequestInit): boolean {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "POST") return false;
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  try {
    const parsed =
      typeof window !== "undefined"
        ? new URL(rawUrl, window.location.href)
        : new URL(rawUrl);
    return parsed.pathname.endsWith("/auth/refresh");
  } catch {
    return rawUrl.endsWith("/auth/refresh");
  }
}

const DESIGN_BFF_SDK_REFRESH_DISABLED_RESPONSE = JSON.stringify({
  error: { code: "design_sdk_auth_refresh_disabled" },
});

function fetchDesignBffSdk(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  if (isSdkAuthRefreshRequest(input, init)) {
    return Promise.resolve(
      new Response(DESIGN_BFF_SDK_REFRESH_DISABLED_RESPONSE, {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
  return fetch(input, init);
}

export function getDesignBffClient(): TeamverClient | null {
  if (!isTeamverEmbedMode()) return null;
  const base = resolveTeamverDesignApiBase();
  if (base === null) return null;
  if (!cachedClient) {
    const apiBaseUrl = base === "" ? "/teamver-bff" : `${base}/api/v1`;
    cachedClient = new TeamverClient({
      apiBaseUrl,
      refreshUrl: resolveDesignBffRefreshUrl(),
      appKey: "design",
      tokenStore: null,
      workspaceStore: createLocalStorageWorkspaceStore({
        activeKey: "teamver_design_active_workspace_id",
        lastByUserKey: "teamver_design_last_workspace_by_user",
      }),
      withCredentials: true,
      fetch: fetchDesignBffSdk,
      onAuthExpired: () => {
        prepareDesignAuthSessionReload();
        redirectToTeamverLoginPreservingRoute({
          returnTo:
            typeof window !== "undefined"
              ? resolveEmbedAuthReturnPath(
                  window.location.pathname,
                  window.location.search,
                )
              : null,
        });
      },
    });
  }
  return cachedClient;
}

export const TEAMVER_BFF_REQUEST_OPTIONS = {
  skipAuthHeader: true,
  // Design embed handles cookie refresh explicitly via refreshDesignAuthCookie().
  // Keep SDK auto-recovery off so ordinary BFF 401s do not spam
  // /teamver-bff/auth/refresh or redirect before the embed auth layer decides.
  skipAuthRecovery: true,
} as const;

const SESSION_PROBE_OPTIONS = TEAMVER_BFF_REQUEST_OPTIONS;

async function postAuthRefresh(
  url: string,
): Promise<{ ok: boolean; status: number; bodyText: string }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    let bodyText = "";
    try {
      bodyText = typeof response.text === "function" ? await response.text() : "";
    } catch {
      bodyText = "";
    }
    return { ok: response.ok, status: response.status, bodyText };
  } catch {
    return { ok: false, status: 0, bodyText: "" };
  }
}

let authRefreshDeclinedForSession = false;
let unauthenticatedRefreshAttempted = false;
/** Allows BFF refresh retry on sign-in return. */
let authRecoveryRefreshActive = false;
/** One-shot load recovery — pending flag / referrer must not stick across probes. */
let embedAuthRecoveryLoadUsed = false;

/** @internal vitest */
export function resetDesignAuthRefreshDeclinedForTests(): void {
  authRefreshDeclinedForSession = false;
  unauthenticatedRefreshAttempted = false;
  authRecoveryRefreshActive = false;
  embedAuthRecoveryLoadUsed = false;
}

function resolveAuthRecoveryLoad(options?: FetchDesignAuthSessionOptions): boolean {
  if (options?.resetRefreshState) {
    embedAuthRecoveryLoadUsed = true;
    return true;
  }
  if (embedAuthRecoveryLoadUsed) return false;
  const recovery =
    consumeTeamverAuthReturnPending() || isLikelyTeamverAuthReturnNavigation();
  if (recovery) embedAuthRecoveryLoadUsed = true;
  return recovery;
}

function setAuthRecoveryRefreshActive(active: boolean): void {
  authRecoveryRefreshActive = active;
}

function resetDesignAuthRefreshDeclined(): void {
  authRefreshDeclinedForSession = false;
}

function shouldAttemptCookieRefresh(): boolean {
  if (authRefreshDeclinedForSession) return false;
  if (isBootstrapAuthMode()) {
    return authRecoveryRefreshActive || isTeamverEmbedSessionAuthenticated();
  }
  if (hasProbableTeamverAuthCookie() || isTeamverEmbedSessionAuthenticated()) return true;
  return !unauthenticatedRefreshAttempted;
}

/** Cookie-only SSO: retry a BFF request once after refresh (tokenStore is null). */
export async function withDesignBffCookieAuthRecovery<T>(
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (err) {
    if (err instanceof NetworkError && err.status === 401) {
      const refreshed = await refreshDesignAuthCookie();
      if (refreshed) return await request();
    }
    throw err;
  }
}

/** BFF silent refresh via design-api (Apps JWT stored server-side). */
export async function refreshDesignAuthCookie(): Promise<boolean> {
  if (!shouldAttemptCookieRefresh()) return false;

  const isBareAttempt =
    !isTeamverEmbedSessionAuthenticated() &&
    !isBootstrapAuthMode() &&
    !hasProbableTeamverAuthCookie();
  if (isBareAttempt) {
    unauthenticatedRefreshAttempted = true;
  }

  const bffResult = await postAuthRefresh(resolveDesignBffRefreshUrl());
  if (bffResult.ok) {
    resetDesignAuthRefreshDeclined();
    return true;
  }
  if (bffResult.status === 400 || bffResult.status === 401) {
    authRefreshDeclinedForSession = true;
    // C2 hookup: if the failure body signals an orphan JWT (valid
    // signature but the Main BE no longer knows the user — typical on
    // staging after a DB reset or a prod cookie bleed), best-effort
    // logout on the Main BE so the `.teamver.com` HttpOnly cookie is
    // cleared. Otherwise the browser retains a permanently-invalid
    // cookie and the user is stuck in a refresh-loop until they clear
    // cookies manually. Fire-and-forget: never block the refresh path.
    if (isOrphanTeamverJwtAuthFailure(bffResult.status, bffResult.bodyText)) {
      console.info(
        '[teamver] auth: orphan JWT detected on BFF refresh; clearing Main BE cookie',
        { status: bffResult.status },
      );
      void clearOrphanTeamverAuthCookies();
    }
  }
  return false;
}

/** Sign-in / post-login return — bust caches so the next probe is not stale. */
export function prepareDesignAuthSessionReload(): void {
  prepareTeamverLoginNavigation();
  resetDesignAuthRefreshState();
  invalidateDesignAuthSessionCache();
}

/**
 * Sticky 400/401 guard reset — only for events that legitimately indicate auth
 * state may have changed (post sign-in return, explicit user retry, or a fresh
 * cookie hint appearing). Visibility/focus alone must NOT call this, otherwise
 * `/teamver-bff/auth/refresh` keeps spamming 400 on every tab switch when the
 * underlying account is missing/deleted.
 */
export function resetDesignAuthRefreshState(): void {
  authRefreshDeclinedForSession = false;
  unauthenticatedRefreshAttempted = false;
  embedAuthRecoveryLoadUsed = false;
}

/** Sticky 400 from `/teamver-bff/auth/refresh` — UI may offer explicit retry. */
export function isDesignAuthRefreshDeclined(): boolean {
  return authRefreshDeclinedForSession;
}

/**
 * Re-allow a single HttpOnly-only refresh attempt (cross-tab login) without
 * clearing the sticky 400 decline guard.
 */
export function resetDesignAuthBareRefreshAttempt(): void {
  unauthenticatedRefreshAttempted = false;
}

function normalizeDesignAuthSession(raw: unknown): DesignAuthSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.authenticated !== "boolean") return null;
  return raw as DesignAuthSession;
}

async function probeDesignAuthSession(client: TeamverClient): Promise<DesignAuthSession> {
  const raw = await client.http.get<unknown>("/auth/session", SESSION_PROBE_OPTIONS);
  const session = normalizeDesignAuthSession(raw);
  if (session) return session;
  throw new NetworkError({
    status: 404,
    message: "Invalid session response (expected JSON from design-api BFF)",
  });
}

function shouldUseDesignApiSessionFallback(err: unknown): boolean {
  if (!(err instanceof NetworkError)) return false;
  return err.status === 0 || err.status === 404 || err.status === 502;
}

async function fetchDesignAuthSessionCrossOriginFallback(): Promise<DesignAuthSession | null> {
  const origin = resolveTeamverDesignApiCrossOriginFallback();
  if (!origin) return null;
  const url = `${origin.replace(/\/+$/, "")}/api/v1/auth/session`;
  try {
    const response = await fetch(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    return normalizeDesignAuthSession(snakeToCamelDeep(body));
  } catch {
    return null;
  }
}

export type FetchDesignAuthSessionOptions = {
  /** Bypass short-lived cache — tab focus / explicit re-auth. */
  force?: boolean;
  /**
   * Clear sticky refresh-decline markers before probing. Use only for events
   * that justify retrying a previously-declined refresh (explicit user retry,
   * post sign-in return). Auto-refresh on visibility/focus must leave this
   * unset, otherwise a 400 from `/teamver-bff/auth/refresh` (e.g. deleted
   * account) repeats on every tab switch.
   */
  resetRefreshState?: boolean;
};

let inFlightSession: Promise<DesignAuthSession | null> | null = null;
let cachedSession: { value: DesignAuthSession | null; at: number } | null = null;
const SESSION_CACHE_MS = 60_000;

/** @internal vitest */
export function resetDesignAuthSessionCacheForTests(): void {
  inFlightSession = null;
  cachedSession = null;
}

/**
 * Clear the short-lived `/auth/session` cache so the next probe re-hits the
 * BFF. Decline markers (`authRefreshDeclinedForSession`,
 * `unauthenticatedRefreshAttempted`) are **intentionally preserved** — see
 * `resetDesignAuthRefreshState` for the explicit reset path used by sign-in
 * return, user retry button, and "new cookie hint detected".
 */
export function invalidateDesignAuthSessionCache(): void {
  cachedSession = null;
}

/** Session snapshot metadata for workspace store reconciliation (loop 425). */
export function readCachedDesignAuthSessionMeta(): {
  fetchedAt: number;
  defaultWorkspaceId: string | null;
} | null {
  if (!cachedSession?.value?.authenticated) return null;
  const defaultWorkspaceId = (cachedSession.value.defaultWorkspaceId ?? "").trim() || null;
  return { fetchedAt: cachedSession.at, defaultWorkspaceId };
}

async function loadDesignAuthSessionOnce(): Promise<DesignAuthSession | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  const loadSession = async (): Promise<DesignAuthSession> => {
    try {
      return await probeDesignAuthSession(client);
    } catch (err) {
      if (shouldUseDesignApiSessionFallback(err)) {
        const fallback = await fetchDesignAuthSessionCrossOriginFallback();
        if (fallback) return fallback;
      }
      throw err;
    }
  };

  const loadWithAuthRecovery = async (): Promise<DesignAuthSession> => {
    try {
      return await loadSession();
    } catch (err) {
      if (err instanceof NetworkError && err.status === 401) {
        const refreshed = await refreshDesignAuthCookie();
        if (refreshed) return await loadSession();
      }
      throw err;
    }
  };

  let session = await loadWithAuthRecovery();
  if (session.authenticated) return session;

  // Plan B cookie SSO — only when refresh credentials may exist (skip bare 400 spam).
  if (shouldAttemptCookieRefresh()) {
    const refreshed = await refreshDesignAuthCookie();
    if (refreshed) {
      session = await loadWithAuthRecovery();
      if (session.authenticated) return session;
    }
  }

  return session;
}

export async function fetchDesignAuthSession(
  options?: FetchDesignAuthSessionOptions,
): Promise<DesignAuthSession | null> {
  const force = options?.force ?? false;
  const recoveryLoad = resolveAuthRecoveryLoad(options);

  if (options?.resetRefreshState) {
    resetDesignAuthRefreshState();
  }

  setAuthRecoveryRefreshActive(recoveryLoad);

  if (force) {
    invalidateDesignAuthSessionCache();
    if (inFlightSession) {
      await inFlightSession.catch(() => null);
    }
  } else if (inFlightSession) {
    return inFlightSession;
  }

  if (
    !force &&
    cachedSession &&
    Date.now() - cachedSession.at < SESSION_CACHE_MS
  ) {
    return cachedSession.value;
  }

  const run = async (): Promise<DesignAuthSession | null> => {
    const value = await loadDesignAuthSessionOnce();
    if (value?.authenticated) {
      cachedSession = { value, at: Date.now() };
    } else {
      cachedSession = null;
    }
    return value;
  };

  inFlightSession = run().finally(() => {
    inFlightSession = null;
    setAuthRecoveryRefreshActive(false);
  });
  return inFlightSession;
}

export type FetchTeamverRuntimeConfigOptions = {
  /** Bypass short-lived cache — workspace switch / explicit reload. */
  force?: boolean;
};

let runtimeConfigInflight: Promise<TeamverRuntimeConfigResponse | null> | null = null;
let cachedRuntimeConfig: { value: TeamverRuntimeConfigResponse | null; at: number } | null = null;
const RUNTIME_CONFIG_CACHE_MS = 60_000;

/** @internal vitest */
export function resetTeamverRuntimeConfigCacheForTests(): void {
  runtimeConfigInflight = null;
  cachedRuntimeConfig = null;
}

export async function fetchTeamverRuntimeConfig(
  options?: FetchTeamverRuntimeConfigOptions,
): Promise<TeamverRuntimeConfigResponse | null> {
  const force = options?.force ?? false;
  if (!force && runtimeConfigInflight) return runtimeConfigInflight;
  if (
    !force &&
    cachedRuntimeConfig &&
    Date.now() - cachedRuntimeConfig.at < RUNTIME_CONFIG_CACHE_MS
  ) {
    return cachedRuntimeConfig.value;
  }

  const client = getDesignBffClient();
  if (!client) return null;

  const run = (async (): Promise<TeamverRuntimeConfigResponse | null> => {
    try {
      const value = await client.http.get<TeamverRuntimeConfigResponse>("/runtime-config", {
        ...TEAMVER_BFF_REQUEST_OPTIONS,
      });
      cachedRuntimeConfig = { value, at: Date.now() };
      return value;
    } catch {
      return null;
    } finally {
      runtimeConfigInflight = null;
    }
  })();

  runtimeConfigInflight = run;
  return run;
}

export type TeamverRuntimeConfigResponse = {
  configured: boolean;
  apiProtocol?: string;
  baseUrl?: string;
  model?: string;
  apiKeyConfigured?: boolean;
};

export type TeamverWorkspacePermissions = {
  workspaceId?: string;
  appEnabled?: boolean;
  appDisabledReason?: string | null;
  isMember?: boolean;
};

export async function fetchTeamverWorkspacePermissions(
  workspaceId: string,
): Promise<TeamverWorkspacePermissions | null> {
  const client = getDesignBffClient();
  if (!client) return null;
  const trimmed = workspaceId.trim();
  if (!trimmed) return null;
  try {
    return await client.http.get<TeamverWorkspacePermissions>(
      `/permissions/${encodeURIComponent(trimmed)}`,
      {
        workspaceId: trimmed,
        ...TEAMVER_BFF_REQUEST_OPTIONS,
      },
    );
  } catch {
    return null;
  }
}
