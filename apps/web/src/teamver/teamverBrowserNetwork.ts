/**
 * Browser network/offline guards for Teamver embed background polls.
 *
 * `navigator.onLine` alone is insufficient — Chrome can report online while
 * requests fail with `ERR_INTERNET_DISCONNECTED`. Pair the flag with a short
 * backoff after fetch transport failures so recovery polls quiet down until
 * `online` or the backoff expires.
 */

/** Pause background Teamver polls after a transport failure. */
export const TEAMVER_BROWSER_NETWORK_BACKOFF_MS = 60_000;

let networkBackoffUntil = 0;

export function isBrowserOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine === false;
}

export function isLikelyFetchNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const haystack = `${err.name} ${err.message}`.toLowerCase();
  if (err.name === "TypeError" && /failed to fetch|networkerror|load failed|network request failed/.test(haystack)) {
    return true;
  }
  return /err_internet_disconnected|networkerror|econnreset|econnrefused|etimedout|enotfound|enetunreach|socket hang up|premature close/.test(
    haystack,
  );
}

export function shouldSkipTeamverNetworkCalls(): boolean {
  if (isBrowserOffline()) return true;
  return Date.now() < networkBackoffUntil;
}

export function noteTeamverNetworkBackoff(): void {
  networkBackoffUntil = Date.now() + TEAMVER_BROWSER_NETWORK_BACKOFF_MS;
}

/** @internal vitest */
export function resetTeamverNetworkBackoffForTests(): void {
  networkBackoffUntil = 0;
}

export class TeamverBrowserNetworkUnavailableError extends Error {
  readonly code = "TEAMVER_BROWSER_NETWORK_UNAVAILABLE";

  constructor() {
    super("teamver_browser_network_unavailable");
    this.name = "TeamverBrowserNetworkUnavailableError";
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    networkBackoffUntil = 0;
  });
}
