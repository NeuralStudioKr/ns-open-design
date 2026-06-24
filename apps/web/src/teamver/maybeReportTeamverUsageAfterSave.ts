import type { ChatMessage } from "../types";
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
  if (runId && reportedRunIds.has(runId)) return;

  const client = getDesignBffClient();
  if (!client) return;

  const workspaceId =
    (await client.workspaceStore?.get()) ??
    (typeof window !== "undefined"
      ? window.localStorage.getItem("teamver_design_active_workspace_id")
      : null);
  if (!workspaceId?.trim()) return;
  if (!isTeamverDesignAppEnabled(workspaceId.trim())) return;

  const usage = extractLatestUsageFromEvents(message.events);
  const modelName = resolveTeamverUsageModelName(message.events);

  await reportTeamverDesignUsage({
    workspaceId: workspaceId.trim(),
    modelName,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    tokenCountSource: usage?.tokenCountSource ?? "unknown",
    projectId,
    runId,
    runStatus: message.runStatus,
  });

  if (runId) reportedRunIds.add(runId);
}
