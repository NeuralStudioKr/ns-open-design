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
