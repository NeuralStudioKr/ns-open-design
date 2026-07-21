import { NetworkError } from "@teamver/app-sdk";
import {
  TEAMVER_BFF_REQUEST_OPTIONS,
  getDesignBffClient,
  shouldSkipTeamverBffAuthCalls,
  withDesignBffCookieAuthRecovery,
} from "./designBffClient";

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
  registryUsageId?: string;
  billingStatus?: string;
  creditsCommitted?: boolean;
  creditsAmountT?: number;
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
    if (status === 0) return true;
    return status >= 500 || status === 429;
  }
  // Browser fetch network failures surface as TypeError.
  if (err instanceof TypeError) return true;
  return false;
}

function usageClientErrorMetric(err: unknown): string {
  if (err instanceof NetworkError) {
    const status = err.status ?? 0;
    if (status >= 500 || status === 429) return "teamver_usage_5xx";
    if (status >= 400) return "teamver_usage_4xx";
  }
  return "teamver_usage_client_error";
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
      ...(event.registryUsageId ? { registryUsageId: event.registryUsageId } : {}),
      ...(event.billingStatus ? { billingStatus: event.billingStatus } : {}),
      ...(event.creditsCommitted != null ? { creditsCommitted: event.creditsCommitted } : {}),
      ...(event.creditsAmountT != null && event.creditsAmountT >= 0
        ? { creditsAmountT: event.creditsAmountT }
        : {}),
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
      ...TEAMVER_BFF_REQUEST_OPTIONS,
    },
  );
  return typeof response?.requestId === "string" && response.requestId ? response.requestId : null;
}

function emitClientUsageDropMarker(stage: string, event: TeamverUsageEvent, err: unknown): void {
  try {
    console.warn(
      JSON.stringify({
        metric: usageClientErrorMetric(err),
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
  if (shouldSkipTeamverBffAuthCalls()) return null;

  try {
    return await withDesignBffCookieAuthRecovery(() => postUsageEvent(client, event));
  } catch (err) {
    if (!isRetryableUsageError(err)) {
      emitClientUsageDropMarker("usage.events_client_drop", event, err);
      return null;
    }
    try {
      return await withDesignBffCookieAuthRecovery(() => postUsageEvent(client, event));
    } catch (retryErr) {
      emitClientUsageDropMarker("usage.events_client_retry_drop", event, retryErr);
      return null;
    }
  }
}
