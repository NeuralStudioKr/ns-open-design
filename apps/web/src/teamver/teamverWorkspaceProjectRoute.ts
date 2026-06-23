import type { Route } from "../router";
import type { Project } from "../types";

/** After workspace switch, leave a deep-linked project that no longer exists in the list. */
export function shouldNavigateHomeAfterWorkspaceProjectList(
  route: Route,
  projects: readonly Pick<Project, "id">[],
): boolean {
  if (route.kind !== "project") return false;
  const projectId = route.projectId.trim();
  if (!projectId) return false;
  return !projects.some((project) => project.id === projectId);
}
