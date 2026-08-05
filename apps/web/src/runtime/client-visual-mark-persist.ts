import { repairArtifactDocumentHead } from '@open-design/contracts';
import type { ChatCommentAttachment, FileRevision, ProjectFile } from '@open-design/contracts';

import {
  filterUsableCommentAttachments,
  isScreenshotOnlyVisualCommentTarget,
} from '../comments';
import { selectInitialDesignPreviewFile } from '../components/design-files/designArtifacts';
import { graftVisualMarksIntoDeckHtml } from '../edit-mode/scoped-deck-patch';
import { sanitizeManualEditFullSource } from '../edit-mode/source-patches';
import { fetchProjectFileText, pushProjectFileRevision } from '../providers/registry';
import { isEmbedSupportingProjectFile } from '../teamver/branding/embedDeliverableFilePolicy';
import { reconcileProjectRawFileMissingCache } from '../utils/projectFileFetchCache';
import { getActiveRevisionSequence, setActiveRevisionSequence } from './revision-active-sequence';
import { setRevisionContentCache } from './revision-content-cache';

export type ClientVisualMarkPersistResult =
  | { ok: true; fileName: string; revision: FileRevision }
  | { ok: false };

function isProjectHtmlFile(file: ProjectFile): boolean {
  return file.kind === 'html' || /\.html?$/i.test(file.path?.trim() || file.name);
}

function isCanonicalDeckFileName(fileName: string): boolean {
  const base = (fileName.split('/').pop() ?? fileName).toLowerCase();
  return /^deck(?:[-_.].*)?\.html?$/.test(base);
}

function resolvePrimaryDeckFilePath(
  files: readonly ProjectFile[],
  entryFile?: string | null,
): string | null {
  const deliverables = files.filter(
    (file) =>
      isProjectHtmlFile(file)
      && !isEmbedSupportingProjectFile(file, { projectFiles: files }),
  );
  if (deliverables.length === 0) return null;
  const preferred = entryFile?.trim();
  if (preferred) {
    const match = deliverables.find(
      (file) => file.name === preferred || file.path === preferred,
    );
    if (match) return match.path?.trim() || match.name;
  }
  const deckNamed = deliverables.find((file) => isCanonicalDeckFileName(file.name));
  if (deckNamed) return deckNamed.path?.trim() || deckNamed.name;
  const fallback = selectInitialDesignPreviewFile(deliverables, entryFile ?? null);
  return fallback ? fallback.path?.trim() || fallback.name : null;
}

export function deriveClientVisualMarkRevisionLabel(
  attachments: readonly ChatCommentAttachment[],
): string {
  const comments = attachments
    .map((attachment) => String(attachment.comment || '').trim())
    .filter(Boolean);
  const joined = comments.join(' · ');
  if (/하트|heart|♥|❤/iu.test(joined)) {
    return 'Visual mark: heart';
  }
  if (joined) return `Visual mark: ${joined.slice(0, 48)}`;
  return 'Visual mark';
}

/**
 * Deterministic screenshot-only visual marks (draw annotations) can be grafted
 * into the deck immediately without waiting for a model deck-patch.
 */
export async function tryPersistClientVisualMarksOnSend(input: {
  projectId: string;
  commentAttachments: readonly ChatCommentAttachment[];
  projectFiles: readonly ProjectFile[];
  entryFile?: string | null;
  conversationId?: string;
}): Promise<ClientVisualMarkPersistResult> {
  const usable = filterUsableCommentAttachments(input.commentAttachments);
  if (usable.length === 0) return { ok: false };
  if (!usable.every(isScreenshotOnlyVisualCommentTarget)) return { ok: false };

  const deckPath = resolvePrimaryDeckFilePath(input.projectFiles, input.entryFile);
  if (!deckPath) return { ok: false };

  const currentHtml = await fetchProjectFileText(input.projectId, deckPath, {
    cache: 'no-store',
  });
  if (!currentHtml) return { ok: false };

  const grafted = graftVisualMarksIntoDeckHtml(currentHtml, usable);
  if (!grafted) return { ok: false };

  // Match ProjectView terminal gate — client graft must not re-persist sibling script/on*.
  const htmlBody = sanitizeManualEditFullSource(repairArtifactDocumentHead(grafted));
  const truncateAfter = getActiveRevisionSequence(input.projectId, deckPath);
  const saved = await pushProjectFileRevision(input.projectId, deckPath, {
    content: htmlBody,
    source: 'manual_edit',
    label: deriveClientVisualMarkRevisionLabel(usable),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(typeof truncateAfter === 'number' ? { truncateAfterSequence: truncateAfter } : {}),
  });
  if (!saved.ok) return { ok: false };

  setRevisionContentCache(input.projectId, deckPath, saved.revision.id, htmlBody);
  setActiveRevisionSequence(input.projectId, deckPath, saved.revision.sequence);
  reconcileProjectRawFileMissingCache(input.projectId, new Set([deckPath]));
  return { ok: true, fileName: deckPath, revision: saved.revision };
}
