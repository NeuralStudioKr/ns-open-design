import { NetworkError } from "@teamver/app-sdk";
import { getDesignBffClient } from "./designBffClient";
import { readTeamverViteEnv } from "./teamverViteEnv";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";

export type TeamverPublishDriveParams = {
  projectId: string;
  formats?: Array<"html" | "zip">;
  artifactFile?: string;
  folderId?: string | null;
  sharedDriveId?: string | null;
};

export type TeamverPublishDriveOutput = {
  id: string;
  kind: string;
  driveAssetId: string;
  driveFolderId?: string | null;
  driveSharedDriveId?: string | null;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  publishStatus: "ready" | "failed";
  errorCode?: string | null;
  publishedAt?: string | null;
};

type PublishOutputRaw = {
  id?: string | null;
  kind: string;
  driveAssetId?: string | null;
  driveFolderId?: string | null;
  driveSharedDriveId?: string | null;
  filename?: string | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
  publishStatus?: string | null;
  errorCode?: string | null;
  publishedAt?: string | null;
};

export type TeamverPublishDriveResult = {
  projectId: string;
  outputs: TeamverPublishDriveOutput[];
  partial: boolean;
};

type PublishResponse = {
  projectId?: string;
  outputs?: PublishOutputRaw[];
};

export function normalizePublishOutput(raw: PublishOutputRaw): TeamverPublishDriveOutput {
  const publishStatus = (raw.publishStatus ?? "ready").toLowerCase();
  const status: "ready" | "failed" = publishStatus === "failed" ? "failed" : "ready";
  return {
    id: raw.id ?? "",
    kind: raw.kind,
    driveAssetId: raw.driveAssetId ?? "",
    driveFolderId: raw.driveFolderId ?? null,
    driveSharedDriveId: raw.driveSharedDriveId ?? null,
    filename: raw.filename ?? raw.kind,
    sizeBytes: raw.sizeBytes ?? 0,
    mimeType: raw.mimeType ?? "application/octet-stream",
    publishStatus: status,
    errorCode: raw.errorCode ?? null,
    publishedAt: raw.publishedAt ?? null,
  };
}

export function pickReadyPublishOutputs(outputs: TeamverPublishDriveOutput[]): TeamverPublishDriveOutput[] {
  return outputs.filter((output) => output.publishStatus === "ready" && output.driveAssetId.trim() !== "");
}

export function buildPublishResultFromResponse(
  response: PublishResponse,
  fallbackProjectId: string,
): TeamverPublishDriveResult {
  const outputs = (response.outputs ?? []).map(normalizePublishOutput);
  const ready = pickReadyPublishOutputs(outputs);
  return {
    projectId: response.projectId ?? fallbackProjectId,
    outputs: ready.length > 0 ? ready : outputs,
    partial: outputs.some((output) => output.publishStatus === "failed"),
  };
}

/** design-api may return structured 502 JSON — parse per-output error codes from SDK NetworkError. */
export function parsePublishFailureFromError(err: unknown): TeamverPublishDriveResult | null {
  if (!(err instanceof NetworkError) || err.status !== 502) return null;
  const body = err.responseBody;
  if (!body || typeof body !== "object") return null;
  const raw = body as PublishResponse;
  if (!Array.isArray(raw.outputs) || raw.outputs.length === 0) return null;
  return buildPublishResultFromResponse(raw, "");
}

export function resolvePublishErrorCode(result: TeamverPublishDriveResult): string {
  const failed = result.outputs.find((output) => output.publishStatus === "failed");
  return failed?.errorCode ?? "publish_failed";
}

/** User-facing design-api error detail (502 publish body, Error.message, or fallback). */
export function formatTeamverDesignErrorMessage(
  err: unknown,
  fallback = "Check your session and try again.",
): string {
  const from502 = parsePublishFailureFromError(err);
  if (from502) return resolvePublishErrorCode(from502);
  if (err instanceof Error) {
    const message = err.message.trim();
    if (message && message !== "publish_failed") return message;
  }
  return fallback;
}

/** @deprecated alias — use formatTeamverDesignErrorMessage */
export function formatPublishErrorMessage(err: unknown): string {
  return formatTeamverDesignErrorMessage(err);
}

function resolveDefaultPublishFolderId(): string | null {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_DRIVE_PUBLISH_FOLDER_ID");
  return fromEnv?.trim() || null;
}

function resolveDefaultPublishSharedDriveId(): string | null {
  const fromEnv = readTeamverViteEnv("VITE_TEAMVER_DRIVE_PUBLISH_SHARED_DRIVE_ID");
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

  await assertTeamverDesignAppEnabled(workspaceId.trim());

  const formats = params.formats?.length ? params.formats : ["html"];
  const body = {
    formats,
    artifactFile: params.artifactFile,
    folderId: params.folderId ?? resolveDefaultPublishFolderId(),
    sharedDriveId: params.sharedDriveId ?? resolveDefaultPublishSharedDriveId(),
  };

  try {
    const response = await client.http.post<PublishResponse>(
      `/projects/${encodeURIComponent(params.projectId)}/publish`,
      body,
      {
        workspaceId: workspaceId.trim(),
        skipAuthHeader: true,
      },
    );

    const result = buildPublishResultFromResponse(response, params.projectId);
    if (
      result.outputs.length > 0
      && pickReadyPublishOutputs(result.outputs).length === 0
      && result.outputs.some((output) => output.publishStatus === "failed")
    ) {
      throw new Error(resolvePublishErrorCode(result));
    }
    return result;
  } catch (err) {
    const failed = parsePublishFailureFromError(err);
    if (failed) {
      throw new Error(resolvePublishErrorCode(failed));
    }
    throw err;
  }
}

export function isRetryablePublishError(err: unknown): boolean {
  return err instanceof NetworkError && ((err.status ?? 0) >= 500 || err.status === 429);
}
