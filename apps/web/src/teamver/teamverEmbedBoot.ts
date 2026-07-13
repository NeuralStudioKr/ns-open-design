import { isTeamverEmbedMode } from "./designApiBase";
import { completeTeamverEmbedInitialUi } from "./teamverEmbedInitialUi";

/**
 * Safety net when session boot never reaches `completeTeamverEmbedBoot`.
 * Keep short for stuck probes, but long enough that a slow `/auth/session`
 * usually finishes first (avoids opening the shell into an unknown auth state).
 */
export const TEAMVER_EMBED_BOOT_FALLBACK_MS = 2_000;

let bootDone = !isTeamverEmbedMode();
let resolveBoot: (() => void) | null = null;

function createBootPromise(): Promise<void> {
  if (bootDone) return Promise.resolve();
  return new Promise<void>((resolve) => {
    resolveBoot = resolve;
  });
}

let bootPromise = createBootPromise();

/** Called once after embed session + workspace seed on App boot. */
export function completeTeamverEmbedBoot(): void {
  if (bootDone) return;
  bootDone = true;
  resolveBoot?.();
  resolveBoot = null;
  completeTeamverEmbedInitialUi();
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
