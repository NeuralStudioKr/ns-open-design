import type { ChatMessage } from "../types";
import { resolveActiveTeamverWorkspaceIdForEmbed } from "./activeTeamverWorkspace";
import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import {
  extractLatestUsageFromEvents,
  isTerminalRunStatus,
  resolveTeamverUsageModelName,
  sumUsageTokens,
} from "./usageAttribution";
import { reportTeamverDesignUsage } from "./reportUsage";
import { isTeamverDesignAppEnabled } from "./teamverDesignAccess";

// Structured marker so ops dashboards can grep `teamver_usage_zero_tokens`
// to spot the next 0-token regression *before* it becomes a billing dispute.
// Matches the daemon-side beacon shape in teamver-usage-bridge.ts.
function emitClientUsageZeroMarker(payload: Record<string, unknown>): void {
  try {
    console.warn(
      JSON.stringify({
        metric: "teamver_usage_zero_tokens",
        stage: "fe.maybe_report",
        ts: Date.now(),
        ...payload,
      }),
    );
  } catch {
    // never let observability break the chat finalize flow.
  }
}

// Long-lived tabs (week-long embed sessions) accumulate runs over time. Cap
// the dedupe set so the helper never leaks memory; the BE upsert is the
// authoritative dedupe on (workspace_id, run_id) anyway, so a rotated-out
// entry only costs us one redundant 202 if the same message replays after
// thousands of newer runs.
const REPORTED_RUN_ID_CAP = 1024;
const reportedRunIds = new Set<string>();
// In-flight requests for the same runId — guards against concurrent
// `persistMessage` retries firing duplicate POSTs while the first is still
// awaiting the network. We hold the entry only for the lifetime of one
// network call so memory is bounded by concurrency, not history.
const inFlightRunIds = new Set<string>();

function rememberReportedRunId(usageRunId: string): void {
  reportedRunIds.add(usageRunId);
  if (reportedRunIds.size <= REPORTED_RUN_ID_CAP) return;
  // FIFO eviction — Set iteration is insertion-ordered.
  const first = reportedRunIds.values().next().value;
  if (typeof first === "string") reportedRunIds.delete(first);
}

/** @internal vitest */
export function resetTeamverReportedRunIdsForTests(): void {
  reportedRunIds.clear();
  inFlightRunIds.clear();
}

export async function maybeReportTeamverUsageAfterSave(
  projectId: string,
  message: ChatMessage,
  options: { telemetryFinalized?: boolean },
): Promise<void> {
  if (!options.telemetryFinalized) return;
  if (!isTeamverEmbedMode()) return;
  if (!isTerminalRunStatus(message.runStatus)) return;

  const runId = message.runId?.trim();
  // Embed BYOK (mode=api) has no daemon runId — use assistant message id so
  // design-api (workspace_id, run_id) upsert dedupes one row per chat turn.
  const usageRunId = runId || message.id;
  if (reportedRunIds.has(usageRunId)) return;
  if (inFlightRunIds.has(usageRunId)) return;

  const client = getDesignBffClient();
  if (!client) return;

  const workspaceId = await resolveActiveTeamverWorkspaceIdForEmbed();
  if (!workspaceId) return;
  if (!isTeamverDesignAppEnabled(workspaceId)) return;

  // Re-check after async resolution — a sibling call may have completed
  // while we awaited workspace resolution.
  if (reportedRunIds.has(usageRunId)) return;
  if (inFlightRunIds.has(usageRunId)) return;

  const usage = extractLatestUsageFromEvents(message.events);
  const modelName = resolveTeamverUsageModelName(message.events);
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const tokenTotal = usage ? sumUsageTokens(usage) : 0;

  // Beacon for 0-token regressions. The FE path covers BYOK runs where the
  // upstream SDK / proxy didn't surface usage — exactly the gap loop 390
  // closed for Anthropic direct SDK. Logging here makes future regressions
  // visible in browser devtools + the design-api access log it gets shipped
  // to via the SDK's tap on console.warn.
  if (tokenTotal === 0) {
    emitClientUsageZeroMarker({
      workspaceId,
      modelName,
      projectId,
      runId: usageRunId,
      runStatus: message.runStatus,
      tokenCountSource: usage?.tokenCountSource ?? "unknown",
      eventCount: message.events?.length ?? 0,
    });
  }

  inFlightRunIds.add(usageRunId);
  try {
    await reportTeamverDesignUsage({
      workspaceId: workspaceId,
      modelName,
      inputTokens,
      outputTokens,
      totalTokens: tokenTotal > 0 ? tokenTotal : undefined,
      tokenCountSource: usage?.tokenCountSource ?? "unknown",
      projectId,
      runId: usageRunId,
      runStatus: message.runStatus,
      cacheReadInputTokens: usage?.cacheReadInputTokens,
      cacheCreationInputTokens: usage?.cacheCreationInputTokens,
      providerReportedModel: usage?.providerReportedModel,
      apiProtocol: usage?.apiProtocol,
      latencyMs: usage?.latencyMs,
      stopReason: usage?.stopReason,
    });
    rememberReportedRunId(usageRunId);
  } finally {
    inFlightRunIds.delete(usageRunId);
  }
}
