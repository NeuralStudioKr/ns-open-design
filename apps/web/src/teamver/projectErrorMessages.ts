import { isTeamverEmbedMode } from "./designApiBase";
import { isTeamverEmbedSessionAuthenticated } from "./teamverEmbedSession";
import { TeamverDaemonUnauthorizedError } from "./teamverDaemonHeaders";

/**
 * Teamver-tone Korean fallbacks for ProjectView conversation lifecycle errors.
 * Standalone OD keeps the existing English wording so this helper only
 * affects the embed surface where Teamver brand+language is enforced.
 */

export function formatProjectConversationCreateError(): string {
  return isTeamverEmbedMode()
    ? "슬라이드 프로젝트의 대화를 시작하지 못했습니다."
    : "Could not create a conversation for this project.";
}

export function formatProjectConversationListError(): string {
  return isTeamverEmbedMode()
    ? "슬라이드 프로젝트의 대화 목록을 불러오지 못했습니다."
    : "Could not load conversations for this project.";
}

export function formatProjectMessagesLoadError(): string {
  return isTeamverEmbedMode()
    ? "대화의 메시지를 불러오지 못했습니다."
    : "Could not load messages for this conversation.";
}

export function formatProjectArtifactRejectedError(name: string, reason: string): string {
  const label = name.trim() || "untitled";
  return isTeamverEmbedMode()
    ? `슬라이드 파일 "${label}" 저장을 거부했습니다: ${reason}`
    : `Refused to save artifact "${label}": ${reason}`;
}

/**
 * User-facing artifact save-failed banner. Never mentions "daemon" /
 * "logs" / other developer-only concepts to end users — those cues stay
 * in the underlying error object for ops (accessible via the error
 * diagnostics copy button in ChatPane).
 *
 * ``detail`` 을 받아 원인 code / HTTP status 를 유저 관점 메시지로
 * 매핑한다. 로그의 실 원인 `teamver_project_s3_prefix_required` 는
 * design-api /access 가 403/404 를 준 결과 (workspace/owner 불일치,
 * project 삭제/이관, 미등록) 이므로 여기선 "접근 권한 / 프로젝트 없음"
 * 방향으로 유저가 다음 행동을 결정할 수 있게 안내한다.
 */
export interface ProjectArtifactSaveErrorDetail {
  status?: number;
  code?: string;
  message?: string;
}

const ACCESS_ERROR_CODES = new Set([
  'FORBIDDEN',
  'PROJECT_OWNER_MISMATCH',
  'WORKSPACE_MISMATCH',
  // teamver_project_s3_prefix_required 는 daemon 이 design-api /access
  // 응답을 denied 로 받았을 때 붙이는 마커 문자열이라 code 자리에 그대로
  // 노출될 수 있다.
  'teamver_project_s3_prefix_required',
  'teamver_project_s3_prefix_mismatch',
]);

const NOT_FOUND_ERROR_CODES = new Set([
  'PROJECT_NOT_FOUND',
  'NOT_FOUND',
]);

const UNAUTHORIZED_ERROR_CODES = new Set([
  'UNAUTHORIZED',
  'AUTH_REQUIRED',
]);

const UPSTREAM_ERROR_CODES = new Set([
  'UPSTREAM_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export function formatProjectArtifactSaveFailedError(
  fileName: string,
  detail?: ProjectArtifactSaveErrorDetail,
): string {
  const embed = isTeamverEmbedMode();
  const code = (detail?.code || '').trim();
  const status = detail?.status;
  const rawMessage = (detail?.message || '').toLowerCase();

  if (ACCESS_ERROR_CODES.has(code) || status === 403) {
    return embed
      ? '이 슬라이드 프로젝트에 접근 권한이 없어 저장에 실패했습니다. 워크스페이스가 올바른지 확인하거나 관리자에게 문의하세요.'
      : "You don't have permission to save into this project. Check your workspace or contact an admin.";
  }

  if (NOT_FOUND_ERROR_CODES.has(code) || status === 404) {
    return embed
      ? '이 슬라이드 프로젝트를 찾을 수 없어 저장에 실패했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.'
      : 'This slide project could not be found. Refresh the page and try again.';
  }

  if (UNAUTHORIZED_ERROR_CODES.has(code) || status === 401) {
    if (embed && isTeamverEmbedSessionAuthenticated()) {
      return '저장 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.';
    }
    return embed
      ? '로그인 세션이 만료되어 저장에 실패했습니다. 다시 로그인한 뒤 시도하세요.'
      : 'Your session expired while saving. Sign in again to continue.';
  }

  if (code === 'RATE_LIMITED' || status === 429) {
    return embed
      ? '요청이 너무 많아 저장에 실패했습니다. 잠시 후 다시 시도하세요.'
      : 'Too many requests — please wait a moment and try again.';
  }

  if (
    UPSTREAM_ERROR_CODES.has(code)
    || status === 502
    || status === 503
    || status === 504
  ) {
    return embed
      ? '저장소 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도하세요.'
      : 'The storage service is temporarily unavailable — please retry shortly.';
  }

  // No status → typically a network failure captured by the fetch wrapper
  // (writeProjectTextFileDetailed returns message='Network error…').
  if (!status && rawMessage.includes('network')) {
    return embed
      ? '네트워크 연결 문제로 저장에 실패했습니다. 연결 상태를 확인하고 다시 시도하세요.'
      : 'Network connection was lost while saving. Check your connection and retry.';
  }

  return embed
    ? `슬라이드 파일 "${fileName}" 저장에 실패했습니다. 잠시 후 다시 시도하세요.`
    : `Failed to save "${fileName}". Please try again shortly.`;
}

export function formatProjectArtifactStubWarning(fileName: string, message: string): string {
  return isTeamverEmbedMode()
    ? `"${fileName}"은(는) 저장됐지만 플레이스홀더일 수 있습니다: ${message}`
    : `Saved "${fileName}", but the model may have shipped a placeholder: ${message}`;
}

/** Terminal run finished but no previewable HTML deck landed on disk. */
export function formatProjectRunDeliverableMissingError(): string {
  return isTeamverEmbedMode()
    ? "슬라이드 결과물이 생성되지 않았습니다. 응답이 중간에 끊겼거나 HTML 파일이 저장되지 않았습니다. 이어서 다시 시도하세요."
    : "The slide deliverable was not created. The response may have been cut off — please try again.";
}

/** Resolve structured proxy/daemon error codes when `err.code` was not set. */
export function extractProjectRunErrorCode(err: unknown): string | undefined {
  const direct = err instanceof Error ? (err as Error & { code?: string }).code?.trim() : "";
  if (direct) return direct;
  const message = err instanceof Error ? err.message : String(err);
  const proxyMatch = /^(?:proxy|daemon) \d+: (\S+)/.exec(message);
  if (proxyMatch?.[1]?.trim()) return proxyMatch[1].trim();
  const known =
    /\b(UPSTREAM_UNAVAILABLE|RATE_LIMITED|UNAUTHORIZED|FORBIDDEN|BAD_REQUEST|INTERNAL_ERROR|OVERLOADED_ERROR|PROJECT_STORAGE_UNAVAILABLE|PROJECT_STORAGE_SYNC_FAILED|MANAGED_API_KEY_MISSING|API_KEY_REQUIRED|MANAGED_KEY_UNAVAILABLE)\b/.exec(
      message,
    );
  return known?.[1];
}

/** User-facing run/stream failure — embed avoids raw daemon/SSE English (banner + chat status). */
export function formatProjectRunErrorForUser(err: unknown): string {
  if (!isTeamverEmbedMode()) {
    return err instanceof Error ? err.message : String(err);
  }
  const code = extractProjectRunErrorCode(err);
  if (code === "session_unreachable") {
    return "Teamver 세션 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  if (code === "MANAGED_API_KEY_MISSING" || code === "API_KEY_REQUIRED") {
    return "서버 API 키가 설정되지 않았습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.";
  }
  if (code === "MANAGED_KEY_UNAVAILABLE") {
    // Identity header / managed-mode misconfig — usually recovered by session
    // refresh or ops, not by "close the tab and re-login".
    return "서버 API 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  if (code === "PROJECT_STORAGE_UNAVAILABLE") {
    return "프로젝트 저장소를 준비하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
    return "API 인증에 실패했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.";
  }
  if (code === "RATE_LIMITED") {
    return "요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
  }
  if (code === "UPSTREAM_UNAVAILABLE") {
    return "AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  // Legacy/provider-native codes that predate mid-stream normalization.
  if (
    code === "OVERLOADED_ERROR"
    || code === "OVERLOADED"
    || code === "API_ERROR"
    || code === "SERVER_ERROR"
    || code === "SERVICE_UNAVAILABLE"
  ) {
    return "AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  if (code === "BAD_REQUEST") {
    return "요청을 처리하지 못했습니다. 내용을 확인한 뒤 다시 시도하세요.";
  }
  if (code === "INTERNAL_ERROR") {
    return "실행 중 내부 오류가 발생했습니다. 다시 시도하세요.";
  }
  if (messageImpliesMissingApiKey(err)) {
    return "서버 API 키가 설정되지 않았습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.";
  }
  return "슬라이드 실행 중 오류가 발생했습니다. 다시 시도하세요.";
}

function messageImpliesMissingApiKey(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes("missing api key");
}

/** User-facing conversation lifecycle banner — embed avoids raw API/daemon English. */
export function formatProjectConversationErrorForUser(err: unknown, fallback: string): string {
  if (!isTeamverEmbedMode()) {
    return err instanceof Error ? err.message : fallback;
  }
  if (err instanceof TeamverDaemonUnauthorizedError) {
    return isTeamverEmbedSessionAuthenticated()
      ? "대화 목록을 불러오는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요."
      : "로그인 세션이 만료되어 대화를 불러올 수 없습니다. 다시 로그인한 뒤 시도하세요.";
  }
  if (err instanceof Error && err.message === "teamver_daemon_unauthorized") {
    return isTeamverEmbedSessionAuthenticated()
      ? "대화 목록을 불러오는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요."
      : "로그인 세션이 만료되어 대화를 불러올 수 없습니다. 다시 로그인한 뒤 시도하세요.";
  }
  return fallback;
}

export function formatProjectForkConversationError(): string {
  return isTeamverEmbedMode()
    ? "대화를 복제하지 못했습니다."
    : "Could not fork this conversation.";
}

export function formatProjectListLoadError(): string {
  return isTeamverEmbedMode()
    ? "슬라이드 프로젝트 목록을 불러오지 못했습니다."
    : "Could not load projects.";
}

export function formatProjectGetLoadError(): string {
  return isTeamverEmbedMode()
    ? "슬라이드 프로젝트를 불러오지 못했습니다."
    : "Could not load this project.";
}

export function formatProjectCreateErrorForUser(err: unknown): string {
  if (!isTeamverEmbedMode()) {
    return err instanceof Error ? err.message : "Could not create project.";
  }
  if (
    err instanceof TeamverDaemonUnauthorizedError
    || (err instanceof Error && err.message === "teamver_daemon_unauthorized")
  ) {
    return isTeamverEmbedSessionAuthenticated()
      ? "프로젝트를 만드는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요."
      : "로그인 세션이 만료되어 프로젝트를 만들 수 없습니다. 다시 로그인한 뒤 시도하세요.";
  }
  return err instanceof Error ? err.message : "슬라이드 프로젝트를 만들지 못했습니다.";
}

/** User-facing project list/home errors — embed maps daemon 401 to retry-first copy. */
export function formatProjectListErrorForUser(err: unknown): string {
  if (!isTeamverEmbedMode()) {
    return err instanceof Error ? err.message : formatProjectListLoadError();
  }
  if (
    err instanceof TeamverDaemonUnauthorizedError
    || (err instanceof Error && err.message === "teamver_daemon_unauthorized")
  ) {
    return isTeamverEmbedSessionAuthenticated()
      ? "프로젝트 목록을 불러오는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요."
      : "로그인 세션이 만료되어 프로젝트 목록을 불러올 수 없습니다. 다시 로그인한 뒤 시도하세요.";
  }
  return formatProjectListLoadError();
}

/** User-facing single-project fetch errors for deep links and metadata refresh. */
export function formatProjectGetErrorForUser(err: unknown): string {
  if (!isTeamverEmbedMode()) {
    return err instanceof Error ? err.message : formatProjectGetLoadError();
  }
  if (
    err instanceof TeamverDaemonUnauthorizedError
    || (err instanceof Error && err.message === "teamver_daemon_unauthorized")
  ) {
    return isTeamverEmbedSessionAuthenticated()
      ? "슬라이드 프로젝트를 불러오는 중 연결을 확인하지 못했습니다. 잠시 후 다시 시도하세요."
      : "로그인 세션이 만료되어 슬라이드 프로젝트를 불러올 수 없습니다. 다시 로그인한 뒤 시도하세요.";
  }
  return formatProjectGetLoadError();
}
