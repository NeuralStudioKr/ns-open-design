import { isTeamverEmbedMode } from "./designApiBase";
import { formatTeamverEmbedOperationFailureMessage, formatTeamverEmbedAuthRequiredMessage } from "./teamverBffAuthError";
import { TeamverDaemonUnauthorizedError } from "./teamverDaemonHeaders";
import type { UploadProjectFilesResult } from "../providers/registry";

const UPLOAD_AUTH_LOGOUT =
  "로그인 세션이 만료되어 파일을 업로드하지 못했습니다. 다시 로그인한 뒤 시도하세요.";
const UPLOAD_AUTH_TRANSIENT =
  "파일 업로드 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.";

/** Map upload API error strings (including daemon 401 copy) for embed UI. */
export function formatProjectUploadFailureDetail(
  error: string | undefined,
): string | undefined {
  const raw = error?.trim();
  if (!raw) return undefined;
  if (!isTeamverEmbedMode()) return raw;
  const err =
    raw === "teamver_daemon_unauthorized" || /\b401\b/.test(raw)
      ? new TeamverDaemonUnauthorizedError()
      : new Error(raw);
  return formatTeamverEmbedOperationFailureMessage(err, raw, {
    logoutMessage: UPLOAD_AUTH_LOGOUT,
    transientMessage: UPLOAD_AUTH_TRANSIENT,
  });
}

export function resolveProjectUploadBatchErrorMessage(options: {
  uploadedCount: number;
  failedCount: number;
  error?: string;
  /** Teamver slide-only embed — always Korean, omit raw English tails unless auth. */
  slideOnlyMvp?: boolean;
}): string {
  const { uploadedCount, failedCount, error, slideOnlyMvp } = options;
  const formattedError = formatProjectUploadFailureDetail(error);
  const authSpecific = Boolean(
    formattedError
    && formattedError !== error?.trim()
    && (formattedError.includes("연결") || formattedError.includes("로그인")),
  );

  if (slideOnlyMvp || isTeamverEmbedMode()) {
    const prefix =
      uploadedCount > 0
        ? `${uploadedCount}개 파일을 첨부했지만 ${failedCount}개는 실패했습니다.`
        : `파일 ${failedCount}개 첨부에 실패했습니다.`;
    if (authSpecific && formattedError) {
      return uploadedCount > 0 ? `${prefix} ${formattedError}` : formattedError;
    }
    return prefix;
  }

  const detail = formattedError ? ` (${formattedError})` : "";
  return uploadedCount > 0
    ? `Attached ${uploadedCount} file(s), but ${failedCount} failed${detail}.`
    : `Attachment upload failed for ${failedCount} file(s)${detail}.`;
}

export function formatProjectFileManagerUploadError(options: {
  pickedCount: number;
  uploadedCount: number;
  failedCount: number;
  error?: string;
}): string {
  const formattedError = formatProjectUploadFailureDetail(options.error);
  if (isTeamverEmbedMode()) {
    const prefix =
      options.uploadedCount > 0
        ? `${options.uploadedCount}개 파일을 업로드했지만 ${options.failedCount}개는 실패했습니다.`
        : `파일 ${options.failedCount}개 업로드에 실패했습니다.`;
    if (formattedError && (formattedError.includes("연결") || formattedError.includes("로그인"))) {
      return options.uploadedCount > 0 ? `${prefix} ${formattedError}` : formattedError;
    }
    return prefix;
  }
  const detail = formattedError ? ` (${formattedError})` : "";
  return options.uploadedCount > 0
    ? `Uploaded ${options.uploadedCount} file(s), but ${options.failedCount} failed${detail}.`
    : `Upload failed for ${options.failedCount} file(s)${detail}.`;
}

export function formatProjectRenameErrorForUser(err: unknown): string {
  if (!isTeamverEmbedMode()) {
    return err instanceof Error ? err.message : String(err);
  }
  return formatTeamverEmbedOperationFailureMessage(
    err,
    "파일 이름을 변경하지 못했습니다. 잠시 후 다시 시도하세요.",
    {
      logoutMessage:
        "로그인 세션이 만료되어 파일 이름을 변경하지 못했습니다. 다시 로그인한 뒤 시도하세요.",
      transientMessage:
        "파일 이름 변경 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
    },
  );
}

/** Preview/board comment image uploads must complete before persisting or queuing. */
export function throwIfProjectCommentUploadIncomplete(
  result: UploadProjectFilesResult,
  expectedCount: number,
): void {
  if (result.uploaded.length >= expectedCount) return;
  const failedCount = Math.max(expectedCount - result.uploaded.length, result.failed.length);
  throw new Error(
    resolveProjectUploadBatchErrorMessage({
      uploadedCount: result.uploaded.length,
      failedCount,
      error: result.error,
      slideOnlyMvp: isTeamverEmbedMode(),
    }),
  );
}

/** User-facing deploy modal errors in Teamver embed (daemon 401 or generic). */
export function formatProjectDeployErrorForUser(err: unknown, fallback: string): string {
  if (!isTeamverEmbedMode()) {
    return err instanceof Error ? err.message : fallback;
  }
  const normalizedErr =
    err instanceof Error
    && (err.message === "teamver_daemon_unauthorized" || /\b401\b/.test(err.message))
      ? new TeamverDaemonUnauthorizedError()
      : err;
  return formatTeamverEmbedOperationFailureMessage(normalizedErr, fallback, {
    logoutMessage:
      "로그인 세션이 만료되어 배포를 진행하지 못했습니다. 다시 로그인한 뒤 시도하세요.",
    transientMessage:
      "배포 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
  });
}

/** Passive-auth companion when mutating save APIs return null/false without detail. */
export function formatProjectPassiveSaveFailureForUser(
  actionLabel: string,
): string {
  if (!isTeamverEmbedMode()) {
    return `${actionLabel} failed.`;
  }
  const logoutMessage =
    `로그인 세션이 만료되어 ${actionLabel}에 실패했습니다. 다시 로그인한 뒤 시도하세요.`;
  const transientMessage =
    `${actionLabel} 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.`;
  return formatTeamverEmbedAuthRequiredMessage(logoutMessage, transientMessage);
}

/** Passive-auth companion copy when file delete returns false in embed. */
export function formatProjectDeleteFailureForUser(failedCount = 1): string {
  if (!isTeamverEmbedMode()) {
    return failedCount > 1
      ? `Could not delete ${failedCount} file(s).`
      : "Could not delete file.";
  }
  const logoutMessage =
    failedCount > 1
      ? `로그인 세션이 만료되어 ${failedCount}개 파일을 삭제하지 못했습니다. 다시 로그인한 뒤 시도하세요.`
      : "로그인 세션이 만료되어 파일을 삭제하지 못했습니다. 다시 로그인한 뒤 시도하세요.";
  const transientMessage = "파일 삭제 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.";
  return formatTeamverEmbedAuthRequiredMessage(logoutMessage, transientMessage);
}

/** Image export modal errors — prefer auth-aware Korean copy in embed. */
export function formatProjectImageExportErrorForUser(
  detail: string | null | undefined,
  fallback: string,
): string {
  if (!isTeamverEmbedMode()) {
    return detail ? `${fallback}\n(${detail})` : fallback;
  }
  if (detail && (detail.includes("연결") || detail.includes("로그인"))) {
    return detail;
  }
  const normalizedErr =
    detail && (detail === "teamver_daemon_unauthorized" || /\b401\b/.test(detail))
      ? new TeamverDaemonUnauthorizedError()
      : detail
        ? new Error(detail)
        : null;
  return formatTeamverEmbedOperationFailureMessage(normalizedErr ?? fallback, fallback, {
    logoutMessage:
      "로그인 세션이 만료되어 이미지 내보내기에 실패했습니다. 다시 로그인한 뒤 시도하세요.",
    transientMessage:
      "이미지 내보내기 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.",
  });
}
