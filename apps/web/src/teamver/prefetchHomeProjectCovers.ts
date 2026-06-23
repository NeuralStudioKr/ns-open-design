import type { ProjectCoverHint } from "@open-design/contracts";
import { HOME_COVER_FETCH_CONCURRENCY, HOME_RECENT_LIST_LIMIT } from "./projectListLimits";
import type { Project } from "../types";
import {
  projectNeedsCoverFileFetch,
  resolveProjectCoverFiles,
  seedProjectCoverHints,
} from "./projectCoverLoader";
import { fetchProjectCoverHints, projectCoverFileFromHint } from "./projectCoverHints";
import type { ProjectCoverFile } from "./projectPreviewFile";

/** Home recent rail — one cover-hints batch, then at most six shallow resolves. */
export async function prefetchHomeProjectCovers(
  projects: Project[],
): Promise<Record<string, ProjectCoverFile | null>> {
  const recent = [...projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, HOME_RECENT_LIST_LIMIT);

  const needsHint = recent.filter((project) => projectNeedsCoverFileFetch(project));
  if (needsHint.length > 0) {
    const hints = await fetchProjectCoverHints(needsHint.map((project) => project.id));
    const positive: Record<string, ProjectCoverFile> = {};
    for (const project of needsHint) {
      const hint = hints[project.id];
      const cover = hint ? projectCoverFileFromHint(hint) : null;
      if (cover) positive[project.id] = cover;
    }
    if (Object.keys(positive).length > 0) {
      seedProjectCoverHints(positive);
    }
  }

  return resolveProjectCoverFiles(recent, {
    concurrency: HOME_COVER_FETCH_CONCURRENCY,
  });
}
