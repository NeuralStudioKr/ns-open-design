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
