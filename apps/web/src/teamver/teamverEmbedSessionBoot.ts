import type { Project } from "../types";
import {
  fetchDesignAuthSession,
  type FetchDesignAuthSessionOptions,
  fetchTeamverRuntimeConfig,
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
import {
  clearEmbedAuthSnapshot,
  persistEmbedAuthSnapshot,
} from "./embedAuthSnapshot";
import { consumeTeamverAuthReturnPending } from "./teamverAuthReturn";
import { shouldDeferEmbedLoginRedirect } from "./teamverEmbedAuthNavigation";

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
 * Auth-return pending is peeked for force recovery and only consumed after a
 * successful authenticated probe so an early false negative cannot disable
 * login-redirect defer and bounce the user back to Main sign-in.
 */
export async function runTeamverEmbedSessionBoot(
  deps: TeamverEmbedSessionBootDeps,
): Promise<Awaited<ReturnType<typeof fetchTeamverRuntimeConfig>> | null> {
  // `resolveEmbedBootSessionOptions` peeks auth-return pending — do not
  // consume here; consume only after authenticated success below.
  const bootSessionOptions = deps.sessionOptions ?? resolveEmbedBootSessionOptions();

  try {
    const session = await fetchDesignAuthSession(bootSessionOptions);
    if (deps.isCancelled()) return null;

    let activeWorkspaceId: string | null = null;
    const detailRoute = deps.readDetailRoute();

    if (session?.authenticated) {
      setTeamverEmbedSessionAuthenticated(true);
      activeWorkspaceId = await syncTeamverWorkspaceFromSession(session);
      if (deps.isCancelled()) return null;

      seedEmbedBootstrapSession({
        session,
        activeWorkspaceId,
      });
      persistEmbedAuthSnapshot({ session, activeWorkspaceId });
      // Settlement complete — safe to drop the defer shield.
      consumeTeamverAuthReturnPending();
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
      // Keep prior UI session when auth-return is still settling — wiping here
      // plus an immediate login redirect is the post-signin bounce loop.
      if (!shouldDeferEmbedLoginRedirect()) {
        await clearTeamverEmbedSessionState();
      }
      if (deps.isCancelled()) return null;

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
    // follow-up probes (STALE_SESSION_GRACE_MS). Keep auth-return pending so
    // defer still blocks a second login hop.
    if (!deps.isCancelled() && !isTeamverEmbedBootComplete()) {
      seedEmbedBootstrapSession({
        session: { authenticated: false },
        activeWorkspaceId: null,
      });
      unlockBootIfNeeded(deps.isCancelled);
    }
    return null;
  }
}
