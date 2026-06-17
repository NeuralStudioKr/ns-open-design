export const TEAMVER_WORKSPACE_CHANGED_EVENT = "teamver-design-workspace-changed";

export type TeamverWorkspaceChangedDetail = {
  workspaceId: string;
};

export function dispatchTeamverWorkspaceChanged(workspaceId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TeamverWorkspaceChangedDetail>(TEAMVER_WORKSPACE_CHANGED_EVENT, {
      detail: { workspaceId },
    }),
  );
}

export function subscribeTeamverWorkspaceChanged(
  listener: (detail: TeamverWorkspaceChangedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<TeamverWorkspaceChangedDetail>;
    const workspaceId = custom.detail?.workspaceId?.trim();
    if (!workspaceId) return;
    listener({ workspaceId });
  };
  window.addEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, handler);
  return () => window.removeEventListener(TEAMVER_WORKSPACE_CHANGED_EVENT, handler);
}
