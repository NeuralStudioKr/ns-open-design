import type { ChatMessage } from "../types";
import { assistantMessageTextBody } from "./chat-events";

function isTerminalRunStatus(status: ChatMessage["runStatus"]): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function isActiveRunStatus(status: ChatMessage["runStatus"]): boolean {
  return status === "queued" || status === "running";
}

function isInFlightAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  if (message.endedAt !== undefined) return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  return message.startedAt !== undefined;
}

function findInFlightAssistantMessages(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    return isInFlightAssistantMessage(message) ? [message] : [];
  }
  return [];
}

/** Assistant row with no user-visible body and no side effects worth keeping. */
export function isEmptyAssistantShell(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if ((message.producedFiles?.length ?? 0) > 0) return false;
  if ((message.events?.length ?? 0) > 0) return false;
  if (assistantMessageTextBody(message).trim().length > 0) return false;
  if ((message.feedback?.rating ?? null) != null) return false;
  return true;
}

function assistantRichnessScore(message: ChatMessage): number {
  let score = (message.content?.length ?? 0) + (message.events?.length ?? 0) * 64;
  score += (message.producedFiles?.length ?? 0) * 128;
  if (isInFlightAssistantMessage(message)) score += 512;
  if (message.runId?.trim()) score += 32;
  if (isTerminalRunStatus(message.runStatus)) score += 16;
  return score;
}

function findLastUserIndex(messages: readonly ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

/** Drop duplicate assistant rows that share the same daemon run id. */
export function dedupeAssistantMessagesByRunId(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  const runIdToBestIndex = new Map<string, number>();
  const duplicateIndices = new Set<number>();

  messages.forEach((message, index) => {
    const runId = message.runId?.trim();
    if (message.role !== "assistant" || !runId) return;
    const existingIndex = runIdToBestIndex.get(runId);
    if (existingIndex === undefined) {
      runIdToBestIndex.set(runId, index);
      return;
    }
    const existing = messages[existingIndex]!;
    const keepIndex =
      assistantRichnessScore(message) > assistantRichnessScore(existing)
        ? index
        : existingIndex;
    const dropIndex = keepIndex === index ? existingIndex : index;
    runIdToBestIndex.set(runId, keepIndex);
    duplicateIndices.add(dropIndex);
  });

  if (duplicateIndices.size === 0) return messages as ChatMessage[];
  return messages.filter((_, index) => !duplicateIndices.has(index));
}

/**
 * Remove a header-only assistant immediately before a richer assistant on the
 * same user turn (no intervening user message).
 */
export function collapseEmptyAssistantShellsBeforeSuccessor(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const current = messages[i]!;
    if (current.role !== "assistant") {
      out.push(current);
      continue;
    }
    let drop = false;
    for (let j = i + 1; j < messages.length; j += 1) {
      const next = messages[j]!;
      if (next.role === "user") break;
      if (next.role !== "assistant") continue;
      if (
        isEmptyAssistantShell(current)
        && !isEmptyAssistantShell(next)
      ) {
        drop = true;
      } else if (
        isEmptyAssistantShell(current)
        && isInFlightAssistantMessage(next)
      ) {
        drop = true;
      }
      break;
    }
    if (!drop) out.push(current);
  }
  if (out.length === messages.length && out.every((message, index) => message === messages[index])) {
    return messages as ChatMessage[];
  }
  return out;
}

type ActiveRunLike = {
  id?: string | null;
  assistantMessageId?: string | null;
  agentId?: string | null;
  status?: ChatMessage["runStatus"];
  createdAt?: number | null;
};

/**
 * When the daemon reports an assistantMessageId stub but the client already
 * holds an optimistic in-flight row for the same turn, pin run metadata onto
 * the existing row instead of appending a second empty assistant.
 */
export function patchInFlightAssistantForActiveRun(
  messages: readonly ChatMessage[],
  run: ActiveRunLike,
  activeRuns?: readonly ActiveRunLike[],
): ChatMessage[] | null {
  const assistantMessageId = run.assistantMessageId?.trim();
  const runId = run.id?.trim();
  if (!assistantMessageId || !runId) return null;
  if (messages.some((message) => message.id === assistantMessageId)) return null;
  if (messages.some((message) => message.role === "assistant" && message.runId === runId)) {
    return null;
  }

  const activeRunIds = (activeRuns ?? [run])
    .map((candidate) => candidate.id?.trim())
    .filter((id): id is string => Boolean(id));
  if (activeRunIds.length > 1) return null;

  const inFlight = findInFlightAssistantMessages(messages)[0];
  if (!inFlight || inFlight.runId?.trim()) return null;

  const lastUserIndex = findLastUserIndex(messages);
  const inFlightIndex = messages.findIndex((message) => message.id === inFlight.id);
  if (inFlightIndex <= lastUserIndex) return null;

  // Only reconcile when this is the sole active run — avoids pinning a new turn
  // onto a stale optimistic row while an older run is still unwinding.
  return messages.map((message) => {
    if (message.id !== inFlight.id) return message;
    return {
      ...message,
      runId,
      runStatus:
        message.runStatus
        ?? (run.status && isActiveRunStatus(run.status) ? run.status : "running"),
      agentId: message.agentId ?? run.agentId ?? undefined,
      startedAt: message.startedAt ?? run.createdAt ?? message.createdAt,
    };
  });
}

/** Full pipeline applied after server/active-run merges. */
export function dedupeConversationAssistantRows(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  const byRunId = dedupeAssistantMessagesByRunId(messages);
  const collapsed = collapseEmptyAssistantShellsBeforeSuccessor(byRunId);
  if (
    collapsed.length === messages.length
    && collapsed.every((message, index) => message === messages[index])
  ) {
    return messages as ChatMessage[];
  }
  return collapsed;
}
