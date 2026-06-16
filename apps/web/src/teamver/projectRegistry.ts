import { NetworkError } from "@teamver/app-sdk";
import type { Project } from "../types";
import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";

export type TeamverProjectRegistryPayload = {
  odProjectId: string;
  title?: string;
};

export type TeamverRegisteredProject = {
  id?: string;
  odProjectId?: string;
  od_project_id?: string;
  s3Prefix?: string;
  s3_prefix?: string;
  title?: string;
  ownerUserId?: string;
  owner_user_id?: string;
};

function readRegistryOdProjectId(project: TeamverRegisteredProject): string | undefined {
  const id = project.odProjectId?.trim() || project.od_project_id?.trim();
  return id || undefined;
}

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
    if (err instanceof NetworkError && err.status === 409) return;
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
      const odProjectId = readRegistryOdProjectId(project);
      if (odProjectId) ids.add(odProjectId);
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

/** Embed: single registry row (od id or DPRJ id). */
export async function fetchTeamverProject(
  projectRef: string,
): Promise<TeamverRegisteredProject | null> {
  if (!isTeamverEmbedMode()) return null;

  const trimmedRef = projectRef.trim();
  if (!trimmedRef) return null;

  const client = getDesignBffClient();
  if (!client) return null;

  try {
    const workspaceId = await client.workspaceStore?.get();
    if (!workspaceId?.trim()) return null;

    return await client.http.get<TeamverRegisteredProject>(
      `/projects/${encodeURIComponent(trimmedRef)}`,
      {
        workspaceId: workspaceId.trim(),
        skipAuthHeader: true,
      },
    );
  } catch (err) {
    if (err instanceof NetworkError && (err.status === 403 || err.status === 404)) {
      return null;
    }
    console.warn("[teamver] project fetch failed", err);
    return null;
  }
}

/** Embed: design-api registry access gate (204 ok · 403/404 deny). */
export async function assertTeamverProjectAccessIfNeeded(
  projectId: string,
): Promise<boolean> {
  if (!isTeamverEmbedMode()) return true;

  const trimmedId = projectId.trim();
  if (!trimmedId) return false;

  const client = getDesignBffClient();
  if (!client) return true;

  try {
    const workspaceId = await client.workspaceStore?.get();
    if (!workspaceId?.trim()) return true;

    await client.http.get<void>(
      `/projects/${encodeURIComponent(trimmedId)}/access`,
      {
        workspaceId: workspaceId.trim(),
        skipAuthHeader: true,
      },
    );
    return true;
  } catch (err) {
    if (
      err instanceof NetworkError
      && (err.status === 403 || err.status === 404)
    ) {
      return false;
    }
    console.warn("[teamver] project access check failed", err);
    return true;
  }
}

/** Embed: daemon project delete 후 design-api registry soft-delete (best-effort). */
export async function unregisterTeamverProjectFromRegistryIfNeeded(
  projectId: string,
): Promise<void> {
  if (!isTeamverEmbedMode()) return;

  const trimmedId = projectId.trim();
  if (!trimmedId) return;

  const client = getDesignBffClient();
  if (!client) return;

  try {
    const workspaceId = await client.workspaceStore?.get();
    if (!workspaceId?.trim()) return;

    await client.http.delete<void>(
      `/projects/${encodeURIComponent(trimmedId)}`,
      {
        workspaceId: workspaceId.trim(),
        skipAuthHeader: true,
      },
    );
  } catch (err) {
    console.warn("[teamver] project registry delete failed", err);
  }
}
