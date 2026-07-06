import { fetchTeamverDaemon } from "../teamver/teamverDaemonHeaders";

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
  if (!resp.ok) {
    throw new Error(`active_byok_proxy_streams_failed:${resp.status}`);
  }
  const body = (await resp.json()) as { streams?: ActiveByokProxyStreamSummary[] };
  return body.streams ?? [];
}
