import type { ChatAttachment } from '@open-design/contracts';
import { loadAuthenticatedProjectFileBlob } from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { sniffImageMime } from './imageBlobNormalize';
import { clearProjectRawFileMissing } from './projectFileFetchCache';

const DEFAULT_READ_DELAYS_MS = [0, 250, 800, 1500, 2500] as const;

/**
 * Wait until durable uploaded images are readable from scratch/S3 before
 * staging or auto-sending. Prevents vision + preview races right after
 * local upload / Drive import on HA pods.
 */
export async function uploadedImagesReadableOnDisk(
  projectId: string,
  uploaded: ChatAttachment[],
  delaysMs: readonly number[] = DEFAULT_READ_DELAYS_MS,
): Promise<ChatAttachment[]> {
  const ready: ChatAttachment[] = [];
  for (const item of uploaded) {
    if (item.kind !== 'image') {
      ready.push(item);
      continue;
    }
    const blob = await loadAuthenticatedProjectFileBlob(projectId, item.path, {
      delaysMs,
      trustExists: true,
    });
    if (!blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!sniffImageMime(bytes)) continue;
    clearProjectRawFileMissing(projectId, item.path);
    ready.push(item);
  }
  return ready;
}

/**
 * Prefer readable attachments for staging. Never fall back to cold images —
 * that used to advertise paths that still 404 in vision/preview/export.
 *
 * Non-image files from `ready` are kept. Cold images are dropped and counted.
 */
export function stageReadableUploadedAttachments(
  uploaded: readonly ChatAttachment[],
  ready: readonly ChatAttachment[],
): { staged: ChatAttachment[]; coldImageCount: number; readyImageCount: number } {
  const uploadedImages = uploaded.filter((item) => item.kind === 'image');
  const readyImages = ready.filter((item) => item.kind === 'image');
  const coldImageCount = Math.max(0, uploadedImages.length - readyImages.length);
  if (uploadedImages.length > 0 && readyImages.length === 0) {
    return {
      staged: ready.filter((item) => item.kind !== 'image'),
      coldImageCount: uploadedImages.length,
      readyImageCount: 0,
    };
  }
  return {
    staged: [...ready],
    coldImageCount,
    readyImageCount: readyImages.length,
  };
}
