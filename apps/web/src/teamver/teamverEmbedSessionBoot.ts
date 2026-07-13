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
import { completeTeamverEmbedBoot } from "./teamverEmbedBoot";
import { syncTeamverWorkspaceFromSession } from "./syncTeamverWorkspace";
import {
  ensureTeamverProjectRegisteredById,
  syncAllDaemonProjectsToRegistry,
} from "./projectRegistry";
import { getProject } from "../state/projects";
import { fetchTeamverRuntimeConfig } from "./designBffClient";

export type TeamverEmbedSessionBootDeps = {
  isCancelled: () => boolean;
  readDetailRoute: () => EmbedProjectDetailRoute | null;
  onProjectPrefetched: (project: Project) => void;
  sessionOptions?: FetchDesignAuthSessionOptions;
};

/**
 * BFF session + workspace seed for embed boot. Runs independently of daemon
 * `/api/health` so auth-return deep links do not hang on EmbedBootstrapGate
 * when the health probe fails transiently.
 *
 * Critical path (blocks the loading splash): session probe + workspace seed.
 * Registry sync, deep-link prefetch, and runtime-config continue after
 * `completeTeamverEmbedBoot()` so the gate unlocks as soon as auth is known.
 */
export async function runTeamverEmbedSessionBoot(
  deps: TeamverEmbedSessionBootDeps,
): Promise<Awaited<ReturnType<typeof fetchTeamverRuntimeConfig>> | null> {
  const bootSessionOptions = deps.sessionOptions ?? resolveEmbedBootSessionOptions();
  try {
    const session = await fetchDesignAuthSession(bootSessionOptions);
    let activeWorkspaceId: string | null = null;
    const detailRoute = deps.readDetailRoute();

    if (session?.authenticated) {
      setTeamverEmbedSessionAuthenticated(true);
      activeWorkspaceId = await syncTeamverWorkspaceFromSession(session);
    } else {
      await clearTeamverEmbedSessionState();
      redirectToDesignLoginIfBffMissing();
    }

    seedEmbedBootstrapSession({
      session: session ?? { authenticated: false },
      activeWorkspaceId,
    });

    // Unlock EmbedBootstrapGate before heavier follow-up work.
    if (!deps.isCancelled()) {
      completeTeamverEmbedBoot();
    }

    if (session?.authenticated) {
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
    }

    try {
      return await fetchTeamverRuntimeConfig();
    } catch (err) {
      console.warn("[teamver] embed boot runtime-config failed", err);
      return null;
    }
  } catch (err) {
    console.warn("[teamver] embed boot session probe failed", err);
    seedEmbedBootstrapSession({
      session: { authenticated: false },
      activeWorkspaceId: null,
    });
    if (!deps.isCancelled()) {
      completeTeamverEmbedBoot();
    }
    return null;
  }
}
