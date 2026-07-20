import type { PetTaskSummary } from "../components/pet/PetOverlay";
import type { Project } from "../types";
import { navigateExtrasForBackgroundRun } from "./backgroundRunNavigate";
import { projectOpenOptionsFromPreviewCover } from "./projectPreviewFile";
import type { EmbedBackgroundRunNoticeStatus } from "./teamverEmbedRunTracking";

export type EmbedBackgroundRunNotice = {
  runId: string;
  projectId: string;
  projectName: string;
  conversationId: string | null;
  status: EmbedBackgroundRunNoticeStatus;
  reopenExtras: { conversationId?: string | null; fileName?: string | null };
};

/** Whether project metadata changes should refresh embed background-run surfaces. */
export function projectAffectsEmbedBackgroundRunSurfaces(
  previous: Project | undefined,
  updated: Project,
): boolean {
  if (!previous || previous.id !== updated.id) return true;
  return (
    previous.name !== updated.name
    || previous.metadata?.entryFile !== updated.metadata?.entryFile
  );
}

/** Patch completion-toast reopen extras when project metadata (name·entryFile) changes. */
export function patchEmbedBackgroundRunNoticeForProject(
  notice: EmbedBackgroundRunNotice | null,
  project: Project,
): EmbedBackgroundRunNotice | null {
  if (!notice || notice.projectId !== project.id) return notice;
  const reopenExtras = navigateExtrasForBackgroundRun(
    {
      status: notice.status === "incomplete" ? "succeeded" : notice.status,
      conversationId: notice.conversationId,
    },
    project,
  );
  if (
    notice.projectName === project.name
    && notice.reopenExtras.conversationId === reopenExtras.conversationId
    && notice.reopenExtras.fileName === reopenExtras.fileName
  ) {
    return notice;
  }
  return {
    ...notice,
    projectName: project.name,
    reopenExtras,
  };
}

/** Patch banner chip label + preview deep-link when project metadata changes. */
export function patchEmbedBackgroundRunSummaryForProject(
  summary: PetTaskSummary,
  project: Project,
): PetTaskSummary {
  if (summary.projectId !== project.id) return summary;
  const previewFileName = projectOpenOptionsFromPreviewCover(project, null)?.fileName ?? null;
  if (
    project.name === summary.projectName
    && previewFileName === (summary.previewFileName ?? null)
  ) {
    return summary;
  }
  const updated: PetTaskSummary = { ...summary, projectName: project.name };
  if (previewFileName) {
    updated.previewFileName = previewFileName;
  } else {
    delete updated.previewFileName;
  }
  return updated;
}

/** Apply notice + summary patches for a single updated project row. */
export function syncEmbedBackgroundRunSurfacesForProject(
  project: Project,
  surfaces: {
    notice: EmbedBackgroundRunNotice | null;
    summaries: PetTaskSummary[];
  },
): {
  notice: EmbedBackgroundRunNotice | null;
  summaries: PetTaskSummary[];
} {
  const notice = patchEmbedBackgroundRunNoticeForProject(surfaces.notice, project);
  const summaries = surfaces.summaries.map((summary) =>
    patchEmbedBackgroundRunSummaryForProject(summary, project),
  );
  return { notice, summaries };
}
