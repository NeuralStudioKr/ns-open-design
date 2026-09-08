import {
  postTeamverEmbedBroadcast,
  subscribeTeamverEmbedBroadcast,
} from "./teamverEmbedBroadcast";

export const TEAMVER_WORKSPACE_CHANGED_EVENT = "teamver-design-workspace-changed";

export type TeamverWorkspaceChangedDetail = {
  workspaceId: string;
};

export const TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT =
  "teamver-design-workspace-auto-switched";

export type TeamverWorkspaceAutoSwitchReason = "app-disabled" | "revoked";

export type TeamverWorkspaceAutoSwitchedDetail = {
  from: string;
  to: string;
  reason: TeamverWorkspaceAutoSwitchReason;
};

let crossTabRelayUnsubscribe: (() => void) | null = null;

/**
 * Install the cross-tab relay once per document. Peer tabs' workspace
 * changes are re-emitted as local CustomEvents so every existing
 * subscriber (App workspace switch handler, ProjectView cleanup, ...)
 * observes them without any downstream refactor.
 */
function ensureCrossTabRelayInstalled(): void {
  if (crossTabRelayUnsubscribe) return;
  crossTabRelayUnsubscribe = subscribeTeamverEmbedBroadcast((message) => {
    if (message.kind !== "workspace-changed") return;
    const workspaceId = message.workspaceId?.trim();
    if (!workspaceId) return;
    window.dispatchEvent(
      new CustomEvent<TeamverWorkspaceChangedDetail>(
        TEAMVER_WORKSPACE_CHANGED_EVENT,
        { detail: { workspaceId } },
      ),
    );
  });
}

/** @internal test — allow tests to re-install the cross-tab relay. */
export function resetTeamverWorkspaceRelayForTests(): void {
  if (crossTabRelayUnsubscribe) {
    try {
      crossTabRelayUnsubscribe();
    } catch {
      // best-effort
    }
    crossTabRelayUnsubscribe = null;
  }
}

export function dispatchTeamverWorkspaceChanged(workspaceId: string): void {
  if (typeof window === "undefined") return;
  ensureCrossTabRelayInstalled();
  window.dispatchEvent(
    new CustomEvent<TeamverWorkspaceChangedDetail>(TEAMVER_WORKSPACE_CHANGED_EVENT, {
      detail: { workspaceId },
    }),
  );
  // Fan out to peer tabs so a workspace switch in tab A does not leave
  // tab B stuck on the previous workspace's project list / registry.
  postTeamverEmbedBroadcast({ kind: "workspace-changed", workspaceId });
}

/**
 * A workspace switch the user did not ask for (0908-N01 P2).
 *
 * Not broadcast across tabs on purpose — the notice belongs to the tab where
 * the switch actually happened, while `dispatchTeamverWorkspaceChanged` above
 * already keeps peer tabs' data in sync.
 */
export function dispatchTeamverWorkspaceAutoSwitched(
  detail: TeamverWorkspaceAutoSwitchedDetail,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TeamverWorkspaceAutoSwitchedDetail>(
      TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT,
      { detail },
    ),
  );
}

export function subscribeTeamverWorkspaceAutoSwitched(
  listener: (detail: TeamverWorkspaceAutoSwitchedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<TeamverWorkspaceAutoSwitchedDetail>;
    const detail = custom.detail;
    if (!detail?.from?.trim() || !detail?.to?.trim()) return;
    listener(detail);
  };
  window.addEventListener(TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT, handler);
  return () =>
    window.removeEventListener(TEAMVER_WORKSPACE_AUTO_SWITCHED_EVENT, handler);
}

export function subscribeTeamverWorkspaceChanged(
  listener: (detail: TeamverWorkspaceChangedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  ensureCrossTabRelayInstalled();
  const handler = (event: Event) => {
    const custom = event as CustomEvent<TeamverWorkspaceChangedDetail>;
    const workspaceId = custom.detail?.workspaceId?.trim();
    if (!workspaceId) return;
    listener({ workspaceId });
  };
  window.addEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, handler);
}
