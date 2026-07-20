import type { LocalStorageWorkspaceStore } from "@teamver/app-sdk";
import {
  getDesignBffClient,
  refreshDesignAuthCookie,
  ensureDesignBffSessionAuthenticated,
} from "./designBffClient";
import { isBootstrapAuthMode } from "./designApiBase";
import { postDesignAuthWorkspace } from "./designAuthClient";
import { dispatchTeamverWorkspaceChanged } from "./teamverWorkspaceEvents";
import { bumpTeamverWorkspaceStoreRevision } from "./teamverWorkspaceStoreRevision";

function isUnauthorizedWorkspaceError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as Record<string, unknown>;
  const status = Number(record.status);
  if (status === 401 || status === 403) return true;
  const code = typeof record.code === "string" ? record.code : "";
  const detail = typeof record.detail === "string" ? record.detail : "";
  if (code === "session_expired" || detail === "session_expired") return true;
  if (code === "token_expired" || detail === "token_expired") return true;
  return false;
}

/**
 * Server-side workspace switch with cookie-recovery ladder.
 *
 * Returns `true` only after the BFF accepted the switch (or bootstrap mode is
 * off). On any BFF failure — auth ladder exhausted **or** non-auth errors —
 * returns `false` without advancing local store so `X-Workspace-Id` cannot
 * drift ahead of the cookie (§13 / §14).
 */
async function postDesignAuthWorkspaceWithRecovery(workspaceId: string): Promise<void> {
  try {
    await postDesignAuthWorkspace(workspaceId);
    return;
  } catch (err) {
    if (!isUnauthorizedWorkspaceError(err)) throw err;
  }
  if (await refreshDesignAuthCookie()) {
    try {
      await postDesignAuthWorkspace(workspaceId);
      return;
    } catch (postRefreshErr) {
      if (!isUnauthorizedWorkspaceError(postRefreshErr)) throw postRefreshErr;
    }
  }
  if (await ensureDesignBffSessionAuthenticated()) {
    await postDesignAuthWorkspace(workspaceId);
    return;
  }
  const err = new Error("workspace_switch_bff_unauthorized") as Error & { status?: number };
  err.status = 401;
  throw err;
}

/**
 * @returns `true` when local store (and callers' UI) may advance to `workspaceId`.
 */
export async function setActiveTeamverWorkspace(
  workspaceId: string,
  userId?: string | null,
): Promise<boolean> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return false;

  if (isBootstrapAuthMode()) {
    try {
      await postDesignAuthWorkspaceWithRecovery(trimmed);
    } catch {
      // Auth ladder failure or non-auth BFF error — keep prior local workspace.
      return false;
    }
  }

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return true;

  await store.set(trimmed);
  bumpTeamverWorkspaceStoreRevision();
  if (userId?.trim() && typeof store.setLastForUser === "function") {
    store.setLastForUser(userId.trim(), trimmed);
  }
  dispatchTeamverWorkspaceChanged(trimmed);
  return true;
}
