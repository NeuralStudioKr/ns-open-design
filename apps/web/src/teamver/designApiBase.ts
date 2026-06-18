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

export function resolveTeamverLoginUrl(): string {
  const origin =
    typeof window === "undefined"
      ? "https://teamver.com"
      : resolveTeamverMainOrigin();
  return `${origin.replace(/\/+$/, "")}${TEAMVER_AUTH_SIGNIN_PATH}`;
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

export function resolveTeamverDesignApiBase(): string | null {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_DESIGN_API_URL");
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
    // Same-origin via Next.js dev rewrite (/teamver-bff → design-api :16000)
    if (isTeamverViteDev()) {
      return "";
    }
    return "http://127.0.0.1:16000";
  }
  if (host === "stg-design.teamver.com") {
    return "https://stg-design-api.teamver.com";
  }
  if (host === "design.teamver.com") {
    return "https://design-api.teamver.com";
  }
  return null;
}
