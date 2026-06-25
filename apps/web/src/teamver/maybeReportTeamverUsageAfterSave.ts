import type { ChatMessage } from "../types";
import { resolveActiveTeamverWorkspaceIdForEmbed } from "./activeTeamverWorkspace";
import { getDesignBffClient } from "./designBffClient";
import { isTeamverEmbedMode } from "./designApiBase";
import {
  extractLatestUsageFromEvents,
  isTerminalRunStatus,
  resolveTeamverUsageModelName,
} from "./usageAttribution";
import { reportTeamverDesignUsage } from "./reportUsage";
import { isTeamverDesignAppEnabled } from "./teamverDesignAccess";

// Long-lived tabs (week-long embed sessions) accumulate runs over time. Cap
// the dedupe set so the helper never leaks memory; the BE upsert is the
// authoritative dedupe on (workspace_id, run_id) anyway, so a rotated-out
// entry only costs us one redundant 202 if the same message replays after
// thousands of newer runs.
const REPORTED_RUN_ID_CAP = 1024;
const reportedRunIds = new Set<string>();

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

  const client = getDesignBffClient();
  if (!client) return;

  const workspaceId = await resolveActiveTeamverWorkspaceIdForEmbed();
  if (!workspaceId) return;
  if (!isTeamverDesignAppEnabled(workspaceId)) return;

  const usage = extractLatestUsageFromEvents(message.events);
  const modelName = resolveTeamverUsageModelName(message.events);
  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;

  await reportTeamverDesignUsage({
    workspaceId: workspaceId,
    modelName,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens > 0 ? inputTokens + outputTokens : undefined,
    tokenCountSource: usage?.tokenCountSource ?? "unknown",
    projectId,
    runId: usageRunId,
    runStatus: message.runStatus,
  });

  rememberReportedRunId(usageRunId);
}
