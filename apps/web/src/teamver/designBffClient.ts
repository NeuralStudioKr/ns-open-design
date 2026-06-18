import {
  TeamverClient,
  createLocalStorageWorkspaceStore,
  type WorkspaceListItem,
} from "@teamver/app-sdk";
import {
  isTeamverEmbedMode,
  resolveTeamverDesignApiBase,
  redirectToTeamverLogin,
  resolveTeamverMainApiBaseUrl,
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
    const mainApiBase = resolveTeamverMainApiBaseUrl();
    cachedClient = new TeamverClient({
      apiBaseUrl,
      refreshUrl: `${mainApiBase}/api/auth/refresh`,
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

export async function fetchDesignAuthSession(): Promise<DesignAuthSession | null> {
  const client = getDesignBffClient();
  if (!client) return null;
  return client.http.get<DesignAuthSession>("/auth/session", {
    skipAuthHeader: true,
  });
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
