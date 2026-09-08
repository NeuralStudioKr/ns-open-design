import type { LocalStorageWorkspaceStore } from "@teamver/app-sdk";
import {
  getDesignBffClient,
  ensureDesignAuthLadder,
  isDesignAuthRefreshDeclined,
  shouldSkipTeamverBffAuthCalls,
} from "./designBffClient";
import { isBootstrapAuthMode } from "./designApiBase";
import { postDesignAuthWorkspace } from "./designAuthClient";
import { dispatchTeamverWorkspaceChanged } from "./teamverWorkspaceEvents";
import { bumpTeamverWorkspaceStoreRevision } from "./teamverWorkspaceStoreRevision";

const AUTH_WORKSPACE_ERROR_CODES = new Set([
  "unauthorized",
  "token_expired",
  "session_expired",
  "session_revoked",
]);

function readErrorCode(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUnauthorizedWorkspaceError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as Record<string, unknown>;
  const status = Number(record.status);
  if (status === 401 || status === 403) return true;

  const code = readErrorCode(record.code);
  const detail = readErrorCode(record.detail);
  if (AUTH_WORKSPACE_ERROR_CODES.has(code) || AUTH_WORKSPACE_ERROR_CODES.has(detail)) {
    return true;
  }

  // BFF envelope: { error: { code, message, login_url } }
  // (and legacy mangled form where message embeds token_expired text).
  const nested =
    record.error && typeof record.error === "object"
      ? (record.error as Record<string, unknown>)
      : null;
  if (nested) {
    const nestedCode = readErrorCode(nested.code);
    if (AUTH_WORKSPACE_ERROR_CODES.has(nestedCode)) return true;
    const nestedMessage = readErrorCode(nested.message);
    if (
      nestedMessage.includes("token_expired") ||
      nestedMessage.includes("session_expired") ||
      nestedMessage.includes("session_revoked")
    ) {
      return true;
    }
  }
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
  if (await ensureDesignAuthLadder("workspace")) {
    try {
      await postDesignAuthWorkspace(workspaceId);
      return;
    } catch (postRefreshErr) {
      if (!isUnauthorizedWorkspaceError(postRefreshErr)) throw postRefreshErr;
    }
  }
  if (await ensureDesignAuthLadder("workspace", { mode: "ensure" })) {
    await postDesignAuthWorkspace(workspaceId);
    return;
  }
  const err = new Error("workspace_switch_bff_unauthorized") as Error & { status?: number };
  err.status = 401;
  throw err;
}

export type SetActiveTeamverWorkspaceOptions = {
  /**
   * Boot realign (0908-N01 slice E) re-asserts the workspace the store already
   * holds so the BFF cookie agrees with `X-Workspace-Id`. Announcing that as a
   * change would make every refresh replay the full switch side effects — list
   * wipe, registry resync, home bounce — for a workspace that never moved.
   */
  skipEventWhenUnchanged?: boolean;
};

/**
 * @returns `true` when local store (and callers' UI) may advance to `workspaceId`.
 */
export async function setActiveTeamverWorkspace(
  workspaceId: string,
  userId?: string | null,
  options?: SetActiveTeamverWorkspaceOptions,
): Promise<boolean> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return false;

  // Hard sticky / logged-out: shouldSkip…. Soft sticky must also skip — otherwise
  // workspace switch re-enters refresh + ensure while C1 owns recovery.
  if (shouldSkipTeamverBffAuthCalls() || isDesignAuthRefreshDeclined()) return false;

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

  const previous =
    options?.skipEventWhenUnchanged && typeof store.get === "function"
      ? (await store.get())?.trim() || null
      : null;

  await store.set(trimmed);
  bumpTeamverWorkspaceStoreRevision();
  if (userId?.trim() && typeof store.setLastForUser === "function") {
    store.setLastForUser(userId.trim(), trimmed);
  }
  if (!(options?.skipEventWhenUnchanged && previous === trimmed)) {
    dispatchTeamverWorkspaceChanged(trimmed);
  }
  return true;
}
