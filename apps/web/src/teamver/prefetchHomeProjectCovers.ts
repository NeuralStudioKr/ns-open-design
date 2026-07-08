import { HOME_COVER_FETCH_CONCURRENCY, HOME_RECENT_LIST_LIMIT } from "./projectListLimits";
import type { Project } from "../types";
import {
  resolveProjectCoverOptionsForListSurface,
  prefetchProjectCoverHintsForProjects,
  projectNeedsCoverFileFetch,
  resolveProjectCoverFiles,
} from "./projectCoverLoader";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";
import { isTeamverEmbedMode } from "./designApiBase";

/**
 * Home recent rail — use the recent list metadata plus one coalesced
 * cover-hints batch. In embed mode we intentionally skip per-project `/files`
 * fallback on root boot; otherwise the home page fans out one extra request per
 * recent card just to improve thumbnails. The full project list/detail surfaces
 * may still resolve file-backed covers when the user intentionally navigates
 * there.
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

  return resolveProjectCoverFiles(recent, {
    concurrency: HOME_COVER_FETCH_CONCURRENCY,
    ...resolveProjectCoverOptionsForListSurface(),
  });
}
