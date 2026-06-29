import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import { prefetchHomeProjectCovers } from "./prefetchHomeProjectCovers";

/** After embed project-list reload — warm home recent-rail covers only (not DesignsTab). */
export function warmEmbedProjectListCaches(projects: Project[]): void {
  if (!isTeamverEmbedMode() || projects.length === 0) return;
  void prefetchHomeProjectCovers(projects);
}
