import { isTeamverEmbedMode } from "./designApiBase";

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

export function formatProjectArtifactSaveFailedError(fileName: string): string {
  return isTeamverEmbedMode()
    ? `슬라이드 파일 "${fileName}"을(를) 저장하지 못했습니다. daemon 로그를 확인하세요.`
    : `Couldn't save artifact "${fileName}". The write failed — check the daemon logs for details.`;
}

export function formatProjectArtifactStubWarning(fileName: string, message: string): string {
  return isTeamverEmbedMode()
    ? `"${fileName}"은(는) 저장됐지만 플레이스홀더일 수 있습니다: ${message}`
    : `Saved "${fileName}", but the model may have shipped a placeholder: ${message}`;
}

/** Resolve structured proxy/daemon error codes when `err.code` was not set. */
export function extractProjectRunErrorCode(err: unknown): string | undefined {
  const direct = err instanceof Error ? (err as Error & { code?: string }).code?.trim() : "";
  if (direct) return direct;
  const message = err instanceof Error ? err.message : String(err);
  const proxyMatch = /^proxy \d+: (\S+)/.exec(message);
  return proxyMatch?.[1]?.trim() || undefined;
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
    return "서버 API 인증 정보를 확인하지 못했습니다. 다시 로그인한 뒤 시도하세요.";
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
  if (code === "UPSTREAM_UNAVAILABLE" || code === "INTERNAL_ERROR") {
    return "AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.";
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
  return fallback;
}

export function formatProjectForkConversationError(): string {
  return isTeamverEmbedMode()
    ? "대화를 복제하지 못했습니다."
    : "Could not fork this conversation.";
}
