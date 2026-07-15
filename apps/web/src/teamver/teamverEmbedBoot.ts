import { isTeamverEmbedMode } from "./designApiBase";
import { completeTeamverEmbedInitialUi } from "./teamverEmbedInitialUi";

/**
 * Safety net when session boot never reaches `completeTeamverEmbedBoot`.
 * Prefer finishing `/auth/session` first; keep this above typical BFF latency
 * so the shell does not open into an unknown auth state on warm networks,
 * while still unblocking a hung probe.
 */
export const TEAMVER_EMBED_BOOT_FALLBACK_MS = 3_500;

/**
 * Soft timeout after session boot before revealing themed chrome even if the
 * first projects paint is slow — avoids pinning the cream shell forever.
 */
export const TEAMVER_EMBED_CHROME_FALLBACK_MS = 4_000;

let bootDone = !isTeamverEmbedMode();
let resolveBoot: (() => void) | null = null;

function createBootPromise(): Promise<void> {
  if (bootDone) return Promise.resolve();
  return new Promise<void>((resolve) => {
    resolveBoot = resolve;
  });
}

let bootPromise = createBootPromise();

/** Marks that bootstrap shell may give way to themed app chrome. */
export const TEAMVER_EMBED_BOOTED_CLASS = "teamver-embed-booted";

export const TEAMVER_EMBED_CHROME_READY_EVENT = "teamver-embed-chrome-ready";

let chromeRevealed = !isTeamverEmbedMode();
let resolveChrome: (() => void) | null = null;

function createChromePromise(): Promise<void> {
  if (chromeRevealed) return Promise.resolve();
  return new Promise<void>((resolve) => {
    resolveChrome = resolve;
  });
}

let chromePromise = createChromePromise();

function markTeamverEmbedBootedInDom(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add(TEAMVER_EMBED_BOOTED_CLASS);
}

/** Called once after embed session + workspace seed on App boot. */
export function completeTeamverEmbedBoot(): void {
  if (bootDone) return;
  bootDone = true;
  resolveBoot?.();
  resolveBoot = null;
  // Keep cream overlay until `revealTeamverEmbedChrome` — revealing themed
  // dark EntryShell the moment session returns felt like a third loader.
  completeTeamverEmbedInitialUi();
}

/**
 * Drop the cream bootstrap overlay and allow dark/light app chrome.
 * App should call this after the first home/project surface is ready.
 */
export function revealTeamverEmbedChrome(): void {
  if (chromeRevealed) return;
  chromeRevealed = true;
  markTeamverEmbedBootedInDom();
  resolveChrome?.();
  resolveChrome = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TEAMVER_EMBED_CHROME_READY_EVENT));
  }
}

/** Embed registry gates must not run before workspace id is seeded from session. */
export function waitForTeamverEmbedBoot(): Promise<void> {
  return bootPromise;
}

export function waitForTeamverEmbedChrome(): Promise<void> {
  return chromePromise;
}

export function isTeamverEmbedBootComplete(): boolean {
  return bootDone;
}

export function isTeamverEmbedChromeRevealed(): boolean {
  return chromeRevealed;
}

/** @internal vitest only */
export function resetTeamverEmbedBootForTests(): void {
  bootDone = !isTeamverEmbedMode();
  resolveBoot = null;
  bootPromise = createBootPromise();
  chromeRevealed = !isTeamverEmbedMode();
  resolveChrome = null;
  chromePromise = createChromePromise();
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove(TEAMVER_EMBED_BOOTED_CLASS);
  }
}
