import { NetworkError } from "@teamver/app-sdk";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";
import { formatTeamverEmbedAuthRequiredMessage } from "./teamverBffAuthError";
import { readTeamverViteEnv } from "./teamverViteEnv";
import { requireActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";
import { assertTeamverDesignAppEnabled } from "./teamverDesignAccess";

/**
 * Teamver embed is slide-only: Drive publish sends deck PDF, inline HTML,
 * and/or PPTX. ZIP remains a local 다운로드 path.
 */
export type TeamverPublishDriveFormat = "html" | "pdf" | "pptx";

export type TeamverPublishDriveParams = {
  projectId: string;
  formats?: Array<TeamverPublishDriveFormat>;
  artifactFile?: string;
  folderId?: string | null;
  sharedDriveId?: string | null;
  deck?: boolean;
  title?: string;
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
    outputs,
    partial: outputs.some((output) => output.publishStatus === "failed") && ready.length > 0,
  };
}

/** design-api may return structured 502 JSON — parse per-output error codes from SDK NetworkError. */
export function parsePublishFailureFromError(err: unknown): TeamverPublishDriveResult | null {
  if (!(err instanceof NetworkError) || err.status !== 502) return null;
  const body = err.responseBody;
  if (!body || typeof body !== "object") return null;
  const raw = body as PublishResponse & { error?: { message?: string } };
  if (Array.isArray(raw.outputs) && raw.outputs.length > 0) {
    return buildPublishResultFromResponse(raw, "");
  }
  const legacyMessage = raw.error?.message?.trim();
  if (legacyMessage && legacyMessage !== "publish_all_failed") {
    return {
      projectId: "",
      outputs: [{ id: "", kind: "", driveAssetId: "", filename: "", sizeBytes: 0, mimeType: "", publishStatus: "failed", errorCode: legacyMessage }],
      partial: false,
    };
  }
  return null;
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
    teamver_design_client_unavailable: "teamver Design을 불러오는 중입니다 — 새로고침 후 다시 시도하세요.",
    artifact_file_required: "편집기에서 슬라이드 파일을 연 뒤 다시 발행하세요.",
    od_daemon_export_failed: "프로젝트를 내보낼 수 없습니다 — 작업을 저장한 뒤 다시 시도하세요.",
    publish_failed: "발행에 실패했습니다 — 세션을 확인하고 다시 시도하세요.",
    publish_all_failed: "발행에 실패했습니다 — 세션을 확인하고 다시 시도하세요.",
    teamver_workspace_pending: "Teamver 작업공간 연결 중입니다 — 기본 위치로 발행됩니다.",
    drive_publish_targets_failed: "Drive 폴더 목록을 불러오지 못했습니다 — 찾아보기 또는 다시 시도하세요.",
    outputs_fetch_failed: "Drive 발행 이력을 불러오지 못했습니다 — 잠시 후 다시 시도하세요.",
    // Main HS256 SSO expired — parent-domain re-login is the only recovery.
    teamver_drive_main_sso_required:
      "Teamver 로그인 세션이 만료되었습니다 — teamver.com에서 다시 로그인한 뒤 발행을 재시도하세요.",
    main_sso_required:
      "Teamver 로그인 세션이 만료되었습니다 — teamver.com에서 다시 로그인한 뒤 발행을 재시도하세요.",
    teamver_drive_main_sso_user_mismatch:
      "Teamver Main 로그인 계정과 Design 세션 계정이 다릅니다 — 같은 계정으로 teamver.com에서 다시 로그인한 뒤 발행하세요.",
    main_sso_user_mismatch:
      "Teamver Main 로그인 계정과 Design 세션 계정이 다릅니다 — 같은 계정으로 teamver.com에서 다시 로그인한 뒤 발행하세요.",
  };
  if (exact[trimmed]) return exact[trimmed];

  if (trimmed.startsWith("drive_upload_failed_403")) {
    return "이 작업공간의 Drive에 발행할 권한이 없습니다 — 다른 작업공간을 선택하거나 폴더 권한을 확인하세요.";
  }
  if (trimmed.startsWith("drive_upload_failed_401")) {
    return formatTeamverEmbedAuthRequiredMessage(
      "Drive 세션이 만료되었습니다 — Teamver에 다시 로그인한 뒤 발행을 재시도하세요.",
      "Drive 연결을 확인하지 못했습니다 — 잠시 후 발행을 다시 시도하세요.",
    );
  }
  if (
    trimmed.startsWith("drive_upload_request_failed_")
    && /invalid[\s_]?token/i.test(trimmed)
  ) {
    return formatTeamverEmbedAuthRequiredMessage(
      "Drive 세션이 만료되었습니다 — Teamver에 다시 로그인한 뒤 발행을 재시도하세요.",
      "Drive 연결을 확인하지 못했습니다 — 잠시 후 발행을 다시 시도하세요.",
    );
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

  const workspaceId = await requireActiveTeamverWorkspaceId();

  await assertTeamverDesignAppEnabled(workspaceId);

  const formats = params.formats?.length ? params.formats : ["html"];
  const body = {
    formats,
    artifactFile: params.artifactFile,
    folderId: params.folderId ?? resolveDefaultPublishFolderId(),
    sharedDriveId: params.sharedDriveId ?? resolveDefaultPublishSharedDriveId(),
    ...(params.deck === true ? { deck: true } : {}),
    ...(params.title?.trim() ? { title: params.title.trim() } : {}),
  };

  try {
    const response = await withDesignBffCookieAuthRecovery(() =>
      client.http.post<PublishResponse>(
        `/projects/${encodeURIComponent(params.projectId)}/publish`,
        body,
        {
          workspaceId: workspaceId,
          ...TEAMVER_BFF_REQUEST_OPTIONS,
        },
      ),
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
