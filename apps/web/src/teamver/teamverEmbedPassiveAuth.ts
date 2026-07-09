import { isBootstrapAuthMode, isTeamverEmbedMode } from "./designApiBase";
import { redirectToTeamverLoginPreservingRoute } from "./designAuthFlow";
import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";
import { hasTeamverEmbedActiveWork } from "./teamverEmbedActiveWork";
import { hasTeamverEmbedBackgroundRuns } from "./teamverEmbedSessionRuns";
import { refreshDesignAuthCookie } from "./designBffClient";

function shouldDeferPassiveAuthRedirect(): boolean {
  return hasTeamverEmbedActiveWork() || hasTeamverEmbedBackgroundRuns();
}

export const TEAMVER_EMBED_PASSIVE_AUTH_EVENT = "teamver:embed-passive-auth-required";

let passiveAuthRedirectTimer: ReturnType<typeof setTimeout> | null = null;
let passiveAuthRecoveryInflight: Promise<void> | null = null;

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

function schedulePassiveLoginRedirect(): void {
  if (typeof window === "undefined") return;
  if (!isTeamverEmbedMode() || !isBootstrapAuthMode()) return;
  if (shouldDeferPassiveAuthRedirect()) {
    dispatchPassiveAuthRequired("daemon");
    return;
  }
  if (passiveAuthRedirectTimer) return;
  passiveAuthRedirectTimer = window.setTimeout(() => {
    passiveAuthRedirectTimer = null;
    if (shouldDeferPassiveAuthRedirect()) {
      dispatchPassiveAuthRequired("daemon");
      return;
    }
    redirectToTeamverLoginPreservingRoute({ returnTo: readEmbedReturnTo() });
  }, 1_500);
}

async function tryPassiveAuthRecovery(): Promise<boolean> {
  if (!passiveAuthRecoveryInflight) {
    passiveAuthRecoveryInflight = (async () => {
      try {
        await refreshDesignAuthCookie();
      } finally {
        passiveAuthRecoveryInflight = null;
      }
    })();
  }
  await passiveAuthRecoveryInflight;
  return true;
}

/**
 * Embed daemon/BFF 401 on background polls — refresh once, defer redirect while
 * a slide run is active, and never hard-navigate synchronously from fetch().
 */
export function handleEmbedPassiveUnauthorized(reason: "daemon" | "bff"): void {
  if (!isTeamverEmbedMode() || !isBootstrapAuthMode()) return;
  void (async () => {
    await tryPassiveAuthRecovery();
    if (shouldDeferPassiveAuthRedirect()) {
      dispatchPassiveAuthRequired(reason);
      return;
    }
    schedulePassiveLoginRedirect();
  })();
}

/** @internal vitest only */
export function resetEmbedPassiveAuthForTests(): void {
  if (passiveAuthRedirectTimer) {
    clearTimeout(passiveAuthRedirectTimer);
    passiveAuthRedirectTimer = null;
  }
  passiveAuthRecoveryInflight = null;
}
