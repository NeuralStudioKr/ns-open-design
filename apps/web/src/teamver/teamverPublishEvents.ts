export const TEAMVER_PUBLISH_OUTPUTS_CHANGED_EVENT = "teamver:publish-outputs-changed";

export function notifyTeamverPublishOutputsChanged(projectId: string): void {
  const trimmed = projectId.trim();
  if (!trimmed || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TEAMVER_PUBLISH_OUTPUTS_CHANGED_EVENT, {
      detail: { projectId: trimmed },
    }),
  );
}
