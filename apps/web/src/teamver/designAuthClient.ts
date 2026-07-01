/**
 * Design BFF auth API — Mail appsAuthClient pattern (15_8).
 */

import { resolveTeamverDesignApiBase } from "./designApiBase";

export type DesignAuthConfig = {
  authMode: "jwt" | "session";
  localLoginEnabled: boolean;
  appId: string;
  mainLoginUrl?: string | null;
  bffSessionEnabled?: boolean;
};

export type DesignBffAuthSession = {
  authenticated: boolean;
  userId?: string;
  workspaceId?: string | null;
  aud?: string | null;
  accessExpiresAt?: number;
  user?: { userId?: string };
};

let cachedAuthConfig: DesignAuthConfig | null = null;
let inflightConfig: Promise<DesignAuthConfig> | null = null;

function resolveBffApiBase(): string {
  const base = resolveTeamverDesignApiBase();
  if (base === "") return "/teamver-bff";
  if (base) return `${base.replace(/\/+$/, "")}/api/v1`;
  return "http://127.0.0.1:16000/api/v1";
}

function normalizeAuthConfig(raw: Record<string, unknown>): DesignAuthConfig {
  return {
    authMode: raw.auth_mode === "session" ? "session" : "jwt",
    localLoginEnabled: Boolean(raw.local_login_enabled),
    appId: String(raw.app_id || "teamver-design"),
    mainLoginUrl: typeof raw.main_login_url === "string" ? raw.main_login_url : null,
    bffSessionEnabled: raw.bff_session_enabled !== false,
  };
}

export function invalidateDesignAuthConfigCache(): void {
  cachedAuthConfig = null;
  inflightConfig = null;
}

export async function fetchDesignAuthConfig(force = false): Promise<DesignAuthConfig> {
  if (cachedAuthConfig && !force) return cachedAuthConfig;
  if (inflightConfig && !force) return inflightConfig;

  const run = (async (): Promise<DesignAuthConfig> => {
    const url = `${resolveBffApiBase()}/design/auth/config`;
    const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`design_auth_config_${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    cachedAuthConfig = normalizeAuthConfig(body);
    return cachedAuthConfig;
  })();

  inflightConfig = run.finally(() => {
    inflightConfig = null;
  });
  return inflightConfig;
}

export async function postDesignAuthExchange(
  code: string,
  redirectUrl: string,
  workspaceId?: string | null,
): Promise<void> {
  const ws = workspaceId?.trim();
  const res = await fetch(`${resolveBffApiBase()}/design/auth/exchange`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      code,
      redirect_url: redirectUrl,
      ...(ws ? { workspace_id: ws } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw body;
  }
}

export async function postDesignAuthWorkspace(workspaceId: string): Promise<void> {
  const res = await fetch(`${resolveBffApiBase()}/auth/workspace`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw body;
  }
}

export async function postDesignAuthLogout(): Promise<void> {
  await fetch(`${resolveBffApiBase()}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function fetchDesignBffAuthSession(): Promise<DesignBffAuthSession> {
  const res = await fetch(`${resolveBffApiBase()}/auth/session`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) return { authenticated: false };
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw body;
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return {
    authenticated: Boolean(raw.authenticated),
    userId: typeof raw.user_id === "string" ? raw.user_id : undefined,
    workspaceId: typeof raw.workspace_id === "string" ? raw.workspace_id : null,
    aud: typeof raw.aud === "string" ? raw.aud : null,
    accessExpiresAt: typeof raw.access_expires_at === "number" ? raw.access_expires_at : undefined,
    user:
      typeof raw.user === "object" && raw.user !== null
        ? { userId: (raw.user as Record<string, unknown>).user_id as string | undefined }
        : undefined,
  };
}
