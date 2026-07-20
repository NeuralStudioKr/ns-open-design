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
 * Historic behaviour was raw fetch + swallow-all-errors, which let the local
 * `workspaceStore` drift ahead of the BFF cookie when a transient 401 hit —
 * subsequent Drive / registry calls then sent an inconsistent
 * `X-Workspace-Id`. Recover once via refresh, then ensure `/auth/session`
 * (which can Set-Cookie a fresh access), and retry the POST before falling
 * back to local-only update.
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
  await postDesignAuthWorkspace(workspaceId);
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
    } catch {
      // Even after refresh + ensure the server refused. Keep local store in
      // sync with the user's intent — the next full-page boot or explicit
      // retry will reconcile server-side; we do not want an empty active
      // workspace UI while the user is actively switching.
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
