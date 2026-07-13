import { isTeamverEmbedMode } from "./designApiBase";

/** Max time to keep the bootstrap shell before revealing the app anyway. */
export const TEAMVER_EMBED_INITIAL_UI_FALLBACK_MS = 3_500;

let initialUiComplete = false;
let waiters: Array<() => void> = [];

export function isTeamverEmbedInitialUiComplete(): boolean {
  return !isTeamverEmbedMode() || initialUiComplete;
}

/** App calls this once the first embed home/project surface is ready to paint. */
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
