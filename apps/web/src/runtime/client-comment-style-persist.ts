import { repairArtifactDocumentHeadIfNeeded } from './artifact-document-head';
import type { ChatCommentAttachment, FileRevision, ProjectFile } from '@open-design/contracts';

import { filterUsableCommentAttachments } from '../comments';
import { selectInitialDesignPreviewFile } from '../components/design-files/designArtifacts';
import {
  reconcileCommentScopeForPersist,
  shouldSkipModelForLocalCommentStyle,
  tryLocalCommentStyleGraftInsteadOfModel,
  type LocalCommentStyleGraftKind,
} from '../edit-mode/scoped-deck-patch';
import { fetchProjectFileText, pushProjectFileRevision } from '../providers/registry';
import { isEmbedSupportingProjectFile } from '../teamver/branding/embedDeliverableFilePolicy';
import { reconcileProjectRawFileMissingCache } from '../utils/projectFileFetchCache';
import { getActiveRevisionSequence, setActiveRevisionSequence } from './revision-active-sequence';
import { setRevisionContentCache } from './revision-content-cache';

export type ClientCommentStylePersistResult =
  | { ok: true; fileName: string; revision: FileRevision; kind: LocalCommentStyleGraftKind }
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

export function deriveLocalCommentStyleRevisionLabel(
  kind: LocalCommentStyleGraftKind,
): string {
  if (kind === 'font-scale') return 'Comment style: font ×2';
  if (kind === 'background') return 'Comment style: background';
  if (kind === 'text-color') return 'Comment style: text color';
  return 'Comment style: fill';
}

/**
 * 1007-N01 AB — Font×2 / selected-element fill / named background comments
 * graft onto the prior deck without a MiniMax turn.
 */
export async function tryPersistLocalCommentStyleOnSend(input: {
  projectId: string;
  commentAttachments: readonly ChatCommentAttachment[];
  projectFiles: readonly ProjectFile[];
  entryFile?: string | null;
  conversationId?: string;
  instructionText?: string;
  fileName?: string | null;
}): Promise<ClientCommentStylePersistResult> {
  const usable = filterUsableCommentAttachments(input.commentAttachments);
  if (
    !shouldSkipModelForLocalCommentStyle({
      instructionText: input.instructionText,
      commentAttachments: usable,
    })
  ) {
    return { ok: false };
  }

  const preferred = String(input.fileName ?? '').trim();
  const deckPath = preferred || resolvePrimaryDeckFilePath(input.projectFiles, input.entryFile);
  if (!deckPath) return { ok: false };

  const currentHtml = await fetchProjectFileText(input.projectId, deckPath, {
    cache: 'no-store',
  });
  if (!currentHtml) return { ok: false };

  const scope = reconcileCommentScopeForPersist(currentHtml, usable);
  const grafted = tryLocalCommentStyleGraftInsteadOfModel({
    priorHtml: currentHtml,
    commentAttachments: scope.attachments,
    instructionText: input.instructionText,
  });
  if (!grafted.ok) return { ok: false };

  const htmlBody = repairArtifactDocumentHeadIfNeeded(grafted.html);
  const truncateAfter = getActiveRevisionSequence(input.projectId, deckPath);
  const saved = await pushProjectFileRevision(input.projectId, deckPath, {
    content: htmlBody,
    source: 'manual_edit',
    label: deriveLocalCommentStyleRevisionLabel(grafted.kind),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(typeof truncateAfter === 'number' ? { truncateAfterSequence: truncateAfter } : {}),
  });
  if (!saved.ok) return { ok: false };

  setRevisionContentCache(input.projectId, deckPath, saved.revision.id, htmlBody);
  setActiveRevisionSequence(input.projectId, deckPath, saved.revision.sequence);
  reconcileProjectRawFileMissingCache(input.projectId, new Set([deckPath]));
  return { ok: true, fileName: deckPath, revision: saved.revision, kind: grafted.kind };
}
