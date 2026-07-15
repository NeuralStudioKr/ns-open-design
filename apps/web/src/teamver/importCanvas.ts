import type { ChatAttachment } from "@open-design/contracts";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";
import { requireActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";
import type { TeamverDriveImportedAsset } from "./importDriveAssets";

export type TeamverCanvasImportRequest = {
  sessionId: string;
  artifactId: string;
  revision?: string;
  filename?: string;
};

export type TeamverCanvasImportResult = {
  projectId: string;
  imported: TeamverDriveImportedAsset[];
};

type CanvasImportResponse = {
  projectId?: string;
  imported?: TeamverDriveImportedAsset[];
  errorCode?: string;
};

/** Korean / code messages for Canvas T2 import (align with Drive import UX). */
export function formatCanvasImportErrorForUser(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "캔버스를 가져오지 못했습니다 — 잠시 후 다시 시도하세요.";

  const exact: Record<string, string> = {
    teamver_workspace_required: "Teamver 작업공간을 먼저 선택한 뒤 다시 시도하세요.",
    teamver_design_client_unavailable:
      "teamver Design을 불러오는 중입니다 — 새로고침 후 다시 시도하세요.",
    canvas_import_failed: "캔버스를 가져오지 못했습니다 — 잠시 후 다시 시도하세요.",
    canvas_session_required: "캔버스 세션 정보가 없습니다.",
    canvas_artifact_required: "캔버스 문서 정보가 없습니다.",
    canvas_export_forbidden: "이 캔버스에 접근할 권한이 없습니다.",
    canvas_export_not_found: "캔버스를 찾을 수 없습니다. 삭제되었거나 이동되었을 수 있습니다.",
    canvas_export_timeout: "캔버스 내보내기가 시간 초과되었습니다 — 다시 시도해 주세요.",
    canvas_export_too_large: "캔버스가 너무 큽니다. 이미지를 줄이거나 내용을 나눈 뒤 다시 시도하세요.",
    canvas_export_failed: "캔버스 HTML을 만들지 못했습니다.",
    od_daemon_import_failed: "Design 프로젝트에 저장할 수 없습니다.",
  };
  if (exact[trimmed]) return exact[trimmed];
  if (trimmed.startsWith("teamver_main_fetch_failed:403")) return exact.canvas_export_forbidden!;
  if (trimmed.startsWith("teamver_main_fetch_failed:404")) return exact.canvas_export_not_found!;
  if (trimmed.startsWith("teamver_main_fetch_failed:")) return exact.canvas_export_failed!;
  return trimmed;
}

export function formatTeamverCanvasImportErrorMessage(err: unknown): string {
  if (err instanceof Error) return formatCanvasImportErrorForUser(err.message);
  return formatCanvasImportErrorForUser(String(err));
}

/**
 * T2: Design BFF pulls Main canvas export-html and stores it in the project.
 * No Drive intermediary.
 */
export async function importTeamverCanvas(
  projectId: string,
  request: TeamverCanvasImportRequest,
): Promise<TeamverCanvasImportResult> {
  const client = getDesignBffClient();
  if (!client) {
    throw new Error("teamver_design_client_unavailable");
  }

  const workspaceId = await requireActiveTeamverWorkspaceId();
  const sessionId = request.sessionId.trim();
  const artifactId = request.artifactId.trim();
  if (!sessionId) throw new Error("canvas_session_required");
  if (!artifactId) throw new Error("canvas_artifact_required");

  await assertTeamverDesignAppEnabled(workspaceId);

  const response = await withDesignBffCookieAuthRecovery(() =>
    client.http.post<CanvasImportResponse>(
      `/projects/${encodeURIComponent(projectId)}/import-canvas`,
      {
        sessionId,
        artifactId,
        revision: request.revision?.trim() || undefined,
        filename: request.filename?.trim() || undefined,
      },
      {
        workspaceId,
        ...TEAMVER_BFF_REQUEST_OPTIONS,
      },
    ),
  );

  if (response.errorCode) {
    throw new Error(response.errorCode);
  }
  const imported = response.imported ?? [];
  if (imported.length === 0) {
    throw new Error("canvas_import_failed");
  }
  return {
    projectId: response.projectId ?? projectId,
    imported,
  };
}

export function canvasImportedToChatAttachments(
  imported: TeamverDriveImportedAsset[],
): ChatAttachment[] {
  return imported.map((item) => ({
    path: item.path,
    name: item.name,
    kind: "file" as const,
    size: item.sizeBytes,
  }));
}
