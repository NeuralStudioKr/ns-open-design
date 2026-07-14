import type { Project } from "../types";
import type { Route } from "../router";
import { isTeamverEmbedMode } from "./designApiBase";

export type EmbedProjectDetailRoute = Extract<Route, { kind: "project" }>;

/** Embed project workspace — skip daemon list + registry membership sync. */
export function shouldDeferEmbedProjectListRefresh(route: Route): boolean {
  return readEmbedProjectDetailRoute(route) != null;
}

export function readEmbedProjectDetailRoute(route: Route): EmbedProjectDetailRoute | null {
  if (!isTeamverEmbedMode() || route.kind !== "project") return null;
  return route;
}

export function mergeProjectIntoList(projects: Project[], project: Project): Project[] {
  const existingIndex = projects.findIndex((row) => row.id === project.id);
  if (existingIndex < 0) {
    return [...projects, project];
  }
  return projects.map((row) => (row.id === project.id ? project : row));
}

/**
 * Upsert a recent-projects slice into the full in-memory list without dropping
 * rows that are outside the recent window (projects-tab pagination, detail
 * prefetch). Home `/api/projects/recent` refresh must not wipe the registry.
 */
export function mergeRecentProjectsIntoList(
  current: Project[],
  recent: Project[],
): Project[] {
  if (recent.length === 0) return current;
  if (current.length === 0) {
    return [...recent].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const byId = new Map(current.map((project) => [project.id, project]));
  for (const project of recent) {
    byId.set(project.id, project);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
