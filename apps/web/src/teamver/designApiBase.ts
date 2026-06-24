/**
 * Teamver design-api origin — Cookie SSO (Plan B).
 * Hostname-based default; override with VITE_TEAMVER_DESIGN_API_URL at build time.
 */
import { isTeamverViteDev, readTeamverViteEnv } from "./teamverViteEnv";

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

export function resolveTeamverLoginUrl(returnTo?: string | null): string {
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

/** Main FE Drive asset deep link — opens detail modal via `?asset=` (D-6). */
export function resolveTeamverDriveAssetUrl(assetId: string): string {
  const id = assetId.trim();
  const origin = resolveTeamverMainOrigin().replace(/\/+$/, "");
  return `${origin}/drive?asset=${encodeURIComponent(id)}`;
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
