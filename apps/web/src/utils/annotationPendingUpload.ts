import type { ChatAttachment, ChatCommentAttachment } from '../types';
import { uploadProjectFiles } from '../providers/registry';
import { projectFilePathsReferToSameFile } from './projectFilePaths';
import { stageReadableUploadedAttachments } from './uploadedImagesReadable';

export const PENDING_ANNOTATION_PATH_PREFIX = '__pending-annotation__/';

export function isPendingAnnotationPath(path: string): boolean {
  return String(path || '').startsWith(PENDING_ANNOTATION_PATH_PREFIX);
}

export function pendingAnnotationPathForFile(file: File): string {
  return `${PENDING_ANNOTATION_PATH_PREFIX}${file.name}`;
}

export function attachmentsHavePendingAnnotationPaths(
  attachments: readonly ChatAttachment[],
): boolean {
  return attachments.some((attachment) => isPendingAnnotationPath(attachment.path));
}

export function commentAttachmentsHavePendingScreenshotPaths(
  attachments: readonly ChatCommentAttachment[],
): boolean {
  return attachments.some((attachment) =>
    isPendingAnnotationPath(String(attachment.screenshotPath || '')),
  );
}

/**
 * Upload deferred annotation screenshots and remap pending paths to daemon paths.
 */
export async function flushPendingAnnotationUploads(
  projectId: string,
  attachments: readonly ChatAttachment[],
  pendingFiles: ReadonlyMap<string, File>,
  uploadedImagesReadableOnDisk: (
    projectId: string,
    uploaded: ChatAttachment[],
  ) => Promise<ChatAttachment[]>,
): Promise<{
  attachments: ChatAttachment[];
  pathReplacements: Map<string, ChatAttachment>;
}> {
  const pathReplacements = new Map<string, ChatAttachment>();
  if (attachments.length === 0) {
    return { attachments: [], pathReplacements };
  }

  const nextAttachments: ChatAttachment[] = [];
  for (const attachment of attachments) {
    if (!isPendingAnnotationPath(attachment.path)) {
      nextAttachments.push(attachment);
      continue;
    }
    const file = pendingFiles.get(attachment.path);
    if (!file) {
      nextAttachments.push(attachment);
      continue;
    }
    const result = await uploadProjectFiles(projectId, [file]);
    const readableUploaded =
      result.uploaded.length > 0
        ? await uploadedImagesReadableOnDisk(projectId, result.uploaded)
        : [];
    const { staged: resolvedUploaded } = stageReadableUploadedAttachments(
      result.uploaded,
      readableUploaded,
    );
    const uploaded = resolvedUploaded[0];
    if (!uploaded) {
      // Drop cold pending annotation screenshots — keep the pending path only
      // when upload produced nothing at all (caller can surface an error).
      if (result.uploaded.length === 0) nextAttachments.push(attachment);
      continue;
    }
    const remapped: ChatAttachment = {
      ...uploaded,
      order: attachment.order,
    };
    pathReplacements.set(attachment.path, remapped);
    nextAttachments.push(remapped);
  }

  return { attachments: nextAttachments, pathReplacements };
}

export function remapPendingCommentScreenshotPaths(
  attachments: readonly ChatCommentAttachment[],
  pathReplacements: ReadonlyMap<string, ChatAttachment>,
): ChatCommentAttachment[] {
  if (pathReplacements.size === 0) return [...attachments];
  return attachments.map((attachment) => {
    const screenshotPath = String(attachment.screenshotPath || '');
    if (!isPendingAnnotationPath(screenshotPath)) return attachment;
    const replacement = pathReplacements.get(screenshotPath);
    if (!replacement) return attachment;
    return {
      ...attachment,
      screenshotPath: replacement.path,
      target: attachment.target
        ? {
            ...attachment.target,
            filePath:
              attachment.target.filePath
              && projectFilePathsReferToSameFile(attachment.target.filePath, screenshotPath)
                ? replacement.path
                : attachment.target.filePath,
          }
        : attachment.target,
    };
  });
}
