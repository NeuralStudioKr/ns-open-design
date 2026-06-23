import {
  TeamverClient,
  createLocalStorageWorkspaceStore,
  snakeToCamelDeep,
  NetworkError,
  type WorkspaceListItem,
} from "@teamver/app-sdk";
import {
  isTeamverEmbedMode,
  resolveTeamverDesignApiBase,
  resolveTeamverDesignApiCrossOriginFallback,
  resolveDesignBffRefreshUrl,
  resolveTeamverMainApiBaseUrl,
  redirectToTeamverLogin,
  prepareTeamverLoginNavigation,
} from "./designApiBase";
import { hasProbableTeamverAuthCookie } from "./teamverAuthCookieHints";
import { isTeamverEmbedSessionAuthenticated } from "./teamverEmbedSession";

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
      onAuthExpired: () => {
        redirectToTeamverLogin();
      },
    });
  }
  return cachedClient;
}

const SESSION_PROBE_OPTIONS = {
  skipAuthHeader: true,
  // Session probe — avoid SDK refresh + onAuthExpired before embed handles 401.
  skipAuthRecovery: true,
} as const;

async function postAuthRefresh(url: string): Promise<{ ok: boolean; status: number }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

let authRefreshDeclinedForSession = false;

/** @internal vitest */
export function resetDesignAuthRefreshDeclinedForTests(): void {
  authRefreshDeclinedForSession = false;
}

function resetDesignAuthRefreshDeclined(): void {
  authRefreshDeclinedForSession = false;
}

function shouldAttemptCookieRefresh(): boolean {
  if (authRefreshDeclinedForSession) return false;
  return hasProbableTeamverAuthCookie() || isTeamverEmbedSessionAuthenticated();
}

/** Cookie-only SSO: refresh may relay Set-Cookie without JSON access_token (tokenStore is null). */
export async function refreshDesignAuthCookie(): Promise<boolean> {
  if (!shouldAttemptCookieRefresh()) return false;

  const bffResult = await postAuthRefresh(resolveDesignBffRefreshUrl());
  if (bffResult.ok) {
    resetDesignAuthRefreshDeclined();
    return true;
  }
  if (bffResult.status === 400) {
    authRefreshDeclinedForSession = true;
    return false;
  }

  const mainRefresh = `${resolveTeamverMainApiBaseUrl().replace(/\/+$/, "")}/api/auth/refresh`;
  const mainResult = await postAuthRefresh(mainRefresh);
  if (mainResult.ok) {
    resetDesignAuthRefreshDeclined();
    return true;
  }
  if (mainResult.status === 400) {
    authRefreshDeclinedForSession = true;
  }
  return false;
}

/** Sign-in / post-login return — bust caches so the next probe is not stale. */
export function prepareDesignAuthSessionReload(): void {
  prepareTeamverLoginNavigation();
  resetDesignAuthRefreshDeclined();
  invalidateDesignAuthSessionCache();
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
};

let inFlightSession: Promise<DesignAuthSession | null> | null = null;
let cachedSession: { value: DesignAuthSession | null; at: number } | null = null;
const SESSION_CACHE_MS = 5_000;

/** @internal vitest */
export function resetDesignAuthSessionCacheForTests(): void {
  inFlightSession = null;
  cachedSession = null;
}

export function invalidateDesignAuthSessionCache(): void {
  cachedSession = null;
  resetDesignAuthRefreshDeclined();
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
  });
  return inFlightSession;
}

export async function fetchTeamverRuntimeConfig(): Promise<TeamverRuntimeConfigResponse | null> {
  const client = getDesignBffClient();
  if (!client) return null;
  try {
    return await client.http.get<TeamverRuntimeConfigResponse>("/runtime-config", {
      skipAuthHeader: true,
    });
  } catch {
    return null;
  }
}

export type TeamverRuntimeConfigResponse = {
  configured: boolean;
  apiProtocol?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
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
        skipAuthHeader: true,
      },
    );
  } catch {
    return null;
  }
}
