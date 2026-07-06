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
 * 3. Auth return load → shouldForceEmbedAuthRecoveryOnLoad() → force session probe +
 *    resetRefreshState (BFF silent refresh only — no Main BE cookie proxy)
 * 4. Session authenticated → sync workspace → embedWorkspaceId set
 *
 * ## Recovery MAY reset refresh-decline (see designBffClient.resetDesignAuthRefreshState)
 *
 * - Full-page auth return (pending flag or Main FE /auth/* referrer)
 * - resetRefreshState: true (banner 「다시 시도」)
 * - Visible cookie newly appeared (cross-tab login on Main FE)
 * - bfcache pageshow restore
 *
 * ## Recovery must NOT run on routine tab focus (loop 381 — deleted-account 400 spam)
 *
 * HttpOnly-only sessions never show document.cookie hints; do not rely on cookie hint alone
 * for sign-in return detection.
 */

import type { FetchDesignAuthSessionOptions } from "./designBffClient";
import { shouldForceEmbedAuthRecoveryOnLoad } from "./teamverAuthReturn";

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
  return (
    signals.cookieHintAppeared
    || signals.pageshowPersisted
    || signals.authReturnNavigation
  );
}

/** useTeamverEmbed scheduled refresh — pass resetRefreshState only on auth-return once. */
export function resolveEmbedFocusSessionOptions(
  signals: EmbedFocusRecoverySignals,
): FetchDesignAuthSessionOptions {
  return {
    force: true,
    resetRefreshState: signals.authReturnNavigation,
  };
}

/**
 * Focus/idle refresh can briefly read `authenticated: false` while HttpOnly
 * cookies and the persisted workspace are still valid. Wiping embed session
 * state in that window clears the workspace store, registry caches, and the
 * project list — the root cause of idle "access denied" / empty-list glips.
 *
 * Definitive logout: cold boot, explicit auth recovery (`resetRefreshState`),
 * or no prior session and no cookie hint.
 */
export function shouldClearEmbedSessionOnUnauthenticated(input: {
  resetRefreshState: boolean;
  hadPriorAuthenticatedUi: boolean;
  cookieHint: boolean;
}): boolean {
  if (input.resetRefreshState) return true;
  if (input.hadPriorAuthenticatedUi || input.cookieHint) return false;
  return true;
}
