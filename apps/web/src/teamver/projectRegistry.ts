import { NetworkError } from "@teamver/app-sdk";
import type { Project } from "../types";
import { sanitizeProjectForEmbed } from "./embedLocalWorkspacePolicy";
import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";

export type TeamverProjectRegistryPayload = {
  odProjectId: string;
  title?: string;
};

export type TeamverRegisteredProject = {
  id?: string;
  odProjectId?: string;
  s3Prefix?: string;
  title?: string;
  ownerUserId?: string;
};

const FE_ACCESS_CACHE_MS = 30_000;
const feAccessCache = new Map<string, { allowed: boolean; at: number }>();

function readRegistryOdProjectId(project: TeamverRegisteredProject): string | undefined {
  const id = project.odProjectId?.trim();
  return id || undefined;
}

function invalidateFeAccessCache(projectId: string, workspaceId?: string): void {
  const trimmed = projectId.trim();
  if (!trimmed) return;
  if (workspaceId?.trim()) {
    feAccessCache.delete(`${workspaceId.trim()}:${trimmed}`);
    return;
  }
  for (const key of feAccessCache.keys()) {
    if (key.endsWith(`:${trimmed}`)) feAccessCache.delete(key);
  }
}

async function fetchDaemonProjectsForRegistry(): Promise<Project[]> {
  try {
    const resp = await fetch("/api/projects");
    if (!resp.ok) return [];
    const json = (await resp.json()) as { projects?: Project[] };
    return (json.projects ?? []).map((project) => sanitizeProjectForEmbed(project));
  } catch {
    return [];
  }
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
    invalidateFeAccessCache(project.id, workspaceId.trim());
  } catch (err) {
    if (err instanceof NetworkError && err.status === 409) return;
    console.warn("[teamver] project registry sync failed", err);
  }
}

/** Best-effort registry upsert for legacy daemon projects before /access checks. */
export async function ensureTeamverProjectRegisteredById(projectId: string): Promise<void> {
  if (!isTeamverEmbedMode()) return;

  const trimmedId = projectId.trim();
  if (!trimmedId) return;

  const project = (await fetchDaemonProjectsForRegistry()).find((row) => row.id === trimmedId);
  if (!project) return;

  await registerTeamverProjectIfNeeded(project);
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

    const cacheKey = `${workspaceId.trim()}:${trimmedId}`;
    const cached = feAccessCache.get(cacheKey);
    if (cached && Date.now() - cached.at < FE_ACCESS_CACHE_MS) {
      return cached.allowed;
    }

    await ensureTeamverProjectRegisteredById(trimmedId);

    await client.http.get<void>(
      `/projects/${encodeURIComponent(trimmedId)}/access`,
      {
        workspaceId: workspaceId.trim(),
        skipAuthHeader: true,
      },
    );
    feAccessCache.set(cacheKey, { allowed: true, at: Date.now() });
    return true;
  } catch (err) {
    if (
      err instanceof NetworkError
      && (err.status === 403 || err.status === 404)
    ) {
      const workspaceId = await client.workspaceStore?.get();
      if (workspaceId?.trim()) {
        feAccessCache.set(`${workspaceId.trim()}:${trimmedId}`, {
          allowed: false,
          at: Date.now(),
        });
      }
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
    invalidateFeAccessCache(trimmedId, workspaceId.trim());
  } catch (err) {
    console.warn("[teamver] project registry delete failed", err);
  }
}
