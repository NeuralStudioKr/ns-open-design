import type { ProjectCoverHint, ProjectCoverHintsResponse } from "@open-design/contracts";
import type { ProjectCoverFile } from "./projectPreviewFile";
import { PROJECT_LIST_VIEWPORT_BATCH } from "./projectListLimits";
import { fetchTeamverDaemon } from "./teamverDaemonHeaders";

export function projectCoverFileFromHint(hint: ProjectCoverHint): ProjectCoverFile | null {
  const version =
    typeof hint.coverVersion === "number" && Number.isFinite(hint.coverVersion)
      ? hint.coverVersion
      : undefined;
  if (hint.coverPath && hint.coverKind) {
    if (!isSafeProjectRelativePath(hint.coverPath)) return null;
    return { kind: hint.coverKind, name: hint.coverPath, version };
  }
  if (hint.entryFile) {
    if (!isSafeProjectRelativePath(hint.entryFile)) return null;
    const kind = hint.coverKind ?? (/\.html?$/i.test(hint.entryFile) ? "html" : "image");
    if (kind === "html" || kind === "image" || kind === "video" || kind === "logo") {
      return { kind, name: hint.entryFile, version };
    }
  }
  return null;
}

function isSafeProjectRelativePath(value: string): boolean {
  if (!value || value.startsWith("/") || /^[a-z][a-z0-9+.-]*:/iu.test(value)) {
    return false;
  }
  const parts = value.split(/[\\/]+/u);
  return parts.every((part) => part && part !== "." && part !== "..");
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
    const response = await fetchTeamverDaemon("/api/projects/cover-hints", {
      method: "POST",
      headers: { "content-type": "application/json" },
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
