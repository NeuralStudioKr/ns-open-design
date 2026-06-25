import { NetworkError } from "@teamver/app-sdk";
import { getDesignBffClient } from "./designBffClient";

export type TeamverUsageEvent = {
  workspaceId: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
  tokenCountSource?: "provider_usage" | "estimated" | "unknown";
  operation?: string;
  projectId?: string;
  runId?: string;
  runStatus?: string;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  providerReportedModel?: string;
  apiProtocol?: string;
  latencyMs?: number;
  stopReason?: string;
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
      ...(event.totalTokens != null && event.totalTokens > 0
        ? { totalTokens: event.totalTokens }
        : {}),
      operation: event.operation ?? "design_run",
      projectId: event.projectId,
      runId: event.runId,
      runStatus: event.runStatus,
      tokenCountSource: event.tokenCountSource ?? "unknown",
      ...(event.cacheReadInputTokens != null && event.cacheReadInputTokens > 0
        ? { cacheReadInputTokens: event.cacheReadInputTokens }
        : {}),
      ...(event.cacheCreationInputTokens != null && event.cacheCreationInputTokens > 0
        ? { cacheCreationInputTokens: event.cacheCreationInputTokens }
        : {}),
      ...(event.providerReportedModel ? { providerReportedModel: event.providerReportedModel } : {}),
      ...(event.apiProtocol ? { apiProtocol: event.apiProtocol } : {}),
      ...(event.latencyMs != null && event.latencyMs > 0 ? { latencyMs: event.latencyMs } : {}),
      ...(event.stopReason ? { stopReason: event.stopReason } : {}),
    },
    {
      workspaceId: event.workspaceId,
      skipAuthHeader: true,
    },
  );
  return typeof response?.requestId === "string" && response.requestId ? response.requestId : null;
}

function emitClientUsage5xxMarker(stage: string, event: TeamverUsageEvent, err: unknown): void {
  // Structured marker so design-api fronting logs / ops dashboards can grep
  // for `teamver_usage_5xx` regardless of which side (FE vs daemon vs BE)
  // dropped the event. Mirrors the daemon `teamver-usage-bridge.ts` shape.
  try {
    console.warn(
      JSON.stringify({
        metric: "teamver_usage_5xx",
        stage,
        ts: Date.now(),
        workspaceId: event.workspaceId,
        runId: event.runId,
        runStatus: event.runStatus,
        modelName: event.modelName,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  } catch {
    // Defensive: never let logging break the chat finalize flow.
  }
}

export async function reportTeamverDesignUsage(event: TeamverUsageEvent): Promise<string | null> {
  const client = getDesignBffClient();
  if (!client) return null;

  try {
    return await postUsageEvent(client, event);
  } catch (err) {
    if (!isRetryableUsageError(err)) {
      emitClientUsage5xxMarker("usage.events_client_drop", event, err);
      return null;
    }
    try {
      return await postUsageEvent(client, event);
    } catch (retryErr) {
      emitClientUsage5xxMarker("usage.events_client_retry_drop", event, retryErr);
      return null;
    }
  }
}
