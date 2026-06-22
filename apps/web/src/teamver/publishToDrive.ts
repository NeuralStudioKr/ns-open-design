import { NetworkError } from "@teamver/app-sdk";
import { getDesignBffClient } from "./designBffClient";
import { readTeamverViteEnv } from "./teamverViteEnv";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";

/**
 * loop 173 — Wire format selection through publishToDrive. Keeping the union
 * narrow (vs. `string`) lets the UI surface a single source of truth for
 * supported formats. PDF is deliberately absent: see
 * `TeamverPublishDriveMenuItem` for the backend constraint.
 */
export type TeamverPublishDriveFormat = "html" | "zip";

export type TeamverPublishDriveParams = {
  projectId: string;
  formats?: Array<TeamverPublishDriveFormat>;
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

/** Ready rows sorted newest-first (matches design-api `published_at DESC`). */
export function sortReadyPublishOutputsDesc(
  outputs: TeamverPublishDriveOutput[],
): TeamverPublishDriveOutput[] {
  return pickReadyPublishOutputs(outputs).sort((a, b) => {
    const aMs = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const bMs = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (bMs !== aMs) return bMs - aMs;
    return b.id.localeCompare(a.id);
  });
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

/**
 * loop 180 — Map loop-177 phase-tagged publish error codes to short user-facing
 * hints shown in FileViewer toasts. Raw codes are kept as fallback for unknown
 * operator-only cases.
 *
 * loop 173 — Copy is Korean to match the embed surface (Teamver tenants are
 * Korean-default). Raw codes still drop through for operator-only debugging.
 */
export function formatPublishErrorCodeForUser(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "발행에 실패했습니다 — 세션을 확인하고 다시 시도하세요.";

  const exact: Record<string, string> = {
    teamver_workspace_required: "Teamver 작업공간을 먼저 선택한 뒤 다시 시도하세요.",
    teamver_design_client_unavailable: "Teamver Design을 불러오는 중입니다 — 새로고침 후 다시 시도하세요.",
    artifact_file_required: "편집기에서 슬라이드 파일을 연 뒤 다시 발행하세요.",
    od_daemon_export_failed: "프로젝트를 내보낼 수 없습니다 — 작업을 저장한 뒤 다시 시도하세요.",
    publish_failed: "발행에 실패했습니다 — 세션을 확인하고 다시 시도하세요.",
    publish_all_failed: "발행에 실패했습니다 — 세션을 확인하고 다시 시도하세요.",
    teamver_workspace_pending: "Teamver 작업공간 연결 중입니다 — 잠시 후 다시 시도하세요.",
    drive_publish_targets_failed: "Drive 폴더 목록을 불러오지 못했습니다 — 찾아보기 또는 다시 시도하세요.",
  };
  if (exact[trimmed]) return exact[trimmed];

  if (trimmed.startsWith("drive_upload_failed_403")) {
    return "Drive 세션이 만료되었습니다 — Teamver에 다시 로그인한 뒤 발행을 재시도하세요.";
  }
  if (trimmed.startsWith("drive_upload_failed_")) {
    return "Teamver 드라이브가 업로드를 거부했습니다 — 폴더 권한을 확인하거나 다른 위치를 선택하세요.";
  }
  if (trimmed.startsWith("drive_presigned_put_failed_")) {
    return "Drive 저장소 업로드에 실패했습니다 — 잠시 후 다시 시도하세요.";
  }
  if (trimmed.startsWith("drive_confirm_failed_") || trimmed.startsWith("drive.confirm")) {
    return "Drive가 업로드를 완료하지 못했습니다 — 재시도하거나 다른 폴더를 선택하세요.";
  }

  return trimmed;
}

/** User-facing design-api error detail (502 publish body, Error.message, or fallback). */
export function formatTeamverDesignErrorMessage(
  err: unknown,
  fallback = "세션을 확인하고 다시 시도하세요.",
): string {
  const from502 = parsePublishFailureFromError(err);
  if (from502) return formatPublishErrorCodeForUser(resolvePublishErrorCode(from502));
  if (err instanceof Error) {
    const message = err.message.trim();
    if (message && message !== "publish_failed") {
      return formatPublishErrorCodeForUser(message);
    }
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
