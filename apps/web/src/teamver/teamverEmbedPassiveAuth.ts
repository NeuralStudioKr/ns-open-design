import { isBootstrapAuthMode, isTeamverEmbedMode } from "./designApiBase";
import { redirectToTeamverLoginPreservingRoute } from "./designAuthFlow";
import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";
import { hasTeamverEmbedActiveWork } from "./teamverEmbedActiveWork";
import { hasTeamverEmbedBackgroundRuns } from "./teamverEmbedSessionRuns";
import {
  prepareDesignAuthSessionReload,
  probeDesignBffSessionAuthenticated,
  refreshDesignAuthCookie,
} from "./designBffClient";

function shouldDeferPassiveAuthRedirect(): boolean {
  return hasTeamverEmbedActiveWork() || hasTeamverEmbedBackgroundRuns();
}

export const TEAMVER_EMBED_PASSIVE_AUTH_EVENT = "teamver:embed-passive-auth-required";

/**
 * Prefer silent recovery over login redirect. Key-refresh (Apps JWT) failures
 * are often HA rotation races — re-login / "close the tab" is last resort only
 * after consecutive unrecovered failures AND a final session probe.
 */
const PASSIVE_AUTH_FAILURE_THRESHOLD = 3;
/** Window that counts consecutive failures (tab-return blips are usually single). */
const PASSIVE_AUTH_FAILURE_WINDOW_MS = 60_000;
/** Delay before navigating away after confirmed session loss. */
const PASSIVE_AUTH_REDIRECT_DELAY_MS = 4_000;

let passiveAuthRedirectTimer: ReturnType<typeof setTimeout> | null = null;
let passiveAuthRecoveryInflight: Promise<boolean> | null = null;
/** Dedup failure credits across parallel 401 waiters of the same recovery. */
let lastRecoveryFailureClaimed = false;
let consecutivePassiveFailures = 0;
let lastPassiveFailureAt = 0;

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

function notePassiveRecoverySuccess(): void {
  consecutivePassiveFailures = 0;
  lastPassiveFailureAt = 0;
  cancelPassiveLoginRedirect();
}

function notePassiveRecoveryFailure(): number {
  const now = Date.now();
  if (now - lastPassiveFailureAt > PASSIVE_AUTH_FAILURE_WINDOW_MS) {
    consecutivePassiveFailures = 0;
  }
  lastPassiveFailureAt = now;
  consecutivePassiveFailures += 1;
  return consecutivePassiveFailures;
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
    // Re-check recovery + session right before leaving — a later 401 may have
    // recovered, or a concurrent call may still be refreshing.
    void (async () => {
      if (await tryPassiveAuthRecovery()) {
        notePassiveRecoverySuccess();
        return;
      }
      if (await probeDesignBffSessionAuthenticated()) {
        notePassiveRecoverySuccess();
        return;
      }
      // One more delayed probe — cookie from a sibling tab/node may land late.
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (await probeDesignBffSessionAuthenticated()) {
        notePassiveRecoverySuccess();
        return;
      }
      // Probe confirmed unauthenticated after threshold — allow Main login even
      // if embed memory is stale (policy: re-login only after authenticated:false).
      prepareDesignAuthSessionReload();
      redirectToTeamverLoginPreservingRoute({ returnTo: readEmbedReturnTo() });
    })();
  }, PASSIVE_AUTH_REDIRECT_DELAY_MS);
}

function claimPassiveRecoveryFailure(): number | null {
  if (lastRecoveryFailureClaimed) return null;
  lastRecoveryFailureClaimed = true;
  return notePassiveRecoveryFailure();
}

async function tryPassiveAuthRecovery(): Promise<boolean> {
  if (!passiveAuthRecoveryInflight) {
    lastRecoveryFailureClaimed = false;
    passiveAuthRecoveryInflight = (async () => {
      try {
        const refreshed = await refreshDesignAuthCookie();
        if (refreshed) return true;
        // POST /auth/refresh can 401 while the BFF cookie is still usable
        // (refresh-token race; access retained). Confirm before logout redirect.
        return await probeDesignBffSessionAuthenticated();
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
 * Single unrecovered 401s (common on tab-return) only surface a soft event.
 * Login redirect requires consecutive failures inside the failure window, then
 * a final session probe still saying unauthenticated.
 *
 * Parallel 401s that share one recovery attempt only count as one failure.
 */
export function handleEmbedPassiveUnauthorized(reason: "daemon" | "bff"): void {
  if (!isTeamverEmbedMode() || !isBootstrapAuthMode()) return;
  void (async () => {
    const recovered = await tryPassiveAuthRecovery();
    if (recovered) {
      notePassiveRecoverySuccess();
      return;
    }
    if (shouldDeferPassiveAuthRedirect()) {
      dispatchPassiveAuthRequired(reason);
      return;
    }
    const failures = claimPassiveRecoveryFailure();
    dispatchPassiveAuthRequired(reason);
    if (failures === null) {
      if (consecutivePassiveFailures >= PASSIVE_AUTH_FAILURE_THRESHOLD) {
        schedulePassiveLoginRedirect();
      }
      return;
    }
    if (failures < PASSIVE_AUTH_FAILURE_THRESHOLD) {
      return;
    }
    schedulePassiveLoginRedirect();
  })();
}

/** @internal vitest only */
export function resetEmbedPassiveAuthForTests(): void {
  cancelPassiveLoginRedirect();
  passiveAuthRecoveryInflight = null;
  lastRecoveryFailureClaimed = false;
  consecutivePassiveFailures = 0;
  lastPassiveFailureAt = 0;
}
