import type { FileRevisionSource } from '@open-design/contracts';
import type { ChatCommentAttachment } from '../types';
import { commentTargetDisplayName } from '../comments';

export function mapArtifactTypeToRevisionSource(
  artifactType: string | undefined,
): FileRevisionSource {
  const normalized = (artifactType ?? '').toLowerCase();
  if (normalized.includes('element')) return 'agent_element_patch';
  if (normalized.includes('deck-patch') || normalized.includes('deck_patch')) {
    return 'agent_deck_patch';
  }
  if (normalized.includes('deck') || normalized.includes('slide')) return 'agent_full_deck';
  return 'agent_full_deck';
}

export function deriveAgentRevisionLabel(
  attachments: readonly ChatCommentAttachment[],
  fallbackTitle: string,
): string {
  if (attachments.length === 1) {
    const comment = attachments[0]!;
    const target = commentTargetDisplayName(comment);
    const text = comment.comment?.trim();
    if (text) return `${target}: ${text.slice(0, 80)}`;
    return target;
  }
  if (attachments.length > 1) {
    return `AI edit (${attachments.length} comments)`;
  }
  const title = fallbackTitle.trim();
  return title.length > 0 ? title : 'AI edit';
}
