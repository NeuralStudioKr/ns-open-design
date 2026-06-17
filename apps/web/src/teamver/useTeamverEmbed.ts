import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkspaceListItem } from "@teamver/app-sdk";
import { NetworkError } from "@teamver/app-sdk";
import { fetchDesignAuthSession, getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode, resolveTeamverLoginUrl } from "./designApiBase";
import { setActiveTeamverWorkspace } from "./setActiveTeamverWorkspace";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
import {
  normalizeWorkspaceList,
  pickDefaultWorkspaceId,
  readWorkspaceId,
  readWorkspaceLabel,
} from "./workspaceUtils";

export type TeamverEmbedState = {
  loading: boolean;
  authenticated: boolean;
  userLabel: string | null;
  userId: string | null;
  activeWorkspaceId: string | null;
  activeWorkspaceLabel: string | null;
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
  activeWorkspaceId: null,
  activeWorkspaceLabel: null,
  workspaces: [],
  error: null,
};

function isSessionExpiredError(err: unknown): boolean {
  return err instanceof NetworkError && err.status === 401;
}

function readUserId(user: {
  userId?: string;
  user_id?: string;
  email?: string;
} | null | undefined): string | null {
  return user?.userId?.trim() || user?.user_id?.trim() || null;
}

function readUserLabel(user: {
  displayName?: string;
  display_name?: string;
  name?: string;
  email?: string;
  userId?: string;
  user_id?: string;
} | null | undefined): string | null {
  return (
    user?.displayName?.trim() ||
    user?.display_name?.trim() ||
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

      setState({
        loading: false,
        authenticated: Boolean(session.authenticated),
        userLabel: readUserLabel(session.user),
        userId,
        activeWorkspaceId,
        activeWorkspaceLabel: activeWorkspace ? readWorkspaceLabel(activeWorkspace) : null,
        workspaces,
        error: session.authenticated ? null : "not_authenticated",
      });
    } catch (err) {
      if (isSessionExpiredError(err) && typeof window !== "undefined") {
        window.location.assign(resolveTeamverLoginUrl());
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
    setState((prev) => ({
      ...prev,
      activeWorkspaceId: trimmed,
      activeWorkspaceLabel: readWorkspaceLabel(target),
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
