import type { Project } from "../types";
import {
  fetchDesignAuthSession,
  type FetchDesignAuthSessionOptions,
} from "./designBffClient";
import { seedEmbedBootstrapSession } from "./embedBootstrapSession";
import type { EmbedProjectDetailRoute } from "./embedProjectListRefresh";
import { warmEmbedProjectListCaches } from "./warmEmbedProjectListCaches";
import {
  redirectToDesignLoginIfBffMissing,
  resolveEmbedBootSessionOptions,
} from "./teamverEmbedAuthFlow";
import {
  clearTeamverEmbedSessionState,
  setTeamverEmbedSessionAuthenticated,
} from "./teamverEmbedSession";
import {
  completeTeamverEmbedBoot,
  isTeamverEmbedBootComplete,
} from "./teamverEmbedBoot";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
import {
  ensureTeamverProjectRegisteredById,
  syncAllDaemonProjectsToRegistry,
} from "./projectRegistry";
import { getProject } from "../state/projects";
import { fetchTeamverRuntimeConfig } from "./designBffClient";
import {
  clearEmbedAuthSnapshot,
  persistEmbedAuthSnapshot,
} from "./embedAuthSnapshot";

export type TeamverEmbedSessionBootDeps = {
  isCancelled: () => boolean;
  readDetailRoute: () => EmbedProjectDetailRoute | null;
  onProjectPrefetched: (project: Project) => void;
  sessionOptions?: FetchDesignAuthSessionOptions;
};

function unlockBootIfNeeded(isCancelled: () => boolean): void {
  if (!isCancelled() && !isTeamverEmbedBootComplete()) {
    completeTeamverEmbedBoot();
  }
}

/**
 * BFF session + workspace seed for embed boot.
 *
 * Critical path: unlock the loading splash after the live session probe +
 * workspace seed. Speed comes from `prefetchEmbedAuthSessionOnBoot` in
 * client-app (coalesced in-flight / 60s memory cache) — not from painting
 * authenticated chrome off a sessionStorage snapshot, which can flash the
 * workspace and then hard-redirect to login when the probe disagrees.
 *
 * Snapshot persist still records the last good session so logout/clear paths
 * can drop stale hints and future soft-UI can opt in safely.
 */
export async function runTeamverEmbedSessionBoot(
  deps: TeamverEmbedSessionBootDeps,
): Promise<Awaited<ReturnType<typeof fetchTeamverRuntimeConfig>> | null> {
  // `resolveEmbedBootSessionOptions` consumes auth-return pending once —
  // do not call shouldForceEmbedAuthRecoveryOnLoad again here.
  const bootSessionOptions = deps.sessionOptions ?? resolveEmbedBootSessionOptions();

  try {
    const session = await fetchDesignAuthSession(bootSessionOptions);
    let activeWorkspaceId: string | null = null;
    const detailRoute = deps.readDetailRoute();

    if (session?.authenticated) {
      setTeamverEmbedSessionAuthenticated(true);
      activeWorkspaceId = await syncTeamverWorkspaceFromSession(session);
      seedEmbedBootstrapSession({
        session,
        activeWorkspaceId,
      });
      persistEmbedAuthSnapshot({ session, activeWorkspaceId });
      unlockBootIfNeeded(deps.isCancelled);

      void syncAllDaemonProjectsToRegistry().catch((err) => {
        console.warn("[teamver] embed boot registry sync failed", err);
      });
      if (detailRoute) {
        void (async () => {
          try {
            await ensureTeamverProjectRegisteredById(detailRoute.projectId);
            const project = await getProject(detailRoute.projectId);
            if (!project || deps.isCancelled()) return;
            deps.onProjectPrefetched(project);
            warmEmbedProjectListCaches([project]);
          } catch (err) {
            console.warn("[teamver] embed boot project prefetch failed", err);
          }
        })();
      }
    } else {
      clearEmbedAuthSnapshot();
      await clearTeamverEmbedSessionState();
      seedEmbedBootstrapSession({
        session: session ?? { authenticated: false },
        activeWorkspaceId: null,
      });
      unlockBootIfNeeded(deps.isCancelled);
      redirectToDesignLoginIfBffMissing();
    }

    try {
      return await fetchTeamverRuntimeConfig();
    } catch (err) {
      console.warn("[teamver] embed boot runtime-config failed", err);
      return null;
    }
  } catch (err) {
    console.warn("[teamver] embed boot session probe failed", err);
    // Transient probe failure: unlock the gate without claiming a session.
    // Stale authenticated memory cache in designBffClient may still serve
    // follow-up probes (STALE_SESSION_GRACE_MS).
    if (!isTeamverEmbedBootComplete()) {
      seedEmbedBootstrapSession({
        session: { authenticated: false },
        activeWorkspaceId: null,
      });
      unlockBootIfNeeded(deps.isCancelled);
    }
    return null;
  }
}
