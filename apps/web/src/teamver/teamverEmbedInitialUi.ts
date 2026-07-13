import { isTeamverEmbedMode } from "./designApiBase";

/**
 * Completes together with embed boot (`completeTeamverEmbedBoot` calls this).
 * Kept for non-embed / legacy waiters; EmbedBootstrapGate no longer waits here.
 */
let initialUiComplete = false;
let waiters: Array<() => void> = [];

export function isTeamverEmbedInitialUiComplete(): boolean {
  return !isTeamverEmbedMode() || initialUiComplete;
}

/** Mark initial UI ready — invoked from `completeTeamverEmbedBoot` in embed mode. */
export function completeTeamverEmbedInitialUi(): void {
  if (!isTeamverEmbedMode() || initialUiComplete) return;
  initialUiComplete = true;
  for (const resolve of waiters) resolve();
  waiters = [];
}

export function waitForTeamverEmbedInitialUi(): Promise<void> {
  if (isTeamverEmbedInitialUiComplete()) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

/** @internal vitest only */
export function resetTeamverEmbedInitialUiForTests(): void {
  initialUiComplete = false;
  waiters = [];
}
