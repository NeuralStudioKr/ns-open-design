import { isBootstrapAuthMode, isTeamverEmbedMode } from "./designApiBase";
import { hasTeamverEmbedActiveWork } from "./teamverEmbedActiveWork";
import { hasTeamverEmbedBackgroundRuns } from "./teamverEmbedSessionRuns";
import {
  ensureDesignAuthLadder,
  isDesignAuthRefreshDeclined,
  isTeamverRuntimeConfigAuthBlocked,
} from "./designBffClient";
import {
  isTeamverEmbedSessionAuthenticated,
  setTeamverEmbedSessionAuthenticated,
} from "./teamverEmbedSession";

function shouldDeferPassiveAuthRequired(): boolean {
  return hasTeamverEmbedActiveWork() || hasTeamverEmbedBackgroundRuns();
}

export const TEAMVER_EMBED_PASSIVE_AUTH_EVENT = "teamver:embed-passive-auth-required";
/** Fired when cookie/ensure recovery succeeds — clears "연결 확인 중…" chip. */
export const TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT =
  "teamver:embed-passive-auth-recovered";

/**
 * Prefer silent recovery over hard navigation. Key-refresh (Apps JWT) failures
 * are often HA rotation races — passive paths only surface a recoverable event.
 * Explicit user CTA paths own any real login redirect.
 */
const PASSIVE_AUTH_FAILURE_THRESHOLD = 3;
/** Window that counts consecutive failures (tab-return blips are usually single). */
const PASSIVE_AUTH_FAILURE_WINDOW_MS = 60_000;
/** Delay before surfacing confirmed passive auth loss without moving the page. */
const PASSIVE_AUTH_REQUIRED_DELAY_MS = 4_000;

let passiveAuthRequiredTimer: ReturnType<typeof setTimeout> | null = null;
let passiveAuthRecoveryInflight: Promise<boolean> | null = null;
/** Dedup failure credits across parallel 401 waiters of the same recovery. */
let lastRecoveryFailureClaimed = false;
let consecutivePassiveFailures = 0;
let lastPassiveFailureAt = 0;

function dispatchPassiveAuthRequired(reason: "daemon" | "bff"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, { detail: { reason } }),
  );
}

function cancelPassiveAuthRequiredTimer(): void {
  if (!passiveAuthRequiredTimer) return;
  clearTimeout(passiveAuthRequiredTimer);
  passiveAuthRequiredTimer = null;
}

function dispatchPassiveAuthRecovered(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT));
}

function notePassiveRecoverySuccess(): void {
  consecutivePassiveFailures = 0;
  lastPassiveFailureAt = 0;
  cancelPassiveAuthRequiredTimer();
  // Keep embed memory authenticated and wake App/banner subscribers even when
  // the flag was already true throughout the outage (forceEvent).
  setTeamverEmbedSessionAuthenticated(true, { forceEvent: true });
  dispatchPassiveAuthRecovered();
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

function schedulePassiveAuthRequired(reason: "daemon" | "bff"): void {
  if (typeof window === "undefined") return;
  if (!isTeamverEmbedMode() || !isBootstrapAuthMode()) return;
  if (shouldDeferPassiveAuthRequired()) {
    dispatchPassiveAuthRequired(reason);
    return;
  }
  if (passiveAuthRequiredTimer) return;
  passiveAuthRequiredTimer = setTimeout(() => {
    passiveAuthRequiredTimer = null;
    if (shouldDeferPassiveAuthRequired()) {
      dispatchPassiveAuthRequired(reason);
      return;
    }
    // Re-check recovery + session before surfacing — a later 401 may have
    // recovered, or a concurrent call may still be refreshing.
    void (async () => {
      // Soft/hard sticky: do not re-run probe×2+ensure here — C1 / banner own it.
      if (isDesignAuthRefreshDeclined()) {
        dispatchPassiveAuthRequired("bff");
        return;
      }
      if (isTeamverRuntimeConfigAuthBlocked()) {
        dispatchPassiveAuthRequired("bff");
        return;
      }
      if (await tryPassiveAuthRecovery()) {
        notePassiveRecoverySuccess();
        return;
      }
      if (await ensureDesignAuthLadder("passive", { mode: "probe" })) {
        notePassiveRecoverySuccess();
        return;
      }
      // ensure can revive expired access that session-probe rejects.
      if (await ensureDesignAuthLadder("passive", { mode: "ensure" })) {
        notePassiveRecoverySuccess();
        return;
      }
      // One more delayed probe — cookie from a sibling tab/node may land late.
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (await ensureDesignAuthLadder("passive", { mode: "probe" })) {
        notePassiveRecoverySuccess();
        return;
      }
      if (await ensureDesignAuthLadder("passive", { mode: "ensure" })) {
        notePassiveRecoverySuccess();
        return;
      }
      // Passive 401s must never hard-navigate the current tab. A background
      // poll, runtime-config touch, or HA cookie blip can fail several times
      // while the visible app is still usable; redirecting to Main sign-in here
      // interrupts slide generation/editing and leaves users on /auth/callback.
      // Surface a recoverable auth-required event; explicit CTA handlers own
      // the real login redirect.
      dispatchPassiveAuthRequired(reason);
    })();
  }, PASSIVE_AUTH_REQUIRED_DELAY_MS);
}

function claimPassiveRecoveryFailure(): number | null {
  if (lastRecoveryFailureClaimed) return null;
  lastRecoveryFailureClaimed = true;
  return notePassiveRecoveryFailure();
}

async function tryPassiveAuthRecovery(): Promise<boolean> {
  if (isTeamverRuntimeConfigAuthBlocked()) return false;
  if (!passiveAuthRecoveryInflight) {
    lastRecoveryFailureClaimed = false;
    passiveAuthRecoveryInflight = (async () => {
      try {
        const refreshed = await ensureDesignAuthLadder("passive");
        if (refreshed) return true;
        // Refresh just soft/hard-sticky declined — do not stack ensure/probe
        // (C1 owns backoff; banner already surfaces via required event).
        if (isDesignAuthRefreshDeclined()) return false;
        // POST /auth/refresh can 401 while ensure can still revive access.
        if (await ensureDesignAuthLadder("passive", { mode: "ensure" })) return true;
        return await ensureDesignAuthLadder("passive", { mode: "probe" });
      } finally {
        passiveAuthRecoveryInflight = null;
      }
    })();
  }
  return passiveAuthRecoveryInflight;
}

/**
 * Embed daemon/BFF 401 on background polls — refresh once, defer the visible
 * auth-required event while a slide run is active, and never hard-navigate
 * synchronously from fetch().
 *
 * Single unrecovered 401s (common on tab-return) only surface a soft event.
 * Consecutive failures schedule one final recovery probe, then surface the
 * soft auth-required event. They do not redirect the current tab.
 *
 * Parallel 401s that share one recovery attempt only count as one failure.
 */
export function handleEmbedPassiveUnauthorized(reason: "daemon" | "bff"): void {
  if (!isTeamverEmbedMode() || !isBootstrapAuthMode()) return;
  // Soft/hard sticky already ran the survival ladder recently — do not start
  // another refresh/probe burst from every parallel 401 waiter. Surface the
  // soft event so the banner can show "다시 시도".
  if (isDesignAuthRefreshDeclined()) {
    dispatchPassiveAuthRequired(reason);
    return;
  }
  if (isTeamverRuntimeConfigAuthBlocked()) {
    dispatchPassiveAuthRequired(reason);
    return;
  }
  void (async () => {
    const recovered = await tryPassiveAuthRecovery();
    if (recovered) {
      notePassiveRecoverySuccess();
      return;
    }
    if (shouldDeferPassiveAuthRequired()) {
      dispatchPassiveAuthRequired(reason);
      return;
    }
    const failures = claimPassiveRecoveryFailure();
    dispatchPassiveAuthRequired(reason);
    if (failures === null) {
      if (consecutivePassiveFailures >= PASSIVE_AUTH_FAILURE_THRESHOLD) {
        schedulePassiveAuthRequired(reason);
      }
      return;
    }
    if (failures < PASSIVE_AUTH_FAILURE_THRESHOLD) {
      return;
    }
    schedulePassiveAuthRequired(reason);
  })();
}

/** @internal vitest only */
export function resetEmbedPassiveAuthForTests(): void {
  cancelPassiveAuthRequiredTimer();
  passiveAuthRecoveryInflight = null;
  lastRecoveryFailureClaimed = false;
  consecutivePassiveFailures = 0;
  lastPassiveFailureAt = 0;
}
