import { fetchTeamverDaemon } from "../teamver/teamverDaemonHeaders";

export type ActiveByokProxyStreamSummary = {
  streamId: string;
  workspaceId?: string;
  projectId?: string;
  registeredAt: number;
};

export async function listActiveByokProxyStreams(
  projectId: string,
): Promise<ActiveByokProxyStreamSummary[]> {
  try {
    const qs = new URLSearchParams({ projectId });
    const resp = await fetchTeamverDaemon(`/api/proxy/active?${qs.toString()}`, {
      teamverProjectId: projectId,
    });
    if (!resp.ok) return [];
    const body = (await resp.json()) as { streams?: ActiveByokProxyStreamSummary[] };
    return body.streams ?? [];
  } catch {
    return [];
  }
}
