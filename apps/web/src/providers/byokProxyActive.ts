import { fetchTeamverDaemon } from "../teamver/teamverDaemonHeaders";
import { isDesignAuthRefreshDeclined } from "../teamver/designBffClient";
import { isTeamverEmbedSessionAuthenticated } from "../teamver/teamverEmbedSession";

export class ActiveByokProxyAuthTransientError extends Error {
  readonly code = "ACTIVE_BYOK_PROXY_AUTH_TRANSIENT";
  readonly status = 401;

  constructor() {
    super("active_byok_proxy_streams_auth_transient");
    this.name = "ActiveByokProxyAuthTransientError";
  }
}

export type ActiveByokProxyStreamSummary = {
  streamId: string;
  workspaceId?: string;
  projectId?: string;
  conversationId?: string;
  assistantMessageId?: string;
  registeredAt: number;
};

/**
 * After a dead-cookie 401, pause further `/api/proxy/active` polls until this
 * timestamp. Prevents App runs-poll from re-hitting nginx every few seconds
 * while C1 owns recovery.
 */
let byokProxyAuthBackoffUntil = 0;
/** Pause `/api/proxy/active` polls after a dead-cookie 401 (App + ProjectView). */
export const BYOK_PROXY_AUTH_BACKOFF_MS = 60_000;

/** @internal vitest */
export function resetByokProxyActiveAuthBackoffForTests(): void {
  byokProxyAuthBackoffUntil = 0;
}

export function shouldSkipByokProxyActivePoll(): boolean {
  if (Date.now() < byokProxyAuthBackoffUntil) return true;
  if (isDesignAuthRefreshDeclined()) return true;
  if (!isTeamverEmbedSessionAuthenticated()) return true;
  return false;
}

function noteByokProxyAuthBackoff(): void {
  byokProxyAuthBackoffUntil = Date.now() + BYOK_PROXY_AUTH_BACKOFF_MS;
}

export async function listActiveByokProxyStreams(
  projectId: string,
): Promise<ActiveByokProxyStreamSummary[]> {
  // Dead cookie / sticky: do not even open the socket — App + ProjectView
  // background polls used to hammer this every 2–15s and each 401 re-entered
  // soft-sticky refresh→probe×2.
  if (shouldSkipByokProxyActivePoll()) {
    throw new ActiveByokProxyAuthTransientError();
  }

  const qs = new URLSearchParams({ projectId });
  const resp = await fetchTeamverDaemon(`/api/proxy/active?${qs.toString()}`, {
    teamverProjectId: projectId,
    // Never run soft-sticky ladder from this read-only poll.
    skipEmbedAuthRecovery: true,
  });
  if (resp.status === 404) {
    return [];
  }
  if (resp.status === 401) {
    noteByokProxyAuthBackoff();
    throw new ActiveByokProxyAuthTransientError();
  }
  if (!resp.ok) {
    throw new Error(`active_byok_proxy_streams_failed:${resp.status}`);
  }
  const body = (await resp.json()) as { streams?: ActiveByokProxyStreamSummary[] };
  return body.streams ?? [];
}
