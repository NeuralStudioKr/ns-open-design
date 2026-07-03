import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import { NetworkError } from "@teamver/app-sdk";
import {
  fetchDesignAuthSession,
  getDesignBffClient,
  invalidateDesignAuthSessionCache,
  isDesignAuthRefreshDeclined,
  prepareDesignAuthSessionReload,
  resetDesignAuthBareRefreshAttempt,
  resetDesignAuthRefreshState,
  type DesignAuthSessionUser,
} from "./designBffClient";
import { isTeamverEmbedMode, isBootstrapAuthMode } from "./designApiBase";
import {
  redirectToDesignLogin,
  redirectToTeamverLoginPreservingRoute,
} from "./designAuthFlow";
import {
  resolveEmbedAuthReturnPath,
  shouldDeferEmbedLoginRedirect,
} from "./teamverEmbedAuthNavigation";
import { hasProbableTeamverAuthCookie } from "./teamverAuthCookieHints";
import { setActiveTeamverWorkspace } from "./setActiveTeamverWorkspace";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
import { clearTeamverEmbedListCaches } from "./teamverEmbedListCaches";
import {
  clearTeamverEmbedSessionState,
  isTeamverEmbedSessionAuthenticated,
  setTeamverEmbedSessionAuthenticated,
  subscribeTeamverEmbedSessionChanged,
} from "./teamverEmbedSession";
import {
  isTeamverEmbedBootComplete,
  waitForTeamverEmbedBoot,
} from "./teamverEmbedBoot";
import {
  isLikelyTeamverAuthReturnNavigation,
  peekTeamverAuthReturnPending,
} from "./teamverAuthReturn";
import {
  normalizeWorkspaceList,
  pickDefaultWorkspaceId,
  readWorkspaceId,
  readWorkspaceLabel,
  isWorkspaceAppEnabled,
  readAppDisabledReason,
} from "./workspaceUtils";
import { readUserImageUrl } from "./teamverEmbedVisuals";
import { snapshotFromWorkspace } from "./teamverDesignAccess";
import { syncAllDaemonProjectsToRegistry } from "./projectRegistry";
import {
  resolveEmbedFocusSessionOptions,
  shouldResetEmbedRefreshDeclineOnFocus,
} from "./teamverEmbedAuthFlow";

export type TeamverEmbedState = {
  loading: boolean;
  authenticated: boolean;
  userLabel: string | null;
  userId: string | null;
  userImageUrl: string | null;
  activeWorkspaceId: string | null;
  activeWorkspaceLabel: string | null;
  designAppEnabled: boolean;
  designDisabledReason: string | null;
  workspaces: WorkspaceListItem[];
  error: string | null;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  /**
   * Re-probe `/teamver-bff/auth/session`.
   * - `force` — bypass the 60s session cache (used by visibility/focus auto-refresh).
   * - `resetRefreshState` — also clear sticky 400/401 decline markers so a previously
   *   declined `/teamver-bff/auth/refresh` is retried. Reserve for explicit user
   *   retry (Banner button) or events that prove auth state changed.
   */
  refresh: (options?: { force?: boolean; resetRefreshState?: boolean }) => Promise<void>;
};

const INITIAL: Omit<TeamverEmbedState, "switchWorkspace" | "refresh"> = {
  loading: false,
  authenticated: false,
  userLabel: null,
  userId: null,
  userImageUrl: null,
  activeWorkspaceId: null,
  activeWorkspaceLabel: null,
  designAppEnabled: true,
  designDisabledReason: null,
  workspaces: [],
  error: null,
};

function isSessionExpiredError(err: unknown): boolean {
  return err instanceof NetworkError && err.status === 401;
}

function readUserId(user: DesignAuthSessionUser | null | undefined): string | null {
  return user?.userId?.trim() || null;
}

function readUserLabel(user: DesignAuthSessionUser | null | undefined): string | null {
  return (
    user?.displayName?.trim() ||
    user?.name?.trim() ||
    user?.email?.trim() ||
    readUserId(user) ||
    null
  );
}

function hadEmbedSession(): boolean {
  return isTeamverEmbedSessionAuthenticated();
}

function readAuthCookieHint(): boolean {
  return hasProbableTeamverAuthCookie() || isTeamverEmbedSessionAuthenticated();
}

const FOCUS_SESSION_REFRESH_MS = 500;
/** Routine focus/visibility session re-probes — cookie hint / bfcache restore bypass this. */
const FOCUS_SESSION_REFRESH_MIN_INTERVAL_MS = 5 * 60_000;

/**
 * Exponential backoff for `session_unreachable` (network / BFF outage).
 * Only fires while the tab is visible so a background tab does not
 * hammer the BFF forever. 5s → 15s → 60s → 60s… — long enough that a
 * transient BFF blip resolves on the first retry, short enough that a
 * user coming back to the tab does not have to hit refresh manually.
 */
const SESSION_UNREACHABLE_BACKOFF_MS: readonly number[] = [5_000, 15_000, 60_000];

function pickSessionUnreachableDelayMs(attempt: number): number {
  const clamped = Math.max(0, attempt);
  const index = Math.min(clamped, SESSION_UNREACHABLE_BACKOFF_MS.length - 1);
  return SESSION_UNREACHABLE_BACKOFF_MS[index] ?? 60_000;
}

export function useTeamverEmbed(enabled: boolean): TeamverEmbedState {
  const [state, setState] = useState(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Track visible cookie / embed-session hint so focus can detect cross-tab login.
  const lastCookieHintRef = useRef<boolean>(
    isTeamverEmbedMode() ? readAuthCookieHint() : false,
  );
  /** Referrer/pending sign-in return — handle once per mount (avoid focus refresh spam). */
  const authReturnFocusHandledRef = useRef(false);

  const takeAuthReturnFocusRecovery = useCallback((): boolean => {
    if (authReturnFocusHandledRef.current) return false;
    const recovery =
      peekTeamverAuthReturnPending() || isLikelyTeamverAuthReturnNavigation();
    if (recovery) authReturnFocusHandledRef.current = true;
    return recovery;
  }, []);

  const refresh = useCallback(async (options?: { force?: boolean; resetRefreshState?: boolean }) => {
    if (!enabled || !isTeamverEmbedMode()) {
      setState(INITIAL);
      return;
    }

    const force = options?.force ?? false;
    const resetRefreshState = options?.resetRefreshState ?? false;
    // Routine tab-focus refresh should not blank the session bar — only the
    // initial boot and explicit auth recovery need the loading affordance.
    setState((prev) => ({
      ...prev,
      loading: prev.authenticated && !resetRefreshState ? prev.loading : true,
      error: null,
    }));
    try {
      // App boot runs the first session probe + registry sync — avoid racing refresh/clear.
      if (!force && !isTeamverEmbedBootComplete()) {
        await waitForTeamverEmbedBoot();
      }

      const session = await fetchDesignAuthSession({ force, resetRefreshState });
      if (!session) {
        if (hadEmbedSession() || stateRef.current.authenticated) {
          setState((prev) => ({ ...prev, loading: false, error: "session_unreachable" }));
          return;
        }
        await clearTeamverEmbedSessionState();
        setState({ ...INITIAL, loading: false, error: "session_unreachable" });
        return;
      }

      if (!session.authenticated) {
        await clearTeamverEmbedSessionState();
        lastCookieHintRef.current = readAuthCookieHint();
        if (isBootstrapAuthMode() && !shouldDeferEmbedLoginRedirect()) {
          void redirectToDesignLogin({
            returnTo: resolveEmbedAuthReturnPath(
              window.location.pathname,
              window.location.search,
            ),
          });
        }
        setState({
          ...INITIAL,
          loading: false,
          error: "not_authenticated",
        });
        return;
      }

      setTeamverEmbedSessionAuthenticated(true);

      const workspaces = normalizeWorkspaceList(session.workspaces);
      const userId = readUserId(session.user);
      const previousUserId = stateRef.current.userId;
      if (previousUserId && userId && previousUserId !== userId) {
        // Account switch without a full reload must not reuse another user's
        // registry list / access caches keyed under the same workspace.
        clearTeamverEmbedListCaches();
      }
      const activeWorkspaceId = await syncTeamverWorkspaceFromSession(session, workspaces, {
        // Only boot and explicit auth recovery may reconcile the stored
        // workspace onto a new one. Routine focus/idle refresh keeps the
        // active workspace pinned so the App does not treat the session
        // touch as a workspace switch and bounce the user to home.
        preserveStoredWorkspace: !resetRefreshState && isTeamverEmbedBootComplete(),
      });
      const activeWorkspace =
        workspaces.find((workspace) => readWorkspaceId(workspace) === activeWorkspaceId) ?? null;
      const designAppEnabled = activeWorkspace ? isWorkspaceAppEnabled(activeWorkspace) : true;
      const designDisabledReason = activeWorkspace
        ? readAppDisabledReason(activeWorkspace)
        : null;
      if (activeWorkspaceId && activeWorkspace) {
        snapshotFromWorkspace(activeWorkspaceId, activeWorkspace);
        // Workspace-changed dispatch lives in syncTeamverWorkspaceFromSession when
        // the stored id actually changes. Do not re-dispatch on every focus
        // session refresh — App treats it as a full workspace switch (project
        // list wipe + registry sync) and reads as a page reload.
      }
      // Registry sync after explicit auth recovery only — not routine tab focus.
      if (
        resetRefreshState
        && session.authenticated
        && activeWorkspaceId
      ) {
        try {
          await syncAllDaemonProjectsToRegistry();
        } catch (err) {
          console.warn("[teamver] registry sync on session refresh failed", err);
        }
      }

      setState({
        loading: false,
        authenticated: true,
        userLabel: readUserLabel(session.user),
        userId,
        userImageUrl: readUserImageUrl(session.user),
        activeWorkspaceId,
        activeWorkspaceLabel: activeWorkspace ? readWorkspaceLabel(activeWorkspace) : null,
        designAppEnabled,
        designDisabledReason,
        workspaces,
        error: null,
      });
    } catch (err) {
      if (isSessionExpiredError(err)) {
        await clearTeamverEmbedSessionState();
        lastCookieHintRef.current = readAuthCookieHint();
        setState((prev) => ({ ...prev, loading: false }));
        prepareDesignAuthSessionReload();
        redirectToTeamverLoginPreservingRoute({
          returnTo:
            typeof window !== "undefined"
              ? resolveEmbedAuthReturnPath(
                  window.location.pathname,
                  window.location.search,
                )
              : null,
        });
        return;
      }
      if (hadEmbedSession() || stateRef.current.authenticated) {
        setState((prev) => ({ ...prev, loading: false, error: "session_unreachable" }));
        return;
      }
      setState({ ...INITIAL, loading: false, error: "session_unreachable" });
    }
  }, [enabled]);

  const focusRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocusSessionRefreshAtRef = useRef(0);

  const scheduleFocusSessionRefresh = useCallback((options?: {
    bypassThrottle?: boolean;
    focusSignals?: {
      cookieHintAppeared: boolean;
      pageshowPersisted: boolean;
      authReturnNavigation: boolean;
    };
  }) => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    const bypassThrottle = options?.bypassThrottle ?? false;
    const focusSignals = options?.focusSignals ?? {
      cookieHintAppeared: false,
      pageshowPersisted: false,
      authReturnNavigation: false,
    };
    if (
      !bypassThrottle &&
      now - lastFocusSessionRefreshAtRef.current < FOCUS_SESSION_REFRESH_MIN_INTERVAL_MS
    ) {
      return;
    }
    if (focusRefreshTimerRef.current) {
      clearTimeout(focusRefreshTimerRef.current);
    }
    lastFocusSessionRefreshAtRef.current = now;
    focusRefreshTimerRef.current = setTimeout(() => {
      focusRefreshTimerRef.current = null;
      invalidateDesignAuthSessionCache();
      void refresh(resolveEmbedFocusSessionOptions(focusSignals));
    }, FOCUS_SESSION_REFRESH_MS);
  }, [refresh]);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    const trimmed = workspaceId.trim();
    if (!trimmed) return;

    const target = stateRef.current.workspaces.find(
      (workspace) => readWorkspaceId(workspace) === trimmed,
    );
    if (!target) return;

    await setActiveTeamverWorkspace(trimmed, stateRef.current.userId);
    snapshotFromWorkspace(trimmed, target);
    setState((prev) => ({
      ...prev,
      activeWorkspaceId: trimmed,
      activeWorkspaceLabel: readWorkspaceLabel(target),
      designAppEnabled: isWorkspaceAppEnabled(target),
      designDisabledReason: readAppDisabledReason(target),
    }));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !isTeamverEmbedMode()) return;

    const onFocusReturn = (event?: Event) => {
      const cookieHintNow = readAuthCookieHint();
      const cookieHintAppeared = cookieHintNow && !lastCookieHintRef.current;
      const pageshowPersisted =
        event?.type === "pageshow" && (event as PageTransitionEvent).persisted === true;
      const authReturnNavigation = takeAuthReturnFocusRecovery();
      const focusSignals = {
        cookieHintAppeared,
        pageshowPersisted,
        authReturnNavigation,
      };

      if (shouldResetEmbedRefreshDeclineOnFocus(focusSignals)) {
        // Cross-tab login, bfcache restore, Main FE sign-in return, or fresh cookie.
        resetDesignAuthRefreshState();
      } else if (
        !stateRef.current.authenticated &&
        !isDesignAuthRefreshDeclined() &&
        cookieHintNow
      ) {
        // Visible cookie exists but UI is logged out — allow one refresh retry per focus
        // without clearing sticky 400 decline (deleted-account JWT).
        resetDesignAuthBareRefreshAttempt();
      }

      lastCookieHintRef.current = cookieHintNow;
      scheduleFocusSessionRefresh({
        bypassThrottle: shouldResetEmbedRefreshDeclineOnFocus(focusSignals),
        focusSignals,
      });
    };

    const onPageShow = (event: Event) => {
      onFocusReturn(event);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      onFocusReturn();
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (focusRefreshTimerRef.current) {
        clearTimeout(focusRefreshTimerRef.current);
        focusRefreshTimerRef.current = null;
      }
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, scheduleFocusSessionRefresh, takeAuthReturnFocusRecovery]);

  useEffect(() => {
    if (!enabled || !isTeamverEmbedMode()) return;
    return subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      if (authenticated && !stateRef.current.authenticated && !stateRef.current.loading) {
        void refresh();
      }
    });
  }, [enabled, refresh]);

  // C1: auto-backoff retry for `session_unreachable`. A single BFF hiccup
  // used to leave the embed banner stuck until the user changed tabs,
  // pressed refresh, or waited for the 5-minute focus refresh window.
  // We now retry with 5s → 15s → 60s while the tab is visible, resetting
  // the counter on any non-unreachable state. Hidden tabs skip the timer
  // and pick up on the next visibilityStatechange.
  const sessionUnreachableAttemptRef = useRef(0);
  useEffect(() => {
    if (!enabled || !isTeamverEmbedMode()) return;
    if (state.error !== "session_unreachable") {
      sessionUnreachableAttemptRef.current = 0;
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const attempt = sessionUnreachableAttemptRef.current;
      const delay = pickSessionUnreachableDelayMs(attempt);
      sessionUnreachableAttemptRef.current = attempt + 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (cancelled) return;
        void refresh({ force: true });
      }, delay);
    };

    scheduleRetry();

    const onVisibilityChange = () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      // Tab returned to foreground during backoff — attempt immediately
      // rather than waiting out the timer to feel responsive.
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      void refresh({ force: true });
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, refresh, state.error]);

  return {
    ...state,
    switchWorkspace,
    refresh,
  };
}

export { readActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";

export { pickDefaultWorkspaceId };
