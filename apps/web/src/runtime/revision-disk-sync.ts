export const REVISION_DISK_SYNC_RETRY_DELAYS_MS = [0, 1_000, 3_000] as const;

export async function syncRevisionWithRetry(
  sync: () => Promise<boolean>,
  delaysMs: readonly number[] = REVISION_DISK_SYNC_RETRY_DELAYS_MS,
): Promise<boolean> {
  for (let attempt = 0; attempt < delaysMs.length; attempt += 1) {
    const delayMs = delaysMs[attempt] ?? 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (await sync()) return true;
  }
  return false;
}
