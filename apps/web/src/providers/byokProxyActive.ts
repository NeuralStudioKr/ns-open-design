import { fetchTeamverDaemon } from "../teamver/teamverDaemonHeaders";

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

export async function listActiveByokProxyStreams(
  projectId: string,
): Promise<ActiveByokProxyStreamSummary[]> {
  const qs = new URLSearchParams({ projectId });
  const resp = await fetchTeamverDaemon(`/api/proxy/active?${qs.toString()}`, {
    teamverProjectId: projectId,
  });
  if (resp.status === 404) {
    return [];
  }
  if (resp.status === 401) {
    throw new ActiveByokProxyAuthTransientError();
  }
  if (!resp.ok) {
    throw new Error(`active_byok_proxy_streams_failed:${resp.status}`);
  }
  const body = (await resp.json()) as { streams?: ActiveByokProxyStreamSummary[] };
  return body.streams ?? [];
}
