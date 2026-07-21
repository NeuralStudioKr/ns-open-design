import {
  readTeamverProjectS3Prefix,
  rememberTeamverProjectS3Prefix,
} from "./teamverProjectS3PrefixCache";
import { isTeamverEmbedMode } from "./designApiBase";
import { readActiveTeamverWorkspaceId } from "./activeTeamverWorkspace";

const inflight = new Map<string, Promise<string | undefined>>();

const PREFIX_WAIT_STEPS_MS = [0, 400, 900, 1500] as const;

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
        const { fetchTeamverProject } = await import("./projectRegistry");
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

/**
 * Best-effort warm of `X-Teamver-S3-Prefix` before BYOK proxy / export.
 * Returns null outside embed or when the prefix cannot be resolved in time.
 */
export async function waitForTeamverProjectStoragePrefix(
  projectId: string,
  opts: { quick?: boolean } = {},
): Promise<string | null> {
  if (!isTeamverEmbedMode()) return null;
  const workspaceId = (await readActiveTeamverWorkspaceId())?.trim();
  if (!workspaceId) return null;
  const steps = opts.quick ? [0] : PREFIX_WAIT_STEPS_MS;
  for (const wait of steps) {
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const prefix = await resolveTeamverProjectS3PrefixForDaemon(workspaceId, projectId);
      if (prefix) return prefix;
    } catch {
      // Registry can transiently fail during workspace switch — keep polling.
    }
  }
  return null;
}

/** @internal vitest only */
export function resetTeamverProjectS3PrefixResolveForTests(): void {
  inflight.clear();
}
