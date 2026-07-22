import type { Artifact, ChatMessage, ProjectFile } from '../types';
import { selectAutoOpenProducedHtml } from '../components/auto-open-file';
import {
  buildEmergencyArtifactFromMessages,
  EMERGENCY_DECK_FALLBACK_STATUS_CODE,
} from '../artifacts/emergency-deck';
import { isIncompleteHtmlDocumentShell, validateHtmlArtifact } from '../artifacts/validate';
import {
  AUTO_CONTINUE_MAX_PER_CONVERSATION,
  AUTO_CONTINUE_STATUS_CODE,
  isAutoContinueIncompleteOutputPrompt,
} from './resume';

type ArtifactPersistResult =
  | { kind: 'persisted'; fileName: string }
  | { kind: 'pointer'; fileName: string }
  | { kind: 'skipped-duplicate'; fileName: string }
  | { kind: 'skipped-incomplete'; fileName: string }
  | { kind: 'rejected'; fileName: string; reason: string }
  | { kind: 'save-failed'; fileName: string; status?: number; code?: string; message?: string }
  | { kind: 'auth-replay-queued'; fileName: string }
  | { kind: 'skipped-discovery-turn'; fileName: string };

export type EmergencySlideDeckRecoveryResult = {
  recovered: boolean;
  produced: ProjectFile[];
  htmlToOpen: string | null;
};

/** Count automatic-continue user turns — one hidden user row per fired attempt. */
export function countAutoContinueAttemptsInConversation(
  messages: readonly ChatMessage[],
): number {
  return messages.reduce((count, message) => {
    if (message.role !== 'user') return count;
    return isAutoContinueIncompleteOutputPrompt(message.content) ? count + 1 : count;
  }, 0);
}

/** Sync the in-memory cap tracker from persisted conversation history. */
export function syncAutoContinueCountFromMessages(
  counts: Map<string, number>,
  conversationId: string,
  messages: readonly ChatMessage[],
): number {
  const next = countAutoContinueAttemptsInConversation(messages);
  counts.set(conversationId, next);
  return next;
}

/**
 * Slide-only terminal recovery must not treat a stale or shell-only `.html`
 * sibling as a successful deliverable just because `computeProducedFiles` saw
 * a new mtime. Re-read disk and apply the same preview gate as persist.
 */
export async function verifySlideProducedHtmlDeliverable(
  fileName: string | null,
  readProjectHtml: (name: string) => Promise<string | null>,
): Promise<string | null> {
  if (!fileName) return null;
  const html = await readProjectHtml(fileName);
  if (!html) return null;
  if (isIncompleteHtmlDocumentShell(html) || !validateHtmlArtifact(html).ok) return null;
  return fileName;
}

export function isEmergencyArtifactPersistSuccess(
  result: ArtifactPersistResult | null | undefined,
): boolean {
  return result?.kind === 'persisted'
    || result?.kind === 'pointer'
    || result?.kind === 'skipped-duplicate'
    || result?.kind === 'auth-replay-queued';
}

export function findIncompleteSlideAssistantForRecovery(
  messages: readonly ChatMessage[],
  options?: { restrictToMessageIds?: ReadonlySet<string> },
): ChatMessage | null {
  const restrict = options?.restrictToMessageIds;
  const latestAssistant = messages.filter((message) => message.role === 'assistant').at(-1) ?? null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'assistant') continue;
    if (restrict && !restrict.has(message.id)) continue;
    if (message.runStatus !== 'failed' || message.resumable !== true) continue;
    const hasIncompleteStatus = message.events?.some((event) =>
      event.kind === 'status'
      && (
        event.code === 'incomplete_output'
        || event.code === AUTO_CONTINUE_STATUS_CODE
      ),
    );
    if (!hasIncompleteStatus) continue;
    // Only recover the latest assistant turn — a newer child auto-continue
    // run may already be in flight or failed separately.
    if (latestAssistant && message.id !== latestAssistant.id) continue;
    const messageIndex = index;
    const hasAutoContinueAfter = messages.slice(messageIndex + 1).some(
      (later) =>
        later.role === 'user'
        && isAutoContinueIncompleteOutputPrompt(later.content),
    );
    if (hasAutoContinueAfter) continue;
    return message;
  }
  return null;
}

export function canFireAutoContinueForConversation(
  autoContinueCount: number,
  maxPerConversation: number = AUTO_CONTINUE_MAX_PER_CONVERSATION,
): boolean {
  return autoContinueCount < maxPerConversation;
}

export async function attemptEmergencySlideDeckRecovery(options: {
  slideOnlyMvp: boolean;
  producedHtmlToOpen: string | null;
  outlineMessages: readonly ChatMessage[];
  finalText?: string | null;
  projectFiles: readonly ProjectFile[];
  beforeFileNames: readonly string[];
  startedAt: number;
  persistArtifact: (
    artifact: Artifact,
    projectFilesSnapshot?: ProjectFile[],
    sourceText?: string,
    activityStartedAt?: number,
  ) => Promise<ArtifactPersistResult>;
  refreshProjectFiles: () => Promise<ProjectFile[]>;
  readProjectHtml: (name: string) => Promise<string | null>;
  computeProducedFiles: (
    before: readonly string[],
    after: readonly ProjectFile[],
  ) => ProjectFile[] | null;
}): Promise<EmergencySlideDeckRecoveryResult> {
  if (!options.slideOnlyMvp || options.producedHtmlToOpen) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const emergencyArtifact = buildEmergencyArtifactFromMessages(
    options.outlineMessages,
    options.finalText,
  );
  if (!emergencyArtifact) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const emergencyPersist = await options.persistArtifact(
    emergencyArtifact,
    options.projectFiles,
    options.finalText ?? undefined,
    options.startedAt,
  );
  if (!isEmergencyArtifactPersistSuccess(emergencyPersist)) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const nextFiles = await options.refreshProjectFiles();
  const produced = options.computeProducedFiles(options.beforeFileNames, nextFiles) ?? [];
  let htmlToOpen = selectAutoOpenProducedHtml(produced)
    ?? emergencyPersist?.fileName
    ?? null;
  htmlToOpen = await verifySlideProducedHtmlDeliverable(htmlToOpen, options.readProjectHtml);

  return {
    recovered: Boolean(htmlToOpen),
    produced,
    htmlToOpen,
  };
}

export { EMERGENCY_DECK_FALLBACK_STATUS_CODE };
