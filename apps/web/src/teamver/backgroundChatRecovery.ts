import type { ChatRunStatusResponse } from "@open-design/contracts";
import type { ChatMessage } from "../types";
import {
  findFirstQuestionForm,
  hasBrokenQuestionFormMarkup,
  hasUnterminatedQuestionForm,
} from "../artifacts/question-form";
import { appendErrorStatusEvent } from "../runtime/chat-events";

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
  if (message.endedAt !== undefined) return false;
  if (isTerminalRunStatus(message.runStatus)) return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  if (!message.runId) return false;
  return true;
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

/** Once SSE reattach is armed, prefer "live" — idle server-side runs have no deltas. */
export function resolveRunRecoveryBannerPhase(
  runStatus: "queued" | "running",
  _savedChars = 0,
): RunRecoveryBannerPhase {
  if (runStatus === "queued") return "queued";
  return "live";
}

/** Hide the inset banner when the chat stream already surfaces preparing/working UI. */
export function shouldShowRunRecoveryBannerInChat(options: {
  banner: { conversationId: string } | null;
  activeConversationId: string | null;
  conversationStreaming: boolean;
}): boolean {
  if (!options.banner || !options.activeConversationId) return false;
  if (options.banner.conversationId !== options.activeConversationId) return false;
  if (options.conversationStreaming) return false;
  return true;
}

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
  const latest = findInFlightAssistantMessages(messages)[0];
  if (!latest) return false;
  return isRecoverableBackgroundChatMessage(latest, mode);
}

/** Drop leaked `streaming` UI when the active conversation has no in-flight turn. */
export function shouldClearPhantomStreamingMarker(input: {
  streaming: boolean;
  streamingConversationId: string | null;
  activeConversationId: string | null;
  loading: boolean;
  awaitingQuestionFormAnswer: boolean;
  hasActiveRun: boolean;
  /** BYOK background recovery may keep streaming armed while the proxy still drains. */
  backgroundRecoveryActive?: boolean;
}): boolean {
  if (!input.streaming) return false;
  if (!input.activeConversationId) return false;
  if (input.streamingConversationId !== input.activeConversationId) return false;
  if (input.backgroundRecoveryActive) return false;
  if (input.loading || input.awaitingQuestionFormAnswer || input.hasActiveRun) return false;
  return true;
}

function findLatestAssistantMessage(
  messages: readonly ChatMessage[],
): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "assistant") return message;
  }
  return null;
}

/**
 * True when the latest assistant turn finished a question form and is waiting
 * for the user to submit answers. The upstream proxy/run is idle by design —
 * composer and form submit must stay enabled (this is not a re-entry attach).
 */
export function conversationAwaitingQuestionFormAnswer(
  messages: readonly ChatMessage[],
): boolean {
  const assistant = findLatestAssistantMessage(messages);
  if (!assistant) return false;
  const content = assistant.content ?? "";
  const parsed = findFirstQuestionForm(content);
  const form = parsed?.form;
  const hasFormIntent =
    form != null
    || hasBrokenQuestionFormMarkup(content)
    || (/<(?:question-form|ask-question)\b/i.test(content) && !hasUnterminatedQuestionForm(content));
  if (!hasFormIntent) return false;
  if (hasUnterminatedQuestionForm(content)) return false;
  const formId = form?.id ?? "discovery";
  const assistantIndex = messages.findIndex((message) => message.id === assistant.id);
  if (assistantIndex < 0) return true;
  for (let i = assistantIndex + 1; i < messages.length; i += 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    if ((message.content ?? "").includes(`[form answers — ${formId}]`)) {
      return false;
    }
  }
  return true;
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
      projectName: projectNameById.get(projectId) ?? "teamver Design",
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

function syntheticAssistantFromActiveRun(run: ChatRunStatusResponse): ChatMessage | null {
  const assistantMessageId = run.assistantMessageId?.trim();
  if (!assistantMessageId) return null;
  const now = run.updatedAt ?? run.createdAt ?? Date.now();
  return {
    id: assistantMessageId,
    role: "assistant",
    content: "",
    runId: run.id,
    runStatus: run.status === "queued" ? "queued" : "running",
    startedAt: run.createdAt ?? now,
    createdAt: run.createdAt ?? now,
  };
}

/**
 * After auth-return reload the daemon may still have an active run while the
 * assistant row was never durably persisted — synthesize a recoverable stub.
 */
export function mergeActiveRunsIntoMessages(
  messages: readonly ChatMessage[],
  activeRuns: readonly ChatRunStatusResponse[],
): ChatMessage[] {
  if (activeRuns.length === 0) return [...messages];
  const merged = [...messages];
  const knownIds = new Set(merged.map((message) => message.id));
  for (const run of activeRuns) {
    const stub = syntheticAssistantFromActiveRun(run);
    if (!stub || knownIds.has(stub.id)) continue;
    merged.push(stub);
    knownIds.add(stub.id);
  }
  return merged;
}

/** Embed safety net when SSE stalls but the daemon run has already finished. */
export const TEAMVER_STALE_RUN_RECONCILE_MS = 10 * 60 * 1000 + 30_000;
export const TEAMVER_STALE_RUN_POLL_MS = 30_000;
/** After this window, force-fail a still-running UI row so the composer unlocks. */
export const TEAMVER_STALE_RUN_FORCE_FAIL_MS = 12 * 60 * 1000;

export function staleDaemonRunStartedAt(message: ChatMessage): number | null {
  if (message.role !== "assistant") return null;
  const startedAt = message.startedAt ?? message.createdAt;
  return typeof startedAt === "number" && Number.isFinite(startedAt) ? startedAt : null;
}

export function shouldPollStaleDaemonRun(message: ChatMessage, now = Date.now()): boolean {
  if (!isRecoverableDaemonRunMessage(message)) return false;
  if (!message.runId?.trim()) return false;
  const startedAt = staleDaemonRunStartedAt(message);
  if (startedAt == null) return false;
  return now - startedAt >= TEAMVER_STALE_RUN_RECONCILE_MS;
}

export function shouldForceFailStaleDaemonRun(message: ChatMessage, now = Date.now()): boolean {
  if (!shouldPollStaleDaemonRun(message, now)) return false;
  const startedAt = staleDaemonRunStartedAt(message);
  if (startedAt == null) return false;
  return now - startedAt >= TEAMVER_STALE_RUN_FORCE_FAIL_MS;
}

export function terminalAssistantPatchFromRunStatus(
  status: ChatRunStatusResponse,
): Partial<ChatMessage> | null {
  if (!isTerminalRunStatus(status.status)) return null;
  const base: Partial<ChatMessage> = {
    runStatus: status.status,
    endedAt: status.updatedAt ?? Date.now(),
    ...(status.resumable !== undefined ? { resumable: status.resumable } : {}),
  };
  const errorDetail = status.error?.trim();
  if (!errorDetail && !status.errorCode) return base;

  const withError = appendErrorStatusEvent(
    { id: "patch", role: "assistant", content: "", ...base } as ChatMessage,
    errorDetail || status.errorCode || "Run failed",
    status.errorCode ?? undefined,
  );
  return {
    ...base,
    ...(withError.events ? { events: withError.events } : {}),
  };
}
