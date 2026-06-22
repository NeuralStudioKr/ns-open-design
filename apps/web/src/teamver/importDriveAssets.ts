import type { ChatAttachment } from "@open-design/contracts";
import { getDesignBffClient } from "./designBffClient";
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
  t: (key: string) => string,
): string {
  const key = `teamver.driveImport.error.${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
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

  const workspaceId = await client.workspaceStore?.get();
  if (!workspaceId?.trim()) {
    throw new Error("teamver_workspace_required");
  }
  if (assets.length === 0) {
    throw new Error("drive_import_assets_required");
  }
  if (assets.length > 12) {
    throw new Error("drive_import_too_many_assets");
  }

  await assertTeamverDesignAppEnabled(workspaceId.trim());

  const response = await client.http.post<DriveImportResponse>(
    `/projects/${encodeURIComponent(projectId)}/import-drive`,
    { assets },
    {
      workspaceId: workspaceId.trim(),
      skipAuthHeader: true,
    },
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
