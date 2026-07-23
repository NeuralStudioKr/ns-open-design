import type { Artifact, ChatMessage, ProjectFile } from '../types';
import { selectAutoOpenProducedHtml } from '../components/auto-open-file';
import type { computeProducedFiles as computeProducedFilesFn } from '../produced-files';
import {
  buildEmergencyArtifactFromMessages,
  EMERGENCY_DECK_FALLBACK_STATUS_CODE,
} from '../artifacts/emergency-deck';
import { recoverBestHtmlDocumentFromText } from '../artifacts/recover';
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

export function collectSlideReferencePathsFromMessages(
  messages: readonly ChatMessage[],
  max = 12,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (value: string | null | undefined) => {
    const path = (value ?? '').trim();
    if (!path || seen.has(path)) return;
    seen.add(path);
    out.push(path);
  };

  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const attachment of message.attachments ?? []) {
      add(attachment.path);
    }
    const content = message.content ?? '';
    const looseRefLines: string[] = [];
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      const lineMatch = /^[-*]\s+(refs\/.+)$/.exec(trimmed);
      if (lineMatch) {
        add(lineMatch[1]);
      } else {
        looseRefLines.push(line);
      }
    }
    for (const match of looseRefLines.join('\n').matchAll(/\brefs\/[^\s`'")\]]+/g)) {
      add(match[0]);
    }
    if (out.length >= max) break;
  }

  return out.slice(0, max);
}

const SLIDE_COUNT_FORM_LABEL_RE =
  /^\s*-\s*(?:슬라이드\s*분량|slide\s*count|Slide count|scale|slides?|pageCount)\s*:\s*(.+)$/i;
const SLIDE_COUNT_PLUGIN_INPUT_RE =
  /\b(?:slideCount|slides|pageCount)\s*:\s*["']?([^"'\n]+)["']?/i;

/** Parse "10장", "8~10장", "10-15 pages" into an auto-continue slide-count hint. */
export function parseSlideCountPhrase(text: string): string | null {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === '(skipped)') return null;

  const rangeMatch = normalized.match(/(\d{1,2})\s*[-~–]\s*(\d{1,2})\s*(?:장|pages?|slides?|페이지)/i);
  if (rangeMatch) {
    const lower = Number.parseInt(rangeMatch[1]!, 10);
    const upper = Number.parseInt(rangeMatch[2]!, 10);
    if (Number.isFinite(lower) && Number.isFinite(upper) && lower >= 1 && upper <= 50) {
      const target = Math.max(lower, upper);
      return `정확히 ${target}장의 슬라이드를 출력하세요 (사용자 요청 범위 ${lower}–${upper}, 상한 적용).`;
    }
  }

  const singleMatch = normalized.match(/(\d{1,2})\s*(?:장|pages?|slides?|페이지)/i);
  if (singleMatch) {
    const count = Number.parseInt(singleMatch[1]!, 10);
    if (Number.isFinite(count) && count >= 1 && count <= 50) {
      return `정확히 ${count}장의 슬라이드를 출력하세요.`;
    }
  }

  return null;
}

/**
 * Recover an explicit slide-count constraint from user turns so auto-continue
 * does not fall back to generic 6–8 when the brief already named a count.
 */
export function extractRequestedSlideCountHintFromMessages(
  messages: readonly ChatMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'user') continue;
    const content = message.content ?? '';
    if (isAutoContinueIncompleteOutputPrompt(content)) continue;

    const pluginMatch = content.match(SLIDE_COUNT_PLUGIN_INPUT_RE);
    if (pluginMatch?.[1]) {
      const parsed = parseSlideCountPhrase(pluginMatch[1]);
      if (parsed) return parsed;
    }

    for (const line of content.split(/\r?\n/)) {
      const formMatch = line.match(SLIDE_COUNT_FORM_LABEL_RE);
      if (formMatch?.[1]) {
        const parsed = parseSlideCountPhrase(formMatch[1]);
        if (parsed) return parsed;
      }
    }

    const visibleUserText = content.split(/\n\n\[Deliverable instruction\]/i)[0] ?? content;
    const parsed = parseSlideCountPhrase(visibleUserText);
    if (parsed) return parsed;
  }

  return null;
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

/** Prefer verified disk HTML; trust a successful persist when read lags. */
export async function resolveSlideProducedHtmlToOpen(
  producedHtmlToOpen: string | null,
  persistResult: ArtifactPersistResult | null | undefined,
  readProjectHtml: (name: string) => Promise<string | null>,
): Promise<string | null> {
  if (!producedHtmlToOpen) return null;
  const verified = await verifySlideProducedHtmlDeliverable(producedHtmlToOpen, readProjectHtml);
  if (verified) return verified;
  return isEmergencyArtifactPersistSuccess(persistResult) ? persistResult!.fileName : null;
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
  beforeFileNames: ReadonlySet<string> | readonly string[];
  startedAt: number;
  persistArtifact: (
    artifact: Artifact,
    projectFilesSnapshot?: ProjectFile[],
    sourceText?: string,
    activityStartedAt?: number,
  ) => Promise<ArtifactPersistResult>;
  refreshProjectFiles: () => Promise<ProjectFile[]>;
  readProjectHtml: (name: string) => Promise<string | null>;
  computeProducedFiles: typeof computeProducedFilesFn;
}): Promise<EmergencySlideDeckRecoveryResult> {
  if (!options.slideOnlyMvp || options.producedHtmlToOpen) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const recoveredHtml = recoverBestHtmlDocumentFromText(options.finalText);
  const emergencyArtifact = recoveredHtml
    ? {
        identifier: 'deck',
        artifactType: 'deck',
        title: 'deck',
        html: recoveredHtml,
      } satisfies Artifact
    : buildEmergencyArtifactFromMessages(
      options.outlineMessages,
      options.finalText,
    );
  if (!emergencyArtifact) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const emergencyPersist = await options.persistArtifact(
    emergencyArtifact,
    [...options.projectFiles],
    options.finalText ?? undefined,
    options.startedAt,
  );
  if (!isEmergencyArtifactPersistSuccess(emergencyPersist)) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const nextFiles = await options.refreshProjectFiles();
  const produced = options.computeProducedFiles(options.beforeFileNames, nextFiles) ?? [];
  let htmlToOpen: string | null = selectAutoOpenProducedHtml(produced)
    ?? emergencyPersist?.fileName
    ?? null;
  const verifiedHtmlToOpen = await verifySlideProducedHtmlDeliverable(htmlToOpen, options.readProjectHtml);
  // The emergency artifact is synthesized locally and already passed
  // validateHtmlArtifact before persist. In S3 / registry-backed staging,
  // refresh/read can lag the successful write by a beat; treating that as
  // unrecovered drops the user into an incomplete_output error even though
  // persistArtifact returned success. Prefer verified disk HTML when present,
  // but trust the successful persist result as a preview target fallback.
  htmlToOpen = verifiedHtmlToOpen ?? emergencyPersist?.fileName ?? null;

  return {
    recovered: Boolean(htmlToOpen),
    produced,
    htmlToOpen,
  };
}

export { EMERGENCY_DECK_FALLBACK_STATUS_CODE };
