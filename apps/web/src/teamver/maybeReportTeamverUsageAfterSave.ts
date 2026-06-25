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

const reportedRunIds = new Set<string>();

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

  reportedRunIds.add(usageRunId);
}
