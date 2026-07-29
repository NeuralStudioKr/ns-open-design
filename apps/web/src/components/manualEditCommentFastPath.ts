import type { ChatCommentAttachment } from '../types';
import type { ManualEditPatch } from '../edit-mode/source-patches';

export type ManualEditCommentFastPathResult = {
  patches: ManualEditPatch[];
};

/**
 * Client-side comment fast-path is intentionally disabled. All comment
 * edits must flow through the model's element-patch / deck-patch contract
 * with auto-continue recovery when the artifact is empty or mis-scoped.
 */
export function buildManualEditCommentFastPath(_input: {
  attachment: ChatCommentAttachment;
  currentStyles: Record<string, string>;
}): ManualEditCommentFastPathResult | null {
  return null;
}
