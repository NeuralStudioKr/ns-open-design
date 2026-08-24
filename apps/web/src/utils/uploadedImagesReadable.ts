import type { ChatAttachment } from '@open-design/contracts';
import { loadAuthenticatedProjectFileBlob } from '../hooks/useAuthenticatedProjectFileObjectUrl';
import { sniffImageMime } from './imageBlobNormalize';
import { clearProjectRawFileMissing } from './projectFileFetchCache';

// Extended ladder (~13s) so HA pod uploads clearing S3 sync-up on one node
// followed by /raw/ hitting a different node have enough time to
// sync-DOWN before we declare the image cold. Prior 5s ladder rejected
// otherwise-valid uploads under normal HA replication lag.
const DEFAULT_READ_DELAYS_MS = [0, 250, 800, 1500, 2500, 3500, 4500] as const;

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
 * Stage uploaded attachments regardless of readability — visible chips give
 * users immediate feedback while our send-time (api-proxy `readAnthropicImageBlock`
 * + preview heal `useAuthenticatedProjectFileObjectUrl`) fetch ladders retry
 * with NFC/NFD + Drive alternates. Prior "never fall back to cold" behaviour
 * hard-rejected uploads under normal S3 sync lag, which the user experienced
 * as "업로드한 이미지를 아직 읽을 수 없습니다."
 *
 * `readyImageCount` still reports how many are already fetch-verified so the
 * caller can decide whether to warn about a partial-readiness stage.
 */
export function stageReadableUploadedAttachments(
  uploaded: readonly ChatAttachment[],
  ready: readonly ChatAttachment[],
): { staged: ChatAttachment[]; coldImageCount: number; readyImageCount: number } {
  const uploadedImages = uploaded.filter((item) => item.kind === 'image');
  const readyImages = ready.filter((item) => item.kind === 'image');
  const coldImageCount = Math.max(0, uploadedImages.length - readyImages.length);
  const readyPathKeys = new Set(readyImages.map((item) => normalizeStagedKey(item.path)));
  // Deduplicate on `ready` first (verified image blob + non-image files), then
  // append any uploaded images that were still cold so the chip is visible.
  const staged: ChatAttachment[] = [...ready];
  for (const item of uploadedImages) {
    if (readyPathKeys.has(normalizeStagedKey(item.path))) continue;
    staged.push(item);
  }
  return {
    staged,
    coldImageCount,
    readyImageCount: readyImages.length,
  };
}

function normalizeStagedKey(path: string): string {
  return String(path || '').trim().replace(/\\/g, '/');
}
