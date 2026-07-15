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

function isIdLikeProjectName(project: Pick<Project, "id" | "name">): boolean {
  const name = project.name?.trim();
  return !name || name === project.id;
}

export function preserveProjectDisplayName(existing: Project | undefined, incoming: Project): Project {
  if (!existing || isIdLikeProjectName(existing) || !isIdLikeProjectName(incoming)) {
    return incoming;
  }
  return { ...incoming, name: existing.name };
}

export function mergeProjectIntoList(projects: Project[], project: Project): Project[] {
  const existingIndex = projects.findIndex((row) => row.id === project.id);
  if (existingIndex < 0) {
    return [...projects, project];
  }
  return projects.map((row) => (
    row.id === project.id ? preserveProjectDisplayName(row, project) : row
  ));
}

export function preserveProjectListDisplayNames(
  current: Project[],
  incoming: Project[],
): Project[] {
  if (current.length === 0 || incoming.length === 0) return incoming;
  const currentById = new Map(current.map((project) => [project.id, project]));
  return incoming.map((project) => preserveProjectDisplayName(currentById.get(project.id), project));
}

/**
 * Upsert a recent-projects slice into the full in-memory list without dropping
 * rows that are outside the recent window (projects-tab pagination, detail
 * prefetch). Home `/api/projects/recent` refresh must not wipe the registry.
 *
 * `excludeIds` removes tombstoned (locally deleted) projects from both the
 * current list and the incoming recent slice so additive merge cannot revive them.
 */
export function mergeRecentProjectsIntoList(
  current: Project[],
  recent: Project[],
  options?: { excludeIds?: ReadonlySet<string> },
): Project[] {
  const excludeIds = options?.excludeIds;
  const base =
    excludeIds && excludeIds.size > 0
      ? current.filter((project) => !excludeIds.has(project.id))
      : current;
  const incoming =
    excludeIds && excludeIds.size > 0
      ? recent.filter((project) => !excludeIds.has(project.id))
      : recent;
  if (incoming.length === 0) return base;
  if (base.length === 0) {
    return [...incoming].sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const byId = new Map(base.map((project) => [project.id, project]));
  for (const project of incoming) {
    byId.set(project.id, preserveProjectDisplayName(byId.get(project.id), project));
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
