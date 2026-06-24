import { NetworkError } from "@teamver/app-sdk";
import { getDesignBffClient } from "./designBffClient";

export type TeamverUsageEvent = {
  workspaceId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  operation?: string;
  projectId?: string;
  runId?: string;
  runStatus?: string;
};

export type TeamverUsageAcceptedResponse = {
  accepted?: boolean;
  requestId?: string;
};

function isRetryableUsageError(err: unknown): boolean {
  if (err instanceof NetworkError) {
    const status = err.status ?? 0;
    return status >= 500 || status === 429;
  }
  return false;
}

async function postUsageEvent(
  client: NonNullable<ReturnType<typeof getDesignBffClient>>,
  event: TeamverUsageEvent,
): Promise<string | null> {
  const response = await client.http.post<TeamverUsageAcceptedResponse>(
    "/usage/events",
    {
      workspaceId: event.workspaceId,
      modelName: event.modelName,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      operation: event.operation ?? "design_run",
      projectId: event.projectId,
      runId: event.runId,
      runStatus: event.runStatus,
    },
    {
      workspaceId: event.workspaceId,
      skipAuthHeader: true,
    },
  );
  return typeof response?.requestId === "string" && response.requestId ? response.requestId : null;
}

export async function reportTeamverDesignUsage(event: TeamverUsageEvent): Promise<string | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  try {
    return await postUsageEvent(client, event);
  } catch (err) {
    if (!isRetryableUsageError(err)) {
      console.warn("[teamver] usage/events failed", err);
      return null;
    }
    try {
      return await postUsageEvent(client, event);
    } catch (retryErr) {
      console.warn("[teamver] usage/events retry failed", retryErr);
      return null;
    }
  }
}
