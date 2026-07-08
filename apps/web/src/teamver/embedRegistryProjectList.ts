/**
 * Teamver embed — project list SSOT is design-api registry (RDS), not daemon
 * sqlite per EC2. Multi-node: daemon `GET /api/projects*` only sees the hashed
 * node's local sqlite; BFF `/teamver-bff/projects` is workspace-consistent.
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
  return sanitizeProjectForEmbed<Project>({
    id,
    name: title || id || "Untitled",
    skillId: null,
    designSystemId: null,
    createdAt: createdAt || Date.now(),
    updatedAt: updatedAt || createdAt || Date.now(),
    status: { value: "not_started" },
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

/** Recent rail + embed list helpers — registry rows only (no daemon list). */
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
