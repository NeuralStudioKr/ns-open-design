import { NetworkError } from "@teamver/app-sdk";
import { getDesignBffClient } from "./designBffClient";

export type TeamverPublishDriveParams = {
  projectId: string;
  formats?: Array<"html" | "zip">;
  artifactFile?: string;
  folderId?: string | null;
};

export type TeamverPublishDriveOutput = {
  id: string;
  kind: string;
  driveAssetId: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
};

export type TeamverPublishDriveResult = {
  projectId: string;
  outputs: TeamverPublishDriveOutput[];
};

type PublishResponse = {
  projectId?: string;
  project_id?: string;
  outputs?: Array<{
    id: string;
    kind: string;
    driveAssetId?: string;
    drive_asset_id?: string;
    filename: string;
    sizeBytes?: number;
    size_bytes?: number;
    mimeType?: string;
    mime_type?: string;
  }>;
};

function normalizeOutput(raw: NonNullable<PublishResponse["outputs"]>[number]): TeamverPublishDriveOutput {
  return {
    id: raw.id,
    kind: raw.kind,
    driveAssetId: raw.driveAssetId ?? raw.drive_asset_id ?? "",
    filename: raw.filename,
    sizeBytes: raw.sizeBytes ?? raw.size_bytes ?? 0,
    mimeType: raw.mimeType ?? raw.mime_type ?? "application/octet-stream",
  };
}

export async function publishTeamverDesignToDrive(
  params: TeamverPublishDriveParams,
): Promise<TeamverPublishDriveResult> {
  const client = getDesignBffClient();
  if (!client) {
    throw new Error("teamver_design_client_unavailable");
  }

  const workspaceId = await client.workspaceStore?.get();
  if (!workspaceId?.trim()) {
    throw new Error("teamver_workspace_required");
  }

  const formats = params.formats?.length ? params.formats : ["html"];
  const body = {
    formats,
    artifactFile: params.artifactFile,
    folderId: params.folderId ?? null,
  };

  const response = await client.http.post<PublishResponse>(
    `/projects/${encodeURIComponent(params.projectId)}/publish`,
    body,
    {
      workspaceId: workspaceId.trim(),
      skipAuthHeader: true,
    },
  );

  const outputs = (response.outputs ?? []).map(normalizeOutput);
  return {
    projectId: response.projectId ?? response.project_id ?? params.projectId,
    outputs,
  };
}

export function isRetryablePublishError(err: unknown): boolean {
  return err instanceof NetworkError && ((err.status ?? 0) >= 500 || err.status === 429);
}
