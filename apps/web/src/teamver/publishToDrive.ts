import { NetworkError } from "@teamver/app-sdk";
import { getDesignBffClient } from "./designBffClient";
import { readTeamverViteEnv } from "./teamverViteEnv";

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
  publishStatus: "ready" | "failed";
  errorCode?: string | null;
};

export type TeamverPublishDriveResult = {
  projectId: string;
  outputs: TeamverPublishDriveOutput[];
  partial: boolean;
};

type PublishResponse = {
  projectId?: string;
  project_id?: string;
  outputs?: Array<{
    id?: string | null;
    kind: string;
    driveAssetId?: string | null;
    drive_asset_id?: string | null;
    filename?: string | null;
    sizeBytes?: number | null;
    size_bytes?: number | null;
    mimeType?: string | null;
    mime_type?: string | null;
    publishStatus?: string | null;
    publish_status?: string | null;
    errorCode?: string | null;
    error_code?: string | null;
  }>;
};

function normalizeOutput(raw: NonNullable<PublishResponse["outputs"]>[number]): TeamverPublishDriveOutput {
  const publishStatus = (raw.publishStatus ?? raw.publish_status ?? "ready").toLowerCase();
  const status: "ready" | "failed" = publishStatus === "failed" ? "failed" : "ready";
  return {
    id: raw.id ?? "",
    kind: raw.kind,
    driveAssetId: raw.driveAssetId ?? raw.drive_asset_id ?? "",
    filename: raw.filename ?? raw.kind,
    sizeBytes: raw.sizeBytes ?? raw.size_bytes ?? 0,
    mimeType: raw.mimeType ?? raw.mime_type ?? "application/octet-stream",
    publishStatus: status,
    errorCode: raw.errorCode ?? raw.error_code ?? null,
  };
}

export function pickReadyPublishOutputs(outputs: TeamverPublishDriveOutput[]): TeamverPublishDriveOutput[] {
  return outputs.filter((output) => output.publishStatus === "ready" && output.driveAssetId.trim() !== "");
}

function resolveDefaultPublishFolderId(): string | null {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_DRIVE_PUBLISH_FOLDER_ID");
  return fromEnv?.trim() || null;
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
    folderId: params.folderId ?? resolveDefaultPublishFolderId(),
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
  const ready = pickReadyPublishOutputs(outputs);
  if (ready.length === 0 && outputs.some((output) => output.publishStatus === "failed")) {
    const firstFailed = outputs.find((output) => output.publishStatus === "failed");
    throw new Error(firstFailed?.errorCode ?? "publish_failed");
  }
  return {
    projectId: response.projectId ?? response.project_id ?? params.projectId,
    outputs: ready.length > 0 ? ready : outputs,
    partial: outputs.some((output) => output.publishStatus === "failed"),
  };
}

export function isRetryablePublishError(err: unknown): boolean {
  return err instanceof NetworkError && ((err.status ?? 0) >= 500 || err.status === 429);
}
