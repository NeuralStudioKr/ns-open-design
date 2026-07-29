import type { ChatCommentAttachment } from '../types';
import type { ManualEditStyles } from '../edit-mode/types';

export interface ManualEditCommentFastPathResult {
  patches: never[];
  label: string;
}

/**
 * Comment edits are interpreted by the model and applied via
 * `<artifact type="element-patch">` (primary) or deck-patch merge (fallback).
 * Client-side regex interpretation was removed — it could not cover arbitrary
 * natural-language requests and duplicated the model's job poorly.
 */
export function buildManualEditCommentFastPath(_input: {
  attachment: ChatCommentAttachment;
  currentStyles: Partial<ManualEditStyles>;
}): ManualEditCommentFastPathResult | null {
  return null;
}
