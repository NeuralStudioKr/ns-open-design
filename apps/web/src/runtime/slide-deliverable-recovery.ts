import type { Artifact, ChatMessage, ProjectFile } from '../types';
import { selectAutoOpenProducedHtml } from '../components/auto-open-file';
import type { computeProducedFiles as computeProducedFilesFn } from '../produced-files';
import {
  EMERGENCY_DECK_FALLBACK_STATUS_CODE,
  buildEmergencyArtifactFromMessages,
} from '../artifacts/emergency-deck';
import { isClosedSoftSalvageDeckHtml } from '../artifacts/deck-html-content';
import { recoverBestHtmlDocumentFromText } from '../artifacts/recover';
import { isIncompleteHtmlDocumentShell, validateHtmlArtifact } from '../artifacts/validate';
import { resolveLastSubstantiveAssistantMessageId } from './conversation-message-dedupe';
import {
  AUTO_CONTINUE_MAX_PER_CONVERSATION,
  AUTO_CONTINUE_STATUS_CODE,
  isAutoContinueIncompleteOutputPrompt,
} from './resume';

/**
 * Status-event code for the "auto-continue cap exhausted and we synthesized a
 * minimal outline deck from the conversation" fallback. Distinct from the
 * `EMERGENCY_DECK_FALLBACK_STATUS_CODE` (stream salvage of authored HTML) so
 * ops can measure how often the outline synth path fires vs the softer
 * salvage path — and so the assistant-card notice can be worded differently.
 */
export { OUTLINE_DECK_FALLBACK_STATUS_CODE } from './deliverable-lifecycle-codes';

type ArtifactPersistResult =
  | { kind: 'persisted'; fileName: string }
  | { kind: 'pointer'; fileName: string }
  | { kind: 'skipped-duplicate'; fileName: string }
  | { kind: 'skipped-incomplete'; fileName: string; reason?: string }
  | { kind: 'scope-rejected'; fileName: string; code: string; reason: string }
  | { kind: 'artifact-regression'; fileName: string; reason: string }
  | { kind: 'rejected'; fileName: string; reason: string }
  | { kind: 'save-failed'; fileName: string; status?: number; code?: string; message?: string }
  | { kind: 'auth-replay-queued'; fileName: string }
  | { kind: 'skipped-discovery-turn'; fileName: string };

export type EmergencySlideDeckRecoveryResult = {
  recovered: boolean;
  produced: ProjectFile[];
  htmlToOpen: string | null;
};

/**
 * Count automatic-continue user turns for the current visible user request.
 * A conversation can contain several unrelated normal user edits; old
 * auto-continue attempts must not exhaust the retry budget for a later edit.
 */
export function countAutoContinueAttemptsInConversation(
  messages: readonly ChatMessage[],
): number {
  let lastManualUserIndex = -1;
  messages.forEach((message, index) => {
    if (message.role !== 'user') return;
    if (isAutoContinueIncompleteOutputPrompt(message.content)) return;
    lastManualUserIndex = index;
  });
  return messages.slice(lastManualUserIndex + 1).reduce((count, message) => {
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
  if (!validateHtmlArtifact(html).ok) return null;
  if (isIncompleteHtmlDocumentShell(html) && !isClosedSoftSalvageDeckHtml(html)) return null;
  return fileName;
}

/** Prefer verified disk HTML; trust a successful persist when read lags. */
export async function resolveSlideProducedHtmlToOpen(
  producedHtmlToOpen: string | null,
  persistResult: ArtifactPersistResult | null | undefined,
  readProjectHtml: (name: string) => Promise<string | null>,
): Promise<string | null> {
  if (!producedHtmlToOpen) {
    return isEmergencyArtifactPersistSuccess(persistResult) ? persistResult!.fileName : null;
  }
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
  // Skip trailing empty/thinking stubs — including in-flight optimistic shells
  // that would otherwise win resolveLastAssistantMessageId and block recovery.
  const latestAssistantId = resolveLastSubstantiveAssistantMessageId(messages);

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
    if (latestAssistantId && message.id !== latestAssistantId) continue;
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

/**
 * Emergency recovery may persist a salvaged full deck from the stream.
 * That path must never run for scoped preview-comment edits — rewriting the
 * whole deck collides with the scoped full-deck guard after an empty
 * element-patch already routed the turn to auto-continue.
 */
export function shouldSkipEmergencySlideDeckRecoveryForScopedCommentEdit(
  commentAttachmentCount: number,
): boolean {
  return commentAttachmentCount > 0;
}

/**
 * Collect stream texts that might still contain a model-authored HTML deck
 * the terminal persist path missed (truncated close, unclosed artifact, etc.).
 */
export function collectEmergencyHtmlSalvageTexts(options: {
  finalText?: string | null;
  outlineMessages?: readonly ChatMessage[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const text = String(value || '').trim();
    if (!text || seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  push(options.finalText);
  for (const message of options.outlineMessages ?? []) {
    if (message.role !== 'assistant') continue;
    push(message.content);
    for (const event of message.events ?? []) {
      if ((event.kind === 'text' || event.kind === 'thinking') && typeof event.text === 'string') {
        push(event.text);
      }
    }
  }
  return out;
}

/** Recover model-authored HTML only — never synthesize a skeleton outline deck. */
export function recoverEmergencyDeckHtmlFromStream(options: {
  finalText?: string | null;
  outlineMessages?: readonly ChatMessage[];
}): string | null {
  for (const text of collectEmergencyHtmlSalvageTexts(options)) {
    const recovered = recoverBestHtmlDocumentFromText(text);
    if (!recovered || !validateHtmlArtifact(recovered).ok) continue;
    // Soft-salvaged sparse decks may still trip the strict incomplete shell
    // ratio — accept them for emergency persist the same way as live salvage.
    if (!isIncompleteHtmlDocumentShell(recovered) || isClosedSoftSalvageDeckHtml(recovered)) {
      return recovered;
    }
  }
  return null;
}

export async function attemptEmergencySlideDeckRecovery(options: {
  slideOnlyMvp: boolean;
  producedHtmlToOpen: string | null;
  /** When > 0, skip salvage — scoped comment edits must retry via element-patch. */
  scopedCommentAttachmentCount?: number;
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
  if (
    shouldSkipEmergencySlideDeckRecoveryForScopedCommentEdit(
      options.scopedCommentAttachmentCount ?? 0,
    )
  ) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  // Critical product rule: never invent a low-quality outline skeleton and mark
  // the run succeeded. That short-circuited auto-continue and shipped junk decks
  // (e.g. "을 만들고 있어요" / "발표 개요"). Only persist HTML the model already
  // authored in the stream; otherwise let auto-continue / incomplete_output run.
  const recoveredHtml = recoverEmergencyDeckHtmlFromStream({
    finalText: options.finalText,
    outlineMessages: options.outlineMessages,
  });
  if (!recoveredHtml) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }
  const emergencyArtifact = {
    identifier: 'deck',
    artifactType: 'deck',
    title: 'deck',
    html: recoveredHtml,
  } satisfies Artifact;

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
  let produced = options.computeProducedFiles(options.beforeFileNames, nextFiles) ?? [];
  let htmlToOpen: string | null = selectAutoOpenProducedHtml(produced, { projectFiles: nextFiles })
    ?? emergencyPersist?.fileName
    ?? null;
  const verifiedHtmlToOpen = await verifySlideProducedHtmlDeliverable(htmlToOpen, options.readProjectHtml);
  // Salvaged HTML already passed validateHtmlArtifact before persist. In S3 /
  // registry-backed staging, refresh/read can lag the successful write by a
  // beat; treating that as unrecovered drops the user into incomplete_output
  // even though persistArtifact returned success. Prefer verified disk HTML
  // when present, but trust the successful persist result as a preview target.
  htmlToOpen = verifiedHtmlToOpen ?? emergencyPersist?.fileName ?? null;
  if (
    htmlToOpen
    && emergencyPersist?.fileName === htmlToOpen
    && !produced.some((file) => file.name === htmlToOpen)
  ) {
    produced = [
      ...produced,
      {
        name: htmlToOpen,
        size: 0,
        mtime: Date.now(),
        kind: 'html',
        mime: 'text/html',
      },
    ];
  }

  return {
    recovered: Boolean(htmlToOpen),
    produced,
    htmlToOpen,
  };
}

/**
 * Final last-resort fallback fired when the auto-continue cap is exhausted
 * AND stream salvage did not recover any authored HTML. Synthesizes a
 * minimal placeholder deck from the outline signals already in the
 * conversation (numbered outlines, bullet lists, Canvas source-brief
 * `Visible headings: A / B / C` lines) so the user is never stranded on a
 * raw "생성 실패" error banner.
 *
 * Product rule reminder: this path INTENTIONALLY violates the "never
 * synthesize a skeleton deck and call it success" rule that keeps the
 * regular emergency salvage strict — but only after every earlier
 * recovery has failed. The synth deck is:
 *   - marked with a distinct `OUTLINE_DECK_FALLBACK_STATUS_CODE`
 *   - accompanied by an "임시 개요만 저장" warning notice so the user
 *     immediately knows to hit "다시 시도"
 *   - still resumable via the existing failed-run retry affordance if we
 *     lift it back to `runStatus: 'failed'` at the caller site
 *
 * Returns `{ recovered: false }` when the conversation has no usable
 * outline material — in that case the caller should still surface the
 * failure banner (there is no responsible fallback to synthesize).
 */
export async function attemptFinalOutlineDeckFallback(options: {
  slideOnlyMvp: boolean;
  producedHtmlToOpen: string | null;
  /** When > 0, skip — scoped comment edits must retry via element-patch. */
  scopedCommentAttachmentCount?: number;
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
  if (
    shouldSkipEmergencySlideDeckRecoveryForScopedCommentEdit(
      options.scopedCommentAttachmentCount ?? 0,
    )
  ) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const outlineArtifact = buildEmergencyArtifactFromMessages(
    options.outlineMessages,
    options.finalText,
  );
  if (!outlineArtifact) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const emergencyPersist = await options.persistArtifact(
    outlineArtifact,
    [...options.projectFiles],
    options.finalText ?? undefined,
    options.startedAt,
  );
  if (!isEmergencyArtifactPersistSuccess(emergencyPersist)) {
    return { recovered: false, produced: [], htmlToOpen: null };
  }

  const nextFiles = await options.refreshProjectFiles();
  let produced = options.computeProducedFiles(options.beforeFileNames, nextFiles) ?? [];
  let htmlToOpen: string | null = selectAutoOpenProducedHtml(produced, { projectFiles: nextFiles })
    ?? emergencyPersist?.fileName
    ?? null;
  const verifiedHtmlToOpen = await verifySlideProducedHtmlDeliverable(htmlToOpen, options.readProjectHtml);
  htmlToOpen = verifiedHtmlToOpen ?? emergencyPersist?.fileName ?? null;
  if (
    htmlToOpen
    && emergencyPersist?.fileName === htmlToOpen
    && !produced.some((file) => file.name === htmlToOpen)
  ) {
    produced = [
      ...produced,
      {
        name: htmlToOpen,
        size: 0,
        mtime: Date.now(),
        kind: 'html',
        mime: 'text/html',
      },
    ];
  }

  return {
    recovered: Boolean(htmlToOpen),
    produced,
    htmlToOpen,
  };
}

export { EMERGENCY_DECK_FALLBACK_STATUS_CODE };
