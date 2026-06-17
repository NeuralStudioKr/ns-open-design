import { NetworkError } from "@teamver/app-sdk";
import { getDesignBffClient } from "./designBffClient";

export type TeamverUsageEvent = {
  workspace_id: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  operation?: string;
  project_id?: string;
  run_id?: string;
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
      workspaceId: event.workspace_id,
      modelName: event.model_name,
      inputTokens: event.input_tokens,
      outputTokens: event.output_tokens,
      operation: event.operation ?? "design_run",
      projectId: event.project_id,
      runId: event.run_id,
    },
    {
      workspaceId: event.workspace_id,
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
