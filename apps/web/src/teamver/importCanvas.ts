import type { ChatAttachment } from "@open-design/contracts";
import { NetworkError } from "@teamver/app-sdk";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  shouldSkipTeamverBffAuthCalls,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";
import { requireActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";
import { formatTeamverEmbedAuthRequiredMessage } from "./teamverBffAuthError";
import type { TeamverDriveImportedAsset } from "./importDriveAssets";
import { extractMainSsoGateCodeFromError, isMainSsoUserMismatchError } from "./teamverMainSsoGate";
import { beginMainSsoMismatchRecovery } from "./mainSsoMismatchRecovery";

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

/** Prefer stable BFF `error.code` / `error.message` / Drive-shaped `detail` over raw "HTTP 403". */
export function extractCanvasImportErrorCode(err: unknown): string {
  // Main SSO gate — AuthenticationError often has message "HTTP 401" with the
  // real token only in responseBody (same shape as Drive / publish).
  const mainSso = extractMainSsoGateCodeFromError(err);
  if (mainSso) return mainSso;

  const body =
    err && typeof err === "object"
      ? (err as { responseBody?: unknown }).responseBody
      : null;
  const status =
    err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : null;

  if (body && typeof body === "object") {
    const nested = (body as { error?: { message?: string; code?: string } }).error;
    const message = nested?.message?.trim();
    if (message && isStableCanvasImportToken(message)) {
      return message;
    }
    const code = nested?.code?.trim();
    if (code && isStableCanvasImportToken(code)) {
      return code;
    }
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string" && isStableCanvasImportToken(detail.trim())) {
      return detail.trim();
    }
  }

  // Bare 401 without Main SSO token → treat as Design session expiry.
  // Do not map to canvas_export_forbidden (wrong "no access" copy).
  if (status === 401) return "session_expired";
  if (status === 403) return "canvas_export_forbidden";
  if (status === 404) return "canvas_export_not_found";
  if (status === 413) return "canvas_export_too_large";
  if (status === 429) return "canvas_import_busy";
  if (status === 504) return "canvas_export_timeout";
  if (status != null && status >= 500) {
    if (body && typeof body === "object") {
      const nested = (body as { error?: { message?: string } }).error;
      const message = nested?.message?.trim();
      if (message && isStableCanvasImportToken(message)) return message;
    }
    return "canvas_export_failed";
  }

  if (body && typeof body === "object") {
    const nested = (body as { error?: { message?: string } }).error;
    const message = nested?.message?.trim();
    if (message) return message;
  }

  if (err instanceof NetworkError || err instanceof Error) {
    const fallback = err.message.trim();
    if (fallback && !/^HTTP\s+\d+/i.test(fallback)) return fallback;
    if (err instanceof NetworkError) return "canvas_import_failed";
    return err.message;
  }
  return String(err);
}

function isStableCanvasImportToken(value: string): boolean {
  return (
    value.startsWith("canvas_")
    || value.startsWith("teamver_")
    || value.startsWith("od_daemon_")
    || value === "session_expired"
    || value === "main_sso_required"
    || value === "main_sso_user_mismatch"
  );
}

/** Korean / code messages for Canvas T2 import (align with Drive import UX). */
export function formatCanvasImportErrorForUser(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "캔버스를 가져오지 못했습니다 — 잠시 후 다시 시도하세요.";

  const exact: Record<string, string> = {
    teamver_workspace_required: "Teamver 작업공간을 먼저 선택한 뒤 다시 시도하세요.",
    teamver_design_client_unavailable:
      "teamver Design을 불러오는 중입니다 — 새로고침 후 다시 시도하세요.",
    session_expired: formatTeamverEmbedAuthRequiredMessage(
      "로그인이 만료되었습니다. 다시 로그인한 뒤 시도하세요.",
      "연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
    ),
    main_sso_required:
      "Teamver 로그인 세션이 만료되었습니다 — teamver.com에서 다시 로그인한 뒤 시도하세요.",
    main_sso_user_mismatch: formatTeamverEmbedAuthRequiredMessage(
      "연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
      "연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
    ),
    canvas_import_failed: "캔버스를 가져오지 못했습니다 — 잠시 후 다시 시도하세요.",
    canvas_import_busy: "지금 가져오기 요청이 많습니다 — 잠시 후 다시 시도하세요.",
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
  if (trimmed.startsWith("od_daemon_")) return exact.od_daemon_import_failed!;
  if (/^HTTP\s+401$/i.test(trimmed)) return exact.session_expired!;
  if (/^HTTP\s+403$/i.test(trimmed)) return exact.canvas_export_forbidden!;
  if (/^HTTP\s+404$/i.test(trimmed)) return exact.canvas_export_not_found!;
  if (/^HTTP\s+429$/i.test(trimmed)) return exact.canvas_import_busy!;
  if (/^HTTP\s+504$/i.test(trimmed)) return exact.canvas_export_timeout!;
  return trimmed;
}

export function formatTeamverCanvasImportErrorMessage(err: unknown): string {
  return formatCanvasImportErrorForUser(extractCanvasImportErrorCode(err));
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
  if (shouldSkipTeamverBffAuthCalls()) {
    throw new Error("session_expired");
  }

  const workspaceId = await requireActiveTeamverWorkspaceId();
  const sessionId = request.sessionId.trim();
  const artifactId = request.artifactId.trim();
  if (!sessionId) throw new Error("canvas_session_required");
  if (!artifactId) throw new Error("canvas_artifact_required");

  await assertTeamverDesignAppEnabled(workspaceId);

  try {
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
    const project = response.projectId?.trim() || projectId;
    const imported = response.imported ?? [];
    if (imported.length === 0) {
      throw new Error(response.errorCode?.trim() || "canvas_import_failed");
    }
    return { projectId: project, imported };
  } catch (err) {
    if (isMainSsoUserMismatchError(err)) void beginMainSsoMismatchRecovery();
    throw err;
  }
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
