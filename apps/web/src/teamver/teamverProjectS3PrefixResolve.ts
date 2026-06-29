import {
  readTeamverProjectS3Prefix,
  rememberTeamverProjectS3Prefix,
} from "./teamverProjectS3PrefixCache";

const inflight = new Map<string, Promise<string | undefined>>();

/**
 * Embed — resolve tenant S3 prefix for daemon `X-Teamver-S3-Prefix`.
 * Registry list/create primes the cache; on miss we fetch the BFF row once
 * (deduped) so BYOK proxy / materialization does not depend on design-api
 * /access winning a race against daemon legacy register.
 */
export async function resolveTeamverProjectS3PrefixForDaemon(
  workspaceId: string,
  projectId: string,
): Promise<string | undefined> {
  const ws = workspaceId.trim();
  const id = projectId.trim();
  if (!ws || !id) return undefined;

  const cached = readTeamverProjectS3Prefix(ws, id);
  if (cached) return cached;

  const key = `${ws}:${id}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const { fetchTeamverProject } = await import("./projectRegistry.js");
        const row = await fetchTeamverProject(id);
        const prefix = row?.s3Prefix?.trim();
        if (prefix) rememberTeamverProjectS3Prefix(ws, id, prefix);
        return prefix || undefined;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, pending);
  }
  return pending;
}

/** @internal vitest only */
export function resetTeamverProjectS3PrefixResolveForTests(): void {
  inflight.clear();
}
