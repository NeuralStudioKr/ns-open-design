import { NetworkError } from "@teamver/app-sdk";
import type { Project } from "../types";
import { sanitizeProjectForEmbed } from "./embedLocalWorkspacePolicy";
import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { readTeamverViteEnv } from "./teamverViteEnv";
import { waitForTeamverEmbedBoot } from "./teamverEmbedBoot";

async function waitForEmbedBootIfNeeded(): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  await waitForTeamverEmbedBoot();
}

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

export class TeamverProjectRegistryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "TeamverProjectRegistryError";
    this.code = code;
  }
}

const REGISTRY_ERROR_MESSAGES: Record<string, string> = {
  teamver_project_registry_unavailable:
    "Teamver Design 연동을 사용할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
  teamver_workspace_required:
    "워크스페이스를 선택한 뒤 프로젝트를 만들어 주세요.",
  teamver_project_registry_sync_failed:
    "프로젝트를 워크스페이스 저장소에 등록하지 못했습니다. 잠시 후 다시 시도하세요.",
};

/** Embed create — registry hard-fail 사용자 메시지. */
export function formatTeamverProjectRegistryErrorMessage(
  code: string,
  fallback = "프로젝트를 만들 수 없습니다. 잠시 후 다시 시도하세요.",
): string {
  const key = code.trim();
  return REGISTRY_ERROR_MESSAGES[key] ?? fallback;
}

const FE_ACCESS_CACHE_MS = 30_000;
const REGISTRY_LIST_CACHE_MS = 15_000;
const SYNC_ALL_MIN_INTERVAL_MS = 60_000;

function legacyRegistryMigrationEnabled(): boolean {
  return readTeamverViteEnv("VITE_TEAMVER_LEGACY_REGISTRY_SYNC") === "1";
}

const feAccessCache = new Map<string, { allowed: boolean; at: number }>();
let registeredIdsCache: { workspaceId: string; ids: Set<string>; at: number } | null = null;
let syncAllInflight: Promise<void> | null = null;
let syncAllAt = 0;

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

function invalidateRegisteredIdsCache(): void {
  registeredIdsCache = null;
}

/** Clear FE registry caches after auth/workspace changes. */
export function invalidateTeamverProjectRegistryCaches(): void {
  feAccessCache.clear();
  invalidateRegisteredIdsCache();
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

async function getRegisteredProjectIds(workspaceId: string): Promise<Set<string> | null> {
  const trimmedWorkspaceId = workspaceId.trim();
  if (
    registeredIdsCache
    && registeredIdsCache.workspaceId === trimmedWorkspaceId
    && Date.now() - registeredIdsCache.at < REGISTRY_LIST_CACHE_MS
  ) {
    return registeredIdsCache.ids;
  }

  const ids = await listTeamverRegisteredProjectIds();
  if (ids) {
    registeredIdsCache = {
      workspaceId: trimmedWorkspaceId,
      ids,
      at: Date.now(),
    };
  }
  return ids;
}

/** @internal vitest only — module-level caches are not request-scoped. */
export function resetTeamverProjectRegistryStateForTests(): void {
  invalidateTeamverProjectRegistryCaches();
  syncAllInflight = null;
  syncAllAt = 0;
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
  options?: { skipBootWait?: boolean },
): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (!options?.skipBootWait) {
    await waitForEmbedBootIfNeeded();
  }

  const client = getDesignBffClient();
  if (!client) throw new TeamverProjectRegistryError("teamver_project_registry_unavailable");

  const workspaceId = (await client.workspaceStore?.get())?.trim();
  if (!workspaceId) throw new TeamverProjectRegistryError("teamver_workspace_required");

  try {
    await client.http.post(
      "/projects",
      buildTeamverProjectRegistryPayload(project),
      {
        workspaceId,
        skipAuthHeader: true,
      },
    );
    invalidateRegisteredIdsCache();
    invalidateFeAccessCache(project.id, workspaceId);
  } catch (err) {
    if (err instanceof NetworkError && err.status === 409) {
      invalidateRegisteredIdsCache();
      invalidateFeAccessCache(project.id, workspaceId);
      return;
    }
    console.warn("[teamver] project registry sync failed", err);
    throw new TeamverProjectRegistryError("teamver_project_registry_sync_failed");
  }
}

/** Best-effort registry upsert for legacy daemon projects before access checks. */
export async function ensureTeamverProjectRegisteredById(projectId: string): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (!legacyRegistryMigrationEnabled()) return;

  const trimmedId = projectId.trim();
  if (!trimmedId) return;

  const project = (await fetchDaemonProjectsForRegistry()).find((row) => row.id === trimmedId);
  if (!project) return;

  await registerTeamverProjectIfNeeded(project);
}

/** Embed boot: upsert all daemon projects into design-api registry (legacy migration). */
export async function syncAllDaemonProjectsToRegistry(): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (!legacyRegistryMigrationEnabled()) return;
  // Called during embed boot before completeTeamverEmbedBoot — must not wait on boot gate.

  const client = getDesignBffClient();
  if (!client) return;

  const workspaceId = (await client.workspaceStore?.get())?.trim();
  if (!workspaceId) return;

  const now = Date.now();
  if (syncAllInflight) {
    await syncAllInflight;
    return;
  }
  if (now - syncAllAt < SYNC_ALL_MIN_INTERVAL_MS) return;

  syncAllInflight = (async () => {
    const projects = await fetchDaemonProjectsForRegistry();
    await Promise.all(
      projects.map((project) =>
        registerTeamverProjectIfNeeded(project, { skipBootWait: true }),
      ),
    );
    invalidateRegisteredIdsCache();
    syncAllAt = Date.now();
  })().finally(() => {
    syncAllInflight = null;
  });

  await syncAllInflight;
}

export async function listTeamverRegisteredProjectIds(): Promise<Set<string> | null> {
  if (!isTeamverEmbedMode()) return null;
  await waitForEmbedBootIfNeeded();

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
  if (!isTeamverEmbedMode()) return projects;
  const registeredIds = await listTeamverRegisteredProjectIds();
  if (registeredIds === null) return [];
  return projects.filter((project) => registeredIds.has(project.id));
}

/** Embed: single registry row (od id or DPRJ id). */
export async function fetchTeamverProject(
  projectRef: string,
): Promise<TeamverRegisteredProject | null> {
  if (!isTeamverEmbedMode()) return null;
  await waitForEmbedBootIfNeeded();

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

async function isProjectRegisteredInWorkspace(
  projectId: string,
  workspaceId: string,
): Promise<boolean | null> {
  const registeredIds = await getRegisteredProjectIds(workspaceId);
  if (registeredIds === null) return null;
  return registeredIds.has(projectId);
}

/** Embed: registry membership gate — daemon middleware owns `/access` + S3 prefix. */
export async function assertTeamverProjectAccessIfNeeded(
  projectId: string,
): Promise<boolean> {
  if (!isTeamverEmbedMode()) return true;
  await waitForEmbedBootIfNeeded();

  const trimmedId = projectId.trim();
  if (!trimmedId) return false;

  const client = getDesignBffClient();
  if (!client) return false;

  const workspaceId = (await client.workspaceStore?.get())?.trim();
  if (!workspaceId) return false;

  const cacheKey = `${workspaceId}:${trimmedId}`;
  const cached = feAccessCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FE_ACCESS_CACHE_MS) {
    return cached.allowed;
  }

  let allowed = await isProjectRegisteredInWorkspace(trimmedId, workspaceId);
  if (allowed === true) {
    feAccessCache.set(cacheKey, { allowed: true, at: Date.now() });
    return true;
  }

  if (legacyRegistryMigrationEnabled()) {
    await ensureTeamverProjectRegisteredById(trimmedId);
    allowed = await isProjectRegisteredInWorkspace(trimmedId, workspaceId);
    if (allowed === true) {
      feAccessCache.set(cacheKey, { allowed: true, at: Date.now() });
      return true;
    }
    if (allowed === false) {
      feAccessCache.set(cacheKey, { allowed: false, at: Date.now() });
      return false;
    }
  }

  feAccessCache.set(cacheKey, { allowed: false, at: Date.now() });
  return false;
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
    invalidateRegisteredIdsCache();
    invalidateFeAccessCache(trimmedId, workspaceId.trim());
  } catch (err) {
    console.warn("[teamver] project registry delete failed", err);
  }
}
