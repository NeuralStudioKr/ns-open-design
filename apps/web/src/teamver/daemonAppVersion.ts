import { fetchTeamverDaemon } from "./teamverDaemonHeaders";

type AppVersionResponse = {
  version?: { version?: unknown } | null;
};

let cachedVersion: string | null = null;
let inflight: Promise<string | null> | null = null;

function parseVersionBody(json: AppVersionResponse): string | null {
  const next = json?.version?.version;
  return typeof next === "string" && next.trim() ? next.trim() : null;
}

/**
 * Shared single-flight `GET /api/version` for analytics, deploy auto-reload,
 * and About panel. Embed boot should issue at most one network round-trip.
 */
export async function fetchDaemonAppVersion(options?: {
  bypassCache?: boolean;
}): Promise<string | null> {
  if (!options?.bypassCache && cachedVersion) return cachedVersion;
  if (!options?.bypassCache && inflight) return inflight;

  const run = (async (): Promise<string | null> => {
    try {
      const resp = await fetchTeamverDaemon("/api/version", { cache: "no-store", skipEmbedAuthRecovery: true });
      if (!resp.ok) return null;
      const json = (await resp.json()) as AppVersionResponse;
      const next = parseVersionBody(json);
      if (next) cachedVersion = next;
      return next;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  if (!options?.bypassCache) inflight = run;
  return run;
}

/** Poll path — always hits network so deploy auto-reload can detect drift. */
export async function fetchDaemonAppVersionForPoll(): Promise<string | null> {
  try {
    const resp = await fetchTeamverDaemon("/api/version", { cache: "no-store", skipEmbedAuthRecovery: true });
    if (!resp.ok) return null;
    const json = (await resp.json()) as AppVersionResponse;
    return parseVersionBody(json);
  } catch {
    return null;
  }
}

export function peekDaemonAppVersion(): string | null {
  return cachedVersion;
}

/** @internal vitest */
export function resetDaemonAppVersionCacheForTests(): void {
  cachedVersion = null;
  inflight = null;
}
