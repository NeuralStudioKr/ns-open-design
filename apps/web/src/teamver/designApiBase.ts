/**
 * Teamver design-api origin — Apps JWT BFF (15_8) on hosted; Plan B returnTo on localhost dev.
 * Hostname-based default; override with VITE_TEAMVER_DESIGN_API_URL at build time.
 */
import { isTeamverViteDev, readTeamverViteEnv } from "./teamverViteEnv";
import { markTeamverAuthReturnPending } from "./teamverAuthReturn";

export const TEAMVER_DESIGN_APP_ID = "teamver-design";

export function isTeamverEmbedMode(): boolean {
  const flag = readTeamverViteEnv("VITE_TEAMVER_EMBED")?.toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith(".teamver.com") ||
    host === "teamver.com" ||
    (isTeamverViteDev() && (host === "localhost" || host === "127.0.0.1"))
  );
}

/** Main FE sign-in path — must match `ns-teamver-fe-v2` `AUTH_SIGNIN_PATH`. */
export const TEAMVER_AUTH_SIGNIN_PATH = "/auth/signin";

/** Query param for post-login redirect — must match `ns-teamver-fe-v2` `AUTH_RETURN_TO_PARAM`. */
export const TEAMVER_AUTH_RETURN_TO_PARAM = "returnTo";

export function appendTeamverAuthReturnTo(loginUrl: string, returnTo: string): string {
  const url = new URL(loginUrl);
  url.searchParams.set(TEAMVER_AUTH_RETURN_TO_PARAM, returnTo);
  return url.toString();
}

export function resolveTeamverLoginReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  return window.location.href;
}

export function isBootstrapAuthMode(): boolean {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_BOOTSTRAP_ENABLED")?.toLowerCase();
  if (fromEnv === "1" || fromEnv === "true" || fromEnv === "yes") return true;
  if (fromEnv === "0" || fromEnv === "false" || fromEnv === "no") return false;
  if (typeof window === "undefined") return true;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith(".teamver.com") || host === "teamver.com";
}

export function getMainLoginBaseUrl(): string {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_MAIN_LOGIN_URL");
  if (fromEnv?.trim()) return fromEnv.trim().replace(/\/+$/, "");
  return `${resolveTeamverMainOrigin()}${TEAMVER_AUTH_SIGNIN_PATH}`;
}

export function buildAuthCallbackRedirectUrl(callbackPath = "/auth/callback"): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://design.teamver.com";
  const path = callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`;
  const combined = `${origin}${path}`;
  return combined.replace(/\/+$/, "") || `${origin}/auth/callback`;
}

export function buildDesignColdStartLoginUrl(options?: {
  workspaceId?: string | null;
  callbackPath?: string;
  mainLoginUrl?: string | null;
}): string {
  const callbackPath = options?.callbackPath ?? "/auth/callback";
  const redirectUrl = buildAuthCallbackRedirectUrl(callbackPath);
  const base = (options?.mainLoginUrl || "").trim() || getMainLoginBaseUrl();
  const params = new URLSearchParams({
    app_id: TEAMVER_DESIGN_APP_ID,
    redirect_url: redirectUrl,
  });
  const ws = options?.workspaceId?.trim();
  if (ws) params.set("workspace_id", ws);
  return `${base}?${params.toString()}`;
}

export function resolveTeamverLoginUrl(returnTo?: string | null): string {
  if (isBootstrapAuthMode()) {
    return buildDesignColdStartLoginUrl();
  }
  const origin =
    typeof window === "undefined"
      ? "https://teamver.com"
      : resolveTeamverMainOrigin();
  const base = `${origin.replace(/\/+$/, "")}${TEAMVER_AUTH_SIGNIN_PATH}`;
  const target = returnTo?.trim() || resolveTeamverLoginReturnTo();
  if (!target) return base;
  return appendTeamverAuthReturnTo(base, target);
}

/** 세션 만료 시 Main FE sign-in 으로 이동 — history 에 Design URL 이 남지 않도록 replace 사용 */
const LOGIN_REDIRECT_COOLDOWN_MS = 5_000;
const LOGIN_REDIRECT_STORAGE_KEY = "teamver:login-redirect-at";

export function resetTeamverLoginRedirectCooldown(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LOGIN_REDIRECT_STORAGE_KEY);
  } catch {
    // sessionStorage blocked
  }
}

/** Sign-in navigation — drop stale session cache so post-login probe is fresh. */
export function prepareTeamverLoginNavigation(): void {
  resetTeamverLoginRedirectCooldown();
  markTeamverAuthReturnPending();
}

export function redirectToTeamverLogin(returnTo?: string | null): void {
  if (typeof window === "undefined") return;

  const now = Date.now();
  try {
    const last = Number(sessionStorage.getItem(LOGIN_REDIRECT_STORAGE_KEY) ?? "0");
    if (last > 0 && now - last < LOGIN_REDIRECT_COOLDOWN_MS) return;
    sessionStorage.setItem(LOGIN_REDIRECT_STORAGE_KEY, String(now));
  } catch {
    // sessionStorage blocked — still attempt one redirect
  }

  window.location.replace(resolveTeamverLoginUrl(returnTo));
}

/** Main FE origin — stg.teamver.com / teamver.com */
export function resolveTeamverMainOrigin(): string {
  if (typeof window === "undefined") return "https://teamver.com";
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("stg-") || host === "localhost" || host === "127.0.0.1") {
    return "https://stg.teamver.com";
  }
  return "https://teamver.com";
}

/** Main BE API base — cookie SSO refresh target (10 §3.2). */
export function resolveTeamverMainApiBaseUrl(): string {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_MAIN_API_URL");
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (typeof window === "undefined") return "https://api.teamver.com";
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("stg-") || host === "localhost" || host === "127.0.0.1") {
    return "https://stg-api.teamver.com";
  }
  if (host.endsWith(".teamver.com") || host === "teamver.com") {
    return "https://api.teamver.com";
  }
  return "http://127.0.0.1:8000";
}

/** Main BE Drive asset deep link — opens detail modal via `?asset=` (D-6). */
export function resolveTeamverDriveAssetUrl(assetId: string): string {
  const id = assetId.trim();
  const origin = resolveTeamverMainOrigin().replace(/\/+$/, "");
  return `${origin}/drive?asset=${encodeURIComponent(id)}`;
}

/** Same-origin BFF base for Drive browse/search (proxies to Main BE via design-api). */
export function resolveTeamverDriveBffBase(): string {
  const designBase = resolveTeamverDesignApiBase();
  if (designBase === "") return "/teamver-bff/drive";
  if (designBase) return `${designBase.replace(/\/+$/, "")}/api/v1/drive`;
  return "http://127.0.0.1:16000/api/v1/drive";
}

/** Cross-origin design-api when same-origin `/teamver-bff` is unavailable (nginx inc 미적용 등). */
export function resolveTeamverDesignApiCrossOriginFallback(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (host === "stg-design.teamver.com") return "https://stg-design-api.teamver.com";
  if (host === "design.teamver.com") return "https://design-api.teamver.com";
  return null;
}

/** Cookie SSO refresh — same-origin BFF 우선 (Set-Cookie relay). */
export function resolveDesignBffRefreshUrl(): string {
  const base = resolveTeamverDesignApiBase();
  if (base === "") return "/teamver-bff/auth/refresh";
  if (base) return `${base.replace(/\/+$/, "")}/api/v1/auth/refresh`;
  return `${resolveTeamverMainApiBaseUrl()}/api/auth/refresh`;
}

export function resolveTeamverDesignApiBase(): string | null {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_DESIGN_API_URL");
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    // Same-origin via Next.js dev rewrite or daemon `/teamver-bff` proxy (docker embed).
    if (isTeamverViteDev() || isTeamverEmbedMode()) {
      return "";
    }
    return "http://127.0.0.1:16000";
  }
  // Same-origin BFF on the OD host — cookies ride with the page load and nginx
  // auth_request sees the same Cookie header as HTML (avoids cross-subdomain loops).
  if (host === "stg-design.teamver.com" || host === "design.teamver.com") {
    return "";
  }
  if (host === "stg-design-api.teamver.com") {
    return "https://stg-design-api.teamver.com";
  }
  if (host === "design-api.teamver.com") {
    return "https://design-api.teamver.com";
  }
  return null;
}
