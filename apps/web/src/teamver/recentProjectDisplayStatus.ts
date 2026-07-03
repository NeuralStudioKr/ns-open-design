import type { PetTaskSummary } from "../components/pet/PetOverlay";
import type { ProjectDisplayStatus } from "../types";

/** Prefer live `/api/runs` active status over stale project-list registry status. */
export function buildActiveRunStatusByProjectId(
  summaries: readonly PetTaskSummary[],
): Map<string, PetTaskSummary["status"]> {
  const byProject = new Map<string, PetTaskSummary["status"]>();
  for (const summary of summaries) {
    const prev = byProject.get(summary.projectId);
    if (prev === "running") continue;
    byProject.set(summary.projectId, summary.status);
  }
  return byProject;
}

export function resolveRecentProjectDisplayStatus(
  projectId: string,
  registryStatus: ProjectDisplayStatus | undefined,
  activeRunStatusByProjectId: ReadonlyMap<string, PetTaskSummary["status"]>,
): ProjectDisplayStatus {
  const active = activeRunStatusByProjectId.get(projectId);
  if (active === "running" || active === "queued") {
    return active;
  }
  return registryStatus ?? "not_started";
}
