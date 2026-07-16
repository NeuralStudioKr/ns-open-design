import { HOME_COVER_FETCH_CONCURRENCY, HOME_RECENT_LIST_LIMIT } from "./projectListLimits";
import type { Project } from "../types";
import {
  prefetchProjectCoverHintsForProjects,
  projectNeedsCoverFileFetch,
  resolveProjectCoverFiles,
  resolveProjectCoverOptionsForHomeSurface,
} from "./projectCoverLoader";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";
import { isTeamverEmbedMode } from "./designApiBase";

/**
 * Home recent rail covers.
 * Cover-hints first; when hints miss (registry row not in daemon sqlite), a bounded
 * `/files` fallback is allowed because HOME_RECENT_LIST_LIMIT caps fan-out.
 * DesignsTab keeps hints-only policy via resolveProjectCoverOptionsForListSurface.
 */
export async function prefetchHomeProjectCovers(
  projects: Project[],
): Promise<Record<string, ProjectCoverFile | null>> {
  const recent = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, HOME_RECENT_LIST_LIMIT);

  const skipNetwork =
    isTeamverEmbedMode() && !isTeamverEmbedDesignSurfaceEnabled();

  if (!skipNetwork) {
    await prefetchProjectCoverHintsForProjects(
      recent.filter((project) => projectNeedsCoverFileFetch(project)),
    );
  }

  const homeOpts = resolveProjectCoverOptionsForHomeSurface();
  return resolveProjectCoverFiles(recent, {
    concurrency: HOME_COVER_FETCH_CONCURRENCY,
    allowFilesFallback: homeOpts.allowFilesFallback ?? true,
  });
}
