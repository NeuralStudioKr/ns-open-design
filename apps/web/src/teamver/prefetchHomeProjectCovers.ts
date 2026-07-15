import { HOME_COVER_FETCH_CONCURRENCY, HOME_RECENT_LIST_LIMIT } from "./projectListLimits";
import type { Project } from "../types";
import {
  prefetchProjectCoverHintsForProjects,
  projectNeedsCoverFileFetch,
  resolveProjectCoverFiles,
  resolveProjectCoverOptionsForListSurface,
} from "./projectCoverLoader";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";
import { isTeamverEmbedMode } from "./designApiBase";

/**
 * Home recent rail covers.
 * Embed design surface: cover-hints only (parity with DesignsTab — no /files fan-out).
 * Standalone: may still use bounded /files fallback when hints miss.
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

  const listOpts = resolveProjectCoverOptionsForListSurface();
  return resolveProjectCoverFiles(recent, {
    concurrency: HOME_COVER_FETCH_CONCURRENCY,
    allowFilesFallback: listOpts.allowFilesFallback ?? true,
  });
}
