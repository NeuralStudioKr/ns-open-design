import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { clearTeamverEmbedListCaches } from "./teamverEmbedListCaches";
import {
  postTeamverEmbedBroadcast,
  subscribeTeamverEmbedBroadcast,
} from "./teamverEmbedBroadcast";

const ACTIVE_WORKSPACE_KEY = "teamver_design_active_workspace_id";

export const TEAMVER_EMBED_SESSION_CHANGED_EVENT = "teamver-embed-session-changed";

export type TeamverEmbedSessionChangedDetail = {
  authenticated: boolean;
};

let embedSessionAuthenticated = false;
let crossTabRelayUnsubscribe: (() => void) | null = null;

function ensureCrossTabRelayInstalled(): void {
  if (crossTabRelayUnsubscribe) return;
  crossTabRelayUnsubscribe = subscribeTeamverEmbedBroadcast((message) => {
    if (message.kind !== "embed-session-changed") return;
    // Mirror the peer tab's authenticated state locally so the module
    // gate (`isTeamverEmbedSessionAuthenticated`) matches without
    // waiting for a fresh session probe. Downstream subscribers then
    // fire off the local CustomEvent path.
    const nextAuthenticated = Boolean(message.authenticated);
    const changed = embedSessionAuthenticated !== nextAuthenticated;
    embedSessionAuthenticated = nextAuthenticated;
    if (changed) {
      window.dispatchEvent(
        new CustomEvent<TeamverEmbedSessionChangedDetail>(
          TEAMVER_EMBED_SESSION_CHANGED_EVENT,
          { detail: { authenticated: nextAuthenticated } },
        ),
      );
    }
  });
}

/** @internal test — reset the cross-tab session relay between suites. */
export function resetTeamverEmbedSessionRelayForTests(): void {
  if (crossTabRelayUnsubscribe) {
    try {
      crossTabRelayUnsubscribe();
    } catch {
      // best-effort
    }
    crossTabRelayUnsubscribe = null;
  }
  embedSessionAuthenticated = false;
}

function dispatchTeamverEmbedSessionChanged(authenticated: boolean): void {
  if (typeof window === "undefined") return;
  ensureCrossTabRelayInstalled();
  window.dispatchEvent(
    new CustomEvent<TeamverEmbedSessionChangedDetail>(TEAMVER_EMBED_SESSION_CHANGED_EVENT, {
      detail: { authenticated },
    }),
  );
  postTeamverEmbedBroadcast({ kind: "embed-session-changed", authenticated });
}

export function subscribeTeamverEmbedSessionChanged(
  listener: (detail: TeamverEmbedSessionChangedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  ensureCrossTabRelayInstalled();
  const handler = (event: Event) => {
    const custom = event as CustomEvent<TeamverEmbedSessionChangedDetail>;
    listener({ authenticated: Boolean(custom.detail?.authenticated) });
  };
  window.addEventListener(TEAMVER_EMBED_SESSION_CHANGED_EVENT, handler);
  return () => window.removeEventListener(TEAMVER_EMBED_SESSION_CHANGED_EVENT, handler);
}

/** Updated by embed boot + `useTeamverEmbed` refresh — gates daemon project lists. */
export function setTeamverEmbedSessionAuthenticated(authenticated: boolean): void {
  const next = Boolean(authenticated);
  const changed = embedSessionAuthenticated !== next;
  embedSessionAuthenticated = next;
  if (changed) {
    dispatchTeamverEmbedSessionChanged(next);
  }
}

export function isTeamverEmbedSessionAuthenticated(): boolean {
  if (!isTeamverEmbedMode()) return true;
  return embedSessionAuthenticated;
}

/** Drop stale workspace + registry caches when cookie SSO is absent. */
export async function clearTeamverEmbedSessionState(): Promise<void> {
  setTeamverEmbedSessionAuthenticated(false);
  clearTeamverEmbedListCaches();

  const client = getDesignBffClient();
  const store = client?.workspaceStore as { clear?: () => Promise<void> | void } | null | undefined;
  if (store && typeof store.clear === "function") {
    await store.clear();
    return;
  }

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
    } catch {
      // ignore quota / privacy mode
    }
  }
}
