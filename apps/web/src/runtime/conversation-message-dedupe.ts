import type { AgentEvent, ChatMessage } from "../types";
import { EMERGENCY_DECK_FALLBACK_STATUS_CODE } from "../artifacts/emergency-deck";
import { assistantMessageTextBody } from "./chat-events";
import { OUTLINE_DECK_FALLBACK_STATUS_CODE } from "./slide-deliverable-recovery";
import { AUTO_CONTINUE_STATUS_CODE, isAutoContinueIncompleteOutputPrompt } from "./resume";

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
  // Runtime / ACP labels never rendered in Teamver embed body (AssistantMessage
  // filters non-error status blocks). Leaving them substantive blocks empty-shell
  // detection and hides completion leads after reload.
  "model",
  "compacting",
  "retrying",
  "waiting_for_first_output",
]);

/**
 * Deliverable lifecycle notices persisted as `status:error` / `warning` with a
 * stable code. ChatPane may rebuild auto-continue / salvage banners from these
 * after hard reload. They carry no chat prose and MUST count as header-only
 * noise for empty-shell detection — otherwise the succeeded turn's completion
 * lead never fires and the whole assistant row disappears on page re-entry.
 */
export const DELIVERABLE_LIFECYCLE_STATUS_CODES: ReadonlySet<string> = new Set([
  "incomplete_output",
  AUTO_CONTINUE_STATUS_CODE,
  EMERGENCY_DECK_FALLBACK_STATUS_CODE,
  OUTLINE_DECK_FALLBACK_STATUS_CODE,
]);

function isDeliverableLifecycleNoticeEvent(event: AgentEvent): boolean {
  if (event.kind !== "status") return false;
  if (event.label !== "error" && event.label !== "warning") return false;
  const code = (event as { code?: unknown }).code;
  return typeof code === "string" && DELIVERABLE_LIFECYCLE_STATUS_CODES.has(code);
}

function isHeaderOnlyNoiseEvent(event: AgentEvent): boolean {
  if (event.kind === "usage") return true;
  // Thinking is NOT header-only: OD renders ThinkingBlock. Teamver embed hides
  // thinking via ChatPane/AssistantMessage filters, not via this predicate.
  if (event.kind === "status") {
    if (HEADER_ONLY_STATUS_LABELS.has(event.label ?? "")) return true;
    if (isDeliverableLifecycleNoticeEvent(event)) return true;
  }
  return false;
}

function hasOnlyHeaderOnlyNoiseEvents(events: readonly AgentEvent[] | undefined): boolean {
  if (!events || events.length === 0) return true;
  return events.every(isHeaderOnlyNoiseEvent);
}

function isThinkingNoiseEvent(event: AgentEvent): boolean {
  return event.kind === "thinking" || isHeaderOnlyNoiseEvent(event);
}

/**
 * Thinking-only (plus status/usage) stub with no prose / files.
 * Collapsible beside a richer sibling; not a global empty shell (OD shows it).
 */
export function isThinkingOnlyAssistantStub(message: ChatMessage): boolean {
  if (message.role !== "assistant") return false;
  if (message.runStatus === "failed" || message.runStatus === "canceled") return false;
  if (message.resumable === true) return false;
  if ((message.producedFiles?.length ?? 0) > 0) return false;
  if (assistantMessageTextBody(message).trim().length > 0) return false;
  if ((message.feedback?.rating ?? null) != null) return false;
  const events = message.events ?? [];
  if (events.length === 0) return false;
  if (!events.some((event) => event.kind === "thinking")) return false;
  return events.every(isThinkingNoiseEvent);
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

/** Empty header shell or thinking-only stub — safe to drop when a richer sibling exists. */
export function isCollapsibleAssistantStub(message: ChatMessage): boolean {
  return isEmptyAssistantShell(message) || isThinkingOnlyAssistantStub(message);
}

function countSubstantiveEvents(events: readonly AgentEvent[] | undefined): number {
  if (!events || events.length === 0) return 0;
  return events.filter((event) => !isThinkingNoiseEvent(event)).length;
}

function assistantRichnessScore(message: ChatMessage): number {
  let score =
    (message.content?.length ?? 0) + countSubstantiveEvents(message.events) * 64;
  score += (message.producedFiles?.length ?? 0) * 2048;
  if (isTerminalRunStatus(message.runStatus)) score += 1024;
  if (isInFlightAssistantMessage(message)) score += 256;
  if (message.runId?.trim()) score += 32;
  if (!isCollapsibleAssistantStub(message)) score += 512;
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

/** Terminal succeeded shells anchor reload UI after sanitizer strips artifact prose. */
function isTerminalSucceededEmptyShell(message: ChatMessage): boolean {
  return (
    message.role === "assistant"
    && message.runStatus === "succeeded"
    && message.endedAt !== undefined
    && isCollapsibleAssistantStub(message)
  );
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
      (index) => !isCollapsibleAssistantStub(messages[index]!),
    );
    const emptyIndices = assistantIndicesInTurn.filter(
      (index) => isCollapsibleAssistantStub(messages[index]!),
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
        if (
          index === assistantIndicesInTurn.at(-1)
          && isTerminalSucceededEmptyShell(messages[index]!)
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
 * Failed rows that only carry an error status (no prose / files / tool ops).
 * Auto-continue leaves these behind a later succeeded shell — they must not
 * steal ChatPane `isLast` from the trailing completion row.
 */
function isErrorStatusOnlyFailedAssistant(message: ChatMessage): boolean {
  if (message.role !== "assistant" || message.runStatus !== "failed") return false;
  if ((message.producedFiles?.length ?? 0) > 0) return false;
  if (assistantMessageTextBody(message).trim().length > 0) return false;
  const events = message.events ?? [];
  if (events.length === 0) return true;
  return events.every((event) => {
    if (event.kind === "usage") return true;
    if (event.kind === "status") {
      return event.label === "error" || HEADER_ONLY_STATUS_LABELS.has(event.label ?? "");
    }
    return false;
  });
}

/**
 * Prefer the live streaming / in-flight assistant for chat anchors, then the
 * newest non-empty assistant. Falls back to the newest empty shell only when
 * that is the sole assistant (so multi-turn streams keep the new shell visible).
 *
 * Error-status-only failed rows are deferred behind later succeeded shells so
 * auto-continue recovery keeps the completion lead as `isLast`.
 */
export function resolveLastAssistantMessageId(
  messages: readonly ChatMessage[],
): string | undefined {
  let fallback: string | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    if (isInFlightAssistantMessage(message)) return message.id;
    // Prefer a real reply over trailing empty/thinking stubs.
    if (isCollapsibleAssistantStub(message)) {
      if (fallback === undefined) fallback = message.id;
      continue;
    }
    // Skip superseded incomplete_output shells when a later stub/shell exists.
    if (isErrorStatusOnlyFailedAssistant(message)) {
      if (fallback === undefined) fallback = message.id;
      continue;
    }
    return message.id;
  }
  return fallback;
}

/**
 * Like {@link resolveLastAssistantMessageId}, but skips empty/thinking stubs
 * even when they are in-flight. Use for recovery / auto-continue gates so a
 * phantom optimistic shell cannot block a failed incomplete turn.
 */
export function resolveLastSubstantiveAssistantMessageId(
  messages: readonly ChatMessage[],
): string | undefined {
  let fallback: string | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    if (isCollapsibleAssistantStub(message)) {
      if (fallback === undefined) fallback = message.id;
      continue;
    }
    if (isInFlightAssistantMessage(message)) return message.id;
    return message.id;
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
