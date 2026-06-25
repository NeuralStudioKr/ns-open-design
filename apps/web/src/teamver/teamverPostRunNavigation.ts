/** One-shot arm — open Teamver publish menu after run success preview auto-open. */

import { isTeamverEmbedMode } from "./designApiBase";

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

/** Embed in-project run success — arm publish menu before HTML preview auto-open. */
export function maybeArmTeamverPublishMenuAfterRunSuccess(
  projectId: string,
  htmlFileName: string | null | undefined,
): void {
  const name = htmlFileName?.trim();
  if (!name || !isTeamverEmbedMode()) return;
  armTeamverPublishMenuOnProjectOpen(projectId, name);
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
