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
 * If both refresh and ensure decline, do **not** advance the local store —
 * keeping the previous active workspace avoids X-Workspace-Id drift (§13).
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

export async function setActiveTeamverWorkspace(
  workspaceId: string,
  userId?: string | null,
): Promise<void> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return;

  if (isBootstrapAuthMode()) {
    try {
      await postDesignAuthWorkspaceWithRecovery(trimmed);
    } catch (err) {
      if (
        isUnauthorizedWorkspaceError(err)
        || (err instanceof Error && err.message === "workspace_switch_bff_unauthorized")
      ) {
        return;
      }
    }
  }

  const client = getDesignBffClient();
  const store = client?.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  if (!store) return;

  await store.set(trimmed);
  bumpTeamverWorkspaceStoreRevision();
  if (userId?.trim() && typeof store.setLastForUser === "function") {
    store.setLastForUser(userId.trim(), trimmed);
  }
  dispatchTeamverWorkspaceChanged(trimmed);
}
