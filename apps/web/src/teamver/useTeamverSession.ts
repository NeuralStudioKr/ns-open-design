import { useCallback, useEffect, useState } from "react";
import { fetchDesignAuthSession } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";

export type TeamverSessionState = {
  loading: boolean;
  authenticated: boolean;
  userLabel: string | null;
  defaultWorkspaceId: string | null;
  error: string | null;
};

const INITIAL: TeamverSessionState = {
  loading: false,
  authenticated: false,
  userLabel: null,
  defaultWorkspaceId: null,
  error: null,
};

export function useTeamverSession(enabled: boolean): TeamverSessionState {
  const [state, setState] = useState<TeamverSessionState>(INITIAL);

  const refresh = useCallback(async () => {
    if (!enabled || !isTeamverEmbedMode()) {
      setState(INITIAL);
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fetchDesignAuthSession();
      if (!data) {
        setState({ ...INITIAL, loading: false, error: "session_unreachable" });
        return;
      }
      const user = data.user;
      const label =
        user?.displayName?.trim() ||
        user?.name?.trim() ||
        user?.email?.trim() ||
        user?.userId?.trim() ||
        null;
      setState({
        loading: false,
        authenticated: Boolean(data.authenticated),
        userLabel: label,
        defaultWorkspaceId: data.defaultWorkspaceId ?? null,
        error: data.authenticated ? null : "not_authenticated",
      });
    } catch {
      setState({ ...INITIAL, loading: false, error: "session_unreachable" });
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return state;
}
