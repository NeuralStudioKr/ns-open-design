import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import { NetworkError } from "@teamver/app-sdk";
import { fetchDesignAuthSession, getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode, redirectToTeamverLogin } from "./designApiBase";
import { setActiveTeamverWorkspace } from "./setActiveTeamverWorkspace";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
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
  refresh: () => Promise<void>;
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

import type { DesignAuthSessionUser } from "./designBffClient";

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

export function useTeamverEmbed(enabled: boolean): TeamverEmbedState {
  const [state, setState] = useState(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    if (!enabled || !isTeamverEmbedMode()) {
      setState(INITIAL);
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const session = await fetchDesignAuthSession();
      if (!session) {
        setState({ ...INITIAL, loading: false, error: "session_unreachable" });
        return;
      }

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
        redirectToTeamverLogin();
        return;
      }
      setState({ ...INITIAL, loading: false, error: "session_unreachable" });
    }
  }, [enabled]);

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

  return {
    ...state,
    switchWorkspace,
    refresh,
  };
}

/** Read active workspace id from store without a full session round-trip. */
export async function readActiveTeamverWorkspaceId(): Promise<string | null> {
  const client = getDesignBffClient();
  const value = await client?.workspaceStore?.get();
  return value?.trim() || null;
}

export { pickDefaultWorkspaceId };
