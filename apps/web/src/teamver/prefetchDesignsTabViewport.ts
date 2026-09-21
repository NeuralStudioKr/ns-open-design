import type { Project } from "../types";
import { buildProjectCardCover } from "./projectCardCover";
import { isTeamverEmbedMode } from "./designApiBase";
import { prefetchLatestPublishSummaries } from "./latestPublishSummary";
import {
  prefetchProjectCoverHintsForProjects,
  resolveProjectCoverFiles,
} from "./projectCoverLoader";
import { PROJECT_LIST_VIEWPORT_BATCH } from "./projectListLimits";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";
import { warmTeamverProjectPreviewPrefixes } from "./teamverProjectPreviewScope";
import { warmTeamverHtmlCoverCache } from "./warmTeamverHtmlCoverCache";

/**
 * DesignsTab `/projects` grid — first viewport:
 * cover-hints + publish chips, then HTML cover preview-url/html batch warm
 * (0914-N01 — same helpers as home N06/N07). Hints-only cover resolve so we
 * do not fan out `/files` from warm; visible cards still lazy-fallback.
 */
export async function prefetchDesignsTabViewport(projects: Project[]): Promise<void> {
  if (!isTeamverEmbedMode() || projects.length === 0) return;
  if (!isTeamverEmbedDesignSurfaceEnabled()) return;

  const batch = projects.slice(0, PROJECT_LIST_VIEWPORT_BATCH);

  void prefetchLatestPublishSummaries(batch.map((project) => project.id));
  await prefetchProjectCoverHintsForProjects(batch);

  try {
    const entries = await resolveProjectCoverFiles(batch, {
      allowFilesFallback: false,
    });
    const htmlItems = batch.flatMap((project) => {
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
  } catch {
    // Soft-fail — cards fall back to per-card preview-url /raw.
  }
}
