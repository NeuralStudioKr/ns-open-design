import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import { prefetchDesignsTabViewport } from "./prefetchDesignsTabViewport";
import { prefetchHomeProjectCovers } from "./prefetchHomeProjectCovers";

/** After embed project-list reload — warm DesignsTab viewport + home recent covers. */
export function warmEmbedProjectListCaches(projects: Project[]): void {
  if (!isTeamverEmbedMode() || projects.length === 0) return;
  void prefetchDesignsTabViewport(projects);
  void prefetchHomeProjectCovers(projects);
}
