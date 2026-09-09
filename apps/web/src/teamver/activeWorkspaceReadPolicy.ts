import type { WorkspaceListItem } from "@teamver/app-sdk";
import { pickDefaultWorkspaceId, readWorkspaceId } from "./workspaceUtils";

/**
 * Which workspace a *read* should route this request to (0908-N01 slice G).
 *
 * `resolveActiveTeamverWorkspaceId` used to answer this by calling
 * `syncTeamverWorkspaceFromSession` with reconcile enabled, which persisted the
 * answer. A single back-navigation calls that read 4-10 times concurrently, so
 * one session response that came back without the stored workspace was enough
 * to move the user's pick — and the write also promoted the fallback to the
 * per-user "last used" record, leaving nothing to return to.
 *
 * This decision writes nothing. Requests still get a workspace that exists on
 * the session, so `X-Workspace-Id` cannot pin itself to a dead workspace; the
 * store is only repaired by boot, session refresh, and explicit recovery, which
 * run once per document/focus and announce the move through P2.
 */
export function resolveActiveWorkspaceIdForRead(input: {
  storedId: string | null | undefined;
  workspaces: WorkspaceListItem[];
  defaultWorkspaceId?: string | null;
  /** Per-user last pick — preferred over the account default as a fallback. */
  durablePreferenceId?: string | null;
}): string | null {
  const stored = input.storedId?.trim() || null;

  // An empty list is not evidence of revocation. A session payload that omits
  // or truncates `workspaces` must never look like "your workspace is gone".
  if (input.workspaces.length === 0) return stored;

  if (stored && input.workspaces.some((workspace) => readWorkspaceId(workspace) === stored)) {
    return stored;
  }

  const fallback = pickDefaultWorkspaceId(input.workspaces, {
    preferredId: input.durablePreferenceId ?? null,
    defaultWorkspaceId: input.defaultWorkspaceId ?? null,
  });
  return fallback ?? stored;
}
