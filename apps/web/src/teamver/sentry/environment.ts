/**
 * Sentry `environment` for Teamver Design static export.
 * Bake-time: NEXT_PUBLIC_SENTRY_ENVIRONMENT or VITE_TEAMVER_SITE_URL.
 * Runtime hostname fallback for local / unexpected hosts.
 */
export function resolveSentryEnvironment(): string {
  const explicit =
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim()
      : undefined) ||
    (typeof process !== "undefined" ? process.env.VITE_TEAMVER_SENTRY_ENVIRONMENT?.trim() : undefined);
  if (explicit) return explicit;

  const siteHint = [
    typeof process !== "undefined" ? process.env.VITE_TEAMVER_SITE_URL : "",
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SENTRY_SITE_HINT : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (/stg-design|stg\.|staging/i.test(siteHint)) return "staging";
  if (/design\.teamver\.com/i.test(siteHint) && !/stg/i.test(siteHint)) return "production";
  if (/localhost|127\.0\.0\.1/i.test(siteHint)) return "local";

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host === "stg-design.teamver.com" || host.includes("stg-design")) {
      return "staging";
    }
    if (host.endsWith("-design.teamver.com") && host.startsWith("stg")) {
      return "staging";
    }
    if (host === "design.teamver.com") return "production";
    if (host === "localhost" || host === "127.0.0.1") return "local";
  }

  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") return "local";
  return "production";
}
