import type { PetTaskSummary } from "../components/pet/PetOverlay";
import type { Project, ProjectDisplayStatus } from "../types";
import type { ProjectCoverFile } from "./projectPreviewFile";

type ResolveRecentProjectDisplayStatusOptions = {
  hasArtifactSignal?: boolean;
};

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
  options: ResolveRecentProjectDisplayStatusOptions = {},
): ProjectDisplayStatus {
  const active = activeRunStatusByProjectId.get(projectId);
  if (active === "running" || active === "queued") {
    return active;
  }
  if (
    options.hasArtifactSignal === true
    && (registryStatus === undefined || registryStatus === "not_started")
  ) {
    return "succeeded";
  }
  return registryStatus ?? "not_started";
}

export function hasProjectArtifactSignal(
  project: Pick<Project, "metadata">,
  cover?: ProjectCoverFile | null,
): boolean {
  return Boolean(project.metadata?.entryFile || cover);
}
