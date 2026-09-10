import type { LocalStorageWorkspaceStore, WorkspaceListItem } from "@teamver/app-sdk";
import { getDesignBffClient, type DesignAuthSession } from "./designBffClient";
import {
  dispatchTeamverWorkspaceAutoSwitched,
  dispatchTeamverWorkspaceChanged,
} from "./teamverWorkspaceEvents";
import {
  isWorkspaceAppEnabled,
  normalizeWorkspaceList,
  pickDefaultWorkspaceId,
  readWorkspaceId,
} from "./workspaceUtils";
import { mayPromoteWorkspaceToDurablePreference } from "./workspaceDurablePreference";
import { bumpTeamverWorkspaceStoreRevision } from "./teamverWorkspaceStoreRevision";

function readSessionUserId(session: DesignAuthSession): string | null {
  return session.user?.userId?.trim() || null;
}

/**
 * The workspace the user last picked inside Design, when it is still present on
 * the session list.
 *
 * `appEnabled` is deliberately ignored for the active key — that judgement
 * belongs to the auto-switch path in `syncTeamverWorkspaceFromSession`. Callers
 * use this only to decide whether a launch-URL hint from Main FE may seed the
 * store at all (0908-N01 P1: an existing in-Design pick outranks the hint).
 *
 * Boot only. The active key and the per-user durable pick can only disagree
 * when a reconcile moved the active key on its own, because an explicit switch
 * writes both (`setActiveTeamverWorkspace`). So preferring the durable pick
 * here is exactly "undo a reconcile that was driven by one flaky session
 * response" (0908-N01 slice G) — which is what P1 promises. It is deliberately
 * not done on routine reads: dragging a mid-session user back to a workspace
 * they were moved off hours ago would read as another spontaneous switch.
 */
export async function readStoredWorkspaceIdOnSession(
  session: DesignAuthSession,
  workspacesInput?: WorkspaceListItem[],
): Promise<string | null> {
  if (!session.authenticated) return null;

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return null;

  const stored = (await store.get())?.trim() || null;
  const workspaces = workspacesInput ?? normalizeWorkspaceList(session.workspaces);
  const activeOnSession =
    stored && workspaces.some((workspace) => workspace.id === stored) ? stored : null;

  const userId = readSessionUserId(session);
  const durable =
    userId && typeof store.getLastForUser === "function"
      ? store.getLastForUser(userId)?.trim() || null
      : null;
  if (durable && durable !== activeOnSession) {
    const durableWorkspace = workspaces.find((workspace) => workspace.id === durable);
    // Requiring `appEnabled` is not optional: P2 moves off a workspace whose
    // Design app was turned off, and restoring it here would make every
    // refresh bounce between the two.
    if (durableWorkspace && isWorkspaceAppEnabled(durableWorkspace)) return durable;
  }

  return activeOnSession;
}

/**
 * Embed boot: seed `teamver_design_active_workspace_id` from Main BE session/bootstrap.
 * Registry, usage, and publish send `X-Workspace-Id` from this store.
 */
export async function syncTeamverWorkspaceFromSession(
  session: DesignAuthSession,
  workspacesInput?: WorkspaceListItem[],
  options?: {
    preferredIdOverride?: string | null;
    /**
     * Routine focus/idle session refresh must not silently reroute the whole
     * embed when the currently-stored workspace still exists in the session.
     * When `true`, we keep `stored` as long as it is present in the workspace
     * list (even if temporarily disabled) instead of falling through to
     * `pickDefaultWorkspaceId` which may pick a different enabled workspace.
     *
     * Boot and explicit auth recovery pass `false` so a legitimately revoked
     * workspace still gets reconciled onto a valid one.
     */
    preserveStoredWorkspace?: boolean;
  },
): Promise<string | null> {
  if (!session.authenticated) return null;

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return null;

  const workspaces = workspacesInput ?? normalizeWorkspaceList(session.workspaces);
  const userId = readSessionUserId(session);

  const override = options?.preferredIdOverride?.trim() || null;
  const storedRaw = (await store.get())?.trim() || null;
  const stored =
    storedRaw && workspaces.some((workspace) => workspace.id === storedRaw)
      ? storedRaw
      : null;

  // Focus/idle refresh — honour the stored workspace whenever it still
  // exists on the session so tab-focus does not fake a workspace switch.
  if (options?.preserveStoredWorkspace && !override && stored) {
    const storedStillPresent = workspaces.some(
      (workspace) => workspace.id === stored,
    );
    if (storedStillPresent) {
      if (userId && typeof store.setLastForUser === "function") {
        store.setLastForUser(userId, stored);
      }
      return stored;
    }
  }

  let active = override || stored || null;
  if (!active && userId && typeof store.getPreferredWorkspaceIdForBootstrap === "function") {
    active = store.getPreferredWorkspaceIdForBootstrap(userId)?.trim() || null;
  }

  const resolved = pickDefaultWorkspaceId(workspaces, {
    preferredId: active,
    defaultWorkspaceId: session.defaultWorkspaceId ?? null,
  });

  if (resolved && resolved !== stored) {
    await store.set(resolved);
    // Invalidate in-flight resolveActiveTeamverWorkspaceId bursts that keyed
    // on the previous revision (0908-N01 H4). setActive already bumps; sync
    // must too or a focus reconcile leaves callers joining a stale flight.
    bumpTeamverWorkspaceStoreRevision();
    active = resolved;
    dispatchTeamverWorkspaceChanged(resolved);
    // Only an unrequested move deserves a notice: `override` means the caller
    // (parent-app switch / launch seed) asked for this one, and a missing
    // `storedRaw` means there was no earlier pick to move away from.
    if (!override && storedRaw && storedRaw !== resolved) {
      dispatchTeamverWorkspaceAutoSwitched({
        from: storedRaw,
        to: resolved,
        reason: workspaces.some((workspace) => workspace.id === storedRaw)
          ? "app-disabled"
          : "revoked",
      });
    }
  } else if (!stored && resolved) {
    await store.set(resolved);
    bumpTeamverWorkspaceStoreRevision();
    active = resolved;
    dispatchTeamverWorkspaceChanged(resolved);
  } else if (resolved) {
    active = resolved;
  }

  if (
    userId
    && active
    && typeof store.setLastForUser === "function"
    && mayPromoteWorkspaceToDurablePreference({
      storedBefore: storedRaw,
      resolved: active,
      requestedByCaller: Boolean(override),
    })
  ) {
    store.setLastForUser(userId, active);
  }

  return active || resolved;
}

export { readWorkspaceId };
