import { resolveTeamverMainOrigin } from "./designApiBase";

/** Set before navigating to Main FE sign-in — consumed on embed return load. */
export const TEAMVER_AUTH_RETURN_PENDING_KEY = "teamver:auth-return-pending";

const AUTH_RETURN_MAX_AGE_MS = 10 * 60_000;

export function markTeamverAuthReturnPending(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TEAMVER_AUTH_RETURN_PENDING_KEY, String(Date.now()));
  } catch {
    // sessionStorage blocked
  }
}

export function peekTeamverAuthReturnPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(TEAMVER_AUTH_RETURN_PENDING_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < AUTH_RETURN_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** Read and clear the pending flag — call once per full page load. */
export function consumeTeamverAuthReturnPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(TEAMVER_AUTH_RETURN_PENDING_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(TEAMVER_AUTH_RETURN_PENDING_KEY);
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < AUTH_RETURN_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function isTeamverAuthReferrer(referrer: string): boolean {
  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();
    if (host !== "teamver.com" && !host.endsWith(".teamver.com")) return false;
    const path = url.pathname.toLowerCase();
    return (
      path.startsWith("/auth/signin")
      || path.startsWith("/auth/callback")
      || path.startsWith("/auth/login")
    );
  } catch {
    return false;
  }
}

/** True when the current navigation likely follows Main FE sign-in. */
export function isLikelyTeamverAuthReturnNavigation(): boolean {
  if (typeof document === "undefined") return false;
  const ref = document.referrer.trim();
  if (!ref) return false;
  if (isTeamverAuthReferrer(ref)) return true;
  try {
    const mainOrigin = resolveTeamverMainOrigin().replace(/\/+$/, "");
    return ref.startsWith(`${mainOrigin}/auth/`);
  } catch {
    return false;
  }
}

/**
 * Embed load should force a fresh session probe + refresh retry when the user
 * just returned from Main FE sign-in (returnTo) or marked pending before leave.
 */
export function shouldForceEmbedAuthRecoveryOnLoad(): boolean {
  return consumeTeamverAuthReturnPending() || isLikelyTeamverAuthReturnNavigation();
}
