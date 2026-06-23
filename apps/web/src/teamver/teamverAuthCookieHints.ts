/** Cookie names used by Teamver Main BE SSO (non-HttpOnly fragments may appear in document.cookie). */
const VISIBLE_TEAMVER_COOKIE_PREFIXES = ["teamver_access_token=", "teamver_refresh_token="];

/** Best-effort — HttpOnly cookies are invisible; use with session flags for refresh heuristics. */
export function hasProbableTeamverAuthCookie(): boolean {
  if (typeof document === "undefined") return false;
  const cookies = document.cookie;
  return VISIBLE_TEAMVER_COOKIE_PREFIXES.some((prefix) => cookies.includes(prefix));
}
