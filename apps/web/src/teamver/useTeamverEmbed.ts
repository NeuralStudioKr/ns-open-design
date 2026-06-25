import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import { NetworkError } from "@teamver/app-sdk";
import {
  fetchDesignAuthSession,
  getDesignBffClient,
  invalidateDesignAuthSessionCache,
  prepareDesignAuthSessionReload,
  resetDesignAuthRefreshState,
  type DesignAuthSessionUser,
} from "./designBffClient";
import { isTeamverEmbedMode, redirectToTeamverLogin } from "./designApiBase";
import { hasProbableTeamverAuthCookie } from "./teamverAuthCookieHints";
import { setActiveTeamverWorkspace } from "./setActiveTeamverWorkspace";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
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
   * - `force` — bypass the 5s session cache (used by visibility/focus auto-refresh).
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

const FOCUS_SESSION_REFRESH_MS = 500;

export function useTeamverEmbed(enabled: boolean): TeamverEmbedState {
  const [state, setState] = useState(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async (options?: { force?: boolean; resetRefreshState?: boolean }) => {
    if (!enabled || !isTeamverEmbedMode()) {
      setState(INITIAL);
      return;
    }

    const force = options?.force ?? false;
    const resetRefreshState = options?.resetRefreshState ?? false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
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
      const activeWorkspaceId = await syncTeamverWorkspaceFromSession(session, workspaces);
      const activeWorkspace =
        workspaces.find((workspace) => readWorkspaceId(workspace) === activeWorkspaceId) ?? null;
      const designAppEnabled = activeWorkspace ? isWorkspaceAppEnabled(activeWorkspace) : true;
      const designDisabledReason = activeWorkspace
        ? readAppDisabledReason(activeWorkspace)
        : null;
      if (activeWorkspaceId && activeWorkspace) {
        snapshotFromWorkspace(activeWorkspaceId, activeWorkspace);
      }
      // Registry sync runs on App boot — skip duplicate work on initial banner hydrate.
      if (force && session.authenticated && activeWorkspaceId) {
        try {
          await syncAllDaemonProjectsToRegistry();
        } catch (err) {
          console.warn("[teamver] registry sync on session refresh failed", err);
        }
      }

      setState({
        loading: false,
        authenticated: Boolean(session.authenticated),
        userLabel: readUserLabel(session.user),
        userId,
        userImageUrl: readUserImageUrl(session.user),
        activeWorkspaceId,
        activeWorkspaceLabel: activeWorkspace ? readWorkspaceLabel(activeWorkspace) : null,
        designAppEnabled,
        designDisabledReason,
        workspaces,
        error: session.authenticated ? null : "not_authenticated",
      });
    } catch (err) {
      if (isSessionExpiredError(err)) {
        await clearTeamverEmbedSessionState();
        prepareDesignAuthSessionReload();
        redirectToTeamverLogin();
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

  const scheduleFocusSessionRefresh = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    if (focusRefreshTimerRef.current) {
      clearTimeout(focusRefreshTimerRef.current);
    }
    focusRefreshTimerRef.current = setTimeout(() => {
      focusRefreshTimerRef.current = null;
      void refresh({ force: true });
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

  // Track the cookie-hint state at the time of the last visibility-change
  // refresh so we only reset the sticky refresh-decline markers when an auth
  // cookie newly *appeared* (likely sign-in in another tab) — not on every
  // focus, which previously spammed `/teamver-bff/auth/refresh` with 400 on
  // each tab switch for accounts whose JWT lookup fails server-side.
  const lastCookieHintRef = useRef<boolean>(
    isTeamverEmbedMode()
      ? hasProbableTeamverAuthCookie() || isTeamverEmbedSessionAuthenticated()
      : false,
  );

  useEffect(() => {
    if (!enabled || !isTeamverEmbedMode()) return;
    const onReturn = () => {
      const cookieHintNow =
        hasProbableTeamverAuthCookie() || isTeamverEmbedSessionAuthenticated();
      const cookieHintAppeared = cookieHintNow && !lastCookieHintRef.current;
      lastCookieHintRef.current = cookieHintNow;
      if (cookieHintAppeared) {
        // Cookie likely refreshed elsewhere — clear sticky 400/401 decline so
        // we re-probe + retry refresh once on this focus.
        resetDesignAuthRefreshState();
      }
      invalidateDesignAuthSessionCache();
      scheduleFocusSessionRefresh();
    };
    window.addEventListener("pageshow", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      if (focusRefreshTimerRef.current) {
        clearTimeout(focusRefreshTimerRef.current);
        focusRefreshTimerRef.current = null;
      }
      window.removeEventListener("pageshow", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [enabled, scheduleFocusSessionRefresh]);

  useEffect(() => {
    if (!enabled || !isTeamverEmbedMode()) return;
    return subscribeTeamverEmbedSessionChanged(({ authenticated }) => {
      if (authenticated && !stateRef.current.authenticated && !stateRef.current.loading) {
        void refresh();
      }
    });
  }, [enabled, refresh]);

  return {
    ...state,
    switchWorkspace,
    refresh,
  };
}

export { readActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";

export { pickDefaultWorkspaceId };
