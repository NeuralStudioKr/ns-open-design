import {
  TeamverClient,
  createLocalStorageWorkspaceStore,
  type WorkspaceListItem,
} from "@teamver/app-sdk";
import {
  isTeamverEmbedMode,
  resolveTeamverDesignApiBase,
  resolveTeamverLoginUrl,
} from "./designApiBase";

export type DesignAuthSession = {
  authenticated: boolean;
  authSource?: string | null;
  appKey?: string | null;
  user?: {
    userId?: string;
    email?: string;
    displayName?: string;
    name?: string;
  } | null;
  defaultWorkspaceId?: string | null;
  workspaces?: WorkspaceListItem[];
};

let cachedClient: TeamverClient | null = null;

export function getDesignBffClient(): TeamverClient | null {
  if (!isTeamverEmbedMode()) return null;
  const base = resolveTeamverDesignApiBase();
  if (!base) return null;
  if (!cachedClient) {
    cachedClient = new TeamverClient({
      apiBaseUrl: `${base}/api/v1`,
      appKey: "design",
      tokenStore: null,
      workspaceStore: createLocalStorageWorkspaceStore({
        activeKey: "teamver_design_active_workspace_id",
        lastByUserKey: "teamver_design_last_workspace_by_user",
      }),
      withCredentials: true,
      onAuthExpired: () => {
        if (typeof window !== "undefined") {
          window.location.assign(resolveTeamverLoginUrl());
        }
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
    skipAuthRecovery: true,
  });
}
