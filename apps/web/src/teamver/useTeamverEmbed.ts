import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import {
  ensureDesignBffSessionAuthenticated,
  fetchDesignAuthSession,
  isDesignAuthRefreshDeclined,
  prepareDesignAuthSessionReload,
  probeDesignBffSessionAuthenticated,
  resetDesignAuthBareRefreshAttempt,
  resetDesignAuthRefreshState,
  type DesignAuthSession,
  type DesignAuthSessionUser,
} from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { redirectToTeamverLoginPreservingRoute } from "./designAuthFlow";
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
  consumeTeamverAuthReturnPending,
} from "./teamverAuthReturn";
import { resolveEmbedAuthReturnPath } from "./teamverEmbedAuthNavigation";
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
  redirectToDesignLoginIfBffMissing,
  shouldClearEmbedSessionOnUnauthenticated,
  shouldResetEmbedRefreshDeclineOnFocus,
  resolveEmbedFocusSessionOptions,
} from "./teamverEmbedAuthFlow";
import {
  handleEmbedPassiveUnauthorized,
  TEAMVER_EMBED_PASSIVE_AUTH_EVENT,
  TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT,
} from "./teamverEmbedPassiveAuth";
import {
  peekEmbedBootstrapSession,
  type EmbedBootstrapSessionSnapshot,
} from "./embedBootstrapSession";

export type TeamverEmbedRefreshResult =
  | "authenticated"
  | "unreachable"
  | "not_authenticated";

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
   * Returns a stable outcome so C1 backoff does not re-read a stale React ref
   * before the matching setState commits.
   */
  refresh: (options?: {
    force?: boolean;
    resetRefreshState?: boolean;
    silent?: boolean;
  }) => Promise<TeamverEmbedRefreshResult>;
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
  // SDK maps HTTP 401 → AuthenticationError; duck-type status so explicit
  // 「다시 시도」 still converges to login on dead cookie.
  if (!(err instanceof Error)) return false;
  return Number((err as { status?: unknown }).status) === 401;
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
/** After this many C1 attempts without recovery, stop probing and require login. */
const SESSION_UNREACHABLE_MAX_ATTEMPTS = 5;

function pickSessionUnreachableDelayMs(attempt: number): number {
  const clamped = Math.max(0, attempt);
  const index = Math.min(clamped, SESSION_UNREACHABLE_BACKOFF_MS.length - 1);
  return SESSION_UNREACHABLE_BACKOFF_MS[index] ?? 60_000;
}

function buildEmbedStateFromBootSnapshot(
  boot: EmbedBootstrapSessionSnapshot,
): Omit<TeamverEmbedState, "switchWorkspace" | "refresh"> {
  const session = boot.session;
  const workspaces = normalizeWorkspaceList(session.workspaces);
  const activeWorkspace =
    workspaces.find((workspace) => readWorkspaceId(workspace) === boot.activeWorkspaceId) ?? null;
  return {
    loading: false,
    authenticated: true,
    userLabel: readUserLabel(session.user),
    userId: readUserId(session.user),
    userImageUrl: readUserImageUrl(session.user),
    activeWorkspaceId: boot.activeWorkspaceId,
    activeWorkspaceLabel: activeWorkspace ? readWorkspaceLabel(activeWorkspace) : null,
    designAppEnabled: activeWorkspace ? isWorkspaceAppEnabled(activeWorkspace) : true,
    designDisabledReason: activeWorkspace ? readAppDisabledReason(activeWorkspace) : null,
    workspaces,
    error: null,
  };
}

function resolveInitialEmbedState(
  enabled: boolean,
): Omit<TeamverEmbedState, "switchWorkspace" | "refresh"> {
  if (!enabled || !isTeamverEmbedMode()) return INITIAL;
  const boot = peekEmbedBootstrapSession();
  if (boot?.session.authenticated) {
    return buildEmbedStateFromBootSnapshot(boot);
  }
  if (!isTeamverEmbedBootComplete()) {
    return { ...INITIAL, loading: true };
  }
  return INITIAL;
}

function applySessionToEmbedState(
  session: DesignAuthSession,
  activeWorkspaceId: string | null,
): Omit<TeamverEmbedState, "switchWorkspace" | "refresh"> {
  const workspaces = normalizeWorkspaceList(session.workspaces);
  const activeWorkspace =
    workspaces.find((workspace) => readWorkspaceId(workspace) === activeWorkspaceId) ?? null;
  const userId = readUserId(session.user);
  return {
    loading: false,
    authenticated: true,
    userLabel: readUserLabel(session.user),
    userId,
    userImageUrl: readUserImageUrl(session.user),
    activeWorkspaceId,
    activeWorkspaceLabel: activeWorkspace ? readWorkspaceLabel(activeWorkspace) : null,
    designAppEnabled: activeWorkspace ? isWorkspaceAppEnabled(activeWorkspace) : true,
    designDisabledReason: activeWorkspace ? readAppDisabledReason(activeWorkspace) : null,
    workspaces,
    error: null,
  };
}

export function useTeamverEmbed(enabled: boolean): TeamverEmbedState {
  const [state, setState] = useState(() => resolveInitialEmbedState(enabled));
  const stateRef = useRef(state);
  stateRef.current = state;

  // Hydrate from the App-boot session snapshot as soon as boot completes.
  // The `refresh()` effect below fetches the session again (cache-hit path),
  // but that resolves one microtask later than `EmbedBootstrapGate.setReady`.
  // Applying the snapshot in the same tick that boot completes means the
  // first render after the gate opens shows the authenticated banner
  // instead of a "session loading" flicker.
  useEffect(() => {
    if (!enabled || !isTeamverEmbedMode()) return;
    if (stateRef.current.authenticated) return;
    if (isTeamverEmbedBootComplete()) {
      const boot = peekEmbedBootstrapSession();
      if (boot?.session.authenticated) {
        setState(applySessionToEmbedState(boot.session, boot.activeWorkspaceId));
      }
      return;
    }
    let cancelled = false;
    void waitForTeamverEmbedBoot().then(() => {
      if (cancelled) return;
      if (stateRef.current.authenticated) return;
      const boot = peekEmbedBootstrapSession();
      if (boot?.session.authenticated) {
        setState(applySessionToEmbedState(boot.session, boot.activeWorkspaceId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

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

  const refresh = useCallback(async (options?: {
    force?: boolean;
    resetRefreshState?: boolean;
    silent?: boolean;
  }): Promise<TeamverEmbedRefreshResult> => {
    if (!enabled || !isTeamverEmbedMode()) {
      setState(INITIAL);
      return "not_authenticated";
    }

    const force = options?.force ?? false;
    const resetRefreshState = options?.resetRefreshState ?? false;
    const silent = options?.silent ?? false;
    const bootSnapshot = peekEmbedBootstrapSession();
    const bootHydrated = bootSnapshot?.session.authenticated === true;
    // Routine tab-focus refresh should not blank the session bar — only the
    // initial boot and explicit auth recovery need the loading affordance.
    // Never clear `session_unreachable` here — clearing it reset the C1 attempt
    // counter (effect saw "recovered") and spammed /auth/refresh + probe 401
    // every 5s. Success / not_authenticated paths clear the error explicitly.
    setState((prev) => ({
      ...prev,
      loading:
        silent
          ? prev.loading
          : (prev.authenticated || bootHydrated) && !resetRefreshState && !force
            ? prev.loading
            : true,
      error:
        prev.error === "session_unreachable"
          ? "session_unreachable"
          : null,
    }));
    try {
      // App boot runs the first session probe + registry sync — avoid racing refresh/clear.
      if (!force && !isTeamverEmbedBootComplete()) {
        await waitForTeamverEmbedBoot();
      }

      const session = await fetchDesignAuthSession({ force, resetRefreshState });
      if (!session) {
        const hadPriorAuthenticatedUi =
          hadEmbedSession() || stateRef.current.authenticated;
        if (
          shouldClearEmbedSessionOnUnauthenticated({
            resetRefreshState,
            hadPriorAuthenticatedUi,
          })
        ) {
          // Definitive dead session after escalate/reset — stop 401 spam.
          consumeTeamverAuthReturnPending();
          await clearTeamverEmbedSessionState();
          redirectToDesignLoginIfBffMissing({
            returnTo: resolveEmbedAuthReturnPath(
              window.location.pathname,
              window.location.search,
            ),
          });
          setState({
            ...INITIAL,
            loading: false,
            error: "not_authenticated",
          });
          return "not_authenticated";
        }
        if (hadPriorAuthenticatedUi) {
          // Keep unreachable so backoff retries continue.
          setState((prev) => ({ ...prev, loading: false, error: "session_unreachable" }));
          return "unreachable";
        }
        await clearTeamverEmbedSessionState();
        setState({ ...INITIAL, loading: false, error: "session_unreachable" });
        return "unreachable";
      }

      if (!session.authenticated) {
        lastCookieHintRef.current = readAuthCookieHint();
        const hadPriorAuthenticatedUi =
          stateRef.current.authenticated || hadEmbedSession();
        const cookieHint = hasProbableTeamverAuthCookie();
        if (
          !shouldClearEmbedSessionOnUnauthenticated({
            resetRefreshState,
            hadPriorAuthenticatedUi,
            cookieHint,
          })
        ) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "session_unreachable",
          }));
          return "unreachable";
        }
        // Definitive unauthenticated — drop the auth-return defer shield so
        // redirectToDesignLoginIfBffMissing is not a no-op.
        consumeTeamverAuthReturnPending();
        await clearTeamverEmbedSessionState();
        redirectToDesignLoginIfBffMissing({
          returnTo: resolveEmbedAuthReturnPath(
            window.location.pathname,
            window.location.search,
          ),
        });
        setState({
          ...INITIAL,
          loading: false,
          error: "not_authenticated",
        });
        return "not_authenticated";
      }

      setTeamverEmbedSessionAuthenticated(true);
      consumeTeamverAuthReturnPending();

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
      if (activeWorkspaceId) {
        const activeWorkspace =
          workspaces.find((workspace) => readWorkspaceId(workspace) === activeWorkspaceId) ?? null;
        if (activeWorkspace) {
          snapshotFromWorkspace(activeWorkspaceId, activeWorkspace);
        }
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
        ...applySessionToEmbedState(session, activeWorkspaceId),
      });
      return "authenticated";
    } catch (err) {
      if (isSessionExpiredError(err)) {
        lastCookieHintRef.current = readAuthCookieHint();
        setState((prev) => ({ ...prev, loading: false }));
        if (resetRefreshState) {
          // Explicit "다시 시도" — confirm session is gone before bouncing login.
          // Probe-confirmed dead allows re-login even if embed memory is stale.
          let probeAlive = await probeDesignBffSessionAuthenticated();
          if (!probeAlive) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            probeAlive = await probeDesignBffSessionAuthenticated();
          }
          // Probe cannot revive absolute-expired access; ensure /auth/session
          // runs ensure_bff_session which can Set-Cookie a fresh access token
          // on the main response and unlock nginx auth_request.
          if (!probeAlive) {
            probeAlive = await ensureDesignBffSessionAuthenticated();
          }
          if (probeAlive) {
            resetDesignAuthRefreshState();
            try {
              const revived = await fetchDesignAuthSession({ force: true, resetRefreshState: true });
              if (revived?.authenticated) {
                setTeamverEmbedSessionAuthenticated(true, { forceEvent: true });
                const workspaces = normalizeWorkspaceList(revived.workspaces);
                const activeWorkspaceId = await syncTeamverWorkspaceFromSession(revived, workspaces, {
                  preserveStoredWorkspace: true,
                });
                setState({
                  ...applySessionToEmbedState(revived, activeWorkspaceId),
                });
                return "authenticated";
              }
            } catch {
              // fall through — probe said alive but session hydrate failed
            }
            // Do NOT forceEvent / clear error: that reloads runtime-config and
            // looks "signed in" while C1 must keep recovering.
            setState((prev) => ({
              ...prev,
              authenticated: true,
              loading: false,
              error: "session_unreachable",
            }));
            return "unreachable";
          }
          prepareDesignAuthSessionReload();
          await clearTeamverEmbedSessionState();
          redirectToTeamverLoginPreservingRoute({
            returnTo:
              typeof window !== "undefined"
                ? resolveEmbedAuthReturnPath(
                    window.location.pathname,
                    window.location.search,
                  )
                : null,
          });
          // Always converge React state — redirect may be deferred (active run),
          // but C1 must stop hammering refresh/probe 401s.
          setState({
            ...INITIAL,
            loading: false,
            error: "not_authenticated",
          });
          return "not_authenticated";
        }
        // C1 silent retries already run fetchDesignAuthSession (refresh/probe).
        // Skip a second passive ladder that would duplicate 401 spam; only
        // surface the soft event when we are not already in the backoff loop.
        const alreadyUnreachable = stateRef.current.error === "session_unreachable";
        if (!silent || !alreadyUnreachable) {
          handleEmbedPassiveUnauthorized("bff");
        }
        if (hadEmbedSession() || stateRef.current.authenticated) {
          setState((prev) => ({
            ...prev,
            error: "session_unreachable",
          }));
          return "unreachable";
        }
        setState((prev) => ({
          ...prev,
          error: "not_authenticated",
        }));
        return "not_authenticated";
      }
      if (hadEmbedSession() || stateRef.current.authenticated) {
        setState((prev) => ({ ...prev, loading: false, error: "session_unreachable" }));
        return "unreachable";
      }
      setState({ ...INITIAL, loading: false, error: "session_unreachable" });
      return "unreachable";
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

    const advanced = await setActiveTeamverWorkspace(trimmed, stateRef.current.userId);
    if (!advanced) {
      // BFF refused — keep prior activeWorkspaceId / design-access snapshot
      // so UI cannot drift ahead of cookie + X-Workspace-Id (§14).
      return;
    }
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
    const boot = peekEmbedBootstrapSession();
    if (boot?.session.authenticated) {
      if (!stateRef.current.authenticated) {
        setState(applySessionToEmbedState(boot.session, boot.activeWorkspaceId));
      }
      if (isTeamverEmbedBootComplete()) {
        return;
      }
    }
    void refresh({ silent: boot?.session.authenticated === true });
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
        // Cross-tab login or Main FE sign-in return — allow a fresh refresh attempt.
        // bfcache pageshow alone must not reset sticky decline (see authFlow).
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
      // While unreachable, rely on the dedicated C1 backoff — including bfcache
      // pageshow. Dead cookies + force focus refresh only duplicate 401 spam;
      // cookie-hint / auth-return still bypass so real sign-in returns recover.
      if (
        stateRef.current.error === "session_unreachable"
        && !shouldResetEmbedRefreshDeclineOnFocus(focusSignals)
        && !focusSignals.cookieHintAppeared
      ) {
        return;
      }
      // Soft/hard sticky with still-true memory authenticated: same spam risk as
      // unreachable — skip opportunistic focus refresh until C1 / auth-return.
      if (
        isDesignAuthRefreshDeclined()
        && !shouldResetEmbedRefreshDeclineOnFocus(focusSignals)
        && !focusSignals.cookieHintAppeared
      ) {
        return;
      }
      scheduleFocusSessionRefresh({
        bypassThrottle:
          shouldResetEmbedRefreshDeclineOnFocus(focusSignals)
          || focusSignals.pageshowPersisted
          || focusSignals.cookieHintAppeared,
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

  // Passive 401 recovery deferred (active run / background) — surface the same
  // unreachable chip so the user can retry without a silent soft-signal.
  useEffect(() => {
    if (!enabled || !isTeamverEmbedMode()) return;
    const onPassiveAuthRequired = () => {
      setState((prev) => {
        if (!prev.authenticated) return prev;
        if (prev.error === "session_unreachable") return prev;
        return { ...prev, error: "session_unreachable" };
      });
    };
    const onPassiveAuthRecovered = () => {
      // Do not clear session_unreachable before refresh confirms auth — clearing
      // early resets the C1 attempt counter and re-opens 5s refresh/probe spam.
      void refresh({ force: true, silent: true }).then((outcome) => {
        if (outcome !== "authenticated") return;
        setState((prev) => {
          if (prev.error !== "session_unreachable") return prev;
          return { ...prev, error: null, loading: false };
        });
      });
    };
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, onPassiveAuthRequired);
    window.addEventListener(TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT, onPassiveAuthRecovered);
    return () => {
      window.removeEventListener(TEAMVER_EMBED_PASSIVE_AUTH_EVENT, onPassiveAuthRequired);
      window.removeEventListener(
        TEAMVER_EMBED_PASSIVE_AUTH_RECOVERED_EVENT,
        onPassiveAuthRecovered,
      );
    };
  }, [enabled, refresh]);

  // C1: auto-backoff retry for `session_unreachable`. A single BFF hiccup
  // used to leave the embed banner stuck until the user changed tabs,
  // pressed refresh, or waited for the 5-minute focus refresh window.
  // We now retry with 5s → 15s → 60s while the tab is visible, resetting
  // the counter on any non-unreachable state. Hidden tabs skip the timer
  // and pick up on the next visibilityStatechange.
  //
  // Important: chain the next attempt from the refresh `.finally` — do not
  // clear `session_unreachable` at refresh start (that used to reset the
  // attempt counter every 5s and spam /auth/refresh + session-probe 401).
  // Cap attempts so a permanently dead cookie converges to not_authenticated.
  const sessionUnreachableAttemptRef = useRef(0);
  const sessionUnreachableInFlightRef = useRef(false);
  useEffect(() => {
    if (!enabled || !isTeamverEmbedMode()) return;
    if (state.error !== "session_unreachable") {
      sessionUnreachableAttemptRef.current = 0;
      sessionUnreachableInFlightRef.current = false;
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const finalizeDeadSession = async () => {
      consumeTeamverAuthReturnPending();
      prepareDesignAuthSessionReload();
      await clearTeamverEmbedSessionState();
      redirectToDesignLoginIfBffMissing({
        returnTo: resolveEmbedAuthReturnPath(
          window.location.pathname,
          window.location.search,
        ),
      });
      if (!cancelled) {
        setState({
          ...INITIAL,
          loading: false,
          error: "not_authenticated",
        });
      }
    };

    const scheduleRetry = (options?: { immediate?: boolean }) => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (sessionUnreachableInFlightRef.current) return;
      const attempt = sessionUnreachableAttemptRef.current;
      if (attempt >= SESSION_UNREACHABLE_MAX_ATTEMPTS) {
        void finalizeDeadSession();
        return;
      }
      const delay = options?.immediate ? 0 : pickSessionUnreachableDelayMs(attempt);
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (cancelled) return;
        if (sessionUnreachableInFlightRef.current) return;
        // Increment only when the attempt actually starts — visibility
        // reschedules must not burn the max-attempt budget.
        const startedAttempt = sessionUnreachableAttemptRef.current;
        if (startedAttempt >= SESSION_UNREACHABLE_MAX_ATTEMPTS) {
          void finalizeDeadSession();
          return;
        }
        sessionUnreachableAttemptRef.current = startedAttempt + 1;
        // First two attempts stay silent; escalate so login can run if the
        // session is truly gone. Never auto-clear sticky (resetRefreshState) —
        // that re-opened POST /auth/refresh + probe×2 storms every C1 cycle.
        // Sticky clear is owned by explicit 「다시 시도」 / auth-return only.
        const escalate = startedAttempt >= 2;
        sessionUnreachableInFlightRef.current = true;
        void refresh({
          force: true,
          silent: !escalate,
          resetRefreshState: false,
        }).then((outcome) => {
          // Clear in-flight before chaining — otherwise scheduleRetry no-ops
          // and C1 stops after the first backoff tick.
          sessionUnreachableInFlightRef.current = false;
          if (cancelled) return;
          if (outcome === "unreachable") {
            scheduleRetry();
          }
        }, () => {
          sessionUnreachableInFlightRef.current = false;
        });
      }, delay);
    };

    scheduleRetry();

    const onVisibilityChange = () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      // Tab returned during in-flight recovery — do not stack another refresh.
      if (sessionUnreachableInFlightRef.current) return;
      // Reschedule immediately with the same attempt index (not yet consumed).
      scheduleRetry({ immediate: true });
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
