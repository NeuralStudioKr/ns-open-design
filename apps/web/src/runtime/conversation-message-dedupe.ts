import type { AgentEvent, ChatMessage } from "../types";
import { assistantMessageTextBody } from "./chat-events";
import { isAutoContinueIncompleteOutputPrompt } from "./resume";

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

/** Status/usage events that leave only the assistant header visible in chat. */
const HEADER_ONLY_STATUS_LABELS = new Set([
  "requesting",
  "initializing",
  "working",
  "empty_response",
  "queued",
  // Match AssistantMessage block filter — these never render a body pill.
  "starting",
  "running",
  "streaming",
  "thinking",
  "tool_call",
  "tool_call_update",
]);

function isHeaderOnlyNoiseEvent(event: AgentEvent): boolean {
  if (event.kind === "usage") return true;
  // Thinking tokens are often filtered from Teamver embed chat body; treat as
  // header-only noise so a thinking-only stub collapses beside a real reply.
  if (event.kind === "thinking") return true;
  if (event.kind === "status") {
    return HEADER_ONLY_STATUS_LABELS.has(event.label ?? "");
  }
  return false;
}

function hasOnlyHeaderOnlyNoiseEvents(events: readonly AgentEvent[] | undefined): boolean {
  if (!events || events.length === 0) return true;
  return events.every(isHeaderOnlyNoiseEvent);
}

/** Assistant row with no user-visible body and no side effects worth keeping. */
export function isEmptyAssistantShell(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  // Failed / canceled / resumable rows anchor error cards and Continue — never
  // treat them as disposable shells even when the body is still empty.
  if (message.runStatus === "failed" || message.runStatus === "canceled") return false;
  if (message.resumable === true) return false;
  if ((message.producedFiles?.length ?? 0) > 0) return false;
  if (!hasOnlyHeaderOnlyNoiseEvents(message.events)) return false;
  if (assistantMessageTextBody(message).trim().length > 0) return false;
  if ((message.feedback?.rating ?? null) != null) return false;
  return true;
}

function assistantRichnessScore(message: ChatMessage): number {
  let score = (message.content?.length ?? 0) + (message.events?.length ?? 0) * 64;
  score += (message.producedFiles?.length ?? 0) * 2048;
  if (isTerminalRunStatus(message.runStatus)) score += 1024;
  if (isInFlightAssistantMessage(message)) score += 256;
  if (message.runId?.trim()) score += 32;
  if (!isEmptyAssistantShell(message)) score += 512;
  return score;
}

function findLastUserIndex(messages: readonly ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

function isVisibleUserTurnBoundary(message: ChatMessage): boolean {
  if (message.role !== "user") return false;
  // Auto-continue prompts are hidden in ChatPane; they must not split a turn
  // for empty-shell collapse or the incomplete first assistant survives.
  return !isAutoContinueIncompleteOutputPrompt(message.content);
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
 * Remove header-only assistant rows that share a visible user turn with a
 * richer assistant (before or after, including across hidden auto-continue
 * user prompts). When every assistant in the turn is an empty shell, keep
 * the richest / latest one only.
 */
export function collapseEmptyAssistantShellsBeforeSuccessor(
  messages: readonly ChatMessage[],
): ChatMessage[] {
  const drop = new Set<number>();
  let assistantIndicesInTurn: number[] = [];

  const flushTurn = () => {
    if (assistantIndicesInTurn.length === 0) return;
    const richIndices = assistantIndicesInTurn.filter(
      (index) => !isEmptyAssistantShell(messages[index]!),
    );
    const emptyIndices = assistantIndicesInTurn.filter(
      (index) => isEmptyAssistantShell(messages[index]!),
    );
    if (richIndices.length > 0) {
      // When the only rich siblings are terminal (e.g. a failed attempt kept
      // for Retry history), keep the in-flight optimistic shell — otherwise
      // dedupe would delete the new streaming target mid-retry.
      const richOnlyTerminal = richIndices.every(
        (index) => !isInFlightAssistantMessage(messages[index]!),
      );
      for (const index of emptyIndices) {
        if (
          richOnlyTerminal
          && isInFlightAssistantMessage(messages[index]!)
        ) {
          continue;
        }
        drop.add(index);
      }
    } else if (emptyIndices.length > 1) {
      const inFlightEmpty = emptyIndices.filter((index) =>
        isInFlightAssistantMessage(messages[index]!),
      );
      let best = (inFlightEmpty.at(-1) ?? emptyIndices[0])!;
      if (inFlightEmpty.length === 0) {
        for (const index of emptyIndices) {
          if (assistantRichnessScore(messages[index]!) >= assistantRichnessScore(messages[best]!)) {
            best = index;
          }
        }
      }
      for (const index of emptyIndices) {
        if (index !== best) drop.add(index);
      }
    }
    assistantIndicesInTurn = [];
  };

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i]!;
    if (message.role === "user") {
      if (!isVisibleUserTurnBoundary(message)) continue;
      flushTurn();
      continue;
    }
    if (message.role === "assistant") {
      assistantIndicesInTurn.push(i);
    }
  }
  flushTurn();

  if (drop.size === 0) return messages as ChatMessage[];
  return messages.filter((_, index) => !drop.has(index));
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

  const activeRunCount = activeRuns?.length ?? 1;
  if (activeRunCount !== 1) return null;

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

/**
 * Prefer the live streaming / in-flight assistant for chat anchors, then the
 * newest non-empty assistant. Falls back to the newest empty shell only when
 * that is the sole assistant (so multi-turn streams keep the new shell visible).
 */
export function resolveLastAssistantMessageId(
  messages: readonly ChatMessage[],
): string | undefined {
  let fallback: string | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    if (isInFlightAssistantMessage(message)) return message.id;
    if (!isEmptyAssistantShell(message)) return message.id;
    if (fallback === undefined) fallback = message.id;
  }
  return fallback;
}

export function resolveLastAssistantMessageIndex(
  messages: readonly ChatMessage[],
): number {
  const id = resolveLastAssistantMessageId(messages);
  if (!id) return -1;
  return messages.findIndex((message) => message.id === id);
}
