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
  redirectToTeamverLogin,
} from "./designApiBase";

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

/** Cookie-only SSO: refresh may relay Set-Cookie without JSON access_token (tokenStore is null). */
export async function refreshDesignAuthCookie(): Promise<boolean> {
  try {
    const response = await fetch(resolveDesignBffRefreshUrl(), {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function probeDesignAuthSession(client: TeamverClient): Promise<DesignAuthSession> {
  return client.http.get<DesignAuthSession>("/auth/session", SESSION_PROBE_OPTIONS);
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
    if (!response.ok) {
      throw new NetworkError({
        status: response.status,
        message: `Session fallback failed (${response.status})`,
        code: "HTTP",
      });
    }
    const body = (await response.json()) as Record<string, unknown>;
    return snakeToCamelDeep(body) as DesignAuthSession;
  } catch {
    return null;
  }
}

export async function fetchDesignAuthSession(): Promise<DesignAuthSession | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  const loadSession = async (): Promise<DesignAuthSession> => {
    try {
      return await probeDesignAuthSession(client);
    } catch (err) {
      const fallback = await fetchDesignAuthSessionCrossOriginFallback();
      if (fallback) return fallback;
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

  // Plan B cookie SSO — Main BE refresh updates HttpOnly cookie; retry session probe.
  const refreshed = await refreshDesignAuthCookie();
  if (refreshed) {
    session = await loadWithAuthRecovery();
    if (session.authenticated) return session;
  }

  return session;
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
