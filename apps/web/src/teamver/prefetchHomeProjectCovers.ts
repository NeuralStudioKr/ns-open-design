import { HOME_COVER_FETCH_CONCURRENCY, HOME_RECENT_LIST_LIMIT } from "./projectListLimits";
import type { Project } from "../types";
import {
  prefetchProjectCoverHintsForProjects,
  projectNeedsCoverFileFetch,
  resolveProjectCoverFiles,
  resolveProjectCoverOptionsForHomeSurface,
} from "./projectCoverLoader";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { buildProjectCardCover } from "./projectCardCover";
import { isTeamverEmbedDesignSurfaceEnabled } from "./teamverDesignAccess";
import { isTeamverEmbedMode } from "./designApiBase";
import { warmTeamverProjectPreviewPrefixes } from "./teamverProjectPreviewScope";
import { warmTeamverHtmlCoverCache } from "./warmTeamverHtmlCoverCache";

/**
 * Home recent rail covers.
 * Cover-hints first, then `/files` within HOME_RECENT_LIST_LIMIT when hints miss.
 * DesignsTab warm prefetch stays hints-only; visible cards use useLazyProjectCover
 * with `/files` fallback.
 *
 * Embed: after cover paths resolve, batch-warm preview-url prefixes (0806-N06)
 * then first-slide HTML into htmlCoverCache (0806-N07) so cards skip /raw.
 *
 * Concurrent callers (App `warmEmbedProjectListCaches` + RecentProjectsStrip)
 * share one drain so preview-url-batch / cover-html-batch stay ×1 per boot
 * (N05 baseline), instead of racing to empty caches and POSTing N times.
 */

let pendingProjectsById = new Map<string, Project>();
let homeCoverPrefetchInflight: Promise<void> | null = null;
let lastCoverEntries: Record<string, ProjectCoverFile | null> = {};

function recentHomeProjects(projects: readonly Project[]): Project[] {
  return [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, HOME_RECENT_LIST_LIMIT);
}

function mergePendingProjects(projects: readonly Project[]): void {
  for (const project of projects) {
    const id = project.id?.trim();
    if (!id) continue;
    const prev = pendingProjectsById.get(id);
    if (!prev || project.updatedAt >= prev.updatedAt) {
      pendingProjectsById.set(id, project);
    }
  }
}

function coversForProjects(
  projects: readonly Project[],
): Record<string, ProjectCoverFile | null> {
  const out: Record<string, ProjectCoverFile | null> = {};
  for (const project of recentHomeProjects(projects)) {
    out[project.id] =
      lastCoverEntries[project.id] !== undefined
        ? lastCoverEntries[project.id]!
        : null;
  }
  return out;
}

async function drainHomeCoverPrefetch(): Promise<void> {
  while (pendingProjectsById.size > 0) {
    const batch = recentHomeProjects([...pendingProjectsById.values()]);
    pendingProjectsById.clear();

    const skipNetwork =
      isTeamverEmbedMode() && !isTeamverEmbedDesignSurfaceEnabled();

    if (!skipNetwork) {
      await prefetchProjectCoverHintsForProjects(
        batch.filter((project) => projectNeedsCoverFileFetch(project)),
      );
    }

    const homeOpts = resolveProjectCoverOptionsForHomeSurface();
    const entries = await resolveProjectCoverFiles(batch, {
      concurrency: HOME_COVER_FETCH_CONCURRENCY,
      allowFilesFallback: homeOpts.allowFilesFallback !== false,
    });
    lastCoverEntries = { ...lastCoverEntries, ...entries };

    if (isTeamverEmbedMode() && !skipNetwork) {
      try {
        const htmlItems = batch.flatMap((project) => {
          const cover = buildProjectCardCover(project, entries[project.id] ?? null);
          if (cover.kind !== "html" || !cover.filePath) return [];
          return [{
            projectId: project.id,
            file: cover.filePath,
            mode: (project.metadata?.kind === "deck" ? "deck" : "page") as "deck" | "page",
          }];
        });
        if (htmlItems.length > 0) {
          await warmTeamverProjectPreviewPrefixes(
            htmlItems.map(({ projectId, file }) => ({ projectId, file })),
          );
          await warmTeamverHtmlCoverCache(htmlItems);
        }
      } catch {
        // Soft-fail — cards still get cover paths; per-card /raw remains.
      }
    }

    // Callers that arrived mid-flight refilled pendingProjectsById — loop.
  }
}

export async function prefetchHomeProjectCovers(
  projects: Project[],
): Promise<Record<string, ProjectCoverFile | null>> {
  mergePendingProjects(projects);

  if (!homeCoverPrefetchInflight) {
    homeCoverPrefetchInflight = drainHomeCoverPrefetch().finally(() => {
      homeCoverPrefetchInflight = null;
    });
  }

  await homeCoverPrefetchInflight;
  return coversForProjects(projects);
}

/** @internal vitest */
export function __resetPrefetchHomeProjectCoversForTests(): void {
  pendingProjectsById = new Map();
  homeCoverPrefetchInflight = null;
  lastCoverEntries = {};
}
