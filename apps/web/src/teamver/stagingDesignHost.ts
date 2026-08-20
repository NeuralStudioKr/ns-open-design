import { readTeamverViteEnv } from "./teamverViteEnv";

/** True on bake-time staging site URL or live `stg-design.teamver.com` host. */
export function isTeamverStagingDesignHost(): boolean {
  const siteUrl = readTeamverViteEnv("VITE_TEAMVER_SITE_URL")?.toLowerCase() ?? "";
  if (siteUrl.includes("stg-design.teamver.com")) return true;
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "stg-design.teamver.com";
}
