import type { ChatRunStatusResponse } from "@open-design/contracts";
import type { ChatMessage } from "../types";

export function isTerminalRunStatus(status: ChatMessage["runStatus"]): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

export function isActiveRunStatus(status: ChatMessage["runStatus"]): boolean {
  return status === "queued" || status === "running";
}

/** Assistant row still in progress (daemon runStatus or API-mode startedAt). */
export function isInFlightAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  if (message.endedAt !== undefined) return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  return message.startedAt !== undefined;
}

/** Only the latest assistant turn can be actively streaming/recovering. */
export function findInFlightAssistantMessages(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    return isInFlightAssistantMessage(message) ? [message] : [];
  }
  return [];
}

/** Daemon-mode rows eligible for `/api/runs/:id/events` reattach. */
export function isRecoverableDaemonRunMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  if (!message.runId) return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  return message.endedAt === undefined;
}

export function isRecoverableBackgroundChatMessage(
  message: ChatMessage,
  mode: "daemon" | "api",
): boolean {
  if (mode === "daemon") return isRecoverableDaemonRunMessage(message);
  return false;
}

export function conversationHasRecoverableBackgroundChat(
  messages: readonly ChatMessage[],
  mode: "daemon" | "api",
): boolean {
  if (mode === "daemon") {
    return messages.some(isRecoverableDaemonRunMessage);
  }
  return findInFlightAssistantMessages(messages).length > 0;
}

/** Poll interval while a background BYOK turn may still be draining on the daemon. */
export const BYOK_BACKGROUND_RECOVERY_POLL_MS = 2_000;

export type ByokBackgroundChatActive = {
  conversationId: string;
  assistantMessageId: string;
};

/** Merge embed BYOK in-flight turns into daemon run summaries for the task banner. */
export function mergeByokBackgroundRunSummaries<T extends {
  projectId: string;
  projectName: string;
  status: "running" | "queued";
  count: number;
  conversationId?: string | null;
}>(
  daemonSummaries: T[],
  byokActive: ReadonlyMap<string, ByokBackgroundChatActive>,
  projectNameById: ReadonlyMap<string, string>,
): T[] {
  if (byokActive.size === 0) return daemonSummaries;
  const byProject = new Map(daemonSummaries.map((summary) => [summary.projectId, summary]));
  for (const [projectId, active] of byokActive) {
    if (byProject.has(projectId)) continue;
    byProject.set(projectId, {
      projectId,
      projectName: projectNameById.get(projectId) ?? "AI Design",
      status: "running",
      count: 1,
      conversationId: active.conversationId,
    } as T);
  }
  return [...byProject.values()];
}

export function syntheticByokRunsForTaskCenter(
  byokActive: ReadonlyMap<string, ByokBackgroundChatActive>,
): ChatRunStatusResponse[] {
  const now = Date.now();
  return [...byokActive.entries()].map(([projectId, active]) => ({
    id: `byok-${active.assistantMessageId}`,
    projectId,
    conversationId: active.conversationId,
    assistantMessageId: active.assistantMessageId,
    agentId: null,
    status: "running" as const,
    createdAt: now,
    updatedAt: now,
  }));
}
