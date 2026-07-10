import { NetworkError } from "@teamver/app-sdk";
import type { Project } from "../types";
import { resolveProjectDisplayName } from "./embedRegistryProjectList";
import { sanitizeProjectForEmbed } from "./embedLocalWorkspacePolicy";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  fetchDesignAuthSession,
  getDesignBffClient,
  withDesignBffCookieAuthRecovery,
  type DesignAuthSession,
} from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import { readTeamverViteEnv } from "./teamverViteEnv";
import { resolveActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { fetchTeamverDaemon } from "./teamverDaemonHeaders";
import { waitForTeamverEmbedBoot } from "./teamverEmbedBoot";
import { isTeamverProjectCollectionRouteSlug } from "./teamverProjectCollectionRouteSlugs";
import {
  clearTeamverProjectS3Prefix,
  clearAllTeamverProjectS3PrefixCache,
  readTeamverProjectS3Prefix,
  rememberTeamverProjectS3Prefix,
} from "./teamverProjectS3PrefixCache";

async function waitForEmbedBootIfNeeded(): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  await waitForTeamverEmbedBoot();
}

export type TeamverProjectRegistryPayload = {
  odProjectId: string;
  title?: string;
  reactivateIfDeleted?: boolean;
};

export type TeamverRegisteredProject = {
  id?: string;
  odProjectId?: string;
  s3Prefix?: string;
  title?: string;
  ownerUserId?: string;
  status?: string;
  createdAt?: string | number;
  updatedAt?: string | number;
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
  teamver_project_registry_list_failed:
    "프로젝트 목록을 불러오지 못했습니다. 잠시 후 다시 시도하거나 페이지를 새로고침하세요.",
  teamver_project_s3_prefix_required:
    "프로젝트 저장소를 준비하지 못했습니다. 잠시 후 다시 시도하거나 페이지를 새로고침하세요.",
};

/** Embed create — registry hard-fail 사용자 메시지. */
export function formatTeamverProjectRegistryErrorMessage(
  code: string,
  fallback = "프로젝트를 만들 수 없습니다. 잠시 후 다시 시도하세요.",
): string {
  const key = code.trim();
  return REGISTRY_ERROR_MESSAGES[key] ?? fallback;
}

/** Embed — registry membership gate 거부 시 사용자 메시지. */
export function formatTeamverProjectAccessDeniedMessage(): string {
  return "이 워크스페이스에서 해당 프로젝트에 접근할 수 없습니다.";
}

/** Embed — deep-link hydration 실패(삭제·미등록) 시 사용자 메시지. */
export function formatTeamverProjectNotFoundMessage(): string {
  return "프로젝트를 찾을 수 없거나 삭제되었습니다.";
}

const FE_ACCESS_CACHE_MS = 30_000;
const REGISTRY_LIST_CACHE_MS = 15_000;
const SYNC_ALL_MIN_INTERVAL_MS = 60_000;
const REGISTRY_CREATE_RETRY_DELAYS_MS = [500, 1_500] as const;
const PROJECT_ACCESS_RETRY_DELAYS_MS = [0, 400, 800] as const;

type ProjectAccessCheckResult = "allowed" | "denied" | "transient";

function legacyRegistryMigrationEnabled(): boolean {
  return readTeamverViteEnv("VITE_TEAMVER_LEGACY_REGISTRY_SYNC") === "1";
}

const feAccessCache = new Map<string, { allowed: boolean; at: number }>();
let registryListCache: {
  workspaceId: string;
  userId: string;
  projects: TeamverRegisteredProject[];
  ids: Set<string>;
  at: number;
} | null = null;
let syncAllInflight: Promise<void> | null = null;
let syncAllAt = 0;

/** Embed list gates — wait for in-flight legacy registry sync before filtering. */
export async function waitForTeamverRegistrySyncIfNeeded(): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (syncAllInflight) {
    await syncAllInflight;
  }
}

function readRegistryOdProjectId(project: TeamverRegisteredProject): string | undefined {
  const id = project.odProjectId?.trim();
  return id || undefined;
}

function readSessionUserId(session: DesignAuthSession): string | null {
  return session.user?.userId?.trim() || null;
}

async function resolveRegistryUserId(): Promise<string | null> {
  try {
    const session = await fetchDesignAuthSession();
    if (!session?.authenticated) return null;
    return readSessionUserId(session);
  } catch {
    return null;
  }
}

function feAccessCacheKey(workspaceId: string, projectId: string, userId: string): string {
  return `${userId.trim()}:${workspaceId.trim()}:${projectId.trim()}`;
}

function invalidateFeAccessCache(projectId: string, workspaceId?: string): void {
  const trimmed = projectId.trim();
  if (!trimmed) return;
  if (workspaceId?.trim()) {
    const suffix = `:${workspaceId.trim()}:${trimmed}`;
    for (const key of feAccessCache.keys()) {
      if (key.endsWith(suffix)) feAccessCache.delete(key);
    }
    clearTeamverProjectS3Prefix(trimmed, workspaceId.trim());
    return;
  }
  for (const key of feAccessCache.keys()) {
    if (key.endsWith(`:${trimmed}`)) feAccessCache.delete(key);
  }
  clearTeamverProjectS3Prefix(trimmed);
}

function primeFeAccessAllowed(projectId: string, workspaceId: string, userId: string): void {
  const trimmedId = projectId.trim();
  const trimmedWorkspaceId = workspaceId.trim();
  const trimmedUserId = userId.trim();
  if (!trimmedId || !trimmedWorkspaceId || !trimmedUserId) return;
  feAccessCache.set(feAccessCacheKey(trimmedWorkspaceId, trimmedId, trimmedUserId), {
    allowed: true,
    at: Date.now(),
  });
}

function invalidateRegisteredIdsCache(): void {
  registryListCache = null;
}

/** Clear FE registry caches after auth/workspace changes. */
export function invalidateTeamverProjectRegistryCaches(): void {
  feAccessCache.clear();
  invalidateRegisteredIdsCache();
  clearAllTeamverProjectS3PrefixCache();
}

async function fetchDaemonProjectsForRegistry(): Promise<Project[]> {
  try {
    const resp = await fetchTeamverDaemon("/api/projects");
    if (!resp.ok) return [];
    const json = (await resp.json()) as { projects?: Project[] };
    return (json.projects ?? [])
      .filter((project) => !isTeamverProjectCollectionRouteSlug(project.id))
      .map((project) => sanitizeProjectForEmbed(project));
  } catch {
    return [];
  }
}

async function getRegisteredProjectIds(_workspaceId: string): Promise<Set<string> | null> {
  return listTeamverRegisteredProjectIds();
}

/** @internal vitest only — module-level caches are not request-scoped. */
export function resetTeamverProjectRegistryStateForTests(): void {
  invalidateTeamverProjectRegistryCaches();
  syncAllInflight = null;
  syncAllAt = 0;
}

export function buildTeamverProjectRegistryPayload(
  project: Pick<Project, "id" | "name">,
  options?: { reactivateIfDeleted?: boolean },
): TeamverProjectRegistryPayload {
  const title = project.name?.trim();
  return {
    odProjectId: project.id,
    ...(title ? { title } : {}),
    ...(options?.reactivateIfDeleted === false ? { reactivateIfDeleted: false } : {}),
  };
}

async function rememberRegistryS3Prefix(
  projectId: string,
  workspaceId: string,
  registered?: TeamverRegisteredProject | null,
): Promise<void> {
  const direct = registered?.s3Prefix?.trim();
  if (direct) {
    rememberTeamverProjectS3Prefix(workspaceId, projectId, direct);
    return;
  }
  const fetched = await fetchTeamverProject(projectId);
  rememberTeamverProjectS3Prefix(workspaceId, projectId, fetched?.s3Prefix);
}

function assertRegistryS3PrefixCached(workspaceId: string, projectId: string): void {
  if (!readTeamverProjectS3Prefix(workspaceId, projectId)?.trim()) {
    throw new TeamverProjectRegistryError("teamver_project_s3_prefix_required");
  }
}

export async function registerTeamverProjectIfNeeded(
  project: Pick<Project, "id" | "name">,
  options?: {
    skipBootWait?: boolean;
    retryDelaysMs?: readonly number[];
    /** Legacy bulk sync must not resurrect user-deleted registry rows. */
    reactivateIfDeleted?: boolean;
  },
): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (isTeamverProjectCollectionRouteSlug(project.id)) return;
  if (!options?.skipBootWait) {
    await waitForEmbedBootIfNeeded();
  }

  const client = getDesignBffClient();
  if (!client) throw new TeamverProjectRegistryError("teamver_project_registry_unavailable");

  const workspaceId = (await resolveActiveTeamverWorkspaceId())?.trim();
  if (!workspaceId) throw new TeamverProjectRegistryError("teamver_workspace_required");

  const userId = await resolveRegistryUserId();

  const payload = buildTeamverProjectRegistryPayload(project, {
    reactivateIfDeleted: options?.reactivateIfDeleted,
  });
  const retryDelaysMs = options?.retryDelaysMs ?? REGISTRY_CREATE_RETRY_DELAYS_MS;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const registered = await withDesignBffCookieAuthRecovery(() =>
        client.http.post<TeamverRegisteredProject>(
          "/projects",
          payload,
          {
            workspaceId,
            ...TEAMVER_BFF_REQUEST_OPTIONS,
          },
        ),
      );
      invalidateRegisteredIdsCache();
      if (userId) primeFeAccessAllowed(project.id, workspaceId, userId);
      await rememberRegistryS3Prefix(project.id, workspaceId, registered);
      assertRegistryS3PrefixCached(workspaceId, project.id);
      return;
    } catch (err) {
      if (err instanceof NetworkError && err.status === 409) {
        if (options?.reactivateIfDeleted === false && isRegistryProjectDeletedConflict(err)) {
          return;
        }
        invalidateRegisteredIdsCache();
        if (userId) primeFeAccessAllowed(project.id, workspaceId, userId);
        await rememberRegistryS3Prefix(project.id, workspaceId);
        assertRegistryS3PrefixCached(workspaceId, project.id);
        return;
      }
      const delayMs = retryDelaysMs[attempt];
      if (delayMs != null && isRetryableRegistryCreateError(err)) {
        await delay(delayMs);
        continue;
      }
      console.warn("[teamver] project registry sync failed", err);
      throw new TeamverProjectRegistryError("teamver_project_registry_sync_failed");
    }
  }
}

function isRetryableRegistryCreateError(err: unknown): boolean {
  if (!(err instanceof NetworkError)) return true;
  if (err.status == null) return true;
  return err.status === 408 || err.status === 425 || err.status === 429 || err.status >= 500;
}

function isRegistryProjectDeletedConflict(err: unknown): boolean {
  if (!(err instanceof NetworkError) || err.status !== 409) return false;
  const message = err.message?.toLowerCase() ?? "";
  return message.includes("project_deleted");
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Best-effort registry upsert for legacy daemon projects before access checks. */
export async function ensureTeamverProjectRegisteredById(projectId: string): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (!legacyRegistryMigrationEnabled()) return;

  const trimmedId = projectId.trim();
  if (!trimmedId) return;
  if (isTeamverProjectCollectionRouteSlug(trimmedId)) return;

  const project = (await fetchDaemonProjectsForRegistry()).find((row) => row.id === trimmedId);
  if (!project) return;

  await registerTeamverProjectIfNeeded(project, {
    skipBootWait: true,
    reactivateIfDeleted: false,
  });
}

/** Embed boot: upsert all daemon projects into design-api registry (legacy migration). */
export async function syncAllDaemonProjectsToRegistry(): Promise<void> {
  if (!isTeamverEmbedMode()) return;
  if (!legacyRegistryMigrationEnabled()) return;
  // Called during embed boot before completeTeamverEmbedBoot — must not wait on boot gate.

  const client = getDesignBffClient();
  if (!client) return;

  const workspaceId = (await resolveActiveTeamverWorkspaceId())?.trim();
  if (!workspaceId) return;

  const now = Date.now();
  if (syncAllInflight) {
    await syncAllInflight;
    return;
  }
  if (now - syncAllAt < SYNC_ALL_MIN_INTERVAL_MS) return;

  syncAllInflight = (async () => {
    const registeredIds = await listTeamverRegisteredProjectIds();
    const projects = await fetchDaemonProjectsForRegistry();
    const pending =
      registeredIds != null
        ? projects.filter((project) => !registeredIds.has(project.id))
        : projects;
    await Promise.all(
      pending.map((project) =>
        registerTeamverProjectIfNeeded(project, {
          skipBootWait: true,
          reactivateIfDeleted: false,
        }),
      ),
    );
    invalidateRegisteredIdsCache();
    syncAllAt = Date.now();
  })().finally(() => {
    syncAllInflight = null;
  });

  await syncAllInflight;
}


async function fetchRegistryProjectsFromBff(): Promise<{
  workspaceId: string;
  userId: string | null;
  projects: TeamverRegisteredProject[];
} | null> {
  if (!isTeamverEmbedMode()) return null;
  await waitForEmbedBootIfNeeded();

  const client = getDesignBffClient();
  if (!client) return null;

  const workspaceId = (await resolveActiveTeamverWorkspaceId())?.trim();
  if (!workspaceId) return null;
  const userId = await resolveRegistryUserId();

  if (
    userId
    && registryListCache
    && registryListCache.workspaceId === workspaceId
    && registryListCache.userId === userId
    && Date.now() - registryListCache.at < REGISTRY_LIST_CACHE_MS
  ) {
    return {
      workspaceId,
      userId,
      projects: registryListCache.projects,
    };
  }

  try {
    const result = await withDesignBffCookieAuthRecovery(() =>
      client.http.get<{ projects?: TeamverRegisteredProject[] }>(
        "/projects",
        {
          workspaceId,
          ...TEAMVER_BFF_REQUEST_OPTIONS,
        },
      ),
    );
    const projects = result.projects ?? [];
    const ids = new Set<string>();
    for (const project of projects) {
      const odProjectId = readRegistryOdProjectId(project);
      if (odProjectId) {
        ids.add(odProjectId);
        rememberTeamverProjectS3Prefix(workspaceId, odProjectId, project.s3Prefix);
      }
    }
    if (userId) {
      registryListCache = {
        workspaceId,
        userId,
        projects,
        ids,
        at: Date.now(),
      };
    }
    return { workspaceId, userId, projects };
  } catch (err) {
    console.warn("[teamver] project registry list failed", err);
    return null;
  }
}

/** Embed list SSOT — full registry rows (RDS; safe across multi-node EC2). */
export async function listTeamverRegistryProjects(): Promise<TeamverRegisteredProject[] | null> {
  const fetched = await fetchRegistryProjectsFromBff();
  return fetched?.projects ?? null;
}

export async function listTeamverRegisteredProjectIds(): Promise<Set<string> | null> {
  if (!isTeamverEmbedMode()) return null;

  const workspaceId = (await resolveActiveTeamverWorkspaceId())?.trim();
  if (!workspaceId) return null;
  const userId = await resolveRegistryUserId();

  if (
    userId
    && registryListCache
    && registryListCache.workspaceId === workspaceId
    && registryListCache.userId === userId
    && Date.now() - registryListCache.at < REGISTRY_LIST_CACHE_MS
  ) {
    return registryListCache.ids;
  }

  const fetched = await fetchRegistryProjectsFromBff();
  if (!fetched) return null;

  if (userId && registryListCache?.workspaceId === workspaceId && registryListCache.userId === userId) {
    return registryListCache.ids;
  }

  const ids = new Set<string>();
  for (const project of fetched.projects) {
    const odProjectId = readRegistryOdProjectId(project);
    if (odProjectId) ids.add(odProjectId);
  }
  return ids;
}

export async function filterProjectsByTeamverRegistryIfNeeded<T extends Pick<Project, "id">>(
  projects: T[],
): Promise<T[]> {
  if (!isTeamverEmbedMode()) return projects;
  const fetched = await fetchRegistryProjectsFromBff();
  if (!fetched) {
    throw new TeamverProjectRegistryError("teamver_project_registry_list_failed");
  }
  const registeredIds = new Set<string>();
  const titlesById = new Map<string, string>();
  for (const row of fetched.projects) {
    const odProjectId = readRegistryOdProjectId(row);
    if (!odProjectId) continue;
    registeredIds.add(odProjectId);
    const title = row.title?.trim();
    if (title) titlesById.set(odProjectId, title);
  }
  return projects
    .filter((project) => registeredIds.has(project.id))
    .map((project) => {
      const title = titlesById.get(project.id);
      if (!title || !("name" in project)) return project;
      const currentName = (project as Pick<Project, "id" | "name">).name;
      const name = resolveProjectDisplayName({ id: project.id, name: currentName }, title);
      if (name === currentName) return project;
      return { ...project, name } as T;
    });
}

/** Embed: single registry row (od id or DPRJ id). */
export async function fetchTeamverProject(
  projectRef: string,
): Promise<TeamverRegisteredProject | null> {
  const outcome = await fetchTeamverProjectAccessOutcome(projectRef);
  return outcome.status === "found" ? outcome.project : null;
}

type TeamverProjectAccessOutcome =
  | { status: "found"; project: TeamverRegisteredProject }
  | { status: "denied" }
  | { status: "unavailable" };

async function fetchTeamverProjectAccessOutcome(
  projectRef: string,
): Promise<TeamverProjectAccessOutcome> {
  if (!isTeamverEmbedMode()) return { status: "unavailable" };
  await waitForEmbedBootIfNeeded();

  const trimmedRef = projectRef.trim();
  if (!trimmedRef) return { status: "denied" };
  if (isTeamverProjectCollectionRouteSlug(trimmedRef)) return { status: "denied" };

  const client = getDesignBffClient();
  if (!client) return { status: "unavailable" };

  try {
    const workspaceId = await resolveWorkspaceIdForProjectAccess();
    if (!workspaceId?.trim()) return { status: "unavailable" };

    const project = await withDesignBffCookieAuthRecovery(() =>
      client.http.get<TeamverRegisteredProject>(
        `/projects/${encodeURIComponent(trimmedRef)}`,
        {
          workspaceId: workspaceId.trim(),
          ...TEAMVER_BFF_REQUEST_OPTIONS,
        },
      ),
    );
    return { status: "found", project };
  } catch (err) {
    if (err instanceof NetworkError && (err.status === 403 || err.status === 404)) {
      return { status: "denied" };
    }
    console.warn("[teamver] project fetch failed", err);
    return { status: "unavailable" };
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

function isDirectRegistryProjectHit(
  projectId: string,
  project: TeamverRegisteredProject | null,
): project is TeamverRegisteredProject {
  if (!project) return false;
  const odProjectId = readRegistryOdProjectId(project);
  if (odProjectId) return odProjectId === projectId;
  return Boolean(project.s3Prefix?.trim());
}

async function resolveWorkspaceIdForProjectAccess(): Promise<string | null> {
  const fromSession = (await resolveActiveTeamverWorkspaceId())?.trim();
  if (fromSession) return fromSession;
  const client = getDesignBffClient();
  return (await client?.workspaceStore?.get())?.trim() || null;
}

async function checkTeamverProjectAccessOnce(
  trimmedId: string,
  workspaceId: string,
  cacheKey: string | null,
): Promise<ProjectAccessCheckResult> {
  if (cacheKey) {
    const cached = feAccessCache.get(cacheKey);
    if (cached?.allowed && Date.now() - cached.at < FE_ACCESS_CACHE_MS) {
      return "allowed";
    }
  }

  let allowed = await isProjectRegisteredInWorkspace(trimmedId, workspaceId);
  if (allowed === true) {
    if (cacheKey) feAccessCache.set(cacheKey, { allowed: true, at: Date.now() });
    return "allowed";
  }

  if (legacyRegistryMigrationEnabled()) {
    await ensureTeamverProjectRegisteredById(trimmedId);
    allowed = await isProjectRegisteredInWorkspace(trimmedId, workspaceId);
    if (allowed === true) {
      if (cacheKey) feAccessCache.set(cacheKey, { allowed: true, at: Date.now() });
      return "allowed";
    }
  }

  // The list endpoint can be briefly stale/partial during auth refresh,
  // workspace switch, or registry write propagation. Before showing the
  // destructive "not accessible in this workspace" UX, confirm against the
  // single-project registry endpoint. This endpoint is the authoritative
  // membership check for deep-linked/detail routes and also refreshes the
  // S3 prefix cache when it succeeds.
  const direct = await fetchTeamverProjectAccessOutcome(trimmedId);
  if (direct.status === "found" && isDirectRegistryProjectHit(trimmedId, direct.project)) {
    const userId = await resolveRegistryUserId();
    if (userId) primeFeAccessAllowed(trimmedId, workspaceId, userId);
    await rememberRegistryS3Prefix(trimmedId, workspaceId, direct.project);
    return "allowed";
  }
  if (direct.status === "denied") return "denied";
  if (allowed === false) return "transient";
  return "transient";
}

/** Embed: registry membership gate — daemon middleware owns `/access` + S3 prefix. */
export async function assertTeamverProjectAccessIfNeeded(
  projectId: string,
): Promise<boolean> {
  if (!isTeamverEmbedMode()) return true;
  await waitForEmbedBootIfNeeded();

  const trimmedId = projectId.trim();
  if (!trimmedId) return false;
  if (isTeamverProjectCollectionRouteSlug(trimmedId)) return false;

  const client = getDesignBffClient();
  if (!client) return false;

  const workspaceId = (await resolveWorkspaceIdForProjectAccess())?.trim();
  if (!workspaceId) return false;

  const userId = await resolveRegistryUserId();
  const cacheKey = userId
    ? feAccessCacheKey(workspaceId, trimmedId, userId)
    : null;

  for (let attempt = 0; attempt < PROJECT_ACCESS_RETRY_DELAYS_MS.length; attempt += 1) {
    const delayMs = PROJECT_ACCESS_RETRY_DELAYS_MS[attempt] ?? 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    const result = await checkTeamverProjectAccessOnce(trimmedId, workspaceId, cacheKey);
    if (result !== "transient") {
      return result === "allowed";
    }
  }

  return false;
}

/** Embed: daemon delete then registry soft-delete (both required). */
export async function unregisterTeamverProjectFromRegistryIfNeeded(
  projectId: string,
): Promise<boolean> {
  if (!isTeamverEmbedMode()) return true;

  const trimmedId = projectId.trim();
  if (!trimmedId) return true;

  const client = getDesignBffClient();
  if (!client) return false;

  let workspaceId: string | null = null;
  try {
    workspaceId = (await resolveActiveTeamverWorkspaceId())?.trim() ?? null;
    if (!workspaceId) return false;

    await client.http.delete<void>(
      `/projects/${encodeURIComponent(trimmedId)}`,
      {
        workspaceId,
        ...TEAMVER_BFF_REQUEST_OPTIONS,
      },
    );
    invalidateRegisteredIdsCache();
    invalidateFeAccessCache(trimmedId, workspaceId);
    return true;
  } catch (err) {
    if (err instanceof NetworkError && err.status === 404) {
      invalidateRegisteredIdsCache();
      if (workspaceId) invalidateFeAccessCache(trimmedId, workspaceId);
      return true;
    }
    console.warn("[teamver] project registry delete failed", err);
    return false;
  }
}
