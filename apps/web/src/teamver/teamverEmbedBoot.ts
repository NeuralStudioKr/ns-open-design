import { isTeamverEmbedMode } from "./designApiBase";
import { completeTeamverEmbedInitialUi } from "./teamverEmbedInitialUi";

/**
 * Safety net when session boot never reaches `completeTeamverEmbedBoot`.
 * Prefer finishing `/auth/session` first; keep this above typical BFF latency
 * so the shell does not open into an unknown auth state on warm networks,
 * while still unblocking a hung probe.
 */
export const TEAMVER_EMBED_BOOT_FALLBACK_MS = 3_500;

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
