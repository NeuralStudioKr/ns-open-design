/**
 * Embed SSO auth flow — single place for boot/recovery contracts (stg-design direct access).
 *
 * ## Why this module exists
 *
 * Cookie SSO for embed spans App boot, designBffClient refresh guards, useTeamverEmbed UI,
 * and App embedWorkspaceId gates. Fixes in one layer (e.g. loop 381 focus decline) repeatedly
 * missed paths in another (post sign-in return, workspace sync). Keep boot/recovery rules here.
 *
 * ## Happy path (direct slide URL, already logged in on .teamver.com)
 *
 * 1. App boot → fetchDesignAuthSession (HttpOnly cookies sent on same-origin BFF)
 * 2. completeTeamverEmbedBoot → App syncEmbedWorkspaceId
 * 3. useTeamverEmbed hydrates banner from cached session
 *
 * ## Cold start / sign-in return (stg-design → Main sign-in → /auth/callback?code=)
 *
 * 1. Unauthenticated boot → redirectToDesignLogin (app_id=teamver-design)
 * 2. Main FE → /auth/callback?code= → POST design/auth/exchange → BFF HttpOnly session
 * 3. Auth return load → shouldForceEmbedAuthRecoveryOnLoad() (peek) → force
 *    session probe + resetRefreshState. Pending is consumed only after a
 *    successful authenticated probe so early false negatives still defer
 *    login redirects via shouldDeferEmbedLoginRedirect.
 * 4. Session authenticated → sync workspace → embedWorkspaceId set
 *
 * ## Recovery MAY reset refresh-decline (see designBffClient.resetDesignAuthRefreshState)
 *
 * - Full-page auth return (pending flag or Main FE /auth/* referrer)
 * - resetRefreshState: true (banner 「다시 시도」)
 * - Visible cookie newly appeared (cross-tab login on Main FE)
 *
 * bfcache `pageshow` alone must NOT reset decline — that re-opens sticky 400
 * refresh loops and feels like a spontaneous re-auth after tab restore.
 *
 * ## Recovery must NOT force session probes on routine tab focus (loop 381)
 *
 * Routine visibility/focus uses cache-friendly `force: false` + `silent: true`.
 * HttpOnly-only sessions never show document.cookie hints; do not rely on cookie hint alone
 * for sign-in return detection.
 */

import type { FetchDesignAuthSessionOptions } from "./designBffClient";
import { isBootstrapAuthMode } from "./designApiBase";
import { redirectToDesignLogin } from "./designAuthFlow";
import { shouldForceEmbedAuthRecoveryOnLoad } from "./teamverAuthReturn";
import {
  resolveEmbedAuthReturnPath,
  shouldDeferEmbedLoginRedirect,
} from "./teamverEmbedAuthNavigation";

/** App.tsx embed boot — first authoritative session probe. */
export function resolveEmbedBootSessionOptions(): FetchDesignAuthSessionOptions {
  const authRecovery = shouldForceEmbedAuthRecoveryOnLoad();
  return {
    force: authRecovery,
    resetRefreshState: authRecovery,
  };
}

export type EmbedFocusRecoverySignals = {
  cookieHintAppeared: boolean;
  pageshowPersisted: boolean;
  authReturnNavigation: boolean;
};

/** useTeamverEmbed focus/pageshow — whether to bypass throttle and reset refresh decline. */
export function shouldResetEmbedRefreshDeclineOnFocus(
  signals: EmbedFocusRecoverySignals,
): boolean {
  // Auth-return only. Cookie hint must not clear Design soft/hard sticky.
  return signals.authReturnNavigation;
}

export type EmbedFocusSessionRefreshOptions = FetchDesignAuthSessionOptions & {
  /** Routine focus refresh — keep UI stable on transient BFF blips. */
  silent?: boolean;
};

/** useTeamverEmbed scheduled refresh — pass resetRefreshState only on auth-return once. */
export function resolveEmbedFocusSessionOptions(
  signals: EmbedFocusRecoverySignals,
): EmbedFocusSessionRefreshOptions {
  if (signals.authReturnNavigation) {
    // Still force + reset sticky decline, but keep the banner quiet — boot already
    // showed the splash; a second visible "re-auth" flash after return feels broken.
    return { force: true, resetRefreshState: true, silent: true };
  }
  if (signals.cookieHintAppeared || signals.pageshowPersisted) {
    return { force: true, resetRefreshState: false, silent: true };
  }
  return { force: false, resetRefreshState: false, silent: true };
}

/**
 * Focus/idle refresh can briefly read `authenticated: false` while HttpOnly
 * cookies and the persisted workspace are still valid. Wiping embed session
 * state in that window clears the workspace store, registry caches, and the
 * project list — the root cause of idle "access denied" / empty-list glips.
 *
 * Definitive logout/redirect: cold boot without prior BFF UI session, or explicit
 * auth recovery (`resetRefreshState`).
 *
 * Main FE visible cookies must not block redirect — Design embed requires its own
 * BFF HttpOnly session + exchange.
 */
export function shouldClearEmbedSessionOnUnauthenticated(input: {
  resetRefreshState: boolean;
  hadPriorAuthenticatedUi: boolean;
  /** Ignored — kept for call-site compatibility. */
  cookieHint?: boolean;
}): boolean {
  if (input.resetRefreshState) return true;
  if (input.hadPriorAuthenticatedUi) return false;
  return true;
}

/** Cold start / missing BFF session — send user through Design login + exchange. */
export function redirectToDesignLoginIfBffMissing(options?: {
  returnTo?: string;
  workspaceId?: string | null;
}): void {
  if (typeof window === "undefined") return;
  if (!isBootstrapAuthMode()) return;
  if (shouldDeferEmbedLoginRedirect()) return;
  void redirectToDesignLogin({
    workspaceId: options?.workspaceId ?? null,
    returnTo:
      options?.returnTo
      ?? resolveEmbedAuthReturnPath(window.location.pathname, window.location.search),
  });
}
