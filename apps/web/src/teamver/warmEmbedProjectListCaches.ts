import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import { prefetchHomeProjectCovers } from "./prefetchHomeProjectCovers";
import { warmTeamverProjectPreviewPrefixes } from "./teamverProjectPreviewScope";

/**
 * After embed project-list reload — warm home recent-rail covers and deck
 * preview-url prefixes so deep-link / create→navigate FileViewer can peek
 * a cached base on first paint (srcDoc hold window shrinks).
 */
export function warmEmbedProjectListCaches(projects: Project[]): void {
  if (!isTeamverEmbedMode() || projects.length === 0) return;
  void prefetchHomeProjectCovers(projects);
  // Do not wait for cover path resolve — deck.html is the deep-link default.
  void warmTeamverProjectPreviewPrefixes(
    projects.map((project) => ({ projectId: project.id, file: "deck.html" })),
  );
}
