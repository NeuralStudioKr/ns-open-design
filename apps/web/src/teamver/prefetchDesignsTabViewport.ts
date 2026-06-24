import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import { prefetchLatestPublishSummaries } from "./latestPublishSummary";
import { prefetchProjectCoverHintsForProjects } from "./projectCoverLoader";
import { PROJECT_LIST_VIEWPORT_BATCH } from "./projectListLimits";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";

/** DesignsTab grid — first viewport: one cover-hints batch + publish chip batch. */
export async function prefetchDesignsTabViewport(projects: Project[]): Promise<void> {
  if (!isTeamverEmbedMode() || projects.length === 0) return;
  if (!isTeamverEmbedDesignSurfaceEnabled()) return;

  const batch = projects.slice(0, PROJECT_LIST_VIEWPORT_BATCH);

  void prefetchLatestPublishSummaries(batch.map((project) => project.id));
  await prefetchProjectCoverHintsForProjects(batch);
}
