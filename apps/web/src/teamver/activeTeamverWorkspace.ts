import type { LocalStorageWorkspaceStore } from "@teamver/app-sdk";
import {
  fetchDesignAuthSession,
  getDesignBffClient,
  isDesignAuthRefreshDeclined,
  shouldSkipTeamverBffAuthCalls,
} from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { resolveActiveWorkspaceIdForRead } from "./activeWorkspaceReadPolicy";
import { readTeamverWorkspaceStoreRevisionMs } from "./teamverWorkspaceStoreRevision";
import { normalizeWorkspaceList } from "./workspaceUtils";

/**
 * Active workspace for embed BFF/Drive/usage calls.
 *
 * Trust the embed-local store whenever it still exists on the session list.
 * Do not reconcile to `session.defaultWorkspaceId` on routine reads — that
 * account default often differs from the workspace the user is actively
 * working in. Hard refresh used to re-fetch `/auth/session` (new `fetchedAt`)
 * and snap back to the account default, wiping the user's explicit pick.
 *
 * This is a read: it never writes the store (0908-N01 slice G). When the stored
 * workspace is missing from the session it answers with a workspace that does
 * exist, so the request stays valid, but persisting that answer belongs to
 * `syncTeamverWorkspaceFromSession` through boot, session refresh, and explicit
 * recovery — paths that run once and announce the move (P2).
 *
 * Explicit workspace picks and parent-app switches go through
 * `setActiveTeamverWorkspace` / `syncTeamverWorkspaceFromSession` dispatch paths
 * (URL `workspace_id` / preferredIdOverride on boot).
 */
async function readActiveWorkspaceIdOnce(): Promise<string | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  const store = client.workspaceStore as LocalStorageWorkspaceStore | null | undefined;
  const storeId = (await store?.get())?.trim() || null;

  // Soft/hard sticky: C1 owns recovery. Routine workspace resolve must not
  // re-hit `/auth/session` (ensure) and reset sticky cooldowns.
  if (shouldSkipTeamverBffAuthCalls() || isDesignAuthRefreshDeclined()) return storeId;

  let session;
  try {
    session = await fetchDesignAuthSession();
  } catch {
    // Session probe can fail while nginx auth_request still accepts the
    // Main BE cookie. Keep routing daemon calls with the persisted workspace
    // so preview/file reads do not lose X-Workspace-Id mid-run.
    return storeId;
  }
  // Session JSON can briefly read unauthenticated during idle refresh while the
  // persisted workspace and BFF cookies are still valid — same rationale as catch.
  if (!session?.authenticated) return storeId;

  const userId = session.user?.userId?.trim() || null;
  const durablePreferenceId =
    userId && typeof store?.getLastForUser === "function"
      ? store.getLastForUser(userId)?.trim() || null
      : null;

  return resolveActiveWorkspaceIdForRead({
    storedId: storeId,
    workspaces: normalizeWorkspaceList(session.workspaces),
    defaultWorkspaceId: session.defaultWorkspaceId ?? null,
    durablePreferenceId,
  });
}

let inflight: Promise<string | null> | null = null;
let inflightRevisionMs = -1;
let flightSeq = 0;

/**
 * Returning from a project detail to the root fires this 4-10 times at once
 * (inflight key, registry list, tombstone filter, daemon enrich headers, plus
 * the `HomeView` mount). Each call independently probed the session and made
 * its own judgement, so the burst multiplied the chance that one flaky response
 * decided for all of them. Joining a burst leaves one judgement per burst.
 *
 * The flight is keyed on the store revision, which only
 * `setActiveTeamverWorkspace` bumps. Without that key a caller that runs just
 * after an explicit switch would join a flight started before it and get the
 * previous workspace back.
 */
export async function resolveActiveTeamverWorkspaceId(): Promise<string | null> {
  const revisionMs = readTeamverWorkspaceStoreRevisionMs();
  if (inflight && inflightRevisionMs === revisionMs) return inflight;

  const seq = ++flightSeq;
  const flight = (async () => {
    try {
      return await readActiveWorkspaceIdOnce();
    } finally {
      // Only the newest flight clears the slot; a settled older flight must not
      // evict the one that replaced it after an explicit switch.
      if (flightSeq === seq) {
        inflight = null;
        inflightRevisionMs = -1;
      }
    }
  })();
  inflight = flight;
  inflightRevisionMs = revisionMs;
  return flight;
}

/** @internal test — drop a joined flight between cases. */
export function resetActiveTeamverWorkspaceFlightForTests(): void {
  inflight = null;
  inflightRevisionMs = -1;
}

export async function resolveActiveTeamverWorkspaceIdForEmbed(): Promise<string | null> {
  if (!isTeamverEmbedMode()) return null;
  return resolveActiveTeamverWorkspaceId();
}

export async function requireActiveTeamverWorkspaceId(): Promise<string> {
  const workspaceId = await resolveActiveTeamverWorkspaceId();
  if (!workspaceId) throw new Error("teamver_workspace_required");
  return workspaceId;
}

/** Alias for embed call sites — session-reconciled active workspace. */
export async function readActiveTeamverWorkspaceId(): Promise<string | null> {
  return resolveActiveTeamverWorkspaceIdForEmbed();
}
