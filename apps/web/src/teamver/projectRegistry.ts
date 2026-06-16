import type { Project } from "../types";
import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";

export type TeamverProjectRegistryPayload = {
  odProjectId: string;
  title?: string;
};

export type TeamverRegisteredProject = {
  odProjectId: string;
};

export function buildTeamverProjectRegistryPayload(
  project: Pick<Project, "id" | "name">,
): TeamverProjectRegistryPayload {
  const title = project.name?.trim();
  return {
    odProjectId: project.id,
    ...(title ? { title } : {}),
  };
}

export async function registerTeamverProjectIfNeeded(
  project: Pick<Project, "id" | "name">,
): Promise<void> {
  if (!isTeamverEmbedMode()) return;

  const client = getDesignBffClient();
  if (!client) return;

  try {
    const workspaceId = await client.workspaceStore?.get();
    if (!workspaceId?.trim()) return;

    await client.http.post(
      "/projects",
      buildTeamverProjectRegistryPayload(project),
      {
        workspaceId: workspaceId.trim(),
        skipAuthHeader: true,
      },
    );
  } catch (err) {
    console.warn("[teamver] project registry sync failed", err);
  }
}

export async function listTeamverRegisteredProjectIds(): Promise<Set<string> | null> {
  if (!isTeamverEmbedMode()) return null;

  const client = getDesignBffClient();
  if (!client) return null;

  try {
    const workspaceId = await client.workspaceStore?.get();
    if (!workspaceId?.trim()) return null;
    const result = await client.http.get<{ projects?: TeamverRegisteredProject[] }>(
      "/projects",
      {
        workspaceId: workspaceId.trim(),
        skipAuthHeader: true,
      },
    );
    const ids = new Set<string>();
    for (const project of result.projects ?? []) {
      if (project.odProjectId) ids.add(project.odProjectId);
    }
    return ids;
  } catch (err) {
    console.warn("[teamver] project registry list failed", err);
    return null;
  }
}

export async function filterProjectsByTeamverRegistryIfNeeded<T extends Pick<Project, "id">>(
  projects: T[],
): Promise<T[]> {
  const registeredIds = await listTeamverRegisteredProjectIds();
  if (registeredIds === null) return projects;
  return projects.filter((project) => registeredIds.has(project.id));
}
