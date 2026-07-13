import {
  fetchDesignAuthSession,
  type FetchDesignAuthSessionOptions,
} from "./designBffClient";
import {
  isLikelyTeamverAuthReturnNavigation,
  peekTeamverAuthReturnPending,
} from "./teamverAuthReturn";

let prefetchStarted = false;

/**
 * Kick off `/auth/session` while the App chunk is still downloading so boot
 * often hits an in-flight or warm cache instead of starting cold.
 *
 * Caller (embed client-app) decides when to invoke. Skips post sign-in recovery
 * navigations. Uses peek — never consume — so App boot still sees the flag.
 */
export function prefetchEmbedAuthSessionOnBoot(): void {
  if (typeof window === "undefined") return;
  if (prefetchStarted) return;
  if (peekTeamverAuthReturnPending() || isLikelyTeamverAuthReturnNavigation()) return;

  prefetchStarted = true;
  const options: FetchDesignAuthSessionOptions = {
    force: false,
    resetRefreshState: false,
  };
  void fetchDesignAuthSession(options).catch(() => undefined);
}

/** @internal vitest */
export function resetEmbedAuthPrefetchForTests(): void {
  prefetchStarted = false;
}
