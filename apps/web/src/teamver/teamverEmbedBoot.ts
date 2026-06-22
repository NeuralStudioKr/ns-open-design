import { isTeamverEmbedMode } from "./designApiBase";

let bootDone = !isTeamverEmbedMode();
let resolveBoot: (() => void) | null = null;

function createBootPromise(): Promise<void> {
  if (bootDone) return Promise.resolve();
  return new Promise<void>((resolve) => {
    resolveBoot = resolve;
  });
}

let bootPromise = createBootPromise();

/** Called once after embed session + workspace + registry sync on App boot. */
export function completeTeamverEmbedBoot(): void {
  if (bootDone) return;
  bootDone = true;
  resolveBoot?.();
  resolveBoot = null;
}

/** Embed registry gates must not run before workspace id is seeded from session. */
export function waitForTeamverEmbedBoot(): Promise<void> {
  return bootPromise;
}

export function isTeamverEmbedBootComplete(): boolean {
  return bootDone;
}

/** @internal vitest only */
export function resetTeamverEmbedBootForTests(): void {
  bootDone = !isTeamverEmbedMode();
  resolveBoot = null;
  bootPromise = createBootPromise();
}
