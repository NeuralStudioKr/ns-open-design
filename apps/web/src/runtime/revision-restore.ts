/**
 * Client-side revision restore helpers.
 *
 * Layer B undo/redo normally POSTs restore (disk write) before updating the
 * preview. When the target snapshot is already in `revision-content-cache`,
 * the preview can update immediately and disk sync can follow without blocking
 * perceived latency.
 */

import { setRevisionContentCache } from './revision-content-cache';

/** True when we can paint the preview from a cached snapshot without waiting on restore. */
export function canApplyRevisionFromClientCache(cachedContent: string | null | undefined): cachedContent is string {
  return typeof cachedContent === 'string';
}

/** Seed the parent revision snapshot after a push so the next undo can use the fast path. */
export function cacheParentRevisionOnPush(
  projectId: string,
  fileName: string,
  parentRevisionId: string | null | undefined,
  preSaveContent: string,
): void {
  if (parentRevisionId) {
    setRevisionContentCache(projectId, fileName, parentRevisionId, preSaveContent);
  }
}
