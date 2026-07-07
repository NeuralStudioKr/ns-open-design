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
    // Cross-tab login sync only. When a peer tab completes sign-in we
    // mirror `authenticated=true` so other tabs unlock without waiting
    // for focus refresh. Do NOT mirror peer `false` — a transient BFF
    // probe failure or cold boot in tab B must not detach BYOK streams /
    // wipe workspace state in tab A where the user is mid-run.
    if (!message.authenticated) return;
    const nextAuthenticated = true;
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
