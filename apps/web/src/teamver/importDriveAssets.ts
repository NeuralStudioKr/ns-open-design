import type { ChatAttachment } from "@open-design/contracts";
import type { Dict } from "../i18n/types";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";
import { requireActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";

export type TeamverDriveImportAsset = {
  assetId: string;
  filename?: string;
  destPath?: string;
  mimeType?: string;
};

export type TeamverDriveImportedAsset = {
  assetId: string;
  path: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
};

export type TeamverDriveImportPartialFailure = {
  asset: TeamverDriveImportAsset;
  errorCode: string;
};

export type TeamverDriveImportPartialResult = {
  importedCount: number;
  failures: TeamverDriveImportPartialFailure[];
};

export function formatDriveImportErrorCode(
  code: string,
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string,
): string {
  const key = `teamver.driveImport.error.${code}` as keyof Dict;
  const translated = t(key);
  return translated === key ? code : translated;
}

/** Korean user-facing Drive import errors for embed (no i18n Dict extension). */
export function formatDriveImportErrorForUser(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "Drive 가져오기에 실패했습니다 — 세션을 확인하고 다시 시도하세요.";

  const exact: Record<string, string> = {
    teamver_workspace_required: "Teamver 작업공간을 먼저 선택한 뒤 다시 시도하세요.",
    teamver_design_client_unavailable:
      "Teamver Design을 불러오는 중입니다 — 새로고침 후 다시 시도하세요.",
    drive_import_failed: "Drive 가져오기에 실패했습니다 — 세션을 확인하고 다시 시도하세요.",
    drive_import_assets_required: "가져올 Drive 파일을 선택하세요.",
    drive_import_too_many_assets: "한 번에 가져올 수 있는 Drive 파일은 12개까지입니다.",
    unsupported_drive_import_file_type: "슬라이드 첨부에 지원하지 않는 파일 형식입니다.",
    drive_download_failed: "Teamver Drive에서 다운로드할 수 없습니다.",
    od_daemon_import_failed: "Design 프로젝트에 저장할 수 없습니다.",
    invalid_filename: "파일 이름이 올바르지 않습니다.",
  };
  if (exact[trimmed]) return exact[trimmed];

  if (trimmed.startsWith("teamver_drive_fetch_failed:401") || trimmed.startsWith("teamver_drive_fetch_failed:403")) {
    return "Drive 세션이 만료되었습니다 — Teamver에 다시 로그인한 뒤 다시 시도하세요.";
  }
  if (trimmed.startsWith("teamver_drive_fetch_failed:")) {
    return "드라이브 파일 목록을 불러오지 못했습니다.";
  }

  return trimmed;
}

export function formatTeamverDriveImportErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return formatDriveImportErrorForUser(err.message);
  }
  return formatDriveImportErrorForUser(String(err));
}

export type TeamverDriveImportFailure = {
  assetId: string;
  errorCode: string;
};

export type TeamverDriveImportResult = {
  projectId: string;
  imported: TeamverDriveImportedAsset[];
  failed: TeamverDriveImportFailure[];
  partial: boolean;
};

type DriveImportResponse = {
  projectId?: string;
  imported?: TeamverDriveImportedAsset[];
  failed?: TeamverDriveImportFailure[];
};

function normalizeDriveImportResponse(
  response: DriveImportResponse,
  fallbackProjectId: string,
): TeamverDriveImportResult {
  const imported = response.imported ?? [];
  const failed = response.failed ?? [];
  return {
    projectId: response.projectId ?? fallbackProjectId,
    imported,
    failed,
    partial: imported.length > 0 && failed.length > 0,
  };
}

export async function importTeamverDriveAssets(
  projectId: string,
  assets: TeamverDriveImportAsset[],
): Promise<TeamverDriveImportResult> {
  const client = getDesignBffClient();
  if (!client) {
    throw new Error("teamver_design_client_unavailable");
  }

  const workspaceId = await requireActiveTeamverWorkspaceId();
  if (assets.length === 0) {
    throw new Error("drive_import_assets_required");
  }
  if (assets.length > 12) {
    throw new Error("drive_import_too_many_assets");
  }

  await assertTeamverDesignAppEnabled(workspaceId);

  const response = await withDesignBffCookieAuthRecovery(() =>
    client.http.post<DriveImportResponse>(
      `/projects/${encodeURIComponent(projectId)}/import-drive`,
      { assets },
      {
        workspaceId,
        ...TEAMVER_BFF_REQUEST_OPTIONS,
      },
    ),
  );
  const result = normalizeDriveImportResponse(response, projectId);
  if (result.imported.length === 0 && result.failed.length > 0) {
    throw new Error(result.failed[0]?.errorCode ?? "drive_import_failed");
  }
  return result;
}

export function driveImportToAttachmentPath(imported: TeamverDriveImportedAsset): string {
  return imported.path;
}

function attachmentKindFromMime(mimeType: string): ChatAttachment["kind"] {
  return mimeType.toLowerCase().startsWith("image/") ? "image" : "file";
}

export function driveImportedToChatAttachments(
  imported: TeamverDriveImportedAsset[],
): ChatAttachment[] {
  return imported.map((item) => ({
    path: item.path,
    name: item.name,
    kind: attachmentKindFromMime(item.mimeType || ""),
    size: item.sizeBytes,
    source: {
      type: "teamver-drive",
      assetId: item.assetId,
    },
  }));
}
