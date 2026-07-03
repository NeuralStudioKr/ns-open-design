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

/**
 * Full SSE replay wipes visible assistant content. Only use it when there is
 * no persisted checkpoint to resume from after a page-leave reattach.
 */
export function shouldFullReplayReattachedRun(message: ChatMessage): boolean {
  if (message.lastRunEventId?.trim()) return false;
  if ((message.content ?? "").trim().length > 0) return false;
  if ((message.events?.length ?? 0) > 0) return false;
  return true;
}

export type RunRecoveryBannerPhase = "connecting" | "live" | "queued";

export function isRecoverableBackgroundChatMessage(
  message: ChatMessage,
  mode: "daemon" | "api",
): boolean {
  if (mode === "daemon") return isRecoverableDaemonRunMessage(message);
  return isInFlightAssistantMessage(message);
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

type ByokProxyStreamLike = {
  conversationId?: string | null;
  assistantMessageId?: string | null;
};

/** Whether the daemon still has an upstream BYOK proxy stream for this chat turn. */
export function isByokProxyStreamActiveForChat(
  streams: readonly ByokProxyStreamLike[],
  active: ByokBackgroundChatActive,
): boolean {
  return streams.some((stream) => {
    const assistantMessageId = stream.assistantMessageId?.trim();
    if (!assistantMessageId || assistantMessageId !== active.assistantMessageId) {
      return false;
    }
    const conversationId = stream.conversationId?.trim();
    return !conversationId || conversationId === active.conversationId;
  });
}

/**
 * Drop stale BYOK background-run chips after the proxy drains. Mirrors the
 * three idle polls ProjectView uses before ending in-project API recovery.
 */
export function reconcileByokBackgroundChatsAfterPoll(
  byokActive: Map<string, ByokBackgroundChatActive>,
  idlePollCounts: Map<string, number>,
  streamsByProjectId: ReadonlyMap<string, readonly ByokProxyStreamLike[]>,
  idleThreshold = 3,
): string[] {
  const removed: string[] = [];
  for (const [projectId, active] of [...byokActive.entries()]) {
    const streams = streamsByProjectId.get(projectId) ?? [];
    if (isByokProxyStreamActiveForChat(streams, active)) {
      idlePollCounts.delete(projectId);
      continue;
    }
    const nextIdle = (idlePollCounts.get(projectId) ?? 0) + 1;
    if (nextIdle >= idleThreshold) {
      byokActive.delete(projectId);
      idlePollCounts.delete(projectId);
      removed.push(projectId);
      continue;
    }
    idlePollCounts.set(projectId, nextIdle);
  }
  return removed;
}
