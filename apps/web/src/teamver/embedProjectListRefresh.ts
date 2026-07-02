import type { Project } from "../types";
import type { Route } from "../router";
import { isTeamverEmbedMode } from "./designApiBase";

/** Embed project workspace — skip daemon list + registry membership sync. */
export function shouldDeferEmbedProjectListRefresh(route: Route): boolean {
  return isTeamverEmbedMode() && route.kind === "project";
}

export function mergeProjectIntoList(projects: Project[], project: Project): Project[] {
  const existingIndex = projects.findIndex((row) => row.id === project.id);
  if (existingIndex < 0) {
    return [...projects, project];
  }
  return projects.map((row) => (row.id === project.id ? project : row));
}
