/**
 * Teamver design-api origin — Cookie SSO (Plan B).
 * Hostname-based default; override with VITE_TEAMVER_DESIGN_API_URL at build time.
 */
export function isTeamverEmbedMode(): boolean {
  const flag = (import.meta.env.VITE_TEAMVER_EMBED as string | undefined)?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host.endsWith(".teamver.com") ||
    host === "teamver.com" ||
    (import.meta.env.DEV && (host === "localhost" || host === "127.0.0.1"))
  );
}

export function resolveTeamverLoginUrl(): string {
  if (typeof window === "undefined") return "https://teamver.com/auth/login";
  const host = window.location.hostname.toLowerCase();
  if (host.startsWith("stg-") || host === "localhost" || host === "127.0.0.1") {
    return "https://stg.teamver.com/auth/login";
  }
  return "https://teamver.com/auth/login";
}

export function resolveTeamverDesignApiBase(): string | null {
  const fromEnv = (import.meta.env.VITE_TEAMVER_DESIGN_API_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") {
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
