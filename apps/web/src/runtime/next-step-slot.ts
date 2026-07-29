import type { ChatMessage, ProjectFile } from '../types';
import { isEmbedSupportingProjectFile } from '../teamver/branding/embedDeliverableFilePolicy';

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
    if (messages[index]?.role === 'user') return true;
  }
  return false;
}

function assistantRunSucceeded(message: ChatMessage, streaming: boolean): boolean {
  if (streaming) return false;
  if (message.runStatus === 'failed') return false;
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

export type PinnedNextStepSlotState = {
  visible: boolean;
  artifactName: string | null;
  showOpenDesignSubmission: boolean;
};

/**
 * Decide whether the pinned "next step" card above the composer should show.
 * The card is anchored to the last successful assistant turn with a previewable
 * HTML deliverable, and hides once the user has already sent a follow-up or
 * queued another turn — so it does not sit awkwardly in the message history.
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
  const assistant = input.lastAssistantId
    ? input.messages.find((message) => message.id === input.lastAssistantId) ?? null
    : null;
  const artifactName = assistant
    ? resolveNextStepArtifactName({
      message: assistant,
      projectFiles: input.projectFiles,
      slideOnlyMvp: input.slideOnlyMvp,
    })
    : null;
  const runSucceeded = assistant ? assistantRunSucceeded(assistant, input.streaming) : false;
  const showOpenDesignSubmission = !!(
    input.onShareToOpenDesign
    && input.onFeedback
    && assistant
    && isFeedbackEligible(assistant, input.streaming)
    && runSucceeded
  );
  const hasFollowUp = hasUserMessagesAfterAssistant(input.messages, input.lastAssistantId);
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
  };
}
