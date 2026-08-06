import { HOME_COVER_FETCH_CONCURRENCY, HOME_RECENT_LIST_LIMIT } from "./projectListLimits";
import type { Project } from "../types";
import {
  prefetchProjectCoverHintsForProjects,
  projectNeedsCoverFileFetch,
  resolveProjectCoverFiles,
  resolveProjectCoverOptionsForHomeSurface,
} from "./projectCoverLoader";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { buildProjectCardCover } from "./projectCardCover";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";
import { isTeamverEmbedMode } from "./designApiBase";
import { warmTeamverProjectPreviewPrefixes } from "./teamverProjectPreviewScope";
import { warmTeamverHtmlCoverCache } from "./warmTeamverHtmlCoverCache";

/**
 * Home recent rail covers.
 * Cover-hints first, then `/files` within HOME_RECENT_LIST_LIMIT when hints miss.
 * DesignsTab warm prefetch stays hints-only; visible cards use useLazyProjectCover
 * with `/files` fallback.
 *
 * Embed: after cover paths resolve, batch-warm preview-url prefixes (0806-N06)
 * then first-slide HTML into htmlCoverCache (0806-N07) so cards skip /raw.
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
  const entries = await resolveProjectCoverFiles(recent, {
    concurrency: HOME_COVER_FETCH_CONCURRENCY,
    allowFilesFallback: homeOpts.allowFilesFallback !== false,
  });

  if (isTeamverEmbedMode() && !skipNetwork) {
    const htmlItems = recent.flatMap((project) => {
      const cover = buildProjectCardCover(project, entries[project.id] ?? null);
      if (cover.kind !== "html" || !cover.filePath) return [];
      return [{
        projectId: project.id,
        file: cover.filePath,
        mode: (project.metadata?.kind === "deck" ? "deck" : "page") as "deck" | "page",
      }];
    });
    if (htmlItems.length > 0) {
      await warmTeamverProjectPreviewPrefixes(
        htmlItems.map(({ projectId, file }) => ({ projectId, file })),
      );
      await warmTeamverHtmlCoverCache(htmlItems);
    }
  }

  return entries;
}
