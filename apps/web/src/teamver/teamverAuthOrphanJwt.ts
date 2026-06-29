import { resolveTeamverMainApiBaseUrl } from "./designApiBase";

/**
 * JWT signature/exp is valid (nginx session-check 204) but user_id is absent from
 * the current Main BE DB — refresh 400 `user_not_found`, bootstrap 401
 * `error.token.user_not_in_database`. Typical on staging after prod cookie bleed,
 * DB reset, or deleted accounts.
 */
export function isOrphanTeamverJwtAuthFailure(status: number, bodyText: string): boolean {
  if (status !== 400 && status !== 401) return false;
  const hay = bodyText.toLowerCase();
  return (
    hay.includes("user_not_found")
    || hay.includes("user_not_in_database")
    || hay.includes("token.user_not_in_database")
  );
}

/** Clear HttpOnly `.teamver.com` cookie via Main BE logout (best-effort). */
export async function clearOrphanTeamverAuthCookies(): Promise<void> {
  const base = resolveTeamverMainApiBaseUrl().replace(/\/+$/, "");
  try {
    await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    // sign-in replace remains the fallback when logout is unreachable
  }
}
