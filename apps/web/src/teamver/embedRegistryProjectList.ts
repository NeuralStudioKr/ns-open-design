/**
 * Teamver embed — registry row mapping + client-side pagination helpers.
 *
 * Embed project **list membership** SSOT: design-api BFF registry (workspace-
 * scoped RDS). Daemon `GET /api/projects*` is used only to enrich status /
 * metadata. Taking daemon top-N then intersecting with the registry undersamples
 * the current workspace whenever other tenants fill the recent window
 * (docs-teamver/09 · 39_5 Q10).
 *
 * docs-teamver/39_7 · 30_embed_home_boot_API_최적화.md
 */

import type { Project } from "../types";
import {
  listTeamverRegistryProjects,
  TeamverProjectRegistryError,
  type TeamverRegisteredProject,
} from "./projectRegistry";
import { sanitizeProjectForEmbed } from "./embedLocalWorkspacePolicy";
import { PROJECT_LIST_PAGE_SIZE } from "./projectListLimits";
import type { ProjectsListPageResult } from "../state/projects";

type ProjectListCursor = { updatedAt: number; id: string };

function readRegistryOdProjectId(project: TeamverRegisteredProject): string | undefined {
  const id = project.odProjectId?.trim();
  return id || undefined;
}

/** Prefer registry title when daemon PG name is empty or still the od id. */
export function resolveProjectDisplayName(
  project: Pick<Project, "id" | "name">,
  registryTitle?: string | null,
): string {
  const title = registryTitle?.trim();
  const name = project.name?.trim();
  if (title && (!name || name === project.id)) return title;
  return name || title || project.id || "Untitled";
}

function parseRegistryTimestamp(raw: unknown, fallback = 0): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function mapRegistryRowToProject(row: TeamverRegisteredProject): Project {
  const id = readRegistryOdProjectId(row) ?? "";
  const updatedAt = parseRegistryTimestamp(row.updatedAt);
  const createdAt = parseRegistryTimestamp(row.createdAt, updatedAt);
  const title = row.title?.trim();
  // Never fall back to Date.now() — missing timestamps used to render as
  // 「방금 전」 and bubble resurrected ghosts to the top of recent.
  const safeCreatedAt = createdAt || updatedAt || 0;
  const safeUpdatedAt = updatedAt || createdAt || 0;
  return sanitizeProjectForEmbed<Project>({
    id,
    name: resolveProjectDisplayName({ id, name: title || id || "" }, title),
    skillId: null,
    designSystemId: null,
    createdAt: safeCreatedAt,
    updatedAt: safeUpdatedAt,
    status: { value: "not_started" },
  });
}

/**
 * Overlay daemon listing fields (status / metadata / timestamps) onto
 * registry-ordered rows without changing membership or sort order.
 */
export function mergeDaemonFieldsOntoRegistryProjects(
  registryProjects: Project[],
  daemonProjects: Project[],
): Project[] {
  if (registryProjects.length === 0 || daemonProjects.length === 0) {
    return registryProjects;
  }
  const byId = new Map(daemonProjects.map((project) => [project.id, project]));
  return registryProjects.map((registry) => {
    const daemon = byId.get(registry.id);
    if (!daemon) return registry;
    return sanitizeProjectForEmbed<Project>({
      ...registry,
      name: resolveProjectDisplayName(daemon, registry.name),
      skillId: daemon.skillId ?? registry.skillId,
      designSystemId: daemon.designSystemId ?? registry.designSystemId,
      status: daemon.status ?? registry.status,
      metadata: daemon.metadata ?? registry.metadata,
      createdAt: registry.createdAt || daemon.createdAt,
      updatedAt: Math.max(registry.updatedAt, daemon.updatedAt),
    });
  });
}

function encodeCursor(cursor: ProjectListCursor): string {
  return `${cursor.updatedAt}:${encodeURIComponent(cursor.id)}`;
}

function parseCursor(raw: string | null | undefined): ProjectListCursor | null {
  if (!raw?.trim()) return null;
  const colon = raw.indexOf(":");
  if (colon <= 0) return null;
  const updatedAt = Number(raw.slice(0, colon));
  const id = decodeURIComponent(raw.slice(colon + 1));
  if (!Number.isFinite(updatedAt) || !id) return null;
  return { updatedAt, id };
}

function sortRegistryProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return b.id.localeCompare(a.id);
  });
}

function sliceAfterCursor(
  sorted: Project[],
  cursor: ProjectListCursor | null,
): Project[] {
  if (!cursor) return sorted;
  const start = sorted.findIndex(
    (project) =>
      project.updatedAt < cursor.updatedAt
      || (project.updatedAt === cursor.updatedAt && project.id < cursor.id),
  );
  return start < 0 ? [] : sorted.slice(start);
}

async function loadSortedRegistryProjects(): Promise<Project[]> {
  const rows = await listTeamverRegistryProjects();
  if (rows === null) {
    throw new TeamverProjectRegistryError("teamver_project_registry_list_failed");
  }
  return sortRegistryProjects(rows.map(mapRegistryRowToProject));
}

/** Recent rail + embed list helpers — registry rows only (workspace SSOT). */
export async function listEmbedProjectsFromRegistry(limit?: number): Promise<Project[]> {
  const sorted = await loadSortedRegistryProjects();
  if (limit == null || limit <= 0) return sorted;
  return sorted.slice(0, limit);
}

/** Client-side cursor page over registry list (matches daemon cursor shape). */
export async function listEmbedProjectsPageFromRegistry(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<ProjectsListPageResult> {
  const limit = options?.limit ?? PROJECT_LIST_PAGE_SIZE;
  const sorted = await loadSortedRegistryProjects();
  const afterCursor = sliceAfterCursor(sorted, parseCursor(options?.cursor));
  const page = afterCursor.slice(0, limit);
  const hasMore = afterCursor.length > limit;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ updatedAt: last.updatedAt, id: last.id })
      : null;
  return { projects: page, hasMore, nextCursor };
}
