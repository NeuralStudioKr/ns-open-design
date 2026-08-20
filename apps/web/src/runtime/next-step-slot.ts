import type { ChatMessage, ProjectFile } from '../types';
import { isEmbedSupportingProjectFile } from '../teamver/branding/embedDeliverableFilePolicy';
import { isActiveRunStatus } from '../teamver/backgroundChatRecovery';
import { isAutoContinueIncompleteOutputPrompt } from './resume';
import { isSlideCountTopUpPrompt } from '../teamver/slideCountTopUp';

export function isPreviewableHtml(file: ProjectFile): boolean {
  return file.kind === 'html' || /\.html?$/i.test(file.name);
}

export function pickPreviewableArtifact(files: ProjectFile[]): string | null {
  const html = files.find(isPreviewableHtml);
  return html ? html.name : null;
}

export function pickLatestPreviewableArtifact(
  files: ProjectFile[],
  options?: { slideOnlyMvp?: boolean },
): string | null {
  let latest: ProjectFile | null = null;
  for (const file of files) {
    if (!isPreviewableHtml(file)) continue;
    if (
      options?.slideOnlyMvp
      && isEmbedSupportingProjectFile(file, { projectFiles: files })
    ) {
      continue;
    }
    if (!latest || (file.mtime ?? 0) > (latest.mtime ?? 0)) latest = file;
  }
  return latest ? latest.name : null;
}

export function resolveNextStepArtifactName(input: {
  message: ChatMessage;
  projectFiles: readonly ProjectFile[];
  slideOnlyMvp?: boolean;
}): string | null {
  const produced = input.message.producedFiles ?? [];
  const fromTurn = pickPreviewableArtifact(produced);
  if (fromTurn) return fromTurn;
  return pickLatestPreviewableArtifact([...input.projectFiles], {
    slideOnlyMvp: input.slideOnlyMvp,
  });
}

export function hasUserMessagesAfterAssistant(
  messages: readonly ChatMessage[],
  assistantId: string | undefined,
): boolean {
  if (!assistantId) return false;
  const assistantIndex = messages.findIndex((message) => message.id === assistantId);
  if (assistantIndex < 0) return false;
  for (let index = assistantIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    if (isAutoContinueIncompleteOutputPrompt(message.content) || isSlideCountTopUpPrompt(message.content)) continue;
    return true;
  }
  return false;
}

function assistantRunSucceeded(message: ChatMessage): boolean {
  if (message.runStatus === 'failed' || message.runStatus === 'canceled') return false;
  if (isActiveRunStatus(message.runStatus)) return false;
  return message.runStatus === 'succeeded' || (!message.runStatus && !!message.endedAt);
}

function isTerminalRunStatus(status: NonNullable<ChatMessage['runStatus']>): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

function isFeedbackEligible(message: ChatMessage, streaming: boolean): boolean {
  if (streaming) return false;
  if (message.events?.some((event) => event.kind === 'status' && event.label === 'empty_response')) {
    return false;
  }
  if (message.runStatus) return isTerminalRunStatus(message.runStatus);
  return !!message.endedAt;
}

/**
 * True when a real user follow-up after `assistantId` should hide the pinned
 * next-step card. Failed/canceled replies do not count — the last good
 * deliverable is still the thing users can share / polish. In-flight or
 * succeeded later turns (and unanswered user prompts) do hide it.
 */
export function hasBlockingFollowUpAfterAssistant(
  messages: readonly ChatMessage[],
  assistantId: string | undefined,
): boolean {
  if (!assistantId) return false;
  const assistantIndex = messages.findIndex((message) => message.id === assistantId);
  if (assistantIndex < 0) return false;
  for (let index = assistantIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== 'user') continue;
    if (isAutoContinueIncompleteOutputPrompt(message.content) || isSlideCountTopUpPrompt(message.content)) continue;

    let reply: ChatMessage | null = null;
    for (let j = index + 1; j < messages.length; j += 1) {
      const candidate = messages[j];
      if (candidate?.role === 'assistant') {
        reply = candidate;
        break;
      }
      if (candidate?.role === 'user') break;
    }
    if (!reply) return true;
    if (reply.runStatus === 'failed' || reply.runStatus === 'canceled') continue;
    return true;
  }
  return false;
}

function findPinnedNextStepAssistant(input: {
  messages: readonly ChatMessage[];
  projectFiles: readonly ProjectFile[];
  slideOnlyMvp?: boolean;
}): { message: ChatMessage; artifactName: string } | null {
  for (let i = input.messages.length - 1; i >= 0; i -= 1) {
    const message = input.messages[i];
    if (message?.role !== 'assistant') continue;
    if (!assistantRunSucceeded(message)) continue;
    const artifactName = resolveNextStepArtifactName({
      message,
      projectFiles: input.projectFiles,
      slideOnlyMvp: input.slideOnlyMvp,
    });
    if (!artifactName) continue;
    return { message, artifactName };
  }
  return null;
}

export type PinnedNextStepSlotState = {
  visible: boolean;
  artifactName: string | null;
  showOpenDesignSubmission: boolean;
  assistantMessageId: string | null;
};

/**
 * Decide whether the pinned "next step" card above the composer should show.
 * The card is anchored to the last successful assistant turn with a previewable
 * HTML deliverable, and hides once the user has a blocking follow-up (in-flight
 * / succeeded later turn, or an unanswered prompt) — so it does not sit
 * awkwardly during active work. Failed follow-ups keep the card for the last
 * good deliverable (share / polish / download still apply).
 */
export function resolvePinnedNextStepSlot(input: {
  messages: readonly ChatMessage[];
  lastAssistantId: string | undefined;
  streaming: boolean;
  hasActiveRun: boolean;
  queuedSendCount: number;
  projectId?: string | null;
  projectFiles: readonly ProjectFile[];
  slideOnlyMvp?: boolean;
  onToolboxAction?: unknown;
  onShareToOpenDesign?: unknown;
  onFeedback?: unknown;
  shareToOpenDesignBusy?: boolean;
}): PinnedNextStepSlotState {
  const pinned = findPinnedNextStepAssistant({
    messages: input.messages,
    projectFiles: input.projectFiles,
    slideOnlyMvp: input.slideOnlyMvp,
  });
  const assistant = pinned?.message ?? null;
  const artifactName = pinned?.artifactName ?? null;
  const runSucceeded = !!assistant;
  const showOpenDesignSubmission = !!(
    input.onShareToOpenDesign
    && input.onFeedback
    && assistant
    && isFeedbackEligible(assistant, input.streaming)
    && runSucceeded
  );
  const hasFollowUp = hasBlockingFollowUpAfterAssistant(
    input.messages,
    assistant?.id,
  );
  const visible = !!(
    assistant
    && !input.streaming
    && !input.hasActiveRun
    && input.queuedSendCount === 0
    && !hasFollowUp
    && input.projectId
    && runSucceeded
    && artifactName
    && ((!!input.onToolboxAction) || showOpenDesignSubmission)
  );
  return {
    visible,
    artifactName,
    showOpenDesignSubmission,
    assistantMessageId: assistant?.id ?? null,
  };
}
