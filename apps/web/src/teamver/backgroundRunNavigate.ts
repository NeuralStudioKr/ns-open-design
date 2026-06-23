import type { ChatRunStatusResponse } from "@open-design/contracts";

import type { Project } from "../types";
import { projectOpenOptionsFromPreviewCover } from "./projectPreviewFile";

/** Embed background-run reopen — chat thread + deck HTML preview on success. */
export function navigateExtrasForBackgroundRun(
  run: Pick<ChatRunStatusResponse, "status" | "conversationId">,
  project: Pick<Project, "metadata"> | undefined,
): { conversationId?: string | null; fileName?: string | null } {
  const extras: { conversationId?: string | null; fileName?: string | null } = {};
  if (run.conversationId) {
    extras.conversationId = run.conversationId;
  }
  if (run.status === "succeeded" && project) {
    const preview = projectOpenOptionsFromPreviewCover(project as Project, null);
    if (preview?.fileName) {
      extras.fileName = preview.fileName;
    }
  }
  return extras;
}
