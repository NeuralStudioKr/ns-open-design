import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import { prefetchLatestPublishSummaries } from "./latestPublishSummary";
import {
  projectNeedsCoverFileFetch,
  seedProjectCoverHints,
} from "./projectCoverLoader";
import { fetchProjectCoverHints, projectCoverFileFromHint } from "./projectCoverHints";
import { PROJECT_LIST_VIEWPORT_BATCH } from "./projectListLimits";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";

/** DesignsTab grid — first viewport: one cover-hints batch + publish chip batch. */
export async function prefetchDesignsTabViewport(projects: Project[]): Promise<void> {
  if (!isTeamverEmbedMode() || projects.length === 0) return;
  if (!isTeamverEmbedDesignSurfaceEnabled()) return;

  const batch = projects.slice(0, PROJECT_LIST_VIEWPORT_BATCH);
  const ids = batch.map((project) => project.id);

  void prefetchLatestPublishSummaries(ids);

  const needsHint = batch.filter((project) => projectNeedsCoverFileFetch(project));
  if (needsHint.length === 0) return;

  const hints = await fetchProjectCoverHints(needsHint.map((project) => project.id));
  const positive: Record<string, ProjectCoverFile | null> = {};
  for (const project of needsHint) {
    const hint = hints[project.id];
    const cover = hint ? projectCoverFileFromHint(hint) : null;
    if (cover) positive[project.id] = cover;
  }
  if (Object.keys(positive).length > 0) {
    seedProjectCoverHints(positive);
  }
}
