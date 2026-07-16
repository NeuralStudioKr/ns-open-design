import {
  listProjects,
  listProjectsPage,
  listRecentProjects,
  type ProjectsListPageResult,
} from "../state/projects";
import type { Project } from "../types";
import { isTeamverEmbedMode } from "./designApiBase";
import {
  formatTeamverProjectRegistryErrorMessage,
  TeamverProjectRegistryError,
} from "./projectRegistry";

export type LoadProjectListResult =
  | { ok: true; projects: Project[] }
  | { ok: false; errorMessage: string };

export type LoadProjectListPageResult =
  | ({ ok: true } & ProjectsListPageResult)
  | { ok: false; errorMessage: string; projects: Project[]; hasMore: false; nextCursor: null };

function mapProjectListError(err: unknown): LoadProjectListResult {
  if (isTeamverEmbedMode() && err instanceof TeamverProjectRegistryError) {
    return {
      ok: false,
      errorMessage: formatTeamverProjectRegistryErrorMessage(err.code),
    };
  }
  return { ok: true, projects: [] };
}

/** Home boot — recent rail only (`GET /api/projects/recent`). */
export async function loadRecentProjectsForHome(): Promise<LoadProjectListResult> {
  try {
    const projects = await listRecentProjects();
    return { ok: true, projects };
  } catch (err) {
    return mapProjectListError(err);
  }
}

/** Projects tab — paginated listing (`GET /api/projects?limit=&cursor=`). */
export async function loadProjectListPage(
  cursor?: string | null,
): Promise<LoadProjectListPageResult> {
  try {
    const page = await listProjectsPage({ cursor });
    return { ok: true, ...page };
  } catch (err) {
    const mapped = mapProjectListError(err);
    if (!mapped.ok) {
      return {
        ok: false,
        errorMessage: mapped.errorMessage,
        projects: [],
        hasMore: false,
        nextCursor: null,
      };
    }
    return { ok: true, projects: [], hasMore: false, nextCursor: null };
  }
}

/** Full daemon listing — registry sync / deep-link recovery fallback. */
export async function loadProjectListSafe(): Promise<LoadProjectListResult> {
  try {
    const projects = await listProjects();
    return { ok: true, projects };
  } catch (err) {
    return mapProjectListError(err);
  }
}

/**
 * Workspace switch reload — home uses recent rail SSOT; projects tab uses
 * paginated registry. Normalizes both to `LoadProjectListPageResult`.
 */
export async function loadProjectsForWorkspaceSwitch(options?: {
  homeRecent?: boolean;
}): Promise<LoadProjectListPageResult> {
  if (options?.homeRecent) {
    const recent = await loadRecentProjectsForHome();
    if (!recent.ok) {
      return {
        ok: false,
        errorMessage: recent.errorMessage,
        projects: [],
        hasMore: false,
        nextCursor: null,
      };
    }
    return {
      ok: true,
      projects: recent.projects,
      hasMore: false,
      nextCursor: null,
    };
  }
  return loadProjectListPage();
}
