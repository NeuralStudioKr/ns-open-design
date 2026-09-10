import type { LocalStorageWorkspaceStore } from "@teamver/app-sdk";
import { getDesignBffClient, type DesignAuthSession } from "./designBffClient";
import { setActiveTeamverWorkspace } from "./setActiveTeamverWorkspace";
import { bumpTeamverWorkspaceStoreRevision } from "./teamverWorkspaceStoreRevision";
import { mayPromoteWorkspaceToDurablePreference } from "./workspaceDurablePreference";

/**
 * Pure plan for BFF cookie vs local store drift (0908-N01 slice I).
 *
 * P1: local wins — never quietly overwrite local with BFF. Realign the BFF
 * instead (same as boot). Seed only when local has nothing.
 */
export type BffWorkspaceDriftPlan =
  | { action: "noop" }
  | { action: "realignBff"; localId: string }
  | { action: "seedLocal"; bffId: string };

export function planBffWorkspaceDriftRepair(args: {
  bffActiveWorkspaceId: string | null | undefined;
  localWorkspaceId: string | null | undefined;
}): BffWorkspaceDriftPlan {
  const bff = args.bffActiveWorkspaceId?.trim() || null;
  const local = args.localWorkspaceId?.trim() || null;
  if (bff === local) return { action: "noop" };
  // Both known and disagree → P1 local wins; push local onto the BFF.
  if (local && bff) return { action: "realignBff", localId: local };
  // BFF-only → seed local. Local-only (BFF unknown) → leave local alone.
  if (bff && !local) return { action: "seedLocal", bffId: bff };
  return { action: "noop" };
}

/**
 * Apply drift repair on focus/session refresh. Read path stays write-0;
 * callers must not invoke this from `resolveActiveTeamverWorkspaceId`.
 */
export async function applyBffWorkspaceDriftRepair(
  session: DesignAuthSession,
  userId?: string | null,
): Promise<BffWorkspaceDriftPlan> {
  if (!session.authenticated) return { action: "noop" };

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store || typeof store.get !== "function") return { action: "noop" };

  const local = (await store.get())?.trim() || null;
  const plan = planBffWorkspaceDriftRepair({
    bffActiveWorkspaceId: session.activeWorkspaceId,
    localWorkspaceId: local,
  });

  if (plan.action === "realignBff") {
    await setActiveTeamverWorkspace(plan.localId, userId, {
      skipEventWhenUnchanged: true,
    });
    return plan;
  }

  if (plan.action === "seedLocal") {
    await store.set(plan.bffId);
    bumpTeamverWorkspaceStoreRevision();
    if (
      userId?.trim()
      && typeof store.setLastForUser === "function"
      && mayPromoteWorkspaceToDurablePreference({
        storedBefore: local,
        resolved: plan.bffId,
        requestedByCaller: false,
      })
    ) {
      store.setLastForUser(userId.trim(), plan.bffId);
    }
    return plan;
  }

  return plan;
}
