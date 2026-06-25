/** One-shot arm — open Teamver publish menu after background-run preview deep-link. */

export type TeamverPublishMenuArm = {
  projectId: string;
  fileName: string;
};

let pendingPublishMenuArm: TeamverPublishMenuArm | null = null;

export function armTeamverPublishMenuOnProjectOpen(projectId: string, fileName: string): void {
  const id = projectId.trim();
  const name = fileName.trim();
  if (!id || !name) return;
  pendingPublishMenuArm = { projectId: id, fileName: name };
}

export function consumeTeamverPublishMenuArm(
  projectId: string,
  fileName: string,
): boolean {
  const id = projectId.trim();
  const name = fileName.trim();
  if (!pendingPublishMenuArm) return false;
  if (pendingPublishMenuArm.projectId !== id || pendingPublishMenuArm.fileName !== name) {
    return false;
  }
  pendingPublishMenuArm = null;
  return true;
}

/** @internal vitest only */
export function resetTeamverPostRunNavigationForTests(): void {
  pendingPublishMenuArm = null;
}
