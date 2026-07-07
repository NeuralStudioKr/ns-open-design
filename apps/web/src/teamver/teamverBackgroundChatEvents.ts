export const TEAMVER_BACKGROUND_CHAT_EVENT = "teamver-design-background-chat";

export type TeamverBackgroundChatDetail = {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  active: boolean;
};

export function dispatchTeamverBackgroundChat(detail: TeamverBackgroundChatDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TeamverBackgroundChatDetail>(TEAMVER_BACKGROUND_CHAT_EVENT, {
      detail,
    }),
  );
}

export function subscribeTeamverBackgroundChat(
  listener: (detail: TeamverBackgroundChatDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<TeamverBackgroundChatDetail>;
    const projectId = custom.detail?.projectId?.trim();
    const conversationId = custom.detail?.conversationId?.trim();
    const assistantMessageId = custom.detail?.assistantMessageId?.trim();
    if (!projectId || !conversationId || !assistantMessageId) return;
    listener({
      projectId,
      conversationId,
      assistantMessageId,
      active: custom.detail.active === true,
    });
  };
  window.addEventListener(TEAMVER_BACKGROUND_CHAT_EVENT, handler);
  return () => window.removeEventListener(TEAMVER_BACKGROUND_CHAT_EVENT, handler);
}
