import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import { prefetchDesignsTabViewport } from "./prefetchDesignsTabViewport";

/** After embed project-list reload — warm DesignsTab viewport (cover-hints + publish). */
export function warmEmbedProjectListCaches(projects: Project[]): void {
  if (!isTeamverEmbedMode() || projects.length === 0) return;
  void prefetchDesignsTabViewport(projects);
}
