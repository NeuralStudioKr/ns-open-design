/**
 * Design cold-start auth flow — Main sign-in → /auth/callback?code= → BFF exchange.
 */

export {
  TEAMVER_DESIGN_APP_ID,
  isBootstrapAuthMode,
  getMainLoginBaseUrl,
  buildAuthCallbackRedirectUrl,
  buildDesignColdStartLoginUrl,
} from "./designApiBase";
import {
  buildAuthCallbackRedirectUrl,
  buildDesignColdStartLoginUrl,
  isBootstrapAuthMode,
  markTeamverLoginRedirectAttempt,
  prepareTeamverLoginNavigation,
  redirectToTeamverLogin,
  resolveTeamverLoginUrl,
} from "./designApiBase";
import {
  invalidateDesignAuthConfigCache,
  fetchDesignAuthConfig,
  postDesignAuthExchange,
  postDesignAuthLogout,
} from "./designAuthClient";
import { invalidateDesignAuthSessionCache } from "./designBffClient";
import {
  normalizeEmbedAuthReturnDestination,
  shouldDeferEmbedLoginRedirect,
} from "./teamverEmbedAuthNavigation";

const RETURN_TO_KEY = "teamver_design_auth_return_to";

export function storeAuthReturnTo(returnTo: string): void {
  if (typeof window === "undefined" || !returnTo.startsWith("/")) return;
  sessionStorage.setItem(
    RETURN_TO_KEY,
    normalizeEmbedAuthReturnDestination(returnTo),
  );
}

export function consumeAuthReturnTo(fallback = "/"): string {
  if (typeof window === "undefined") return fallback;
  const stored = sessionStorage.getItem(RETURN_TO_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
  if (stored?.startsWith("/")) return stored;
  return fallback;
}

export function clearDesignAuthSession(): void {
  if (typeof window === "undefined") return;
  invalidateDesignAuthConfigCache();
  invalidateDesignAuthSessionCache();
}

export async function clearDesignAuthSessionFull(): Promise<void> {
  clearDesignAuthSession();
  try {
    await postDesignAuthLogout();
  } catch {
    // best-effort apps-only logout
  }
}

export async function resolveDesignLoginUrl(options?: {
  workspaceId?: string | null;
  returnTo?: string;
}): Promise<string> {
  if (!isBootstrapAuthMode()) {
    return resolveTeamverLoginUrl(options?.returnTo ?? null);
  }
  try {
    const config = await fetchDesignAuthConfig();
    if (config.mainLoginUrl?.includes("app_id=")) return config.mainLoginUrl;
    return buildDesignColdStartLoginUrl({
      workspaceId: options?.workspaceId,
      mainLoginUrl: config.mainLoginUrl,
    });
  } catch {
    return buildDesignColdStartLoginUrl({ workspaceId: options?.workspaceId });
  }
}

export async function redirectToDesignLogin(options?: {
  workspaceId?: string | null;
  returnTo?: string;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (shouldDeferEmbedLoginRedirect()) return;
  if (!markTeamverLoginRedirectAttempt()) return;

  prepareTeamverLoginNavigation();
  if (options?.returnTo?.startsWith("/")) {
    storeAuthReturnTo(options.returnTo);
  }
  const loginUrl = await resolveDesignLoginUrl(options);
  window.location.replace(loginUrl);
}

/**
 * Canonical "401 catch → Main sign-in" entry that both persists `returnTo`
 * to sessionStorage (so `/auth/callback` can restore the embed route) and
 * dispatches the correct redirect for bootstrap vs legacy modes.
 *
 * Prefer this over `redirectToTeamverLogin` from 401 catch paths so we
 * don't drop the current embed route on session expiry.
 */
export function redirectToTeamverLoginPreservingRoute(options?: {
  workspaceId?: string | null;
  returnTo?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const returnTo = options?.returnTo?.trim();
  if (returnTo && returnTo.startsWith("/")) {
    storeAuthReturnTo(returnTo);
  }
  if (isBootstrapAuthMode()) {
    // Async fire-and-forget; the promise only awaits config fetch. In-flight
    // cooldown guarding is shared via `markTeamverLoginRedirectAttempt`.
    void redirectToDesignLogin({
      workspaceId: options?.workspaceId ?? null,
      returnTo: returnTo && returnTo.startsWith("/") ? returnTo : undefined,
    });
    return;
  }
  redirectToTeamverLogin(returnTo ?? null);
}

export async function exchangeAuthCodeForDesignSession(
  code: string,
  redirectUrl: string,
  workspaceId?: string | null,
): Promise<void> {
  await postDesignAuthExchange(code, redirectUrl, workspaceId);
}

export { buildAuthCallbackRedirectUrl as buildDesignAuthCallbackRedirectUrl };
