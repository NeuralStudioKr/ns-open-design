import type { ProjectCoverHint, ProjectCoverHintsResponse } from "@open-design/contracts";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { PROJECT_LIST_VIEWPORT_BATCH } from "./projectListLimits";
import { buildTeamverDaemonRequestHeaders } from "./teamverDaemonHeaders";

export function projectCoverFileFromHint(hint: ProjectCoverHint): ProjectCoverFile | null {
  if (hint.coverPath && hint.coverKind) {
    return { kind: hint.coverKind, name: hint.coverPath };
  }
  if (hint.entryFile) {
    const kind = hint.coverKind ?? (/\.html?$/i.test(hint.entryFile) ? "html" : "image");
    if (kind === "html" || kind === "image" || kind === "video" || kind === "logo") {
      return { kind, name: hint.entryFile };
    }
  }
  return null;
}

export async function fetchProjectCoverHints(
  projectIds: string[],
): Promise<Record<string, ProjectCoverHint>> {
  const ids = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))].slice(
    0,
    PROJECT_LIST_VIEWPORT_BATCH,
  );
  const result: Record<string, ProjectCoverHint> = {};
  if (ids.length === 0) return result;

  try {
    const headers = await buildTeamverDaemonRequestHeaders({ "content-type": "application/json" });
    const response = await fetch("/api/projects/cover-hints", {
      method: "POST",
      headers,
      body: JSON.stringify({ projectIds: ids }),
    });
    if (!response.ok) return result;
    const body = (await response.json()) as ProjectCoverHintsResponse;
    for (const hint of body.hints ?? []) {
      if (!hint.projectId) continue;
      result[hint.projectId] = hint;
    }
  } catch {
    return result;
  }

  return result;
}
