import { isBootstrapAuthMode, isTeamverEmbedMode, resolveDesignBffRefreshUrl } from "./designApiBase";
import { redirectToTeamverLoginPreservingRoute } from "./designAuthFlow";
import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";
import { hasTeamverEmbedActiveWork } from "./teamverEmbedActiveWork";
import { hasTeamverEmbedBackgroundRuns } from "./teamverEmbedSessionRuns";
import { prepareDesignAuthSessionReload, refreshDesignAuthCookie } from "./designBffClient";

function shouldDeferPassiveAuthRedirect(): boolean {
  return hasTeamverEmbedActiveWork() || hasTeamverEmbedBackgroundRuns();
}

export const TEAMVER_EMBED_PASSIVE_AUTH_EVENT = "teamver:embed-passive-auth-required";

let passiveAuthRedirectTimer: ReturnType<typeof setTimeout> | null = null;
let passiveAuthRecoveryInflight: Promise<boolean> | null = null;

function readEmbedReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  return resolveEmbedAuthReturnPath(
    window.location.pathname,
    window.location.search,
  );
}

function dispatchPassiveAuthRequired(reason: "daemon" | "bff"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, { detail: { reason } }),
  );
}

function cancelPassiveLoginRedirect(): void {
  if (!passiveAuthRedirectTimer) return;
  clearTimeout(passiveAuthRedirectTimer);
  passiveAuthRedirectTimer = null;
}

function schedulePassiveLoginRedirect(): void {
  if (typeof window === "undefined") return;
  if (!isTeamverEmbedMode() || !isBootstrapAuthMode()) return;
  if (shouldDeferPassiveAuthRedirect()) {
    dispatchPassiveAuthRequired("daemon");
    return;
  }
  if (passiveAuthRedirectTimer) return;
  passiveAuthRedirectTimer = setTimeout(() => {
    passiveAuthRedirectTimer = null;
    if (shouldDeferPassiveAuthRedirect()) {
      dispatchPassiveAuthRequired("daemon");
      return;
    }
    // Only clear caches / mark login return when we are actually leaving.
    prepareDesignAuthSessionReload();
    redirectToTeamverLoginPreservingRoute({ returnTo: readEmbedReturnTo() });
  }, 1_500);
}

function resolveDesignBffSessionUrl(): string {
  return resolveDesignBffRefreshUrl().replace(/\/auth\/refresh\/?$/, "/auth/session");
}

/**
 * Raw session probe — avoids TeamverClient onAuthExpired recursion when a
 * prior 401 already entered passive recovery.
 */
async function probeBffSessionAuthenticated(): Promise<boolean> {
  try {
    const response = await fetch(resolveDesignBffSessionUrl(), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { authenticated?: unknown };
    return body.authenticated === true;
  } catch {
    return false;
  }
}

async function tryPassiveAuthRecovery(): Promise<boolean> {
  if (!passiveAuthRecoveryInflight) {
    passiveAuthRecoveryInflight = (async () => {
      try {
        const refreshed = await refreshDesignAuthCookie();
        if (refreshed) return true;
        // POST /auth/refresh can 401 while the BFF cookie is still usable
        // (refresh-token race; access retained). Confirm before logout redirect.
        return await probeBffSessionAuthenticated();
      } finally {
        passiveAuthRecoveryInflight = null;
      }
    })();
  }
  return passiveAuthRecoveryInflight;
}

/**
 * Embed daemon/BFF 401 on background polls — refresh once, defer redirect while
 * a slide run is active, and never hard-navigate synchronously from fetch().
 *
 * Important: do NOT redirect when recovery succeeds. Previously recovery always
 * returned true-ish and then still scheduled login → sudden "불러오는 중" loops.
 */
export function handleEmbedPassiveUnauthorized(reason: "daemon" | "bff"): void {
  if (!isTeamverEmbedMode() || !isBootstrapAuthMode()) return;
  void (async () => {
    const recovered = await tryPassiveAuthRecovery();
    if (recovered) {
      cancelPassiveLoginRedirect();
      return;
    }
    if (shouldDeferPassiveAuthRedirect()) {
      dispatchPassiveAuthRequired(reason);
      return;
    }
    schedulePassiveLoginRedirect();
  })();
}

/** @internal vitest only */
export function resetEmbedPassiveAuthForTests(): void {
  cancelPassiveLoginRedirect();
  passiveAuthRecoveryInflight = null;
}
